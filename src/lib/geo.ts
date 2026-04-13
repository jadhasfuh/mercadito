// Default origin: Mercado Municipal de Sahuayo
export const MERCADO_LAT = 20.0562569;
export const MERCADO_LNG = -102.721598;
export const MERCADO_NOMBRE = "Mercado Municipal";

const OSRM_BASE = "https://router.project-osrm.org";

export interface RutaResult {
  distanciaKm: number;
  duracionMin: number;
  geometria: [number, number][]; // [lat, lng] pairs for polyline
  costoEnvio: number;
  zona: string;
  tiempo: string;
}

export interface OrigenInfo {
  lat: number;
  lng: number;
  nombre: string;
}

// Get real driving route from OSRM
export async function calcularRuta(
  destLat: number,
  destLng: number,
  origen?: OrigenInfo
): Promise<RutaResult> {
  const origenLat = origen?.lat ?? MERCADO_LAT;
  const origenLng = origen?.lng ?? MERCADO_LNG;

  const url = `${OSRM_BASE}/route/v1/driving/${origenLng},${origenLat};${destLng},${destLat}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== "Ok" || !data.routes?.length) {
      return calcularRutaFallback(destLat, destLng, origenLat, origenLng);
    }

    const route = data.routes[0];
    const distanciaKm = route.distance / 1000;
    const duracionMin = Math.round(route.duration / 60);

    const geometria: [number, number][] = route.geometry.coordinates.map(
      (coord: [number, number]) => [coord[1], coord[0]]
    );

    const envio = calcularCostoEnvioPorDistancia(distanciaKm);

    return {
      distanciaKm: Math.round(distanciaKm * 10) / 10,
      duracionMin,
      geometria,
      costoEnvio: envio.costo,
      zona: envio.zona,
      tiempo: `${duracionMin}-${duracionMin + 15} min`,
    };
  } catch {
    return calcularRutaFallback(destLat, destLng, origenLat, origenLng);
  }
}

function calcularRutaFallback(destLat: number, destLng: number, origenLat: number, origenLng: number): RutaResult {
  const dist = haversineKm(origenLat, origenLng, destLat, destLng);
  const roadDist = dist * 1.4;
  const envio = calcularCostoEnvioPorDistancia(roadDist);

  return {
    distanciaKm: Math.round(roadDist * 10) / 10,
    duracionMin: Math.round(roadDist * 4),
    geometria: [
      [origenLat, origenLng],
      [destLat, destLng],
    ],
    costoEnvio: envio.costo,
    zona: envio.zona,
    tiempo: envio.tiempo,
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcularCostoEnvioPorDistancia(distanciaKm: number): {
  costo: number;
  zona: string;
  tiempo: string;
} {
  if (distanciaKm <= 2) {
    return { costo: 25, zona: "Muy cerca", tiempo: "20-30 min" };
  } else if (distanciaKm <= 5) {
    return { costo: 35, zona: "Cerca", tiempo: "30-45 min" };
  } else if (distanciaKm <= 10) {
    return { costo: 50, zona: "Media distancia", tiempo: "45-60 min" };
  } else if (distanciaKm <= 20) {
    return { costo: 60, zona: "Lejos", tiempo: "60-90 min" };
  } else {
    return { costo: 0, zona: "Fuera de cobertura", tiempo: "" };
  }
}

// Geocode by postal code (fallback for address search)
export async function buscarPorCP(cp: string): Promise<{ lat: number; lng: number; nombre: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cp}&country=mx&limit=1`
    );
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), nombre: data[0].display_name };
    }
  } catch { /* ignore */ }
  return null;
}
