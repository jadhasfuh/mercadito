import { query, queryOne, withTransaction } from "@/lib/db";
import { getUsuarioFromSession, type Usuario } from "@/lib/auth";
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
    peso_kg: pedido.peso_kg != null ? parseFloat(pedido.peso_kg as string) : null,
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
    // Tienda ve: pedidos con sus productos (catalogo) O pedidos B2B
    // donde la tienda solicito el repartidor (envio sin items pero con
    // solicitado_por_tienda_id). Sin el OR el dashboard de tienda
    // quedaba ciego a su propia solicitud de repartidor.
    params.push(usuario.puesto_id);
    const idx = params.length;
    whereClause = ` AND (
      EXISTS (SELECT 1 FROM pedido_items pi WHERE pi.pedido_id = p.id AND pi.puesto_id = $${idx})
      OR p.solicitado_por_tienda_id = $${idx}
    )`;
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
      // LEFT JOIN: items manuales (producto_id NULL) traen su propio
      // producto_nombre. COALESCE prefiere el custom; unidad cae a 'pieza'.
      `SELECT pi.*,
              COALESCE(pi.producto_nombre, pr.nombre) as producto_nombre,
              pu.nombre as puesto_nombre,
              COALESCE(pr.unidad, 'pieza') as unidad,
              (pi.producto_id IS NULL) as manual,
              pu.telefono_contacto as puesto_telefono, pu.ubicacion as puesto_ubicacion,
              pu.lat as puesto_lat, pu.lng as puesto_lng
       FROM pedido_items pi
       LEFT JOIN productos pr ON pr.id = pi.producto_id
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
  // Pedidos requieren sesión de cliente. Antes aceptábamos pedidos
  // anónimos (con nombre+tel sueltos), pero eso permitía ver pedidos
  // ajenos con solo conocer el teléfono. Ahora exigimos login con PIN.
  const usuarioSesion = await getUsuarioFromSession();
  if (!usuarioSesion || usuarioSesion.rol !== "cliente") {
    return NextResponse.json({ error: "Inicia sesión para hacer un pedido" }, { status: 401 });
  }

  const body = await request.json();
  const { tipo: tipoRaw, cliente_nombre, cliente_telefono, zona_id, direccion_entrega, items, notas, costo_envio_override, metodo_pago, recargo_tarjeta, comprobante_pago, agendado_para } = body;
  const tipo: "mercado" | "envio" = tipoRaw === "envio" ? "envio" : "mercado";

  if (tipo === "envio") {
    return crearEnvio(body, usuarioSesion);
  }

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

  // Lead time: si algún (producto, puesto) del carrito requiere anticipación,
  // el agendado debe estar al menos `max(lead_time)` días en el futuro. El
  // lead efectivo por item es COALESCE(producto.lead_time_dias, puesto.lead_time_dias).
  const cartProductos = (items as { producto_id: string; puesto_id: string }[]).map((i) => i.producto_id);
  const cartPuestos = (items as { producto_id: string; puesto_id: string }[]).map((i) => i.puesto_id);
  if (cartProductos.length > 0) {
    const leadRows = await query<{ lead_time_dias: number }>(
      `SELECT COALESCE(MAX(COALESCE(pr.lead_time_dias, pu.lead_time_dias)), 0) AS lead_time_dias
       FROM unnest($1::text[], $2::text[]) AS t(producto_id, puesto_id)
       JOIN productos pr ON pr.id = t.producto_id
       JOIN puestos pu ON pu.id = t.puesto_id`,
      [cartProductos, cartPuestos]
    );
    const maxLead = Number(leadRows[0]?.lead_time_dias ?? 0);
    if (maxLead > 0) {
      // Mínima fecha agendada: medianoche MX del día actual + maxLead días.
      // Así el cliente que pide el 29 a las 9 PM con lead=1 puede recibir
      // cualquier momento del 30 abril (no necesita esperar 24h exactas).
      const ahoraMx = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
      const startTodayMx = new Date(`${ahoraMx.getFullYear()}-${String(ahoraMx.getMonth() + 1).padStart(2, "0")}-${String(ahoraMx.getDate()).padStart(2, "0")}T00:00:00-06:00`);
      const minimo = new Date(startTodayMx.getTime() + maxLead * 24 * 3600 * 1000);
      if (!agendadoParaDate || agendadoParaDate.getTime() < minimo.getTime()) {
        return NextResponse.json(
          {
            error: `Tu carrito incluye productos por encargo (entrega con ${maxLead} día${maxLead === 1 ? "" : "s"} de anticipación). Agéndalo a partir del ${minimo.toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "short" })}.`,
            code: "LEAD_TIME_REQUIRED",
            min_iso: minimo.toISOString(),
          },
          { status: 400 }
        );
      }
    }
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

  // Sesión ya validada al inicio de POST; clienteId proviene de ahí.
  const usuario = usuarioSesion;
  const clienteId = usuario.id;

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

  // Crédito de referidos: el cliente puede aplicar todo o parte de su
  // saldo. No puede dejar el total en 0 (mínimo $1 cargo, así el flow
  // de pago no falla con $0 en métodos como transferencia/tarjeta).
  // Validamos contra el saldo real en BD para evitar manipulación.
  let creditoUsado = 0;
  const creditoSolicitado = Number(body.usar_credito) || 0;
  if (creditoSolicitado > 0) {
    const saldoRow = await queryOne<{ saldo_credito: string }>(
      "SELECT saldo_credito FROM usuarios WHERE id = $1",
      [usuarioSesion.id]
    );
    const saldo = Number(saldoRow?.saldo_credito ?? 0);
    const totalSinCredito = subtotalProductos + totalComision + costoEnvio + recargoTarjetaVal;
    creditoUsado = Math.min(creditoSolicitado, saldo, Math.max(0, totalSinCredito - 1));
    creditoUsado = Math.round(creditoUsado * 100) / 100;
  }

  const total = subtotalProductos + totalComision + costoEnvio + recargoTarjetaVal - creditoUsado;

  // Todo en transacción — si un item falla, se revierte el pedido completo.
  try {
    await withTransaction(async (q) => {
      const notasFinales = envioGratisAplicado
        ? `${notas ? notas + " " : ""}[ENVÍO GRATIS PROMO MAYO]`.trim()
        : (notas || null);
      await q(
        `INSERT INTO pedidos (id, cliente_id, cliente_nombre, cliente_telefono, zona_id, direccion_entrega, subtotal, costo_envio, total, notas, metodo_pago, recargo_tarjeta, comprobante_pago, agendado_para, credito_usado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [pedidoId, clienteId, cliente_nombre, cliente_telefono, zona_id || "mapa", direccion_entrega, subtotalProductos, costoEnvio, total, notasFinales, metodo_pago || "efectivo", recargoTarjetaVal, comprobante_pago || null, agendadoParaDate ? agendadoParaDate.toISOString() : null, creditoUsado]
      );
      // Descontar el crédito del saldo del cliente al cerrar el pedido.
      // Si el pedido se cancela después, podrías reembolsar — por ahora
      // cancelar no devuelve crédito (decisión simple para el piloto).
      if (creditoUsado > 0) {
        await q(
          "UPDATE usuarios SET saldo_credito = GREATEST(0, saldo_credito - $1) WHERE id = $2",
          [creditoUsado, clienteId]
        );
      }
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

