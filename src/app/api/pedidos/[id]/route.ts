import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { enviarPush } from "@/lib/push";
import { enviarWebPushAUsuarios } from "@/lib/webpush";
import { calcularRuta } from "@/lib/geo";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

/**
 * Cargo de liquidación: cuando un repartidor NO de confianza entrega un pedido
 * de catálogo en efectivo, cobró el ticket completo y le debe a Mercadito su
 * comisión (servicio). Lo registramos como 'cargo' en su cuenta. Idempotente
 * (índice único parcial por pedido). Fernando (confianza) no acumula deuda.
 */
async function registrarCargoEfectivo(pedidoId: string) {
  try {
    const ped = await queryOne<{ repartidor_id: string | null; metodo_pago: string; tipo: string | null }>(
      "SELECT repartidor_id, metodo_pago, tipo FROM pedidos WHERE id = $1",
      [pedidoId]
    );
    if (!ped?.repartidor_id || ped.metodo_pago !== "efectivo" || (ped.tipo ?? "mercado") !== "mercado") return;
    const conf = await queryOne<{ repartidor_confianza: boolean }>(
      "SELECT repartidor_confianza FROM usuarios WHERE id = $1",
      [ped.repartidor_id]
    );
    if (!conf || conf.repartidor_confianza) return;
    const com = await queryOne<{ total: string }>(
      "SELECT COALESCE(SUM(comision), 0)::text AS total FROM pedido_items WHERE pedido_id = $1",
      [pedidoId]
    );
    const monto = Number(com?.total ?? 0);
    if (monto <= 0) return;
    await query(
      `INSERT INTO repartidor_movimientos (id, repartidor_id, pedido_id, tipo, monto, concepto)
       VALUES ($1, $2, $3, 'cargo', $4, 'Comisión Mercadito de pedido en efectivo')
       ON CONFLICT (pedido_id) WHERE tipo = 'cargo' DO NOTHING`,
      [uuidv4(), ped.repartidor_id, pedidoId, monto]
    );
  } catch (e) {
    console.error("[liquidacion] registrarCargoEfectivo failed", e);
  }
}

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
    // Sin filtro push_token IS NOT NULL: los usuarios web no tienen token Expo
    // pero sí pueden tener suscripción web push. Traemos id para ambos canales.
    const rows = await query<{ id: string; push_token: string | null }>(
      `SELECT id, push_token FROM usuarios
       WHERE activo = true AND rol = 'cliente'
         AND (id = $1 OR telefono = $2)`,
      [pedido.cliente_id, pedido.cliente_telefono]
    );
    const data = { pedidoId, tipo: "estado_pedido", estado };
    enviarPush(rows.map((r) => r.push_token).filter((t): t is string => !!t), msg.title, msg.body, data);
    enviarWebPushAUsuarios(rows.map((r) => r.id), msg.title, msg.body, data);
  } catch (e) {
    console.error("[push] notificarClientePedido failed", e);
  }
}

type EventoTienda = "repartidor_asignado" | "en_compra" | "en_camino" | "entregado" | "cancelado";

function mensajeTienda(evento: EventoTienda): { title: string; body: string } {
  switch (evento) {
    case "repartidor_asignado": return { title: "🛵 Pedido asignado", body: "Un repartidor tomó tu pedido y va en camino" };
    case "en_compra": return { title: "🛒 Repartidor recogiendo", body: "El repartidor está recogiendo el pedido" };
    case "en_camino": return { title: "🛵 Pedido en camino", body: "El pedido va camino al cliente" };
    case "entregado": return { title: "✅ Pedido entregado", body: "El pedido fue entregado al cliente" };
    case "cancelado": return { title: "❌ Pedido cancelado", body: "El pedido fue cancelado" };
  }
}

/** Fire-and-forget push a la(s) tienda(s) involucradas en el pedido.
 *  - Catálogo: tiendas con items en el pedido (puestos distintos de los items).
 *  - B2B (envío): la tienda que solicitó el repartidor.
 *  Filtra push_token + rol=tienda + tienda activa para no spamear cuentas
 *  desactivadas. */
