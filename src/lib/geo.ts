// Default origin: Mercado Municipal de Sahuayo
export const MERCADO_LAT = 20.0562569;
export const MERCADO_LNG = -102.721598;
export const MERCADO_NOMBRE = "Mercado Municipal";

// Mapbox Directions API — proveedor principal de rutas.
// El token es `pk.*` (publishable), seguro en cliente por diseño.
// Free tier: 100k requests/mes. Rotar aquí si se compromete.
const MAPBOX_TOKEN = "pk.eyJ1IjoiamFkaGFzZnVoIiwiYSI6ImNtb2J6MXR5MTA1cmEyeHB6NWExMDA1bTAifQ.F28tnTfIXW7AcbsnY_u5BQ";
const MAPBOX_BASE = "https://api.mapbox.com/directions/v5/mapbox/driving";
const ROUTE_TIMEOUT_MS = 8000;

// Cache SOLO de respuestas reales (con geometría detallada). Los fallbacks
// diagonales nunca se cachean para que un próximo intento a OSRM tenga
// oportunidad. Antes, una red momentánea caída dejaba la diagonal pegada
// hasta recargar la página.
const rutaCache = new Map<string, RutaResult>();
const MAX_CACHE = 100;

function cacheKey(destLat: number, destLng: number, origenes: OrigenInfo[]): string {
  const r = (n: number) => n.toFixed(4);
  const origs = origenes.map((o) => `${r(o.lat)},${r(o.lng)}`).join("|");
  return `${origs}->${r(destLat)},${r(destLng)}`;
}

