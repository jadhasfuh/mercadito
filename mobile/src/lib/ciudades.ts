// Espejo de src/lib/ciudades.ts (web). Mantener sincronizado.
// Sahuayo es la base; Jiquilpan y Venustiano Carranza ("San Pedro") son
// foráneas: impuesto de ciudad oculto + piso, y aporte de la tienda.

export const CIUDAD_BASE = "sahuayo";

export const CIUDADES: { id: string; label: string }[] = [
  { id: "sahuayo", label: "Sahuayo" },
  { id: "jiquilpan", label: "Jiquilpan" },
  { id: "venustiano", label: "San Pedro (Venustiano Carranza)" },
];

export function labelCiudad(id?: string | null): string {
  return CIUDADES.find((c) => c.id === id)?.label ?? "Sahuayo";
}

export function esForanea(ciudad?: string | null): boolean {
  return !!ciudad && ciudad !== CIUDAD_BASE;
}

export const PISO_FORANEO_ENVIO = 25;
export const IMPUESTO_CIUDAD = 10;
export const APORTE_TIENDA_FORANEA = 20;
export const PREMIUM_SURCHARGE = 15;
export const FERNANDO_ID = "fernando-1";
