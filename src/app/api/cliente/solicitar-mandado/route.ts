import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { enviarPush } from "@/lib/push";
import { enviarWebPushAUsuarios } from "@/lib/webpush";
import { calcularRutaMandado, haversineKm, dentroDeZonaServicio } from "@/lib/geo";
import { getHorarioInfo } from "@/lib/horario";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";

const MIN_DISTANCIA_KM = 0.1; // 100 m — bloquea origen=destino
const MAX_KM = 20;            // cobertura

/**
 * POST /api/cliente/solicitar-mandado
 *
 * El cliente pide al repartidor que vaya a un origen, recoja o compre algo
 * y se lo lleve a destino. Opcionalmente regresa al origen (`ida_vuelta`).
 * Si el cliente necesita que el repartidor pague por algo (medicina, comida),
 * captura `monto_mandado` y el repartidor lo cobra al entregar.
 *
 * Reusa `tipo='envio'` con dos campos extra (ida_vuelta, monto_mandado).
 *
 * Costo de envío se calcula server-side con calcularRutaMandado para evitar
 * que el cliente envíe un costo manipulado.
 */
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "cliente") {
    return NextResponse.json({ error: "Solo clientes pueden pedir mandados" }, { status: 403 });
  }

  const body = await request.json();
  const {
    // Origen
    origen_nombre,
    origen_telefono,
    origen_direccion,   // string ya formateada con #num + detalles
    origen_lat,
    origen_lng,
    // Destino
    destino_nombre,
    destino_telefono,
    destino_direccion,
    destino_lat,
    destino_lng,
    // Mandado — instrucciones y monto en origen (qué recoger/comprar y cuánto
    // adelanta el repartidor) y opcionalmente en destino (qué hacer al entregar
    // y cuánto cobrar/pagar al recibir, ej. "pregunta por Juan y le cobras $X").
    descripcion,
    monto_mandado: montoMandadoRaw,
    destino_descripcion: destinoDescripcionRaw,
    destino_monto: destinoMontoRaw,
    ida_vuelta: idaVueltaRaw,
    metodo_pago: metodoPagoRaw,
    comprobante_pago,
  } = body;

  // Validaciones de origen — telefono opcional (a veces el cliente no tiene
  // el número de la tienda). Si se manda, validamos 10 dígitos.
  if (!origen_nombre || !origen_direccion) {
    return NextResponse.json({ error: "Falta nombre o dirección del origen" }, { status: 400 });
  }
  const origenTelRaw = origen_telefono ? String(origen_telefono).replace(/\D/g, "") : "";
  if (origenTelRaw && origenTelRaw.length !== 10) {
    return NextResponse.json({ error: "El teléfono del origen debe ser de 10 dígitos" }, { status: 400 });
  }
  const origenTel = origenTelRaw || null;
  const oLat = Number(origen_lat);
  const oLng = Number(origen_lng);
  if (!isFinite(oLat) || !isFinite(oLng)) {
    return NextResponse.json({ error: "Marca el punto del origen en el mapa" }, { status: 400 });
  }

  // Validaciones de destino — telefono opcional (cae al telefono del usuario
  // logueado para que el repartidor siempre tenga cómo contactar).
  if (!destino_nombre || !destino_direccion) {
    return NextResponse.json({ error: "Falta nombre o dirección del destino" }, { status: 400 });
  }
  const destTelRaw = destino_telefono ? String(destino_telefono).replace(/\D/g, "") : "";
  if (destTelRaw && destTelRaw.length !== 10) {
    return NextResponse.json({ error: "El teléfono del destino debe ser de 10 dígitos" }, { status: 400 });
  }
  // cliente_telefono es NOT NULL — si el cliente no llenó el campo, usamos
  // el teléfono con el que está logueado (siempre existe para rol cliente).
  const destTel = destTelRaw || usuario.telefono;
  const dLat = Number(destino_lat);
  const dLng = Number(destino_lng);
  if (!isFinite(dLat) || !isFinite(dLng)) {
    return NextResponse.json({ error: "Marca el punto del destino en el mapa" }, { status: 400 });
  }

  // Ambos puntos deben caer en la zona de servicio. La cobertura de 20 km
  // solo mide origen→destino: dos pines juntos en cualquier parte del mundo
  // la pasaban (pasó de verdad — un mandado de prueba desde Bulgaria).
  if (!dentroDeZonaServicio(oLat, oLng) || !dentroDeZonaServicio(dLat, dLng)) {
    return NextResponse.json(
      { error: "Por ahora solo damos servicio en Sahuayo, Jiquilpan y Venustiano Carranza" },
      { status: 400 }
    );
  }

  // Origen no puede ser igual a destino
  const distOrigDest = haversineKm(oLat, oLng, dLat, dLng);
  if (distOrigDest < MIN_DISTANCIA_KM) {
    return NextResponse.json(
      { error: "Origen y destino son el mismo lugar — usa otra dirección" },
      { status: 400 }
    );
  }

  // Mandado
  if (!descripcion || typeof descripcion !== "string" || descripcion.trim().length < 3) {
    return NextResponse.json({ error: "Describe qué necesitas que recojan o compren" }, { status: 400 });
  }
  const montoMandado = montoMandadoRaw == null || montoMandadoRaw === "" ? 0 : Number(montoMandadoRaw);
  if (!isFinite(montoMandado) || montoMandado < 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
  }
  // Destino opcional: si vienen vacíos, no se persisten.
  const destinoDescripcion = typeof destinoDescripcionRaw === "string" && destinoDescripcionRaw.trim().length > 0
    ? destinoDescripcionRaw.trim()
    : null;
  const destinoMonto = destinoMontoRaw == null || destinoMontoRaw === "" ? 0 : Number(destinoMontoRaw);
  if (!isFinite(destinoMonto) || destinoMonto < 0) {
    return NextResponse.json({ error: "Monto destino inválido" }, { status: 400 });
  }
  const idaVuelta = !!idaVueltaRaw;

  // Horario
  const horario = getHorarioInfo();
  if (!horario.abierto) {
    return NextResponse.json({ error: horario.mensaje }, { status: 400 });
  }

  // Ruta y costo
  const ruta = await calcularRutaMandado(
    { lat: oLat, lng: oLng, nombre: origen_nombre },
    dLat,
    dLng,
    idaVuelta
  );
  // Cobertura: si Mapbox no devolvió ruta, distanciaKm sale grande del fallback;
  // igual rechazamos si excede el límite. costoEnvio <= 0 significa que la
  // tarifa no cubre esa distancia (la función regresa $0 fuera de rango) — sin
  // este check, un POST directo en la banda no tarificada creaba el mandado
  // con envío gratis.
  if (ruta.distanciaKm > MAX_KM * (idaVuelta ? 2 : 1) || ruta.costoEnvio <= 0) {
    return NextResponse.json(
      { error: `Fuera de cobertura (más de ${MAX_KM} km${idaVuelta ? " por tramo" : ""})` },
      { status: 400 }
    );
  }
  const costoEnvio = ruta.costoEnvio + horario.recargoNocturno;

  // Pago
  const metodoPago = ["efectivo", "tarjeta", "transferencia"].includes(metodoPagoRaw)
    ? metodoPagoRaw
    : "efectivo";
  if (metodoPago === "transferencia" && (!comprobante_pago || String(comprobante_pago).length < 50)) {
    return NextResponse.json({ error: "Sube el comprobante de transferencia" }, { status: 400 });
  }
  // Recargo sobre TODO el cobro con tarjeta (envío + montos del mandado),
  // igual que el checkout de catálogo — la terminal cobra comisión del total.
  const recargoTarjeta = metodoPago === "tarjeta"
    ? Math.round((costoEnvio + montoMandado + destinoMonto) * 0.0406 * 100) / 100
    : 0;

  // Total a cobrar al cliente al entregar:
  //   envío + recargo tarjeta + monto adelantado en origen + monto cobrado/pagado en destino
  const total = costoEnvio + recargoTarjeta + montoMandado + destinoMonto;

  // Direcciones con coordenadas embebidas para que el repartidor las pueda
  // abrir en Maps con un toque (mismo patrón que enviar-paquete).
  const direccionRecogida = `${origen_direccion.trim()} [${oLat.toFixed(6)}, ${oLng.toFixed(6)}]`;
  const direccionEntrega = `${destino_direccion.trim()} [${dLat.toFixed(6)}, ${dLng.toFixed(6)}]`;

  // Notas con contexto para Fernando — origen + destino si aplica. En
  // transferencia el cliente ya pagó TODO por adelantado: sin la advertencia
  // explícita, el repartidor cobraba de nuevo al entregar (doble cobro).
  const prepagado = metodoPago === "transferencia";
  const partesNotas: string[] = [
    `[MANDADO${idaVuelta ? " IDA Y VUELTA" : ""}${prepagado ? " · PAGADO POR TRANSFERENCIA" : ""}]`,
    `Recoger/comprar: ${descripcion.trim()}`,
    montoMandado > 0
      ? prepagado
        ? `Compra: $${montoMandado.toFixed(2)} (la adelantas tú — ya viene pagada en la transferencia)`
        : `Cobrar al entregar el mandado: $${montoMandado.toFixed(2)} (lo adelantas tú)`
      : "Sin pago en origen",
  ];
  if (destinoDescripcion) {
    partesNotas.push(`En destino: ${destinoDescripcion}`);
  }
  if (destinoMonto > 0) {
    partesNotas.push(`Monto destino: $${destinoMonto.toFixed(2)}`);
  }
  if (prepagado) {
    partesNotas.push(`YA PAGADO $${total.toFixed(2)} por transferencia — NO cobres al entregar`);
  }
  const notas = partesNotas.join(" — ");

  const pedidoId = uuidv4();

  // subtotal "del contenido" = lo que el cliente paga por algo, sin envío.
  // Para mandados es la suma de los dos montos (origen + destino).
  const subtotalContenido = montoMandado + destinoMonto;

  try {
    await query(
      `INSERT INTO pedidos (
         id, tipo, cliente_id, cliente_nombre, cliente_telefono, zona_id, direccion_entrega,
         direccion_recogida, recogida_lat, recogida_lng, recogida_nombre, recogida_telefono,
         descripcion_contenido,
         subtotal, costo_envio, total, notas,
         metodo_pago, recargo_tarjeta, comprobante_pago,
         envio_pagado_por, ida_vuelta, monto_mandado,
         destino_descripcion, destino_monto, es_mandado
       ) VALUES (
         $1, 'envio', $2, $3, $4, 'mapa', $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, 'cliente', $19, $20,
         $21, $22, true
       )`,
      [
        pedidoId,
        usuario.id,
        destino_nombre.trim(),
        destTel,
        direccionEntrega,
        direccionRecogida,
        oLat,
        oLng,
        origen_nombre.trim(),
        origenTel,
        descripcion.trim(),
        subtotalContenido,               // subtotal: lo que se cobra "por el contenido" (mandado origen + destino)
        costoEnvio,                      // costo_envio SIN recargo — misma convención que catálogo; el desglose suma la línea de recargo aparte
        total,                           // total a cobrar al cliente al entregar
        notas,
        metodoPago,
        recargoTarjeta,
        metodoPago === "transferencia" ? comprobante_pago : null,
        idaVuelta,
        montoMandado > 0 ? montoMandado : null,
        destinoDescripcion,
        destinoMonto > 0 ? destinoMonto : null,
      ]
    );
  } catch (e) {
    console.error("[solicitar-mandado] fallo al crear pedido", e);
    return NextResponse.json({ error: "No se pudo crear el mandado. Intenta de nuevo." }, { status: 500 });
  }

  // Notificar (fire-and-forget). Antes el mandado se creaba en silencio: ni
  // repartidores ni admin se enteraban. Transferencia → admin valida el pago;
  // efectivo/tarjeta → repartidores + admin (venta registrada).
  if (metodoPago === "transferencia") {
    query<{ id: string; push_token: string | null }>(
      `SELECT id, push_token FROM usuarios
       WHERE activo = true AND rol = 'admin'`
    ).then((rows) => {
      const body = `Mandado — $${total.toFixed(0)} (transferencia)`;
      const data = { pedidoId, tipo: "pago_por_validar" };
      enviarPush(rows.map((r) => r.push_token).filter((t): t is string => !!t), "Pago por validar", body, data);
      enviarWebPushAUsuarios(rows.map((r) => r.id), "Pago por validar", body, data);
    }).catch((e) => console.error("[push] admin mandado pago failed", e));
  } else {
    query<{ id: string; push_token: string | null }>(
      `SELECT id, push_token FROM usuarios
       WHERE activo = true
         AND (rol = 'repartidor' OR rol = 'admin')`
    ).then((rows) => {
      const body = `${origen_nombre.trim()} → ${destino_nombre.trim()} · $${total.toFixed(0)}`;
      const data = { pedidoId, tipo: "nuevo_mandado" };
      enviarPush(rows.map((r) => r.push_token).filter((t): t is string => !!t), "📦 Nuevo mandado", body, data);
      enviarWebPushAUsuarios(rows.map((r) => r.id), "📦 Nuevo mandado", body, data);
    }).catch((e) => console.error("[push] mandado destinatarios failed", e));
  }

  return NextResponse.json({
    ok: true,
    pedido_id: pedidoId,
    costo_envio: Math.round(costoEnvio * 100) / 100,
    recargo_tarjeta: recargoTarjeta,
    monto_mandado: montoMandado,
    destino_monto: destinoMonto,
    total: Math.round(total * 100) / 100,
    distancia_km: ruta.distanciaKm,
    tiempo_estimado: ruta.tiempoTotal,
    ida_vuelta: idaVuelta,
  });
}
