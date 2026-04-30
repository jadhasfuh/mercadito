import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "cliente") {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Find orders by cliente_id or by phone number (for orders placed before login)
  const pedidos = await query(
    `SELECT p.*, COALESCE(z.nombre, 'Ubicación en mapa') as zona_nombre,
            r.nombre as repartidor_nombre, r.telefono as repartidor_telefono,
            r.ubicacion_lat as repartidor_lat, r.ubicacion_lng as repartidor_lng,
            r.ubicacion_at  as repartidor_ubicacion_at
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

  const result = await Promise.all(
    pedidos.map(async (pedido) => {
      const items = await query(
        `SELECT pi.*, pr.nombre as producto_nombre, pu.nombre as puesto_nombre, pr.unidad
         FROM pedido_items pi
         JOIN productos pr ON pr.id = pi.producto_id
         JOIN puestos pu ON pu.id = pi.puesto_id
         WHERE pi.pedido_id = $1`,
        [pedido.id]
      );
      return {
        ...pedido,
        subtotal: parseFloat(pedido.subtotal),
        costo_envio: parseFloat(pedido.costo_envio),
        total: parseFloat(pedido.total),
        repartidor_default: repartidorDefault
          ? { nombre: repartidorDefault.nombre, telefono: repartidorDefault.telefono }
          : null,
        items: items.map((item) => ({
          ...item,
          cantidad: parseFloat(item.cantidad),
          precio_unitario: parseFloat(item.precio_unitario),
          subtotal: parseFloat(item.subtotal),
        })),
      };
    })
  );

  return NextResponse.json(result);
}