async function notificarTiendaPedido(pedidoId: string, evento: EventoTienda) {
  try {
    const puestos = await query<{ puesto_id: string }>(
      `SELECT DISTINCT pi.puesto_id FROM pedido_items pi WHERE pi.pedido_id = $1
       UNION
       SELECT solicitado_por_tienda_id AS puesto_id FROM pedidos
       WHERE id = $1 AND solicitado_por_tienda_id IS NOT NULL`,
      [pedidoId]
    );
    if (puestos.length === 0) return;
    const puestoIds = puestos.map((p) => p.puesto_id);
    const rows = await query<{ id: string; push_token: string | null }>(
      `SELECT u.id, u.push_token FROM usuarios u
       WHERE u.activo = true AND u.rol = 'tienda' AND u.puesto_id = ANY($1)`,
      [puestoIds]
    );
    if (rows.length === 0) return;
    const msg = mensajeTienda(evento);
    const data = { pedidoId, tipo: "estado_pedido_tienda", evento };
    enviarPush(rows.map((r) => r.push_token).filter((t): t is string => !!t), msg.title, msg.body, data);
    enviarWebPushAUsuarios(rows.map((r) => r.id), msg.title, msg.body, data);
  } catch (e) {
    console.error("[push] notificarTiendaPedido failed", e);
  }
}

/** Fire-and-forget push al repartidor ASIGNADO cuando cambia el estado.
 *  Si el pedido no tiene repartidor (p.ej. cancelación de un pendiente que
 *  nadie tomó), no notifica a nadie. */
async function notificarRepartidorPedido(pedidoId: string, evento: EventoTienda) {
  try {
    const pedido = await queryOne<{ repartidor_id: string | null }>(
      "SELECT repartidor_id FROM pedidos WHERE id = $1",
      [pedidoId]
    );
    if (!pedido?.repartidor_id) return;
    const rows = await query<{ push_token: string }>(
      `SELECT push_token FROM usuarios
       WHERE push_token IS NOT NULL AND activo = true
         AND rol = 'repartidor' AND id = $1`,
      [pedido.repartidor_id]
    );
    const tokens = rows.map((r) => r.push_token);
    if (tokens.length === 0) return;
    const msg = mensajeTienda(evento);
    enviarPush(tokens, msg.title, msg.body, { pedidoId, tipo: "estado_pedido_repartidor", evento });
  } catch (e) {
    console.error("[push] notificarRepartidorPedido failed", e);
  }
}

/** Fire-and-forget push al admin para eventos que le interesan (venta
 *  registrada, cancelación). Da visibilidad al dueño sin entrar al panel. */
