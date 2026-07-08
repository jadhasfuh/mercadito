import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { calcularComision } from "@/lib/comision";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// PATCH — edit items of an order
// Cliente   → solo "pendiente", sin cambiar precios ni agregar sustitutos
// Repartidor/admin → "pendiente" o "en_compra", todo permitido
// Tienda    → "pendiente" o "en_compra", solo items de su propio puesto
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const pedido = await queryOne<{
    id: string;
    estado: string;
    cliente_id: string | null;
    cliente_telefono: string | null;
    cliente_nombre: string | null;
    metodo_pago: string | null;
    total: string;
    repartidor_id: string | null;
  }>(
    "SELECT id, estado, cliente_id, cliente_telefono, cliente_nombre, metodo_pago, total, repartidor_id FROM pedidos WHERE id = $1",
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
  const esTienda = usuario.rol === "tienda";
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
    // IDOR: el repartidor solo edita items de pedidos asignados a él. Admin exento.
    if (usuario.rol === "repartidor" && pedido.repartidor_id !== usuario.id) {
      return NextResponse.json({ error: "Solo puedes editar pedidos asignados a ti" }, { status: 403 });
    }
  } else if (esTienda) {
    if (pedido.estado !== "pendiente" && pedido.estado !== "en_compra") {
      return NextResponse.json({ error: "Solo se puede editar en pendiente o comprando" }, { status: 400 });
    }
    if (!usuario.puesto_id) {
      return NextResponse.json({ error: "Tu cuenta no tiene puesto asignado" }, { status: 403 });
    }
    // La tienda solo puede tocar pedidos donde tenga al menos un item suyo.
    const puestosDelPedido = await query<{ puesto_id: string }>(
      "SELECT DISTINCT puesto_id FROM pedido_items WHERE pedido_id = $1",
      [id]
    );
    if (!puestosDelPedido.some((p) => p.puesto_id === usuario.puesto_id)) {
      return NextResponse.json({ error: "Este pedido no tiene productos de tu tienda" }, { status: 403 });
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

  // La tienda solo puede modificar items de SU puesto. Items de otras
  // tiendas del mismo pedido deben mantenerse igual al original (precio
  // y cantidad). No puede agregar items a tiendas que no son la suya.
  if (esTienda) {
    const itemsActuales = await query<{ id: string; puesto_id: string; precio_unitario: string; cantidad: string }>(
      "SELECT id, puesto_id, precio_unitario, cantidad FROM pedido_items WHERE pedido_id = $1",
      [id]
    );
    const orig = new Map(itemsActuales.map((it) => [it.id, it]));
    for (const it of items as Array<{ id?: string; puesto_id: string; precio_unitario: number; cantidad: number }>) {
      if (it.puesto_id !== usuario.puesto_id) {
        if (!it.id || !orig.has(it.id)) {
          return NextResponse.json({ error: "No puedes agregar productos a otras tiendas" }, { status: 403 });
        }
        const o = orig.get(it.id)!;
        const cambioPrecio = Math.abs(Number(it.precio_unitario) - Number(o.precio_unitario)) > 0.005;
        const cambioCantidad = Math.abs(Number(it.cantidad) - Number(o.cantidad)) > 0.005;
        if (cambioPrecio || cambioCantidad) {
          return NextResponse.json({ error: "Solo puedes editar productos de tu propia tienda" }, { status: 403 });
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

  // Avisar al cliente si el total cambió. Crítico para tarjeta: si subió,
  // necesita preparar efectivo por la diferencia (no se puede recobrar al
  // POS); si bajó, el repartidor le dará el cambio. La diferencia mínima
  // ($1) evita ruido por redondeos.
  const totalAnterior = Number(pedido.total);
  const diff = total - totalAnterior;
  if (Math.abs(diff) >= 1 && !esCliente) {
    try {
      const tokens = await query<{ push_token: string }>(
        `SELECT push_token FROM usuarios
         WHERE push_token IS NOT NULL AND activo = true AND rol = 'cliente'
           AND (id = $1 OR telefono = $2)`,
        [pedido.cliente_id, pedido.cliente_telefono]
      );
      const subio = diff > 0;
      const esTarjeta = pedido.metodo_pago === "tarjeta";
      const monto = `$${total.toFixed(0)}`;
      const dif = `$${Math.abs(diff).toFixed(0)}`;
      let title: string;
      let body: string;
      if (esTarjeta && subio) {
        title = "Tu pedido cambió de precio 💳";
        body = `Nuevo total: ${monto} (${dif} más). Prepara efectivo para la diferencia, el repartidor te avisará.`;
      } else if (esTarjeta && !subio) {
        title = "Tu pedido bajó de precio 💳";
        body = `Nuevo total: ${monto} (${dif} menos). El repartidor te dará el cambio en efectivo.`;
      } else if (subio) {
        title = "Tu pedido cambió de precio";
        body = `Nuevo total: ${monto} (${dif} más). Diferencia se cobra al entregar.`;
      } else {
        title = "Tu pedido bajó de precio";
        body = `Nuevo total: ${monto} (${dif} menos). El repartidor te ajustará el cobro.`;
      }
      enviarPush(
        tokens.map((r) => r.push_token),
        title,
        body,
        { pedidoId: id, tipo: "precio_cambiado", total, diff }
      );
    } catch (e) {
      console.error("[push] precio cambiado failed", e);
    }
  }

  return NextResponse.json({ ok: true, subtotal, total });
}
