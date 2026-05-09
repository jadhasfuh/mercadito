import { query } from "@/lib/db";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";

/**
 * Cron — pide al cliente calificar al repartidor 30min–3h después
 * de que se marcó el pedido como entregado.
 *
 * Filtros:
 *   - estado = 'entregado'
 *   - entregado_at en ventana [NOW()-3h, NOW()-30min]
 *   - repartidor_rating todavía es NULL (no calificó por su cuenta)
 *   - push_calificar_enviado = false (idempotente)
 *   - cliente con push_token activo
 *
 * Ventana 30min: que el cliente termine de comer / acomodar la compra.
 * Ventana 3h: si pasó más, perdimos la frescura — no insistir.
 *
 * Auth: header X-Cron-Secret. Diseñado para llamarse cada 15min.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const filas = await query<{ id: string; push_token: string; tipo: string }>(
    `SELECT p.id, u.push_token, p.tipo
     FROM pedidos p
     JOIN usuarios u ON u.id = p.cliente_id
     WHERE p.estado = 'entregado'
       AND p.entregado_at IS NOT NULL
       AND p.entregado_at BETWEEN NOW() - INTERVAL '3 hours' AND NOW() - INTERVAL '30 minutes'
       AND p.repartidor_rating IS NULL
       AND p.push_calificar_enviado = false
       AND u.push_token IS NOT NULL
       AND u.activo = true`
  );

  if (filas.length === 0) {
    return NextResponse.json({ enviadas: 0 });
  }

  // Personalizar el body según tipo (mercado vs envío de paquete) sin
  // batch agrupado: enviarPush ya filtra tokens válidos y mete cada uno
  // como mensaje individual.
  await Promise.all(
    filas.map((p) => {
      const body = p.tipo === "envio"
        ? "¿Cómo estuvo la entrega? Califica a tu repartidor."
        : "¿Qué tal estuvo tu pedido? Califica a tu repartidor.";
      return enviarPush(
        [p.push_token],
        "Mercadito 🛵",
        body,
        { tipo: "calificar", pedido_id: p.id }
      );
    })
  );

  // Marcar como enviado para no repetir.
  const ids = filas.map((p) => p.id);
  await query(
    "UPDATE pedidos SET push_calificar_enviado = true WHERE id = ANY($1)",
    [ids]
  );

  return NextResponse.json({ enviadas: filas.length });
}
