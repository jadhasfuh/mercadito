import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { infoPlan } from "@/lib/plan";
import { NextResponse } from "next/server";

// GET /api/citas/stats?dias=30 — métricas de citas del negocio (tienda/admin).
// Ingreso = suma del precio de las citas completadas en el periodo.
export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const puestoId = usuario.rol === "admin" ? searchParams.get("puesto_id") : usuario.puesto_id;
  if (!puestoId) return NextResponse.json({ error: "Sin puesto" }, { status: 400 });

  const dias = Math.min(Math.max(parseInt(searchParams.get("dias") || "30", 10) || 30, 1), 365);

  const resumen = await queryOne<{
    total: string;
    completadas: string;
    canceladas: string;
    no_shows: string;
    pendientes: string;
    ingreso: string;
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE estado = 'completada') AS completadas,
       COUNT(*) FILTER (WHERE estado = 'cancelada') AS canceladas,
       COUNT(*) FILTER (WHERE estado = 'no_show') AS no_shows,
       COUNT(*) FILTER (WHERE estado IN ('pendiente','confirmada')) AS pendientes,
       COALESCE(SUM(COALESCE(monto_cobrado, precio)) FILTER (WHERE estado = 'completada'), 0) AS ingreso
     FROM citas
     WHERE puesto_id = $1 AND inicio >= NOW() - make_interval(days => $2)`,
    [puestoId, dias]
  );

  const top = await query(
    `SELECT servicio_nombre,
       COUNT(*) AS n,
       COALESCE(SUM(COALESCE(monto_cobrado, precio)) FILTER (WHERE estado = 'completada'), 0) AS ingreso
     FROM citas
     WHERE puesto_id = $1 AND inicio >= NOW() - make_interval(days => $2)
     GROUP BY servicio_nombre
     ORDER BY n DESC
     LIMIT 5`,
    [puestoId, dias]
  );

  const puesto = await queryOne<{ plan: string; suscripcion_hasta: string | null; categoria_servicio: string | null }>(
    "SELECT plan, suscripcion_hasta, categoria_servicio FROM puestos WHERE id = $1",
    [puestoId]
  );

  // Ventas de PRODUCTOS de este puesto (si vende). Solo pedidos entregados.
  const productos = await queryOne<{ pedidos: string; items: string; ingreso: string }>(
    `SELECT COUNT(DISTINCT pi.pedido_id) AS pedidos,
            COALESCE(SUM(pi.cantidad), 0) AS items,
            COALESCE(SUM(pi.subtotal), 0) AS ingreso
     FROM pedido_items pi
     JOIN pedidos p ON p.id = pi.pedido_id
     WHERE pi.puesto_id = $1 AND p.estado = 'entregado'
       AND p.created_at >= NOW() - make_interval(days => $2)`,
    [puestoId, dias]
  );

  // Top productos del puesto en el periodo.
  const topProductos = await query(
    `SELECT COALESCE(pr.nombre, pi.producto_nombre, 'Producto') AS nombre,
            SUM(pi.cantidad) AS cantidad, COALESCE(SUM(pi.subtotal), 0) AS ingreso
     FROM pedido_items pi
     JOIN pedidos p ON p.id = pi.pedido_id
     LEFT JOIN productos pr ON pr.id = pi.producto_id
     WHERE pi.puesto_id = $1 AND p.estado = 'entregado'
       AND p.created_at >= NOW() - make_interval(days => $2)
     GROUP BY 1
     ORDER BY cantidad DESC
     LIMIT 5`,
    [puestoId, dias]
  );

  const tp = await queryOne<{ tiene: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM precios WHERE puesto_id = $1 AND activo = true) AS tiene",
    [puestoId]
  );

  return NextResponse.json({
    dias,
    resumen,
    top,
    productos,
    topProductos,
    tieneProductos: tp?.tiene ?? false,
    plan: puesto?.plan ?? "gratis",
    suscripcion_hasta: puesto?.suscripcion_hasta ?? null,
    categoria_servicio: puesto?.categoria_servicio ?? null,
    planInfo: infoPlan(puesto?.plan ?? "gratis", puesto?.suscripcion_hasta ?? null),
  });
}
