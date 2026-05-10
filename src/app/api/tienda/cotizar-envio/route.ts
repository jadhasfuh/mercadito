import { queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { calcularRuta } from "@/lib/geo";
import { getHorarioInfo } from "@/lib/horario";
import { NextResponse } from "next/server";

/**
 * GET /api/tienda/cotizar-envio?lat=X&lng=Y
 *
 * Preview del costo de envío para el form de "Solicitar repartidor".
 * Calcula la ruta tienda → punto sin crear pedido. Permite que el
 * dueño del restaurante vea el costo aproximado mientras mueve el pin
 * en el mapa, antes de confirmar.
 *
 * Idéntico cálculo que el endpoint POST que crea el pedido — el costo
 * que se ve aquí es el que se cobra (modulo recálculo final con GPS
 * del repartidor al entregar).
 */
export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (!usuario.puesto_id) {
    return NextResponse.json({ error: "Tu cuenta no tiene tienda asociada" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
  }

  const puesto = await queryOne<{ nombre: string; lat: number | null; lng: number | null }>(
    "SELECT nombre, lat, lng FROM puestos WHERE id = $1 AND activo = true",
    [usuario.puesto_id]
  );
  if (!puesto) {
    return NextResponse.json({ error: "Tu tienda no está activa" }, { status: 400 });
  }
  if (puesto.lat == null || puesto.lng == null) {
    return NextResponse.json({ error: "Tu tienda no tiene ubicación. Ajústala en 'Mi tienda'." }, { status: 400 });
  }

  const ruta = await calcularRuta(lat, lng, {
    lat: puesto.lat,
    lng: puesto.lng,
    nombre: puesto.nombre,
  });
  const horario = getHorarioInfo();
  const recargoNocturno = horario.recargoNocturno;
  // calcularRuta devuelve costoEnvio=0 cuando >20 km. Flag para que la UI
  // bloquee el botón y muestre mensaje en vez de cotizar.
  const fueraDeCobertura = ruta.costoEnvio === 0;
  const costoEnvio = fueraDeCobertura ? 0 : ruta.costoEnvio + recargoNocturno;

  return NextResponse.json({
    costo_envio: Math.round(costoEnvio * 100) / 100,
    distancia_km: ruta.distanciaKm,
    tiempo_estimado: ruta.tiempoTotal,
    recargo_nocturno: recargoNocturno,
    fuera_de_cobertura: fueraDeCobertura,
  });
}
