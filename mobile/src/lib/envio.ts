// Cálculo de costo de envío por distancia real.
// Misma fórmula que la web (src/lib/geo.ts): ceil(km) * $12, mínimo $12, cobertura 20 km.

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Distancia haversine en km entre dos puntos. Para pasar de línea recta a
 * distancia de carretera se multiplica por ~1.4 (factor empírico).
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Distancia multi-parada (carretera aproximada): tienda1 → tienda2 → ... → destino.
 * Cada tramo se multiplica por 1.4 para aproximar distancia por calles.
 */
export function distanciaMultiParada(origenes: LatLng[], destino: LatLng): number {
  if (origenes.length === 0) return 0;
  let total = 0;
  const puntos = [...origenes, destino];
  for (let i = 0; i < puntos.length - 1; i++) {
    total += haversineKm(puntos[i], puntos[i + 1]) * 1.4;
  }
  return total;
}

export interface EnvioCalculado {
  distanciaKm: number;
  costo: number;
  fueraDeCobertura: boolean;
}

const MAX_KM = 20;
const PRECIO_POR_KM = 12;

export function calcularCostoEnvio(distanciaKm: number): EnvioCalculado {
  if (distanciaKm <= 0) return { distanciaKm: 0, costo: 0, fueraDeCobertura: false };
  if (distanciaKm > MAX_KM) return { distanciaKm, costo: 0, fueraDeCobertura: true };
  const km = Math.max(1, Math.ceil(distanciaKm));
  return { distanciaKm, costo: km * PRECIO_POR_KM, fueraDeCobertura: false };
}
