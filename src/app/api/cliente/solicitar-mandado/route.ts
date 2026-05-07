import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { calcularRutaMandado, haversineKm } from "@/lib/geo";
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
    // Mandado
    descripcion,
    monto_mandado: montoMandadoRaw,
    ida_vuelta: idaVueltaRaw,
    metodo_pago: metodoPagoRaw,
    comprobante_pago,
  } = body;

  // Validaciones de origen
  if (!origen_nombre || !origen_telefono || !origen_direccion) {
    return NextResponse.json({ error: "Falta nombre, teléfono o dirección del origen" }, { status: 400 });
  }
  const origenTel = String(origen_telefono).replace(/\D/g, "");
  if (origenTel.length !== 10) {
    return NextResponse.json({ error: "El teléfono del origen debe ser de 10 dígitos" }, { status: 400 });
  }
  const oLat = Number(origen_lat);
  const oLng = Number(origen_lng);
  if (!isFinite(oLat) || !isFinite(oLng)) {
    return NextResponse.json({ error: "Marca el punto del origen en el mapa" }, { status: 400 });
  }

  // Validaciones de destino
  if (!destino_nombre || !destino_telefono || !destino_direccion) {
    return NextResponse.json({ error: "Falta nombre, teléfono o dirección del destino" }, { status: 400 });
  }
  const destTel = String(destino_telefono).replace(/\D/g, "");
  if (destTel.length !== 10) {
    return NextResponse.json({ error: "El teléfono del destino debe ser de 10 dígitos" }, { status: 400 });
  }
  const dLat = Number(destino_lat);
  const dLng = Number(destino_lng);
  if (!isFinite(dLat) || !isFinite(dLng)) {
    return NextResponse.json({ error: "Marca el punto del destino en el mapa" }, { status: 400 });
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
  // igual rechazamos si excede el límite.
  if (ruta.distanciaKm > MAX_KM * (idaVuelta ? 2 : 1)) {
    return NextResponse.json(
      { error: `Fuera de cobertura (más de ${MAX_KM} km${idaVuelta ? " ida" : ""})` },
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
  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(costoEnvio * 0.0406 * 100) / 100 : 0;

  // Total a cobrar al cliente al entregar:
  //   envío + recargo tarjeta + monto del mandado (lo que el repartidor adelantó)
  const total = costoEnvio + recargoTarjeta + montoMandado;

  // Direcciones con coordenadas embebidas para que el repartidor las pueda
  // abrir en Maps con un toque (mismo patrón que enviar-paquete).
  const direccionRecogida = `${origen_direccion.trim()} [${oLat.toFixed(6)}, ${oLng.toFixed(6)}]`;
  const direccionEntrega = `${destino_direccion.trim()} [${dLat.toFixed(6)}, ${dLng.toFixed(6)}]`;

  // Notas con contexto para Fernando.
  const notas = [
    `[MANDADO${idaVuelta ? " IDA Y VUELTA" : ""}]`,
    `Recoger/comprar: ${descripcion.trim()}`,
    montoMandado > 0
      ? `Cobrar al entregar el mandado: $${montoMandado.toFixed(2)} (lo adelantas tú)`
      : "Sin pago en origen",
  ].join(" — ");

  const pedidoId = uuidv4();

  try {
    await query(
      `INSERT INTO pedidos (
         id, tipo, cliente_id, cliente_nombre, cliente_telefono, zona_id, direccion_entrega,
         direccion_recogida, recogida_lat, recogida_lng, recogida_nombre, recogida_telefono,
         descripcion_contenido,
         subtotal, costo_envio, total, notas,
         metodo_pago, recargo_tarjeta, comprobante_pago,
         envio_pagado_por, ida_vuelta, monto_mandado
       ) VALUES (
         $1, 'envio', $2, $3, $4, 'mapa', $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, 'cliente', $19, $20
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
        montoMandado,                    // subtotal: lo que se cobra "por el contenido" (mandado)
        costoEnvio + recargoTarjeta,     // costo_envio: incluye recargo tarjeta para que el desglose simple muestre correcto
        total,                           // total a cobrar al cliente al entregar
        notas,
        metodoPago,
        recargoTarjeta,
        metodoPago === "transferencia" ? comprobante_pago : null,
        idaVuelta,
        montoMandado > 0 ? montoMandado : null,
      ]
    );
  } catch (e) {
    console.error("[solicitar-mandado] fallo al crear pedido", e);
    return NextResponse.json({ error: "No se pudo crear el mandado. Intenta de nuevo." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    pedido_id: pedidoId,
    costo_envio: Math.round(costoEnvio * 100) / 100,
    recargo_tarjeta: recargoTarjeta,
    monto_mandado: montoMandado,
    total: Math.round(total * 100) / 100,
    distancia_km: ruta.distanciaKm,
    tiempo_estimado: ruta.tiempoTotal,
    ida_vuelta: idaVuelta,
  });
}
