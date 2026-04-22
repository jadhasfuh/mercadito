// Cálculo de costo de envío por distancia real.
// Misma fórmula y mismo proveedor de rutas que la web (src/lib/geo.ts):
// OSRM demo servidor público para ruta por carretera; ceil(km) * $12,
// mínimo $12, cobertura máxima 20 km. Si OSRM no responde se cae a
// una aproximación con haversine * 1.4.

export interface LatLng {
  lat: number;
  lng: number;
}

const OSRM_BASE = "https://router.project-osrm.org";
const MAX_KM = 20;

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Fallback: suma haversine × 1.4 para cada tramo. */
function distanciaMultiParadaFallback(origenes: LatLng[], destino: LatLng): number {
  if (origenes.length === 0) return 0;
  let total = 0;
  const puntos = [...origenes, destino];
  for (let i = 0; i < puntos.length - 1; i++) {
    total += haversineKm(puntos[i], puntos[i + 1]) * 1.4;
  }
  return total;
}

/**
 * Distancia por carretera multi-parada (tienda1 → tienda2 → … → destino).
 * Usa OSRM. Si falla, cae a haversine × 1.4. Ambas retornan km.
 */
export async function calcularDistanciaRuta(origenes: LatLng[], destino: LatLng): Promise<number> {
  if (origenes.length === 0) return 0;
  const waypoints = [
    ...origenes.map((o) => `${o.lng},${o.lat}`),
    `${destino.lng},${destino.lat}`,
  ].join(";");

  try {
    const url = `${OSRM_BASE}/route/v1/driving/${waypoints}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("no route");
    return data.routes[0].distance / 1000;
  } catch {
    return distanciaMultiParadaFallback(origenes, destino);
  }
}

export interface EnvioCalculado {
  distanciaKm: number;
  costo: number;
  fueraDeCobertura: boolean;
}

/**
 * Tarifa progresiva por km iniciado:
 *   Primeros 10 km: $10/km (máx $100).
 *   Km 11-20:       $30/km adicional (de $100 a $400).
 *   Cobertura máx:  20 km.
 */
export function calcularCostoEnvio(distanciaKm: number): EnvioCalculado {
  if (distanciaKm <= 0) return { distanciaKm: 0, costo: 0, fueraDeCobertura: false };
  if (distanciaKm > MAX_KM) return { distanciaKm, costo: 0, fueraDeCobertura: true };
  const km = Math.max(1, Math.ceil(distanciaKm));
  const costo = km <= 10 ? km * 10 : 100 + (km - 10) * 30;
  return { distanciaKm, costo, fueraDeCobertura: false };
}
