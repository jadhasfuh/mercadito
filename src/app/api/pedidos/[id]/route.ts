import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { enviarPush } from "@/lib/push";
import { calcularRuta } from "@/lib/geo";
import { NextResponse } from "next/server";

type EstadoPedido = "pendiente" | "en_compra" | "en_camino" | "entregado" | "cancelado";

function mensajePorEstado(estado: EstadoPedido, tipo: "mercado" | "envio"): { title: string; body: string } | null {
  if (estado === "pendiente") return null;
  if (tipo === "envio") {
    if (estado === "en_compra") return { title: "Mercadito", body: "El repartidor va por tu paquete 📦" };
    if (estado === "en_camino") return { title: "Mercadito", body: "Tu paquete va en camino 🛵" };
    if (estado === "entregado") return { title: "Mercadito", body: "Tu paquete fue entregado 🎉" };
    if (estado === "cancelado") return { title: "Mercadito", body: "Tu envío fue cancelado" };
  }
  if (estado === "en_compra") return { title: "Mercadito", body: "Tu pedido ya se está comprando 🛒" };
  if (estado === "en_camino") return { title: "Mercadito", body: "Tu pedido va en camino 🛵" };
  if (estado === "entregado") return { title: "Mercadito", body: "Tu pedido fue entregado 🎉" };
  if (estado === "cancelado") return { title: "Mercadito", body: "Tu pedido fue cancelado" };
  return null;
}

