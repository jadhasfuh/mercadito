import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde"); // YYYY-MM-DD
  const hasta = searchParams.get("hasta"); // YYYY-MM-DD

  let dateFilter = "";
  const params: unknown[] = [];
  if (desde && hasta) {
    params.push(desde, hasta);
    dateFilter = ` AND p.created_at >= $${params.length - 1}::date AND p.created_at < ($${params.length}::date + interval '1 day')`;
  }

  // General stats
  const [totales] = await query(
    `SELECT
      COUNT(*) as total_pedidos,
      COUNT(*) FILTER (WHERE p.estado = 'entregado') as entregados,
      COUNT(*) FILTER (WHERE p.estado = 'cancelado') as cancelados,
      COUNT(*) FILTER (WHERE p.estado NOT IN ('entregado', 'cancelado')) as activos,
      COALESCE(SUM(p.total) FILTER (WHERE p.estado = 'entregado'), 0) as ventas_total,
      COALESCE(SUM(p.subtotal) FILTER (WHERE p.estado = 'entregado'), 0) as subtotal_productos,
      COALESCE(SUM(p.costo_envio) FILTER (WHERE p.estado = 'entregado'), 0) as ingresos_envio,
      COUNT(DISTINCT p.cliente_telefono) FILTER (WHERE p.estado = 'entregado') as clientes_unicos
    FROM pedidos p
    WHERE 1=1${dateFilter}`,
    params
  );

  // Sales by day (last 30 days)
  const ventasPorDia = await query(
    `SELECT
      DATE(p.created_at) as fecha,
      COUNT(*) as pedidos,
      COALESCE(SUM(p.total), 0) as total,
      COALESCE(SUM(p.costo_envio), 0) as envios
    FROM pedidos p
    WHERE p.estado = 'entregado'
      AND p.created_at > NOW() - INTERVAL '30 days'
    GROUP BY DATE(p.created_at)
    ORDER BY fecha DESC`
  );

  // Sales by store (what we owe each store = subtotal of their items)
  const ventasPorTienda = await query(
    `SELECT
      pu.id as puesto_id,
      pu.nombre as puesto_nombre,
      COUNT(DISTINCT pi.pedido_id) as pedidos,
      COALESCE(SUM(pi.subtotal), 0) as total_vendido
    FROM pedido_items pi
    JOIN puestos pu ON pu.id = pi.puesto_id
    JOIN pedidos p ON p.id = pi.pedido_id
    WHERE p.estado = 'entregado'
    GROUP BY pu.id, pu.nombre
    ORDER BY total_vendido DESC`
  );

  // Sales by repartidor
  const ventasPorRepartidor = await query(
    `SELECT
      u.nombre as repartidor,
      COUNT(*) as pedidos_entregados,
      COALESCE(SUM(p.total), 0) as total,
      COALESCE(SUM(p.costo_envio), 0) as envios
    FROM pedidos p
    JOIN usuarios u ON u.id = p.repartidor_id
    WHERE p.estado = 'entregado'
    GROUP BY u.id, u.nombre
    ORDER BY pedidos_entregados DESC`
  );

  // Top products
  const topProductos = await query(
    `SELECT
      pr.nombre as producto,
      SUM(pi.cantidad) as cantidad_total,
      SUM(pi.subtotal) as total_vendido
    FROM pedido_items pi
    JOIN productos pr ON pr.id = pi.producto_id
    JOIN pedidos p ON p.id = pi.pedido_id
    WHERE p.estado = 'entregado'
    GROUP BY pr.id, pr.nombre
    ORDER BY cantidad_total DESC
    LIMIT 10`
  );

  // Pending store approvals
  const tiendasPendientes = await query(
    `SELECT p.*, u.nombre as nombre_dueno, u.telefono as telefono_dueno, u.id as usuario_id
     FROM puestos p
     LEFT JOIN usuarios u ON u.puesto_id = p.id AND (u.rol = 'tienda' OR u.rol = 'repartidor')
     WHERE p.aprobado = false`
  );

  // Active stores with owner info
  const tiendasActivas = await query(
    `SELECT p.id, p.nombre, p.descripcion, p.activo,
            u.id as usuario_id, u.nombre as nombre_dueno, u.telefono as telefono_dueno, u.rol as rol_dueno,
            COUNT(DISTINCT pr.id) FILTER (WHERE pr.activo = true) as total_productos
     FROM puestos p
     LEFT JOIN usuarios u ON u.puesto_id = p.id AND (u.rol = 'tienda' OR u.rol = 'repartidor')
     LEFT JOIN precios pr ON pr.puesto_id = p.id
     WHERE p.aprobado = true
     GROUP BY p.id, p.nombre, p.descripcion, p.activo, u.id, u.nombre, u.telefono, u.rol
     ORDER BY p.nombre`
  );

  return NextResponse.json({
    totales: {
      total_pedidos: parseInt(totales.total_pedidos),
      entregados: parseInt(totales.entregados),
      cancelados: parseInt(totales.cancelados),
      activos: parseInt(totales.activos),
      ventas_total: parseFloat(totales.ventas_total),
      subtotal_productos: parseFloat(totales.subtotal_productos),
      ingresos_envio: parseFloat(totales.ingresos_envio),
      clientes_unicos: parseInt(totales.clientes_unicos),
    },
    ventasPorDia: ventasPorDia.map((d) => ({
      fecha: d.fecha,
      pedidos: parseInt(d.pedidos),
      total: parseFloat(d.total),
      envios: parseFloat(d.envios),
    })),
    ventasPorTienda: ventasPorTienda.map((t) => ({
      ...t,
      pedidos: parseInt(t.pedidos),
      total_vendido: parseFloat(t.total_vendido),
    })),
    ventasPorRepartidor: ventasPorRepartidor.map((r) => ({
      ...r,
      pedidos_entregados: parseInt(r.pedidos_entregados),
      total: parseFloat(r.total),
      envios: parseFloat(r.envios),
    })),
    topProductos: topProductos.map((p) => ({
      ...p,
      cantidad_total: parseFloat(p.cantidad_total),
      total_vendido: parseFloat(p.total_vendido),
    })),
    tiendasPendientes,
    tiendasActivas: tiendasActivas.map((t) => ({
      ...t,
      total_productos: parseInt(t.total_productos),
    })),
  });
}
