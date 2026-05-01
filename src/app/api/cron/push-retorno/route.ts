import { query } from "@/lib/db";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";

/**
 * Cron — push de retorno a clientes inactivos.
 *
 * Lógica: cliente que tiene push_token, no ha hecho pedido en los últimos
 * 7 días, y SÍ ha hecho al menos un pedido alguna vez (no clientes nuevos
 * que solo abrieron la app sin comprar — esos no tienen señal aún).
 *
 * Idempotencia: registra en el push_token cuándo se envió el último
 * "retorno" para no spamear si el cron corre dos veces el mismo día.
 *
 * Auth: header X-Cron-Secret debe coincidir con CRON_SECRET en .env.
 * Diseñado para que un cron de host lo llame con curl.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Asegurar columna `push_retorno_at` en usuarios para no spamear.
  // Es idempotente — corre cada vez que se llama el endpoint.
  await query(
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS push_retorno_at TIMESTAMPTZ"
  );

  const filas = await query<{ id: string; push_token: string; nombre: string }>(
    `SELECT u.id, u.push_token, u.nombre
     FROM usuarios u
     WHERE u.rol = 'cliente'
       AND u.activo = true
       AND u.push_token IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM pedidos p
         WHERE p.cliente_id = u.id AND p.estado = 'entregado'
       )
       AND NOT EXISTS (
         SELECT 1 FROM pedidos p
         WHERE p.cliente_id = u.id
           AND p.created_at > NOW() - INTERVAL '7 days'
       )
       AND (u.push_retorno_at IS NULL OR u.push_retorno_at < NOW() - INTERVAL '14 days')`
  );

  if (filas.length === 0) {
    return NextResponse.json({ enviadas: 0, mensaje: "Nadie cumple criterio" });
  }

  const tokens = filas.map((u) => u.push_token).filter(Boolean);
  await enviarPush(
    tokens,
    "Lo de siempre te está esperando 👀",
    "Vuelve a Mercadito y arma tu lista en segundos.",
    { tipo: "retorno" }
  );

  // Marcar enviados
  const ids = filas.map((u) => u.id);
  await query("UPDATE usuarios SET push_retorno_at = NOW() WHERE id = ANY($1)", [ids]);

  return NextResponse.json({ enviadas: filas.length });
}
