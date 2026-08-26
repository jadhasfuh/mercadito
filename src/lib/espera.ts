// Tiempo de espera de una comanda en cocina.
//
// Lo que cocina necesita no es la hora a la que entró el pedido, sino cuánto
// lleva esperando — y verlo sin hacer la resta. Los umbrales están pensados
// para comida de calle y fonda (una orden de tacos que lleva 20 minutos ya es
// un problema), no para un restaurante de tiempos largos.
//
// Espejo de mobile/src/lib/espera.ts. Si cambian los umbrales, cambian los dos.

export type NivelEspera = "ok" | "medio" | "alto";

/** Minutos transcurridos desde `iso`. null si no hay fecha o es futura/inválida. */
export function minutosDesde(iso: string | null | undefined, ahora: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ahora - t) / 60_000));
}

/** "8 min" hasta la hora; "1:05 h" de ahí en adelante. Una comanda de más de
 *  una hora en pantalla casi siempre es basura que nadie marcó como servida,
 *  y en ese formato salta a la vista. */
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

/** Colores del chip por nivel — mismos tonos en web y app. */
export const COLOR_ESPERA: Record<NivelEspera, { fondo: string; texto: string }> = {
  ok: { fondo: "#ECFDF5", texto: "#047857" },
  medio: { fondo: "#FEF3C7", texto: "#92400E" },
  alto: { fondo: "#FEE2E2", texto: "#B91C1C" },
};