// ──────── ENVÍOS (paquetes entre ciudades) ────────

interface EnvioBody {
  cliente_nombre?: string;
  cliente_telefono?: string;
  zona_id?: string;
  direccion_entrega?: string;
  recogida_nombre?: string;
  recogida_telefono?: string;
  direccion_recogida?: string;
  recogida_lat?: number;
  recogida_lng?: number;
  peso_kg?: number;
  descripcion_contenido?: string;
  notas?: string;
  metodo_pago?: "efectivo" | "tarjeta" | "transferencia";
  comprobante_pago?: string;
  agendado_para?: string | null;
  costo_envio_override?: number | null;
}

async function crearEnvio(body: EnvioBody, usuarioSesion: Usuario): Promise<NextResponse> {
  const {
    cliente_nombre, cliente_telefono, zona_id, direccion_entrega,
    recogida_nombre, recogida_telefono, direccion_recogida, recogida_lat, recogida_lng,
    peso_kg, descripcion_contenido, notas, metodo_pago, comprobante_pago, agendado_para,
    costo_envio_override,
  } = body;

  // Datos del que recibe (cliente del pedido) y del que recoge.
  if (!cliente_nombre || !cliente_telefono || !direccion_entrega) {
    return NextResponse.json({ error: "Faltan datos del destinatario (nombre, teléfono, dirección)" }, { status: 400 });
  }
  if (!direccion_recogida || recogida_lat == null || recogida_lng == null) {
    return NextResponse.json({ error: "Falta la dirección de recogida (con ubicación)" }, { status: 400 });
  }
  if (!recogida_nombre || !recogida_telefono) {
    return NextResponse.json({ error: "Falta nombre o teléfono de quien envía" }, { status: 400 });
  }

  // Peso: requerido, > 0, <= 10 kg.
  const peso = Number(peso_kg);
  if (!isFinite(peso) || peso <= 0 || peso > 10) {
    return NextResponse.json({ error: "El peso debe ser mayor a 0 y máximo 10 kg" }, { status: 400 });
  }

  // Descripción: obligatoria. Sirve para que el repartidor sepa qué recoger
  // y que el cliente acepte explícitamente la responsabilidad del contenido.
  if (!descripcion_contenido || descripcion_contenido.trim().length < 3) {
    return NextResponse.json({ error: "Describe brevemente qué envías" }, { status: 400 });
  }

  // Agendado opcional, mismas reglas que mercado.
  let agendadoParaDate: Date | null = null;
  if (agendado_para) {
    const d = new Date(agendado_para);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Fecha de agenda inválida" }, { status: 400 });
    if (d.getTime() <= Date.now()) return NextResponse.json({ error: "La fecha de agenda debe ser en el futuro" }, { status: 400 });
    if (d.getTime() > Date.now() + 14 * 24 * 3600 * 1000) return NextResponse.json({ error: "Solo puedes agendar hasta 14 días en el futuro" }, { status: 400 });
    agendadoParaDate = d;
  }

  if (metodo_pago === "transferencia" && (!comprobante_pago || typeof comprobante_pago !== "string" || comprobante_pago.trim().length < 50)) {
    return NextResponse.json({ error: "Falta el comprobante de pago" }, { status: 400 });
  }

  const horario = getHorarioInfo();
  if (!agendadoParaDate && !horario.abierto) {
    return NextResponse.json({ error: horario.mensaje }, { status: 400 });
  }

  // Sesión validada en POST antes de delegar a crearEnvio.
  const usuario = usuarioSesion;
  const clienteId = usuario.id;

  // Costo: misma lógica que mercado — costo de la zona del destino + recargo
  // nocturno (si aplica) + recargo tarjeta (si aplica). Sin items ni comisión.
  const recargoNocturno = agendadoParaDate ? 0 : horario.recargoNocturno;
  let costoEnvio: number;
  if (costo_envio_override != null) {
    costoEnvio = Number(costo_envio_override) + recargoNocturno;
  } else if (zona_id) {
    const zona = await queryOne(
      "SELECT costo_envio FROM zonas_entrega WHERE id = $1 AND activa = true",
      [zona_id]
    );
    if (!zona) return NextResponse.json({ error: "Zona de entrega no válida" }, { status: 400 });
    costoEnvio = parseFloat(zona.costo_envio) + recargoNocturno;
  } else {
    return NextResponse.json({ error: "Falta zona o costo de envío" }, { status: 400 });
  }

  const recargoTarjetaVal = metodo_pago === "tarjeta" ? Math.round(costoEnvio * 0.0406 * 100) / 100 : 0;
  const total = costoEnvio + recargoTarjetaVal;

  const pedidoId = uuidv4();
  const notasFinales = `[ENVÍO ${peso}kg] ${descripcion_contenido}${notas ? " — " + notas : ""}`.trim();

  try {
    await query(
      `INSERT INTO pedidos (
         id, tipo, cliente_id, cliente_nombre, cliente_telefono, zona_id, direccion_entrega,
         direccion_recogida, recogida_lat, recogida_lng, recogida_nombre, recogida_telefono,
         peso_kg, descripcion_contenido,
         subtotal, costo_envio, total, notas, metodo_pago, recargo_tarjeta, comprobante_pago, agendado_para
       ) VALUES (
         $1, 'envio', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, $14, $15, $16, $17, $18, $19, $20
       )`,
      [
        pedidoId, clienteId, cliente_nombre, cliente_telefono, zona_id || "mapa", direccion_entrega,
        direccion_recogida, recogida_lat, recogida_lng, recogida_nombre, recogida_telefono,
        peso, descripcion_contenido.trim(),
        costoEnvio, total, notasFinales, metodo_pago || "efectivo", recargoTarjetaVal,
        comprobante_pago || null, agendadoParaDate ? agendadoParaDate.toISOString() : null,
      ]
    );
  } catch (e) {
    console.error("[envio] fallo al crear envío", e);
    return NextResponse.json({ error: "No se pudo crear el envío. Intenta de nuevo." }, { status: 500 });
  }

  // Notificaciones: si transferencia, solo admin para validar; si no, repartidores.
  if (metodo_pago === "transferencia") {
    query<{ push_token: string }>(
      `SELECT push_token FROM usuarios WHERE push_token IS NOT NULL AND activo = true AND rol = 'admin'`
    ).then((rows) => {
      enviarPush(
        rows.map((r) => r.push_token),
        "Pago por validar",
        `${cliente_nombre} — $${total.toFixed(0)} (envío · transferencia)`,
        { pedidoId, tipo: "pago_por_validar" }
      );
    }).catch((e) => console.error("[push] envío admin pago failed", e));
  } else {
    query<{ push_token: string }>(
      `SELECT push_token FROM usuarios WHERE push_token IS NOT NULL AND activo = true AND rol = 'repartidor'`
    ).then((rows) => {
      enviarPush(
        rows.map((r) => r.push_token),
        "Nuevo envío en Mercadito",
        `${recogida_nombre} → ${cliente_nombre} — $${total.toFixed(0)}`,
        { pedidoId, tipo: "nuevo_envio" }
      );
    }).catch((e) => console.error("[push] envío repartidores failed", e));
  }

  return NextResponse.json({ id: pedidoId, costo_envio: costoEnvio, total, tipo: "envio" }, { status: 201 });
}
