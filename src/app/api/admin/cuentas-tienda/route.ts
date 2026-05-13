import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/cuentas-tienda?dias=7
 *
 * Cuentas por cobrar de tiendas que usan el flow B2B (solicitar
 * repartidor con envio_pagado_por='tienda'). Suma de envíos
 * entregados en los últimos N días, agrupado por tienda.
 *
 * Solo cuenta pedidos en estado 'entregado' — los cancelados o
 * pendientes no son cobrables. Default: últimos 7 días (corte
 * semanal típico).
 */
export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const diasRaw = Number(searchParams.get("dias") || "7");
  const dias = isFinite(diasRaw) && diasRaw > 0 && diasRaw <= 90 ? diasRaw : 7;

  const rows = await query<{
    tienda_id: string;
    tienda_nombre: string;
    telefono_contacto: string | null;
    num_pedidos: number;
    total_a_cobrar: string;
    primer_pedido: string;
    ultimo_pedido: string;
  }>(
    `SELECT
       p.solicitado_por_tienda_id AS tienda_id,
       pu.nombre AS tienda_nombre,
       pu.telefono_contacto,
       COUNT(*)::int AS num_pedidos,
       SUM(p.costo_envio)::numeric AS total_a_cobrar,
       MIN(p.created_at) AS primer_pedido,
       MAX(p.created_at) AS ultimo_pedido
     FROM pedidos p
     JOIN puestos pu ON pu.id = p.solicitado_por_tienda_id
     WHERE p.envio_pagado_por = 'tienda'
       AND p.estado = 'entregado'
       AND p.tienda_envio_pagado_at IS NULL
       AND p.created_at >= NOW() - ($1 || ' days')::interval
     GROUP BY p.solicitado_por_tienda_id, pu.nombre, pu.telefono_contacto
     ORDER BY SUM(p.costo_envio) DESC`,
    [String(dias)]
  );

  const totalGeneral = rows.reduce((s, r) => s + Number(r.total_a_cobrar), 0);

  return NextResponse.json({
    dias,
    total_general: Math.round(totalGeneral * 100) / 100,
    tiendas: rows.map((r) => ({
      tienda_id: r.tienda_id,
      tienda_nombre: r.tienda_nombre,
      telefono_contacto: r.telefono_contacto,
      num_pedidos: r.num_pedidos,
      total_a_cobrar: Math.round(Number(r.total_a_cobrar) * 100) / 100,
      primer_pedido: r.primer_pedido,
      ultimo_pedido: r.ultimo_pedido,
    })),
  });
}
