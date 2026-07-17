// Cálculo de costo de envío por distancia real.
// Misma fórmula y mismo proveedor de rutas que la web (src/lib/geo.ts):
// OSRM demo servidor público para ruta por carretera; ceil(km) * $12,
// mínimo $12, cobertura máxima 20 km. Si OSRM no responde se cae a
// una aproximación con haversine * 1.4.

import { PISO_FORANEO_ENVIO, IMPUESTO_CIUDAD } from "./ciudades";

export interface LatLng {
  lat: number;
  lng: number;
}

// Mapbox Directions API (token pk.* público por diseño).
const MAPBOX_TOKEN = "pk.eyJ1IjoiamFkaGFzZnVoIiwiYSI6ImNtb2J6MXR5MTA1cmEyeHB6NWExMDA1bTAifQ.F28tnTfIXW7AcbsnY_u5BQ";
const MAPBOX_BASE = "https://api.mapbox.com/directions/v5/mapbox/driving";
const ROUTE_TIMEOUT_MS = 8000;
const MAX_KM = 20;

// Cache SOLO de distancias OSRM reales (no del fallback haversine) — así un
// intento fallido no se queda cacheado.
const distCache = new Map<string, number>();
const MAX_CACHE = 50;
function cacheKey(origenes: LatLng[], destino: LatLng): string {
  const r = (n: number) => n.toFixed(4);
  return origenes.map((o) => `${r(o.lat)},${r(o.lng)}`).join("|") + "->" + `${r(destino.lat)},${r(destino.lng)}`;
}

async function fetchConTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

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
 * Distancia ida + vuelta para mandado: origen → destino → origen.
 * Si OSRM responde, devuelve la distancia real. Si falla, fallback haversine×1.4×2.
 */
export async function calcularDistanciaIdaVuelta(origen: LatLng, destino: LatLng): Promise<number> {
  const key = `IV:${origen.lat.toFixed(4)},${origen.lng.toFixed(4)}->${destino.lat.toFixed(4)},${destino.lng.toFixed(4)}`;
  const cached = distCache.get(key);
  if (cached != null) return cached;

  const waypoints = `${origen.lng},${origen.lat};${destino.lng},${destino.lat};${origen.lng},${origen.lat}`;
  try {
    const url = `${MAPBOX_BASE}/${waypoints}?overview=false&access_token=${MAPBOX_TOKEN}`;
    const res = await fetchConTimeout(url, ROUTE_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("no route");
    const km = data.routes[0].distance / 1000;
    if (distCache.size >= MAX_CACHE) {
      const firstKey = distCache.keys().next().value;
      if (firstKey !== undefined) distCache.delete(firstKey);
    }
    distCache.set(key, km);
    return km;
  } catch {
    return haversineKm(origen, destino) * 1.4 * 2;
  }
}

/**
 * Distancia por carretera multi-parada (tienda1 → tienda2 → … → destino).
 * Usa OSRM. Si falla, cae a haversine × 1.4. Ambas retornan km.
 */
export async function calcularDistanciaRuta(origenes: LatLng[], destino: LatLng): Promise<number> {
  if (origenes.length === 0) return 0;

  const key = cacheKey(origenes, destino);
  const cached = distCache.get(key);
  if (cached != null) return cached;

  const storeReal = (km: number) => {
    if (distCache.size >= MAX_CACHE) {
      const firstKey = distCache.keys().next().value;
      if (firstKey !== undefined) distCache.delete(firstKey);
    }
    distCache.set(key, km);
    return km;
  };

  const waypoints = [
    ...origenes.map((o) => `${o.lng},${o.lat}`),
    `${destino.lng},${destino.lat}`,
  ].join(";");

  try {
    const url = `${MAPBOX_BASE}/${waypoints}?overview=false&access_token=${MAPBOX_TOKEN}`;
    const res = await fetchConTimeout(url, ROUTE_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("no route");
    return storeReal(data.routes[0].distance / 1000);
  } catch {
    // No cacheamos el fallback — próximo intento vuelve a pegar a Mapbox.
    return distanciaMultiParadaFallback(origenes, destino);
  }
}

// Zona de servicio — espejo de CENTROS_ZONA en src/lib/ciudades.ts (web).
// Sin este check, dos pines cercanos en cualquier parte del mundo pasaban la
// cobertura de 20 km (que solo mide origen→destino).
const CENTROS_ZONA = [
  { id: "sahuayo",    lat: 20.0563, lng: -102.7216 },
  { id: "jiquilpan",  lat: 19.9928, lng: -102.7192 },
  { id: "venustiano", lat: 20.1167, lng: -102.6667 },
];
const RADIO_ZONA_SERVICIO_KM = 15;

/** True si el punto cae dentro de la zona de servicio. */
export function dentroDeZonaServicio(lat: number, lng: number): boolean {
  return CENTROS_ZONA.some((c) => haversineKm({ lat, lng }, { lat: c.lat, lng: c.lng }) <= RADIO_ZONA_SERVICIO_KM);
}

export interface EnvioCalculado {
  distanciaKm: number;
  costo: number;
  fueraDeCobertura: boolean;
}

/**
 * Tarifa de envío. Mantener sincronizado con src/lib/geo.ts del backend.
 *  1-7 km (Sahuayo): $15 → $65 lineal (piso subido de $10 a $15).
 *    Ej: 1=$15, 2=$23, 3=$32, 4=$40, 5=$48, 6=$57, 7=$65.
 *  8-10 km:  $10/km (80, 90, 100). Pueblos vecinos.
 *  11-20 km: $100 + ($30/km extra). Cobertura máxima 20 km = $400.
 *
 * `foranea` (tienda en Jiquilpan/San Pedro): impuesto de ciudad oculto + piso
 * foráneo. 1 km foráneo = max(25, 15+10) = 25. No se muestra como línea aparte.
 *
 * `tipo` 'envio' (paquetes punto a punto) tiene piso $12 — refleja el costo
 * extra de ir a recoger al origen.
 */
export function calcularCostoEnvio(
  distanciaKm: number,
  tipo: "mercado" | "envio" = "mercado",
  foranea = false
): EnvioCalculado {
  if (distanciaKm <= 0) return { distanciaKm: 0, costo: 0, fueraDeCobertura: false };
  if (distanciaKm > MAX_KM) return { distanciaKm, costo: 0, fueraDeCobertura: true };
  const km = Math.max(1, Math.ceil(distanciaKm));
  let costo: number;
  if (km <= 7) costo = Math.round(15 + (km - 1) * (50 / 6));
  else if (km <= 10) costo = km * 10;
  else costo = 100 + (km - 10) * 30;
  if (foranea) costo = Math.max(PISO_FORANEO_ENVIO, costo + IMPUESTO_CIUDAD);
  if (tipo === "envio") costo = Math.max(12, costo);
  return { distanciaKm, costo, fueraDeCobertura: false };
}
