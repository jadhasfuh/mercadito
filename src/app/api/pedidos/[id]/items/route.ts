import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// PATCH — edit items of an order
// Client can edit in "pendiente", repartidor in "pendiente" or "en_compra"
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const pedido = await queryOne(
    "SELECT id, estado, cliente_id, cliente_telefono FROM pedidos WHERE id = $1",
    [id]
  );
  if (!pedido) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  // Prevent editing delivered or cancelled orders
  if (pedido.estado === "entregado" || pedido.estado === "cancelado") {
    return NextResponse.json({ error: "No se puede editar un pedido entregado o cancelado" }, { status: 400 });
  }

  // Permission check
  if (usuario.rol === "cliente") {
    const isOwner = pedido.cliente_id === usuario.id || pedido.cliente_telefono === usuario.telefono;
    if (!isOwner) {
      return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });
    }
    if (pedido.estado !== "pendiente") {
      return NextResponse.json({ error: "Solo puedes editar pedidos pendientes" }, { status: 400 });
    }
  } else if (usuario.rol === "repartidor" || usuario.rol === "admin") {
    if (pedido.estado !== "pendiente" && pedido.estado !== "en_compra") {
      return NextResponse.json({ error: "Solo se puede editar en pendiente o comprando" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { items, editado_por } = body;
  // items: [{ producto_id, puesto_id, cantidad, precio_unitario }]

  if (!items || !Array.isArray(items)) {
    return NextResponse.json({ error: "Items requeridos" }, { status: 400 });
  }

  // Delete old items
  await query("DELETE FROM pedido_items WHERE pedido_id = $1", [id]);

  // Insert new items and recalculate totals
  let subtotal = 0;
  for (const item of items) {
    if (item.cantidad <= 0) continue;
    const itemSubtotal = item.cantidad * item.precio_unitario;
    subtotal += itemSubtotal;
    await query(
      `INSERT INTO pedido_items (id, pedido_id, producto_id, puesto_id, cantidad, precio_unitario, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuidv4(), id, item.producto_id, item.puesto_id, item.cantidad, item.precio_unitario, itemSubtotal]
    );
  }

  // Update pedido totals
  const pedidoData = await queryOne(
    "SELECT costo_envio FROM pedidos WHERE id = $1",
    [id]
  );
  const costoEnvio = parseFloat(pedidoData!.costo_envio);
  const total = subtotal + costoEnvio;

  // Track who edited
  const quien = editado_por || usuario.nombre || usuario.rol;
  await query(
    `UPDATE pedidos SET subtotal = $1, total = $2, editado_por = $3, editado_at = NOW()
     WHERE id = $4`,
    [subtotal, total, quien, id]
  );

  return NextResponse.json({ ok: true, subtotal, total });
}