/** Fire-and-forget push al cliente dueño del pedido cuando cambia el estado. */
async function notificarClientePedido(pedidoId: string, estado: EstadoPedido) {
  try {
    const pedido = await queryOne<{ cliente_id: string | null; cliente_telefono: string; tipo: string | null }>(
      "SELECT cliente_id, cliente_telefono, tipo FROM pedidos WHERE id = $1",
      [pedidoId]
    );
    if (!pedido) return;
    const tipo: "mercado" | "envio" = pedido.tipo === "envio" ? "envio" : "mercado";
    const msg = mensajePorEstado(estado, tipo);
    if (!msg) return;
    const rows = await query<{ push_token: string }>(
      `SELECT push_token FROM usuarios
       WHERE push_token IS NOT NULL AND activo = true AND rol = 'cliente'
         AND (id = $1 OR telefono = $2)`,
      [pedido.cliente_id, pedido.cliente_telefono]
    );
    const tokens = rows.map((r) => r.push_token);
    enviarPush(tokens, msg.title, msg.body, { pedidoId, tipo: "estado_pedido", estado });
  } catch (e) {
    console.error("[push] notificarClientePedido failed", e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { estado, repartidor_id, motivo_cancelacion, repartidor_rating, repartidor_review } = body;

  // Rating + comentario del repartidor: lo escribe el cliente dueño del
  // pedido (solo en pedidos entregados). Admin solo lo lee. Repartidor no
  // se autocalifica.
  if (repartidor_rating !== undefined || repartidor_review !== undefined) {
    if (usuario.rol !== "cliente") {
      return NextResponse.json({ error: "Solo el cliente puede calificar al repartidor" }, { status: 403 });
    }
    const pedido = await queryOne<{ cliente_id: string | null; cliente_telefono: string; estado: string }>(
      "SELECT cliente_id, cliente_telefono, estado FROM pedidos WHERE id = $1",
      [id]
    );
    if (!pedido) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    const isOwner = pedido.cliente_id === usuario.id || pedido.cliente_telefono === usuario.telefono;
    if (!isOwner) {
      return NextResponse.json({ error: "No tienes permiso para calificar este pedido" }, { status: 403 });
    }
    if (pedido.estado !== "entregado") {
      return NextResponse.json({ error: "Solo puedes calificar pedidos ya entregados" }, { status: 400 });
    }
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (repartidor_rating !== undefined) {
      const r = repartidor_rating === null ? null : Number(repartidor_rating);
      if (r !== null && (!Number.isInteger(r) || r < 1 || r > 5)) {
        return NextResponse.json({ error: "Rating inválido (1–5)" }, { status: 400 });
      }
      updates.push(`repartidor_rating = $${i++}`); values.push(r);
    }
    if (repartidor_review !== undefined) {
      updates.push(`repartidor_review = $${i++}`); values.push(repartidor_review || null);
    }
    values.push(id);
    await query(
      `UPDATE pedidos SET ${updates.join(", ")} WHERE id = $${i}`,
      values
    );
    // Si solo era esto, terminamos.
    if (estado === undefined && repartidor_id === undefined && motivo_cancelacion === undefined) {
      return NextResponse.json({ ok: true });
    }
  }

  // Assign repartidor — only repartidores (to themselves) or admin
  if (repartidor_id !== undefined) {
    if (usuario.rol === "repartidor") {
      if (repartidor_id !== null && repartidor_id !== usuario.id) {
        return NextResponse.json({ error: "Solo puedes asignarte a ti mismo" }, { status: 403 });
      }
    } else if (usuario.rol !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (repartidor_id !== null) {
      // Only claim unclaimed orders to prevent race condition
      const result = await query(
        "UPDATE pedidos SET repartidor_id = $1 WHERE id = $2 AND repartidor_id IS NULL RETURNING id",
        [repartidor_id, id]
      );
      if (result.length === 0) {
        return NextResponse.json({ error: "Este pedido ya fue tomado por otro repartidor" }, { status: 409 });
      }
    } else {
      // Allow un-assigning (setting to null)
      await query("UPDATE pedidos SET repartidor_id = $1 WHERE id = $2", [repartidor_id, id]);
    }
    if (!estado) {
      return NextResponse.json({ ok: true });
    }
  }

  if (estado) {
    const validStates = ["pendiente", "en_compra", "en_camino", "entregado", "cancelado"];
    if (!validStates.includes(estado)) {
      return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
    }

    if (estado === "cancelado") {
      const pedido = await queryOne(
        "SELECT id, estado, cliente_id, cliente_telefono FROM pedidos WHERE id = $1",
        [id]
      );
      if (!pedido) {
        return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
      }

      if (usuario.rol === "cliente") {
        // Client can only cancel their own orders in "pendiente"
        const isOwner = pedido.cliente_id === usuario.id || pedido.cliente_telefono === usuario.telefono;
        if (!isOwner) {
          return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });
        }
        if (pedido.estado !== "pendiente") {
          return NextResponse.json({ error: "Solo puedes cancelar pedidos que aun no se estan comprando. Llama al repartidor para coordinar." }, { status: 400 });
        }
      } else if (usuario.rol === "repartidor") {
        // Repartidor can cancel in "pendiente" or "en_compra", NOT once en_camino
        if (pedido.estado !== "pendiente" && pedido.estado !== "en_compra") {
          return NextResponse.json({ error: "No se puede cancelar un pedido que ya esta en camino" }, { status: 400 });
        }
      } else if (usuario.rol !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      // Save cancellation with reason
      await query(
        "UPDATE pedidos SET estado = 'cancelado', motivo_cancelacion = $1 WHERE id = $2",
        [motivo_cancelacion || null, id]
      );
      notificarClientePedido(id, "cancelado");
      return NextResponse.json({ ok: true, estado: "cancelado" });

    } else {
      // Non-cancel state changes: only repartidor and admin
      if (usuario.rol !== "repartidor" && usuario.rol !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      // Para envíos B2B (solicitados por tienda), el repartidor puede
      // mandar su ubicación GPS al entregar. Recalculamos el costo de
      // envío con la distancia real (tienda → punto de entrega) y
      // actualizamos el total + las coordenadas embebidas en
      // direccion_entrega. El costo inicial era solo estimación.
      const { entrega_lat: latEntrega, entrega_lng: lngEntrega, foto_entrega } = body;
      // Foto opcional al entregar — sirve como prueba ante disputas.
      // Validamos que sea data URL razonable (>50 chars) sin imponer
      // límite estricto; si es muy grande igual el endpoint lo aguanta.
      const fotoValida = typeof foto_entrega === "string" && foto_entrega.startsWith("data:") && foto_entrega.length > 50;
      let recosteo: { costoEnvio: number; total: number; direccion: string } | null = null;
      if (estado === "entregado" && latEntrega != null && lngEntrega != null) {
        const lat = Number(latEntrega);
        const lng = Number(lngEntrega);
        if (isFinite(lat) && isFinite(lng)) {
          const pedido = await queryOne<{
            tipo: string;
            recogida_lat: number | null;
            recogida_lng: number | null;
            recogida_nombre: string | null;
            subtotal: string;
            costo_envio: string;
            envio_pagado_por: string;
            solicitado_por_tienda_id: string | null;
            direccion_entrega: string;
          }>(
            `SELECT tipo, recogida_lat, recogida_lng, recogida_nombre, subtotal, costo_envio,
                    envio_pagado_por, solicitado_por_tienda_id, direccion_entrega
             FROM pedidos WHERE id = $1`,
            [id]
          );
          if (
            pedido &&
            pedido.tipo === "envio" &&
            pedido.solicitado_por_tienda_id &&
            pedido.recogida_lat != null &&
            pedido.recogida_lng != null
          ) {
            const ruta = await calcularRuta(lat, lng, {
              lat: pedido.recogida_lat,
              lng: pedido.recogida_lng,
              nombre: pedido.recogida_nombre || "Tienda",
            });
            const nuevoCostoEnvio = ruta.costoEnvio;
            const subtotal = Number(pedido.subtotal);
            // Total a cobrar al cliente: si la tienda absorbe envío,
            // cliente paga solo el monto del pedido; si no, paga ambos.
            const nuevoTotal = pedido.envio_pagado_por === "cliente"
              ? subtotal + nuevoCostoEnvio
              : subtotal;
            // Actualizar el [lat,lng] embebido en direccion_entrega para
            // que la próxima carga muestre la ubicación real.
            const textoSinCoords = pedido.direccion_entrega.replace(/\s*\[-?\d+\.\d+,\s*-?\d+\.\d+\]\s*$/, "").trim();
            const nuevaDireccion = `${textoSinCoords} [${lat},${lng}]`;
            recosteo = { costoEnvio: nuevoCostoEnvio, total: nuevoTotal, direccion: nuevaDireccion };
          }
        }
      }

      // Construimos el SET dinamicamente: estado siempre, costo/dir
      // si hubo recosteo (B2B con GPS), foto_entrega si la mandó.
      const sets: string[] = ["estado = $1"];
      const vals: unknown[] = [estado];
      let p = 2;
      if (recosteo) {
        sets.push(`costo_envio = $${p++}`); vals.push(recosteo.costoEnvio);
        sets.push(`total = $${p++}`); vals.push(recosteo.total);
        sets.push(`direccion_entrega = $${p++}`); vals.push(recosteo.direccion);
      }
      if (estado === "entregado" && fotoValida) {
        sets.push(`foto_entrega = $${p++}`); vals.push(foto_entrega);
      }
      vals.push(id);
      const result = await query(
        `UPDATE pedidos SET ${sets.join(", ")} WHERE id = $${p} RETURNING id`,
        vals
      );
      if (result.length === 0) {
        return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
      }

      // Bono de referidos: cuando un cliente nuevo (referido por alguien)
      // tiene su PRIMER pedido entregado, ambos ganan $30 de saldo. Solo
      // se da una vez por cliente — lo marcamos en el pedido para evitar
      // duplicar si el repartidor hace ping doble. Excluye envíos B2B
      // (no son del cliente final referido).
      if (estado === "entregado") {
        const pedidoBono = await queryOne<{
          id: string; cliente_id: string | null; tipo: string;
          credito_referido_aplicado: boolean;
        }>(
          "SELECT id, cliente_id, tipo, credito_referido_aplicado FROM pedidos WHERE id = $1",
          [id]
        );
        if (
          pedidoBono &&
          pedidoBono.cliente_id &&
          pedidoBono.tipo !== "envio" &&
          !pedidoBono.credito_referido_aplicado
        ) {
          const ref = await queryOne<{ referido_por_id: string | null }>(
            "SELECT referido_por_id FROM usuarios WHERE id = $1",
            [pedidoBono.cliente_id]
          );
          if (ref?.referido_por_id) {
            // Verificar que sea el primer pedido entregado del cliente.
            const previos = await queryOne<{ count: string }>(
              `SELECT COUNT(*)::text as count FROM pedidos
               WHERE cliente_id = $1 AND estado = 'entregado' AND id != $2`,
              [pedidoBono.cliente_id, id]
            );
            const yaTuvo = Number(previos?.count ?? 0) > 0;
            if (!yaTuvo) {
              const BONO = 30;
              await query(
                "UPDATE usuarios SET saldo_credito = saldo_credito + $1 WHERE id = $2",
                [BONO, pedidoBono.cliente_id]
              );
              await query(
                "UPDATE usuarios SET saldo_credito = saldo_credito + $1 WHERE id = $2",
                [BONO, ref.referido_por_id]
              );
              await query(
                "UPDATE pedidos SET credito_referido_aplicado = true WHERE id = $1",
                [id]
              );
            }
          }
        }
      }

      notificarClientePedido(id, estado as EstadoPedido);
      return NextResponse.json({
        ok: true,
        estado,
        costo_envio_actualizado: recosteo ? recosteo.costoEnvio : undefined,
        total_actualizado: recosteo ? recosteo.total : undefined,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
