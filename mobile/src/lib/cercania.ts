import * as Location from "expo-location";

// Espejo de src/lib/cercania.ts en web. Filtro de cercanía del directorio de
// menús: mientras Mercadito entregaba, la lista se filtraba por ciudad
// (Sahuayo / Jiquilpan / San Pedro) porque esas eran las zonas de reparto.
// Sin entregas la ciudad dejó de importar — lo que le sirve al usuario es qué
// hay cerca — y la lista fija impedía crecer a cualquier otra parte del país.

export const RADIO_KM = 15;

/** Mercado Municipal de Sahuayo — el default mientras no sepamos dónde está
 *  el usuario: es donde están casi todos los negocios, así que la primera
 *  pantalla nunca sale vacía. */
export const ORIGEN_DEFAULT: Origen = { lat: 20.0562569, lng: -102.721598, fuente: "default" };

export interface Origen {
  lat: number;
  lng: number;
  fuente: "gps" | "pin" | "default";
}

export interface ConCoords {
  lat?: number | null;
  lng?: number | null;
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

export function distanciaA(origen: Origen, p: ConCoords): number | null {
  if (p.lat == null || p.lng == null) return null;
  return haversineKm(origen.lat, origen.lng, p.lat, p.lng);
}

/**
 * Ordena por cercanía y marca cuáles quedan dentro del radio.
 *
 * Los negocios SIN coordenadas nunca se esconden: van al final. Algunos se
 * dieron de alta cuando el mapa no era obligatorio, y desaparecerlos por un
 * dato que ellos no controlan sería castigarlos por algo nuestro.
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
      if (a.km == null) return 1;
      if (b.km == null) return -1;
      return a.km - b.km;
    });
}

/** "1.2 km" / "800 m" */
export function formatKm(km: number | null): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Pide la ubicación. Resuelve a null si el usuario la niega o el dispositivo
 * no responde — ahí seguimos con el default y el usuario puede elegir ciudad
 * a mano. Nunca bloquea la pantalla.
 */
export async function pedirUbicacion(): Promise<Origen | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, fuente: "gps" };
  } catch {
    return null;
  }
}
