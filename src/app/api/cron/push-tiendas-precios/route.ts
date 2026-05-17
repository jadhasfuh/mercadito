import { query } from "@/lib/db";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";

/**
 * Cron — recordatorio cada 3 días a TODAS las tiendas aprobadas con
 * push_token: "¿tus precios siguen al día?". El crontab del VPS hace el
 * scheduling (lo agendamos cada 3 días).
 *
 * Filtro: solo tiendas aprobadas y activas. Tiendas pausadas o pendientes
 * no reciben — sería ruido.
 *
 * Idempotencia: `push_precios_at` evita doble envío si el cron se dispara
 * dos veces. Margen de 2 días (cron es cada 3, así sobra un día).
 *
 * Auth: header X-Cron-Secret debe coincidir con CRON_SECRET en .env.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS push_precios_at TIMESTAMPTZ");

  const filas = await query<{ id: string; push_token: string }>(
    `SELECT u.id, u.push_token
     FROM usuarios u
     JOIN puestos p ON p.id = u.puesto_id
     WHERE u.rol = 'tienda'
       AND u.activo = true
       AND u.push_token IS NOT NULL
       AND p.aprobado = true
       AND p.activo = true
       AND (u.push_precios_at IS NULL OR u.push_precios_at < NOW() - INTERVAL '2 days')`
  );

  if (filas.length === 0) {
    return NextResponse.json({ enviadas: 0, mensaje: "Nadie cumple criterio" });
  }

  const tokens = filas.map((u) => u.push_token);
  await enviarPush(
    tokens,
    "💲 ¿Tus precios siguen al día?",
    "Revisa tu catálogo en Mercadito y actualiza lo que cambió. Toma 1 min.",
    { tipo: "recordatorio_precios" }
  );

  const ids = filas.map((u) => u.id);
  await query("UPDATE usuarios SET push_precios_at = NOW() WHERE id = ANY($1)", [ids]);

  return NextResponse.json({ enviadas: filas.length });
}
