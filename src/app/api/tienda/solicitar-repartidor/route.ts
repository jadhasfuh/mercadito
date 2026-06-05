import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { calcularRuta } from "@/lib/geo";
import { esForanea } from "@/lib/ciudades";
import { getHorarioInfo } from "@/lib/horario";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";

/**
 * POST /api/tienda/solicitar-repartidor
 *
 * Flow B2B: una tienda registrada (típicamente restaurante) levanta un
 * pedido para que Mercadito mande un repartidor a su local, recoja la
 * orden y la entregue al cliente final. La tienda ya tiene la relación
 * con el cliente (lo recibió por su WhatsApp / mostrador / propia app
 * de Mercadito tienda); solo necesita el delivery.
 *
 * Reusa la infra de envíos (`tipo='envio'`) — repartidor, tracking,
 * estados, ratings — agregando dos campos:
 *   - solicitado_por_tienda_id: la tienda que originó el pedido.
 *   - envio_pagado_por: 'tienda' (default acá) o 'cliente'. Si tienda,
 *     se acumula y se factura semanal. Si cliente, repartidor cobra al
 *     entregar.
 *
 * Datos de recogida vienen de puestos.{lat,lng,ubicacion,telefono_contacto}.
 * Costo de envío se calcula server-side con calcularRuta para evitar
 * que el cliente envíe un costo manipulado.
 */
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "Solo cuentas tienda pueden solicitar repartidor" }, { status: 403 });
  }
  if (!usuario.puesto_id) {
    return NextResponse.json({ error: "Tu cuenta no tiene una tienda asociada" }, { status: 400 });
  }

  const body = await request.json();
  const {
    cliente_nombre,
    cliente_telefono,
    direccion_entrega,
    cliente_lat,
    cliente_lng,
    monto_pedido,
    notas,
    envio_pagado_por: ePagado,
  } = body;

  if (!cliente_nombre || !cliente_telefono) {
    return NextResponse.json({ error: "Falta nombre o teléfono del cliente" }, { status: 400 });
  }
  const tel = String(cliente_telefono).replace(/\D/g, "");
  if (tel.length !== 10) {
    return NextResponse.json({ error: "El teléfono del cliente debe ser de 10 dígitos" }, { status: 400 });
  }
  if (!direccion_entrega || typeof direccion_entrega !== "string" || direccion_entrega.trim().length < 5) {
    return NextResponse.json({ error: "Falta la dirección de entrega" }, { status: 400 });
  }
  // El pin es opcional — la tienda muchas veces no sabe la ubicación
  // exacta del cliente (lo agarró por WhatsApp con dirección de texto).
  // Si no hay pin, usamos el centro de Sahuayo como fallback para estimar
  // el costo. El costo se recalcula cuando el repartidor marca entregado
  // con su GPS real.
  const latRaw = cliente_lat == null ? null : Number(cliente_lat);
  const lngRaw = cliente_lng == null ? null : Number(cliente_lng);
  const tienePin = latRaw != null && lngRaw != null && isFinite(latRaw) && isFinite(lngRaw);
  const lat = tienePin ? latRaw! : 20.0562569; // MERCADO_LAT
  const lng = tienePin ? lngRaw! : -102.721598; // MERCADO_LNG
  const monto = Number(monto_pedido);
  if (!isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "Captura el monto del pedido" }, { status: 400 });
  }

  const envioPagadoPor = ePagado === "cliente" ? "cliente" : "tienda";

  // Datos de la tienda (recogida).
  const puesto = await queryOne<{
    id: string;
    nombre: string;
    ubicacion: string | null;
    telefono_contacto: string | null;
    lat: number | null;
    lng: number | null;
    ciudad: string | null;
  }>(
    "SELECT id, nombre, ubicacion, telefono_contacto, lat, lng, ciudad FROM puestos WHERE id = $1 AND activo = true",
    [usuario.puesto_id]
  );
  if (!puesto) {
    return NextResponse.json({ error: "Tu tienda no está activa" }, { status: 400 });
  }
  if (puesto.lat == null || puesto.lng == null) {
    return NextResponse.json(
      { error: "Tu tienda no tiene ubicación. Edítala en 'Mi tienda' antes de solicitar repartidor." },
      { status: 400 }
    );
  }
  const recogidaTel = puesto.telefono_contacto || usuario.telefono;
  const direccionRecogida = puesto.ubicacion || "Sin dirección registrada";

  // Costo del envío: misma lógica que el flow de paquete del cliente —
  // calcularRuta de tienda → cliente. Server-side para evitar manipulación.
  const ruta = await calcularRuta(lat, lng, {
    lat: puesto.lat,
    lng: puesto.lng,
    nombre: puesto.nombre,
  }, esForanea(puesto.ciudad));
  // Cobertura: calcularRuta devuelve costoEnvio=0 cuando >20 km. Bloqueamos
  // server-side igual que /api/cliente/solicitar-mandado para que un cliente
  // manipulado no pueda crear pedidos fuera de zona.
  if (ruta.costoEnvio === 0 && tienePin) {
    return NextResponse.json(
      { error: `Fuera de cobertura (${ruta.distanciaKm} km). Solo entregamos hasta 20 km.` },
      { status: 400 }
    );
  }
  const horario = getHorarioInfo();
  // Si es horario nocturno y no agendado, recargo nocturno aplica igual
  // que paquetes — operativamente es la misma chamba para Fernando.
  const recargoNocturno = horario.recargoNocturno;
  if (!horario.abierto) {
    return NextResponse.json({ error: horario.mensaje }, { status: 400 });
  }
  const costoEnvio = ruta.costoEnvio + recargoNocturno;

  const pedidoId = uuidv4();
  // Notas con el monto que el cliente paga al repartidor (si aplica) y
  // contexto de la tienda — ayuda a Fernando saber cuánto cobrar y por qué.
  const notasFinales = [
    envioPagadoPor === "cliente"
      ? `[CLIENTE PAGA ENVÍO] Recoger en ${puesto.nombre}.`
      : `[ENVÍO PAGA ${puesto.nombre}] Cliente paga sólo el pedido.`,
    `Monto pedido: $${monto.toFixed(2)}`,
    notas ? `Notas: ${notas}` : "",
  ].filter(Boolean).join(" — ");

  // Si la tienda absorbe el envío, lo que cobra Fernando al cliente es
  // sólo el monto del pedido. Si lo paga el cliente, Fernando cobra
  // pedido + envío.
  const totalACobrar = envioPagadoPor === "cliente" ? monto + costoEnvio : monto;

  // direccion_entrega = SOLO el texto que escribió la tienda. El pin
  // del mapa es para cotizar el costo, no para fijar la ubicación
  // exacta del cliente — la tienda muchas veces no la conoce. El
  // repartidor busca esa dirección en Google Maps y al entregar
  // captura su GPS real, que ahí sí se embebe como [lat,lng].
  const direccionConCoords = direccion_entrega.trim();

  try {
    await query(
      `INSERT INTO pedidos (
         id, tipo, cliente_id, cliente_nombre, cliente_telefono, zona_id, direccion_entrega,
         direccion_recogida, recogida_lat, recogida_lng, recogida_nombre, recogida_telefono,
         peso_kg, descripcion_contenido,
         subtotal, costo_envio, total, notas, metodo_pago, recargo_tarjeta,
         solicitado_por_tienda_id, envio_pagado_por
       ) VALUES (
         $1, 'envio', NULL, $2, $3, 'mapa', $4, $5, $6, $7, $8, $9, 1, $10, $11, $12, $13, $14, 'efectivo', 0, $15, $16
       )`,
      [
        pedidoId,
        cliente_nombre.trim(),
        tel,
        direccionConCoords,
        direccionRecogida,
        puesto.lat,
        puesto.lng,
        puesto.nombre,
        recogidaTel,
        // descripcion_contenido — usamos algo legible para repartidor.
        `Pedido de ${puesto.nombre} (monto $${monto.toFixed(2)})`,
        // subtotal: el monto del pedido tal como lo paga el cliente al recibir
        // si tienda absorbe envío; o sólo el envío si cliente paga ambas
        // partes (en cuyo caso el subtotal es el monto del pedido también).
        monto,
        costoEnvio,
        totalACobrar,
        notasFinales,
        usuario.puesto_id,
        envioPagadoPor,
      ]
    );
  } catch (e) {
    console.error("[solicitar-repartidor] fallo al crear pedido", e);
    return NextResponse.json({ error: "No se pudo crear la solicitud. Intenta de nuevo." }, { status: 500 });
  }

  // Link público de tracking para que la tienda lo comparta a su cliente
  // por WhatsApp. Sin login. La página /p/[id] expone solo lo mínimo
  // (estado + GPS + ETA) — no datos sensibles del pedido.
  const trackingUrl = `https://mercadito.cx/p/${pedidoId}`;

  return NextResponse.json({
    ok: true,
    pedido_id: pedidoId,
    costo_envio: Math.round(costoEnvio * 100) / 100,
    total_a_cobrar: Math.round(totalACobrar * 100) / 100,
    distancia_km: ruta.distanciaKm,
    tiempo_estimado: ruta.tiempoTotal,
    envio_pagado_por: envioPagadoPor,
    // Si la tienda no puso pin, el costo es solo estimación basada en
    // centro Sahuayo. El repartidor lo confirma con GPS al entregar.
    costo_estimado: !tienePin,
    tracking_url: trackingUrl,
  });
}
