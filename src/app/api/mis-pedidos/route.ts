import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Rol equivocado NO es 401: el móvil desloguea ante cualquier 401 con token,
  // así que un repartidor/tienda que caiga aquí no debe perder su sesión → 403.
  if (usuario.rol !== "cliente") {
    return NextResponse.json({ error: "Solo clientes" }, { status: 403 });
  }

  // Find orders by cliente_id or by phone number (for orders placed before login)
  const pedidos = await query(
    `SELECT p.*, COALESCE(z.nombre, 'Ubicación en mapa') as zona_nombre,
            r.nombre as repartidor_nombre, r.telefono as repartidor_telefono,
            r.ubicacion_lat as repartidor_lat, r.ubicacion_lng as repartidor_lng,
            r.ubicacion_at  as repartidor_ubicacion_at,
            EXISTS (
              SELECT 1 FROM pedido_items pi JOIN puestos pu ON pu.id = pi.puesto_id
              WHERE pi.pedido_id = p.id AND pu.ciudad <> 'sahuayo'
            ) as es_foraneo
     FROM pedidos p
     LEFT JOIN zonas_entrega z ON z.id = p.zona_id
     LEFT JOIN usuarios r ON r.id = p.repartidor_id
     WHERE p.cliente_id = $1 OR p.cliente_telefono = $2
     ORDER BY p.created_at DESC`,
    [usuario.id, usuario.telefono]
  );

  // Repartidor "de turno" para pedidos sin asignar — el cliente lo ve desde el
  // momento de la compra. Hoy con un solo repartidor activo es claro; con
  // varios el primero registrado es un placeholder razonable.
  const repartidorDefault = await queryOne(
    `SELECT nombre, telefono FROM usuarios
     WHERE rol = 'repartidor' AND activo = true
     ORDER BY created_at ASC, id ASC LIMIT 1`
  );

  // Items de TODOS los pedidos en UNA sola query (antes era N+1: una query por
  // pedido, y esta ruta se poletea cada 15s → saturaba el pooler).
  // LEFT JOIN a productos: items manuales (sustituciones del repartidor) tienen
  // producto_id NULL y traen su propio producto_nombre.
  const pedidoIds = pedidos.map((p) => p.id);
  const allItems = pedidoIds.length
    ? await query(
        `SELECT pi.*,
                COALESCE(pi.producto_nombre, pr.nombre) as producto_nombre,
                pu.nombre as puesto_nombre,
                COALESCE(pr.unidad, 'pieza') as unidad,
                (pi.producto_id IS NULL) as manual
         FROM pedido_items pi
         LEFT JOIN productos pr ON pr.id = pi.producto_id
         JOIN puestos pu ON pu.id = pi.puesto_id
         WHERE pi.pedido_id = ANY($1)`,
        [pedidoIds]
      )
    : [];

  const itemsPorPedido = new Map();
  for (const item of allItems) {
    if (!itemsPorPedido.has(item.pedido_id)) itemsPorPedido.set(item.pedido_id, []);
    itemsPorPedido.get(item.pedido_id).push({
      ...item,
      cantidad: parseFloat(item.cantidad),
      precio_unitario: parseFloat(item.precio_unitario),
      subtotal: parseFloat(item.subtotal),
    });
  }

  const result = pedidos.map((pedido) => ({
    ...pedido,
    subtotal: parseFloat(pedido.subtotal),
    costo_envio: parseFloat(pedido.costo_envio),
    total: parseFloat(pedido.total),
    repartidor_default: repartidorDefault
      ? { nombre: repartidorDefault.nombre, telefono: repartidorDefault.telefono }
      : null,
    items: itemsPorPedido.get(pedido.id) ?? [],
  }));

  return NextResponse.json(result);
}