async function notificarAdminPedido(pedidoId: string, evento: "cancelado" | "entregado") {
  try {
    const pedido = await queryOne<{ cliente_nombre: string | null; total: string | null }>(
      "SELECT cliente_nombre, total FROM pedidos WHERE id = $1",
      [pedidoId]
    );
    const rows = await query<{ push_token: string }>(
      `SELECT push_token FROM usuarios
       WHERE push_token IS NOT NULL AND activo = true AND rol = 'admin'`
    );
    const tokens = rows.map((r) => r.push_token);
    if (tokens.length === 0) return;
    const nombre = pedido?.cliente_nombre || "Cliente";
    const monto = pedido?.total != null ? ` — $${Number(pedido.total).toFixed(0)}` : "";
    const titulo = evento === "cancelado" ? "❌ Pedido cancelado" : "✅ Venta entregada";
    enviarPush(tokens, titulo, `${nombre}${monto}`, { pedidoId, tipo: "admin_pedido", evento });
  } catch (e) {
    console.error("[push] notificarAdminPedido failed", e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { estado, repartidor_id, motivo_cancelacion, repartidor_rating, repartidor_review, upgrade_premium } = body;

  // Upgrade a premium: el cliente dueño sube su pedido foráneo normal, aún
  // pendiente y sin tomar, a premium (Fernando asegurado, +$15). Asigna a
  // Fernando de inmediato y recalcula el total.
  if (upgrade_premium) {
    const { FERNANDO_ID, PREMIUM_SURCHARGE } = await import("@/lib/ciudades");
    const ped = await queryOne<{
      cliente_id: string | null; cliente_telefono: string; estado: string;
      tier_repartidor: string; repartidor_id: string | null;
      costo_envio: string; total: string;
    }>(
      "SELECT cliente_id, cliente_telefono, estado, tier_repartidor, repartidor_id, costo_envio, total FROM pedidos WHERE id = $1",
      [id]
    );
    if (!ped) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    const isOwner = usuario.rol === "cliente" && (ped.cliente_id === usuario.id || ped.cliente_telefono === usuario.telefono);
    if (!isOwner && usuario.rol !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (ped.tier_repartidor === "premium") {
      return NextResponse.json({ error: "Este pedido ya es asegurado" }, { status: 400 });
    }
    if (ped.estado !== "pendiente" || ped.repartidor_id) {
      return NextResponse.json({ error: "Ya no se puede cambiar este pedido a asegurado" }, { status: 400 });
    }
    // Premium solo aplica a pedidos foráneos (Jiquilpan/San Pedro).
    const foraneo = await queryOne<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pedido_items pi
       JOIN puestos pu ON pu.id = pi.puesto_id
       WHERE pi.pedido_id = $1 AND pu.ciudad <> 'sahuayo'`,
      [id]
    );
    if (Number(foraneo?.n ?? 0) === 0) {
      return NextResponse.json({ error: "El asegurado solo aplica a pedidos de otra ciudad" }, { status: 400 });
    }
    const nuevoEnvio = Number(ped.costo_envio) + PREMIUM_SURCHARGE;
    const nuevoTotal = Number(ped.total) + PREMIUM_SURCHARGE;
    const r = await query(
      `UPDATE pedidos SET tier_repartidor = 'premium', repartidor_id = $1, costo_envio = $2, total = $3
       WHERE id = $4 AND estado = 'pendiente' AND repartidor_id IS NULL RETURNING id`,
      [FERNANDO_ID, nuevoEnvio, nuevoTotal, id]
    );
    if (r.length === 0) return NextResponse.json({ error: "Ya no se puede cambiar este pedido" }, { status: 409 });
    notificarTiendaPedido(id, "repartidor_asignado");
    return NextResponse.json({ ok: true, tier_repartidor: "premium", costo_envio: nuevoEnvio, total: nuevoTotal });
  }

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
      notificarTiendaPedido(id, "repartidor_asignado");
    } else {
      // Soltar (repartidor_id = null). Un repartidor solo puede soltar SU
      // propio pedido; sin el filtro de dueño, cualquier repartidor podía
      // soltar (y luego re-tomar) el pedido de otro. Admin puede soltar cualquiera.
      if (usuario.rol === "repartidor") {
        const soltado = await query(
          "UPDATE pedidos SET repartidor_id = NULL WHERE id = $1 AND repartidor_id = $2 RETURNING id",
          [id, usuario.id]
        );
        if (soltado.length === 0) {
          return NextResponse.json({ error: "No puedes soltar un pedido que no es tuyo" }, { status: 403 });
        }
      } else {
        await query("UPDATE pedidos SET repartidor_id = NULL WHERE id = $1", [id]);
      }
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
      notificarTiendaPedido(id, "cancelado");
      notificarRepartidorPedido(id, "cancelado");
      notificarAdminPedido(id, "cancelado");
      return NextResponse.json({ ok: true, estado: "cancelado" });

    } else {
      // Non-cancel state changes: only repartidor and admin
      if (usuario.rol !== "repartidor" && usuario.rol !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      // IDOR: un repartidor solo puede mover el estado de pedidos ASIGNADOS a
      // él. Sin esto, cualquier repartidor marcaba 'entregado' el pedido de
      // otro y disparaba deuda/bono contra el asignado. Admin exento. (Si en
      // esta misma request se acaba de auto-asignar, el bloque de arriba ya
      // dejó repartidor_id = usuario.id, así que este check pasa.)
      if (usuario.rol === "repartidor") {
        const dueno = await queryOne<{ repartidor_id: string | null }>(
          "SELECT repartidor_id FROM pedidos WHERE id = $1",
          [id]
        );
        if (!dueno || dueno.repartidor_id !== usuario.id) {
          return NextResponse.json({ error: "Solo puedes actualizar pedidos asignados a ti" }, { status: 403 });
        }
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

      // H8 — máquina de estados: no se puede revivir un pedido terminal.
      // Reactivar un 'cancelado' o des-entregar un 'entregado' re-dispararía
      // bono de referido, deuda del repartidor y timestamps. Traemos el estado
      // actual y lo exigimos en el WHERE (concurrencia optimista).
      const actual = await queryOne<{ estado: string }>(
        "SELECT estado FROM pedidos WHERE id = $1",
        [id]
      );
      if (!actual) {
        return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
      }
      const esTerminal = actual.estado === "cancelado" || (actual.estado === "entregado" && estado !== "entregado");
      if (esTerminal) {
        return NextResponse.json(
          { error: `No se puede modificar un pedido ${actual.estado}.` },
          { status: 409 }
        );
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
      // Timestamp de entrega: se setea solo la primera vez para no perder
      // el momento real si el repartidor toca "entregado" dos veces.
      if (estado === "entregado") {
        sets.push(`entregado_at = COALESCE(entregado_at, NOW())`);
      }
      vals.push(id);
      const idParam = p;
      vals.push(actual.estado);
      const estadoParam = p + 1;
      const result = await query(
        `UPDATE pedidos SET ${sets.join(", ")} WHERE id = $${idParam} AND estado = $${estadoParam} RETURNING id`,
        vals
      );
      if (result.length === 0) {
        // El estado cambió entre el SELECT y el UPDATE (otra request ganó).
        return NextResponse.json({ error: "El pedido cambió de estado, recarga e intenta de nuevo." }, { status: 409 });
      }

      // Bono de referidos: cuando un cliente nuevo (referido por alguien)
      // tiene su PRIMER pedido entregado, ambos ganan $20 de saldo. Solo
      // se da una vez por cliente — lo marcamos en el pedido para evitar
      // duplicar si el repartidor hace ping doble. Cuenta cualquier pedido
      // del cliente referido (mercado, envío de paquete o mandado); solo se
      // excluyen los envíos B2B solicitados por una tienda (solicitado_por_tienda_id),
      // donde el "cliente" del pedido no es el referido.
      if (estado === "entregado") {
        const pedidoBono = await queryOne<{
          id: string; cliente_id: string | null; solicitado_por_tienda_id: string | null;
          credito_referido_aplicado: boolean;
        }>(
          "SELECT id, cliente_id, solicitado_por_tienda_id, credito_referido_aplicado FROM pedidos WHERE id = $1",
          [id]
        );
        if (
          pedidoBono &&
          pedidoBono.cliente_id &&
          !pedidoBono.solicitado_por_tienda_id &&
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
              const BONO = 20;
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

      // Cargo de liquidación al repartidor (pedido de catálogo en efectivo).
      if (estado === "entregado") {
        await registrarCargoEfectivo(id);
      }

      notificarClientePedido(id, estado as EstadoPedido);
      // En_compra/en_camino/entregado: avisar a la(s) tienda(s). El "pendiente"
      // ya disparó el push de "nuevo pedido" en POST /api/pedidos.
      if (estado === "en_compra" || estado === "en_camino" || estado === "entregado") {
        notificarTiendaPedido(id, estado);
      }
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
