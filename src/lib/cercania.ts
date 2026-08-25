import { haversineKm, MERCADO_LAT, MERCADO_LNG } from "@/lib/geo";

// Filtro de cercanía del directorio de menús.
//
// Mientras Mercadito entregaba, el directorio se filtraba por ciudad
// (Sahuayo / Jiquilpan / San Pedro) porque esas eran las tres zonas de
// reparto. Sin entregas, la ciudad dejó de importar: lo que le sirve al
// usuario es "qué hay cerca de mí", y la plataforma puede crecer a
// cualquier parte del país sin tocar una lista de ciudades.

export const RADIO_KM = 15;

/** Punto de referencia del usuario y de dónde salió. */
export interface Origen {
  lat: number;
  lng: number;
  fuente: "gps" | "pin" | "default";
}

/** Sahuayo mientras no sepamos dónde está el usuario: es donde están casi
 *  todos los negocios hoy, así que la primera pantalla nunca sale vacía. */
export const ORIGEN_DEFAULT: Origen = { lat: MERCADO_LAT, lng: MERCADO_LNG, fuente: "default" };

export interface ConCoords {
  lat?: number | null;
  lng?: number | null;
}

/** Distancia al origen, o null si el negocio no tiene coordenadas. */
export function distanciaA(origen: Origen, p: ConCoords): number | null {
  if (p.lat == null || p.lng == null) return null;
  return haversineKm(origen.lat, origen.lng, p.lat, p.lng);
}

/**
 * Ordena por cercanía y marca cuáles quedan dentro del radio.
 *
 * Los negocios SIN coordenadas nunca se esconden: van al final. Muchos se
 * dieron de alta cuando el mapa no era obligatorio, y desaparecerlos del
 * directorio por un dato que ellos no controlan sería castigarlos por algo
 * que es culpa nuestra.
 */
export function porCercania<T extends ConCoords>(
  origen: Origen,
  lista: T[],
  radioKm = RADIO_KM
): { item: T; km: number | null; cerca: boolean }[] {
  return lista
    .map((item) => {
      const km = distanciaA(origen, item);
      return { item, km, cerca: km == null || km <= radioKm };
    })
    .sort((a, b) => {
      if (a.km == null && b.km == null) return 0;
      if (a.km == null) return 1; // sin coords, al final
      if (b.km == null) return -1;
      return a.km - b.km;
    });
}

/** "1.2 km" / "800 m" — para mostrar en la tarjeta del negocio. */
export function formatKm(km: number | null): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Pide la ubicación al navegador. Resuelve a null si el usuario la niega o
 *  el dispositivo no responde a tiempo — ahí seguimos con el pin o el default. */
export function pedirUbicacion(timeoutMs = 8000): Promise<Origen | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, fuente: "gps" }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60_000 }
    );
  });
}
