// Tiempo de espera de una comanda en cocina.
//
// ESPEJO de src/lib/espera.ts (web). Los umbrales están pensados para comida
// de calle y fonda: una orden que lleva 20 minutos ya es un problema. Si
// cambian allá, cambian aquí.

export type NivelEspera = "ok" | "medio" | "alto";

/** Minutos transcurridos desde `iso`. null si no hay fecha o es inválida. */
export function minutosDesde(iso: string | null | undefined, ahora: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ahora - t) / 60_000));
}

/** "8 min" hasta la hora; "1:05 h" de ahí en adelante. */
export function textoEspera(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}:${String(min % 60).padStart(2, "0")} h`;
}

export function nivelEspera(min: number): NivelEspera {
  if (min >= 20) return "alto";
  if (min >= 10) return "medio";
  return "ok";
}

export const COLOR_ESPERA: Record<NivelEspera, { fondo: string; texto: string }> = {
  ok: { fondo: "#ECFDF5", texto: "#047857" },
  medio: { fondo: "#FEF3C7", texto: "#92400E" },
  alto: { fondo: "#FEE2E2", texto: "#B91C1C" },
};
