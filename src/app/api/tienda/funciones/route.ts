import { queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/tienda/funciones — qué tiene encendido el negocio.
//
// Alimenta el centro de ayuda "Qué puedes hacer con Mercadito": cada función se
// marca Activado o Sin usar según lo que el negocio realmente hizo, no según lo
// que dice su plan. Muchos pagan la suscripción sin saber que tienen mesas,
// comandas o meseros, y una lista de funciones sin estado no lo resuelve — se
// lee como publicidad.
//
// "Activado" significa USADO, no disponible: tener el interruptor de mesas
// prendido sin una sola mesa dada de alta no es tener mesas.
export async function GET() {
  const u = await getUsuarioFromSession();
  if (!u || (u.rol !== "tienda" && u.rol !== "admin") || !u.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const row = await queryOne<{
    tipo: string; menu_publico: boolean | null; dine_in_activo: boolean | null;
    menu_vistas: number; menu_slug: string | null;
    productos: number; mesas: number; meseros: number; comandas: number;
    cortes: number; citas: number; servicios_pedido: unknown;
  }>(
    `SELECT p.tipo, p.menu_publico, p.dine_in_activo,
            COALESCE(p.menu_vistas, 0)::int AS menu_vistas, p.menu_slug,
            p.servicios_pedido,
            (SELECT COUNT(*)::int FROM precios WHERE puesto_id = p.id AND activo = true) AS productos,
            (SELECT COUNT(*)::int FROM mesas WHERE puesto_id = p.id AND activa = true) AS mesas,
            (SELECT COUNT(*)::int FROM usuarios WHERE puesto_id = p.id AND rol = 'mesero' AND activo = true) AS meseros,
            (SELECT COUNT(*)::int FROM cuentas WHERE puesto_id = p.id) AS comandas,
            (SELECT COUNT(*)::int FROM caja_turnos WHERE puesto_id = p.id) AS cortes,
            (SELECT COUNT(*)::int FROM citas WHERE puesto_id = p.id) AS citas
     FROM puestos p WHERE p.id = $1`,
    [u.puesto_id]
  ).catch(() => null);

  if (!row) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

  const serviciosPedido = Array.isArray(row.servicios_pedido)
    ? (row.servicios_pedido as string[])
    : typeof row.servicios_pedido === "string"
      ? (JSON.parse(row.servicios_pedido || "[]") as string[])
      : [];

  return NextResponse.json({
    // `aplica` decide si la tarjeta se muestra: a un negocio de puras reservas
    // no le sirve leer sobre comandas de cocina.
    menu:      { activado: row.menu_publico !== false && row.productos > 0, aplica: true, extra: { productos: row.productos, vistas: row.menu_vistas, slug: row.menu_slug } },
    ficha:     { activado: serviciosPedido.length > 0, aplica: true },
    mesas:     { activado: !!row.dine_in_activo && row.mesas > 0, aplica: true, extra: { mesas: row.mesas } },
    comandas:  { activado: row.comandas > 0, aplica: !!row.dine_in_activo },
    meseros:   { activado: row.meseros > 0, aplica: !!row.dine_in_activo, extra: { meseros: row.meseros } },
    caja:      { activado: row.cortes > 0, aplica: true },
    reservas:  { activado: row.citas > 0, aplica: row.tipo === "servicios" || row.tipo === "ambos" },
  });
}
