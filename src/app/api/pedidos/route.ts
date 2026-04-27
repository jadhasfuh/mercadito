import { query, queryOne, withTransaction } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { getHorarioInfo } from "@/lib/horario";
import { calcularComision } from "@/lib/comision";
import { validarDisponibilidadItems, mensajeBloqueo } from "@/lib/disponibilidad";
import { contarEntregadosCliente, clienteTienePremioActivo, promoEnvioGratisActiva, siguienteEnvioGratis } from "@/lib/promos";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// Helper to convert NUMERIC fields
function parsePedido(pedido: Record<string, unknown>, items: Record<string, unknown>[]) {
  return {
    ...pedido,
    subtotal: parseFloat(pedido.subtotal as string),
    costo_envio: parseFloat(pedido.costo_envio as string),
    total: parseFloat(pedido.total as string),
    recargo_tarjeta: parseFloat((pedido.recargo_tarjeta as string) || "0"),
    items: items.map((item) => ({
      ...item,
      cantidad: parseFloat(item.cantidad as string),
      precio_unitario: parseFloat(item.precio_unitario as string),
      subtotal: parseFloat(item.subtotal as string),
      comision: parseFloat((item.comision as string) || "0"),
    })),
  };
}

export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const estado = searchParams.get("estado");

  // Role-based filtering
  let whereClause = "";
  const params: unknown[] = [];

  if (usuario.rol === "cliente") {
    // Clients only see their own orders
    params.push(usuario.id, usuario.telefono);
    whereClause = ` AND (p.cliente_id = $${params.length - 1} OR p.cliente_telefono = $${params.length})`;
  } else if (usuario.rol === "tienda") {
    // Tienda users only see orders containing their products
    params.push(usuario.puesto_id);
    whereClause = ` AND EXISTS (SELECT 1 FROM pedido_items pi WHERE pi.pedido_id = p.id AND pi.puesto_id = $${params.length})`;
  }

  // Repartidores y tiendas no ven pedidos con transferencia pendiente de validación.
  if (usuario.rol === "repartidor" || usuario.rol === "tienda") {
    whereClause += ` AND (p.metodo_pago <> 'transferencia' OR p.pago_validado_at IS NOT NULL)`;
  }
  // admin ve todo (incluyendo los pendientes de validar)

  if (estado) {
    params.push(estado);
    whereClause += ` AND p.estado = $${params.length}`;
  }

  const pedidos = await query(
    `SELECT p.*, COALESCE(z.nombre, 'Ubicación en mapa') as zona_nombre,
            r.nombre as repartidor_nombre, r.telefono as repartidor_telefono
     FROM pedidos p
     LEFT JOIN zonas_entrega z ON z.id = p.zona_id
     LEFT JOIN usuarios r ON r.id = p.repartidor_id
     WHERE 1=1${whereClause}
     ORDER BY p.created_at ${usuario.rol === "repartidor" ? "ASC" : "DESC"}`,
    params
  );

  // Repartidor "de turno" para pedidos sin asignar — así el cliente ve un
  // contacto desde el momento de la compra. Mientras solo haya un repartidor
  // activo es claro; con varios el primer registrado es un placeholder
  // razonable (admin puede ajustar criterio después).
  const repartidorDefault = await queryOne(
    `SELECT nombre, telefono FROM usuarios
     WHERE rol = 'repartidor' AND activo = true
     ORDER BY created_at ASC, id ASC LIMIT 1`
  );

  // Fetch all items for all orders in one query (avoids N+1)
  const pedidoIds = pedidos.map((p) => p.id as string);
  let allItems: Record<string, unknown>[] = [];
  if (pedidoIds.length > 0) {
    const placeholders = pedidoIds.map((_, i) => `$${i + 1}`).join(", ");
    allItems = await query(
      `SELECT pi.*, pr.nombre as producto_nombre, pu.nombre as puesto_nombre, pr.unidad,
              pu.telefono_contacto as puesto_telefono, pu.ubicacion as puesto_ubicacion
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
       JOIN puestos pu ON pu.id = pi.puesto_id
       WHERE pi.pedido_id IN (${placeholders})`,
      pedidoIds
    );
  }

  // Group items by pedido_id
  const itemsByPedido = new Map<string, Record<string, unknown>[]>();
  for (const item of allItems) {
    const pid = item.pedido_id as string;
    if (!itemsByPedido.has(pid)) {
      itemsByPedido.set(pid, []);
    }
    itemsByPedido.get(pid)!.push(item);
  }

  const result = pedidos.map((pedido) => {
    const items = itemsByPedido.get(pedido.id as string) || [];
    const parsed = parsePedido(pedido, items);
    return {
      ...parsed,
      repartidor_default: repartidorDefault
        ? { nombre: repartidorDefault.nombre, telefono: repartidorDefault.telefono }
        : null,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { cliente_nombre, cliente_telefono, zona_id, direccion_entrega, items, notas, costo_envio_override, metodo_pago, recargo_tarjeta, comprobante_pago, agendado_para } = body;

  if (!cliente_nombre || !cliente_telefono || !direccion_entrega || !items?.length) {
    return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 });
  }

  // Pedido agendado: el cliente quiere recibirlo más tarde (ej. mañana 9 am).
  // Se valida disponibilidad contra esa fecha — la tienda puede estar
  // cerrada AHORA siempre que esté abierta en el horario agendado.
  let agendadoParaDate: Date | null = null;
  if (agendado_para) {
    const d = new Date(agendado_para);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Fecha de agenda inválida" }, { status: 400 });
    }
    if (d.getTime() <= Date.now()) {
      return NextResponse.json({ error: "La fecha de agenda debe ser en el futuro" }, { status: 400 });
    }
    // Tope de 14 días para no acumular agenda lejana sin sentido.
    if (d.getTime() > Date.now() + 14 * 24 * 3600 * 1000) {
      return NextResponse.json({ error: "Solo puedes agendar hasta 14 días en el futuro" }, { status: 400 });
    }
    agendadoParaDate = d;
  }

  if (metodo_pago === "transferencia" && (!comprobante_pago || typeof comprobante_pago !== "string" || comprobante_pago.trim().length < 50)) {
    // Una imagen base64 válida son miles de chars — si viene muy corta o vacía
    // no la aceptamos para no guardar basura en DB.
    return NextResponse.json({ error: "Falta el comprobante de pago" }, { status: 400 });
  }

  // Validación básica de items: cantidades y precios positivos. Antes se
  // aceptaba cualquier cosa y podíamos crear pedidos con subtotal negativo.
  for (const it of items) {
    const q = Number(it.cantidad);
    const p = Number(it.precio_unitario);
    if (!isFinite(q) || q <= 0) {
      return NextResponse.json({ error: "Cantidad inválida en uno de los productos" }, { status: 400 });
    }
    if (!isFinite(p) || p < 0) {
      return NextResponse.json({ error: "Precio inválido en uno de los productos" }, { status: 400 });
    }
  }

  // Check business hours. Si el pedido es agendado, no exigimos que el
  // negocio esté abierto AHORA — solo en la fecha agendada (lo valida
  // validarDisponibilidadItems más abajo). Sí descontamos el recargo
  // nocturno solo si el pedido es inmediato.
  const horario = getHorarioInfo();
  if (!agendadoParaDate && !horario.abierto) {
    return NextResponse.json({ error: horario.mensaje }, { status: 400 });
  }

  const usuario = await getUsuarioFromSession();
  const clienteId = usuario?.rol === "cliente" ? usuario.id : null;

  let costoEnvio: number;
  // El recargo nocturno solo aplica a pedidos inmediatos. Si es agendado, el
  // recargo lo definirá la hora real de entrega (lo asume el repartidor o
  // se recalcula al activarse — TODO si llega a importar).
  const recargoNocturno = agendadoParaDate ? 0 : horario.recargoNocturno;
  if (costo_envio_override != null) {
    costoEnvio = costo_envio_override + recargoNocturno;
  } else if (zona_id) {
    const zona = await queryOne(
      "SELECT costo_envio FROM zonas_entrega WHERE id = $1 AND activa = true",
      [zona_id]
    );
    if (!zona) {
      return NextResponse.json({ error: "Zona de entrega no válida" }, { status: 400 });
    }
    costoEnvio = parseFloat(zona.costo_envio);
  } else {
    return NextResponse.json({ error: "Falta zona o costo de envío" }, { status: 400 });
  }

  // Promo "1 envío gratis cada N pedidos" — si está vigente y este teléfono
  // ya cumplió el ciclo, este pedido lleva costo_envio = 0. Para evitar
  // doble premio, si el cliente ya tiene un pedido en vuelo con la promo
  // aplicada, los siguientes pagan normal hasta que ese se entregue.
  let envioGratisAplicado = false;
  if (promoEnvioGratisActiva()) {
    const tienePremioActivo = await clienteTienePremioActivo(cliente_telefono);
    if (!tienePremioActivo) {
      const entregadosPrevios = await contarEntregadosCliente(cliente_telefono);
      if (siguienteEnvioGratis(entregadosPrevios)) {
        costoEnvio = 0;
        envioGratisAplicado = true;
      }
    }
  }

  // Re-validar disponibilidad de cada (producto, puesto) en el momento del
  // POST. La página filtra estos criterios en GET /productos, pero entre
  // ese GET y este POST puede haber pasado tiempo (carrito abierto, hora
  // de cierre de la tienda, producto que se marcó como no disponible).
  // Cubre: tienda activa+aprobada, dentro de horario_atencion, producto
  // disponible, dentro de producto_horarios.
  const bloqueos = await validarDisponibilidadItems(
    items.map((i: { producto_id: string; puesto_id: string }) => ({
      producto_id: i.producto_id,
      puesto_id: i.puesto_id,
    })),
    agendadoParaDate
  );
  if (bloqueos.length > 0) {
    return NextResponse.json(
      { error: mensajeBloqueo(bloqueos), bloqueos },
      { status: 409 } // 409 Conflict: el carrito chocó con el estado actual
    );
  }

  const pedidoId = uuidv4();
  // precio_unitario en el body es el precio REAL (sin comision). La comision viene
  // como campo aparte y se guarda tambien en pedido_items.comision.
  // variante_id, variante_nombre y modificadores (SeleccionModificador[]) son
  // opcionales — vienen tal cual eligió el cliente y se congelan en pedido_items.
  let subtotalProductos = 0;
  let totalComision = 0;
  for (const item of items) {
    const com = typeof item.comision === "number" ? item.comision : calcularComision(item.precio_unitario);
    subtotalProductos += item.cantidad * item.precio_unitario;
    totalComision += item.cantidad * com;
  }

  const recargoTarjetaVal = metodo_pago === "tarjeta"
    ? Math.round((subtotalProductos + totalComision + costoEnvio) * 0.0406)
    : 0;
  const total = subtotalProductos + totalComision + costoEnvio + recargoTarjetaVal;

  // Todo en transacción — si un item falla, se revierte el pedido completo.
  try {
    await withTransaction(async (q) => {
      const notasFinales = envioGratisAplicado
        ? `${notas ? notas + " " : ""}[ENVÍO GRATIS PROMO MAYO]`.trim()
        : (notas || null);
      await q(
        `INSERT INTO pedidos (id, cliente_id, cliente_nombre, cliente_telefono, zona_id, direccion_entrega, subtotal, costo_envio, total, notas, metodo_pago, recargo_tarjeta, comprobante_pago, agendado_para)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [pedidoId, clienteId, cliente_nombre, cliente_telefono, zona_id || "mapa", direccion_entrega, subtotalProductos, costoEnvio, total, notasFinales, metodo_pago || "efectivo", recargoTarjetaVal, comprobante_pago || null, agendadoParaDate ? agendadoParaDate.toISOString() : null]
      );
      for (const item of items) {
        const com = typeof item.comision === "number" ? item.comision : calcularComision(item.precio_unitario);
        const itemSubtotal = item.cantidad * item.precio_unitario;
        const modificadoresJson = Array.isArray(item.modificadores) && item.modificadores.length > 0
          ? JSON.stringify(item.modificadores)
          : null;
        await q(
          `INSERT INTO pedido_items (id, pedido_id, producto_id, puesto_id, cantidad, precio_unitario, subtotal, comision, variante_id, variante_nombre, modificadores)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            uuidv4(), pedidoId, item.producto_id, item.puesto_id, item.cantidad, item.precio_unitario, itemSubtotal, com,
            item.variante_id ?? null, item.variante_nombre ?? null, modificadoresJson,
          ]
        );
      }
    });
  } catch (e) {
    console.error("[pedidos] fallo al crear pedido (transacción revertida)", e);
    return NextResponse.json({ error: "No se pudo crear el pedido. Intenta de nuevo." }, { status: 500 });
  }

  // Notificar (fire-and-forget).
  // Si es transferencia, solo se notifica al admin para validar el pago.
  // Repartidores/tiendas se notifican cuando el admin valida.
  if (metodo_pago === "transferencia") {
    query<{ push_token: string }>(
      `SELECT push_token FROM usuarios
       WHERE push_token IS NOT NULL AND activo = true AND rol = 'admin'`
    ).then((rows) => {
      const tokens = rows.map((r) => r.push_token);
      enviarPush(
        tokens,
        "Pago por validar",
        `${cliente_nombre} — $${total.toFixed(0)} (transferencia)`,
        { pedidoId, tipo: "pago_por_validar" }
      );
    }).catch((e) => console.error("[push] admin pago failed", e));
  } else {
    const puestoIdsItems = Array.from(new Set(items.map((i: { puesto_id: string }) => i.puesto_id)));
    query<{ push_token: string }>(
      `SELECT push_token FROM usuarios
       WHERE push_token IS NOT NULL AND activo = true
         AND (
           rol = 'repartidor'
           OR (rol = 'tienda' AND puesto_id = ANY($1))
         )`,
      [puestoIdsItems]
    ).then((rows) => {
      const tokens = rows.map((r) => r.push_token);
      enviarPush(
        tokens,
        "Nuevo pedido en Mercadito",
        `${cliente_nombre} — $${total.toFixed(0)}`,
        { pedidoId, tipo: "nuevo_pedido" }
      );
    }).catch((e) => console.error("[push] fetch destinatarios failed", e));
  }

  return NextResponse.json({ id: pedidoId, subtotal: subtotalProductos, servicio_mercadito: totalComision, costo_envio: costoEnvio, total }, { status: 201 });
}