function setCache(key: string, val: RutaResult) {
  if (rutaCache.size >= MAX_CACHE) {
    // LRU cheap: tira la primera key insertada
    const firstKey = rutaCache.keys().next().value;
    if (firstKey !== undefined) rutaCache.delete(firstKey);
  }
  rutaCache.set(key, val);
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

export interface RutaResult {
  distanciaKm: number;
  duracionMin: number;
  geometria: [number, number][]; // [lat, lng] pairs for polyline
  costoEnvio: number;
  zona: string;
  tiempo: string;
  tiempoCompra: number; // minutos estimados comprando en tiendas
  tiempoTotal: string;  // tiempo de compra + envío, con mínimo 30 min
  esAproximada?: boolean; // true si no obtuvimos ruta real de OSRM
}

export interface OrigenInfo {
  lat: number;
  lng: number;
  nombre: string;
}

// Get real driving route from Mapbox. Pedimos `alternatives=true` y nos
// quedamos con la de menor distancia — cobramos por km, así que la ruta más
// corta sale más barata para el cliente y gasta menos gasolina al repartidor,
// aun cuando Mapbox "prefiera" otra por unos minutos menos. `alternatives`
// solo aplica con 2 waypoints (origen→destino); multi-parada y mandado
// ida+vuelta no lo soportan y siguen tomando la primera (más rápida).
export async function calcularRuta(
  destLat: number,
  destLng: number,
  origen?: OrigenInfo
): Promise<RutaResult> {
  const origenLat = origen?.lat ?? MERCADO_LAT;
  const origenLng = origen?.lng ?? MERCADO_LNG;

  const coords = `${origenLng},${origenLat};${destLng},${destLat}`;
  const url = `${MAPBOX_BASE}/${coords}?overview=full&geometries=geojson&alternatives=true&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetchConTimeout(url, ROUTE_TIMEOUT_MS);
    const data = await res.json();

    if (data.code !== "Ok" || !data.routes?.length) {
      return calcularRutaFallback(destLat, destLng, origenLat, origenLng);
    }

    const route = data.routes.reduce(
      (min: { distance: number }, r: { distance: number }) => (r.distance < min.distance ? r : min),
      data.routes[0]
    );
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
      tiempoCompra: 0,
      tiempoTotal: `${Math.max(30, duracionMin)}-${Math.max(45, duracionMin + 15)} min`,
      esAproximada: false,
    };
  } catch {
    return calcularRutaFallback(destLat, destLng, origenLat, origenLng);
  }
}

function calcularRutaFallback(destLat: number, destLng: number, origenLat: number, origenLng: number): RutaResult {
  const dist = haversineKm(origenLat, origenLng, destLat, destLng);
  const roadDist = dist * 1.4;
  const envio = calcularCostoEnvioPorDistancia(roadDist);
  const durMin = Math.round(roadDist * 4);

  return {
    distanciaKm: Math.round(roadDist * 10) / 10,
    duracionMin: durMin,
    geometria: [
      [origenLat, origenLng],
      [destLat, destLng],
    ],
    costoEnvio: envio.costo,
    zona: envio.zona,
    tiempo: envio.tiempo,
    tiempoCompra: 0,
    tiempoTotal: `${Math.max(30, durMin)}-${Math.max(45, durMin + 15)} min`,
    esAproximada: true,
  };
}

// Tiempo estimado de compra por tienda (minutos)
const TIEMPO_COMPRA_POR_TIENDA = 10;
// Tiempo mínimo total de entrega (centro muy lleno de gente)
const TIEMPO_MINIMO_TOTAL = 30;

/**
 * Calcula ruta multi-parada: tienda1 → tienda2 → ... → domicilio
 * Suma distancias de cada tramo, concatena geometrías, y agrega tiempo de compra.
 */
export async function calcularRutaMultiParada(
  destLat: number,
  destLng: number,
  origenes: OrigenInfo[]
): Promise<RutaResult> {
  // Cache: evita llamar OSRM dos veces seguidas al mismo punto.
  const key = cacheKey(destLat, destLng, origenes);
  const cached = rutaCache.get(key);
  if (cached) return cached;

  const finalizar = (r: RutaResult): RutaResult => {
    // Solo cachear rutas reales. Diagonales se recalculan cada vez para dar
    // oportunidad a que OSRM responda la próxima.
    if (!r.esAproximada) setCache(key, r);
    return r;
  };

  if (origenes.length === 0) {
    // Sin tiendas con coordenadas, usar mercado por defecto
    const resultado = await calcularRuta(destLat, destLng);
    resultado.tiempoCompra = TIEMPO_COMPRA_POR_TIENDA;
    const totalMin = resultado.duracionMin + resultado.tiempoCompra;
    resultado.tiempoTotal = `${Math.max(TIEMPO_MINIMO_TOTAL, totalMin)}-${Math.max(TIEMPO_MINIMO_TOTAL + 15, totalMin + 15)} min`;
    return finalizar(resultado);
  }

  if (origenes.length === 1) {
    const resultado = await calcularRuta(destLat, destLng, origenes[0]);
    resultado.tiempoCompra = TIEMPO_COMPRA_POR_TIENDA;
    const totalMin = resultado.duracionMin + resultado.tiempoCompra;
    resultado.tiempoTotal = `${Math.max(TIEMPO_MINIMO_TOTAL, totalMin)}-${Math.max(TIEMPO_MINIMO_TOTAL + 15, totalMin + 15)} min`;
    return finalizar(resultado);
  }

  // Multi-parada: construir waypoints string para OSRM
  // tienda1 → tienda2 → ... → domicilio
  const waypoints = [
    ...origenes.map((o) => `${o.lng},${o.lat}`),
    `${destLng},${destLat}`,
  ].join(";");

  const tiempoCompra = origenes.length * TIEMPO_COMPRA_POR_TIENDA;

  try {
    const url = `${MAPBOX_BASE}/${waypoints}?overview=full&geometries=geojson&access_token=${MAPBOX_TOKEN}`;
    const res = await fetchConTimeout(url, ROUTE_TIMEOUT_MS);
    const data = await res.json();

    if (data.code !== "Ok" || !data.routes?.length) {
      return finalizar(fallbackMultiParada(destLat, destLng, origenes, tiempoCompra));
    }

    const route = data.routes[0];
    const distanciaKm = route.distance / 1000;
    const duracionMin = Math.round(route.duration / 60);

    const geometria: [number, number][] = route.geometry.coordinates.map(
      (coord: [number, number]) => [coord[1], coord[0]]
    );

    const envio = calcularCostoEnvioPorDistancia(distanciaKm);
    const totalMin = duracionMin + tiempoCompra;

    return finalizar({
      distanciaKm: Math.round(distanciaKm * 10) / 10,
      duracionMin,
      geometria,
      costoEnvio: envio.costo,
      zona: envio.zona,
      tiempo: `${duracionMin}-${duracionMin + 15} min`,
      tiempoCompra,
      tiempoTotal: `${Math.max(TIEMPO_MINIMO_TOTAL, totalMin)}-${Math.max(TIEMPO_MINIMO_TOTAL + 15, totalMin + 15)} min`,
      esAproximada: false,
    });
  } catch {
    return finalizar(fallbackMultiParada(destLat, destLng, origenes, tiempoCompra));
  }
}

/**
 * Ruta para "mandado" del cliente: repartidor va a un origen, recoge/compra
 * algo y lo entrega en destino. Si `idaVuelta` es true, además regresa al
 * origen — útil cuando el cliente necesita que algo se devuelva (firma,
 * llaves, etc.). Costo se aplica sobre la distancia total real (origen →
 * destino [→ origen]). Cobertura: cada tramo individual ≤ 20km.
 */
export async function calcularRutaMandado(
  origen: OrigenInfo,
  destLat: number,
  destLng: number,
  idaVuelta: boolean
): Promise<RutaResult> {
  if (!idaVuelta) {
    return calcularRuta(destLat, destLng, origen);
  }
  // Ida + vuelta: 3 waypoints — origen → destino → origen
  const waypoints = [
    `${origen.lng},${origen.lat}`,
    `${destLng},${destLat}`,
    `${origen.lng},${origen.lat}`,
  ].join(";");
  try {
    const url = `${MAPBOX_BASE}/${waypoints}?overview=full&geometries=geojson&access_token=${MAPBOX_TOKEN}`;
    const res = await fetchConTimeout(url, ROUTE_TIMEOUT_MS);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) {
      return fallbackMandadoIdaVuelta(origen, destLat, destLng);
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
      tiempoCompra: 0,
      tiempoTotal: `${Math.max(30, duracionMin)}-${Math.max(45, duracionMin + 15)} min`,
      esAproximada: false,
    };
  } catch {
    return fallbackMandadoIdaVuelta(origen, destLat, destLng);
  }
}

function fallbackMandadoIdaVuelta(origen: OrigenInfo, destLat: number, destLng: number): RutaResult {
  const tramo = haversineKm(origen.lat, origen.lng, destLat, destLng) * 1.4;
  const total = tramo * 2;
  const envio = calcularCostoEnvioPorDistancia(total);
  const durMin = Math.round(total * 4);
  return {
    distanciaKm: Math.round(total * 10) / 10,
    duracionMin: durMin,
    geometria: [
      [origen.lat, origen.lng],
      [destLat, destLng],
      [origen.lat, origen.lng],
    ],
    costoEnvio: envio.costo,
    zona: envio.zona,
    tiempo: envio.tiempo,
    tiempoCompra: 0,
    tiempoTotal: `${Math.max(30, durMin)}-${Math.max(45, durMin + 15)} min`,
    esAproximada: true,
  };
}

function fallbackMultiParada(
  destLat: number, destLng: number,
  origenes: OrigenInfo[], tiempoCompra: number
): RutaResult {
  // Calcular distancia total sumando tramos
  let totalDist = 0;
  const geometria: [number, number][] = [];

  for (let i = 0; i < origenes.length; i++) {
    const fromLat = origenes[i].lat;
    const fromLng = origenes[i].lng;
    const toLat = i < origenes.length - 1 ? origenes[i + 1].lat : destLat;
    const toLng = i < origenes.length - 1 ? origenes[i + 1].lng : destLng;
    totalDist += haversineKm(fromLat, fromLng, toLat, toLng) * 1.4;
    geometria.push([fromLat, fromLng]);
  }
  geometria.push([destLat, destLng]);

  const envio = calcularCostoEnvioPorDistancia(totalDist);
  const durMin = Math.round(totalDist * 4);
  const totalMin = durMin + tiempoCompra;

  return {
    distanciaKm: Math.round(totalDist * 10) / 10,
    duracionMin: durMin,
    geometria,
    costoEnvio: envio.costo,
    zona: envio.zona,
    tiempo: envio.tiempo,
    tiempoCompra,
    tiempoTotal: `${Math.max(TIEMPO_MINIMO_TOTAL, totalMin)}-${Math.max(TIEMPO_MINIMO_TOTAL + 15, totalMin + 15)} min`,
    esAproximada: true,
  };
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
  // Tarifa Sahuayo (1-7 km): $10 → $50 lineal — incentivo para que las
  // entregas dentro del pueblo salgan más barato y el cliente se anime.
  // Sahuayo cabe holgadamente en un radio de 7 km desde el centro.
  // Ejemplos: 1=$10, 2=$17, 3=$23, 4=$30, 5=$37, 6=$43, 7=$50.
  // 8-10 km:  $10/km (siguen igual: 80/90/100). Pueblos vecinos.
  // 11-20 km: $100 + ($30/km extra). Cobertura máxima 20 km = $400.
  const MAX_KM = 20;
  if (distanciaKm > MAX_KM) {
    return { costo: 0, zona: "Fuera de cobertura", tiempo: "" };
  }
  const km = Math.max(1, Math.ceil(distanciaKm));
  let costo: number;
  if (km <= 7) costo = Math.round(10 + (km - 1) * (40 / 6));
  else if (km <= 10) costo = km * 10;
  else costo = 100 + (km - 10) * 30;
  const minutosBase = Math.max(20, Math.round(distanciaKm * 4) + 15);
  const tiempo = `${minutosBase}-${minutosBase + 15} min`;
  const zona =
    distanciaKm <= 1 ? "Muy cerca" :
    distanciaKm <= 3 ? "Cerca" :
    distanciaKm <= 6 ? "Sahuayo" :
    distanciaKm <= 10 ? "Otra ciudad" : "Lejos";
  return { costo, zona, tiempo };
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
