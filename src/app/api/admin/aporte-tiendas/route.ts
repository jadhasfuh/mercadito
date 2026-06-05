import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Cobro del aporte de las tiendas foráneas al envío ($20 por pedido cuando no
 * hay repartidor local). Es una cuenta por cobrar a la tienda, distinta del
 * envío B2B (envio_pagado_por='tienda'). Se atribuye a la tienda foránea del
 * pedido y se cuenta solo en pedidos ya entregados y aún no liquidados.
 */

const PEND_CTE = `
  WITH pend AS (
    SELECT p.id, p.aporte_tienda,
      (SELECT pu.id FROM pedido_items pi JOIN puestos pu ON pu.id = pi.puesto_id
       WHERE pi.pedido_id = p.id AND pu.ciudad <> 'sahuayo' LIMIT 1) AS puesto_id
    FROM pedidos p
    WHERE p.aporte_tienda > 0 AND p.aporte_tienda_pagado_at IS NULL AND p.estado = 'entregado'
  )`;

// GET — aporte pendiente agrupado por tienda foránea.
export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const rows = await query(
    `${PEND_CTE}
     SELECT pu.id, pu.nombre, pu.ciudad, pu.telefono_contacto,
            COUNT(*)::int AS num_pedidos,
            SUM(pend.aporte_tienda)::numeric AS total_a_cobrar
     FROM pend JOIN puestos pu ON pu.id = pend.puesto_id
     WHERE pend.puesto_id IS NOT NULL
     GROUP BY pu.id, pu.nombre, pu.ciudad, pu.telefono_contacto
     ORDER BY total_a_cobrar DESC`
  );
  return NextResponse.json(rows);
}

// POST — marca como pagado el aporte pendiente de una tienda (todos sus
// pedidos entregados con aporte sin liquidar).
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { puesto_id } = await request.json();
  if (!puesto_id) return NextResponse.json({ error: "Falta puesto_id" }, { status: 400 });

  const res = await query(
    `${PEND_CTE}
     UPDATE pedidos SET aporte_tienda_pagado_at = NOW()
     WHERE id IN (SELECT id FROM pend WHERE puesto_id = $1)
     RETURNING id`,
    [puesto_id]
  );
  return NextResponse.json({ ok: true, pedidos: res.length });
}
