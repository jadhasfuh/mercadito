import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "cliente") {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Find orders by cliente_id or by phone number (for orders placed before login)
  const pedidos = await query(
    `SELECT p.*, COALESCE(z.nombre, 'Ubicación en mapa') as zona_nombre
     FROM pedidos p
     LEFT JOIN zonas_entrega z ON z.id = p.zona_id
     WHERE p.cliente_id = $1 OR p.cliente_telefono = $2
     ORDER BY p.created_at DESC`,
    [usuario.id, usuario.telefono]
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
