// Ciudades de cobertura y reglas de envío multi-ciudad (jun 2026).
// Sahuayo es la base; Jiquilpan y Venustiano Carranza ("San Pedro") son
// foráneas: pagan impuesto de ciudad (oculto, en geo.ts) y, mientras no haya
// repartidor local, la tienda aporta un fijo al envío.

export const CIUDAD_BASE = "sahuayo";

export const CIUDADES: { id: string; label: string }[] = [
  { id: "sahuayo", label: "Sahuayo" },
  { id: "jiquilpan", label: "Jiquilpan" },
  { id: "venustiano", label: "San Pedro (Venustiano Carranza)" },
];

// Centros geográficos de la zona de servicio + radio. Los usa
// dentroDeZonaServicio (geo.ts) para rechazar puntos fuera de la región —
// sin este check se podía crear un mandado con origen y destino en cualquier
// parte del mundo (los dos pines cercanos entre sí pasaban la cobertura de
// 20 km). Radio generoso para ranchos alrededor; espejo en mobile/src/lib/envio.ts.
export const CENTROS_ZONA: { id: string; lat: number; lng: number }[] = [
  { id: "sahuayo",    lat: 20.0563, lng: -102.7216 },
  { id: "jiquilpan",  lat: 19.9928, lng: -102.7192 },
  { id: "venustiano", lat: 20.1167, lng: -102.6667 },
];
export const RADIO_ZONA_SERVICIO_KM = 15;

export function labelCiudad(id?: string | null): string {
  return CIUDADES.find((c) => c.id === id)?.label ?? "Sahuayo";
}

/** True si la ciudad no es Sahuayo (aplica impuesto de ciudad y aporte). */
export function esForanea(ciudad?: string | null): boolean {
  return !!ciudad && ciudad !== CIUDAD_BASE;
}

// Impuesto de ciudad (recargo oculto) y piso del envío foráneo. Los usa el
// motor de precios (geo.ts) y la validación server-side del pedido.
// 1 km foráneo = max(PISO, 15 + IMPUESTO) = 25.
export const PISO_FORANEO_ENVIO = 25;
export const IMPUESTO_CIUDAD = 10;

// Aporte fijo de la tienda foránea al envío, SOLO cuando no hay repartidor
// activo registrado en su ciudad (entonces el envío lo cubre uno de Sahuayo).
export const APORTE_TIENDA_FORANEA = 20;

// Recargo del tier premium (repartidor asegurado = Fernando). Solo se ofrece
// en pedidos de ciudad foránea.
export const PREMIUM_SURCHARGE = 15;

// Repartidor de planta que cubre los premium garantizados.
export const FERNANDO_ID = "fernando-1";

// Minutos que un pedido normal foráneo puede estar sin que nadie lo tome antes
// de ofrecerle al cliente subir a premium.
export const UPGRADE_PREMIUM_MIN = 10;
