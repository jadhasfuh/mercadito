import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { calcularComision } from "@/lib/comision";
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
  const esCliente = usuario.rol === "cliente";
  if (esCliente) {
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

  // Cliente NO puede agregar items manuales (sustituciones) ni cambiar
  // precios — eso es flow del repartidor. Sin estos guards, un cliente
  // técnico podía bypassear la UI y manipular el pedido (ej. bajar
  // precios a $0.01). Validamos contra los items originales.
  if (esCliente) {
    const itemsActuales = await query<{ id: string; producto_id: string | null; precio_unitario: string }>(
      "SELECT id, producto_id, precio_unitario FROM pedido_items WHERE pedido_id = $1",
      [id]
    );
    const preciosOriginales = new Map(
      itemsActuales.map((it) => [it.id, Number(it.precio_unitario)])
    );
    for (const it of items as Array<{ id?: string; producto_id?: string | null; producto_nombre?: string; precio_unitario: number }>) {
      // No items manuales (sin producto_id pero con nombre libre).
      if (!it.producto_id && it.producto_nombre) {
        return NextResponse.json(
          { error: "Solo el repartidor puede agregar productos sustitutos" },
          { status: 403 }
        );
      }
      // Precios solo pueden mantenerse iguales al original.
      if (it.id && preciosOriginales.has(it.id)) {
        const original = preciosOriginales.get(it.id)!;
        if (Math.abs(Number(it.precio_unitario) - original) > 0.005) {
          return NextResponse.json(
            { error: "Solo el repartidor puede cambiar precios" },
            { status: 403 }
          );
        }
      }
    }
  }
  // items: [{ producto_id?, producto_nombre?, puesto_id, cantidad, precio_unitario,
  //           variante_id?, variante_nombre?, modificadores? }]
  // - producto_id presente → item de catálogo
  // - producto_id null/ausente + producto_nombre → item manual (sustitución)

  if (!items || !Array.isArray(items)) {
    return NextResponse.json({ error: "Items requeridos" }, { status: 400 });
  }

  // Validación: cada item es de catálogo (producto_id) o manual
  // (producto_nombre). Sin uno de los dos no se puede insertar.
  for (const item of items) {
    if (!item.puesto_id) {
      return NextResponse.json({ error: "Cada item necesita puesto_id" }, { status: 400 });
    }
    const tieneProducto = !!item.producto_id;
    const tieneNombre = typeof item.producto_nombre === "string" && item.producto_nombre.trim().length > 0;
    if (!tieneProducto && !tieneNombre) {
      return NextResponse.json({ error: "Cada item necesita producto_id o producto_nombre" }, { status: 400 });
    }
    if (!isFinite(Number(item.precio_unitario)) || Number(item.precio_unitario) <= 0) {
      return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
    }
    if (!isFinite(Number(item.cantidad)) || Number(item.cantidad) <= 0) {
      return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
    }
  }

  // Delete old items
  await query("DELETE FROM pedido_items WHERE pedido_id = $1", [id]);

  // Insert new items y recalcula totales.
  // Items manuales: producto_id NULL + producto_nombre con el texto libre.
  // Comisión: siempre recalculamos con calcularComision(precio_unitario) —
  // si el repartidor ajusta precios o agrega sustituciones, Mercadito sigue
  // ganando su porcentaje sobre el precio efectivo. El repartidor le avisa
  // al cliente del cambio antes de guardar.
  let subtotal = 0;
  for (const item of items) {
    const itemSubtotal = item.cantidad * item.precio_unitario;
    subtotal += itemSubtotal;
    const productoId: string | null = item.producto_id || null;
    const productoNombre: string | null = productoId
      ? null
      : String(item.producto_nombre).trim();
    const comisionUnit = calcularComision(Number(item.precio_unitario));
    await query(
      `INSERT INTO pedido_items (id, pedido_id, producto_id, producto_nombre, puesto_id, cantidad, precio_unitario, subtotal, comision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [uuidv4(), id, productoId, productoNombre, item.puesto_id, item.cantidad, item.precio_unitario, itemSubtotal, comisionUnit]
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
