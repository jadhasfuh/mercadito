/**
 * Piezas de promociones que necesita la app.
 *
 * ESPEJO PARCIAL de src/lib/precioPromo.ts (web): de allá sólo se copia lo que
 * es de interfaz. La resolución del precio vigente es SQL y vive en el
 * servidor a propósito — que el menú, la caja y la comanda de mesa saquen el
 * mismo número depende de que la regla esté escrita UNA vez.
 */

export const DIAS_CORTOS = ["D", "L", "M", "M", "J", "V", "S"];

/** "HH:MM" válido, o null. Se acepta vacío para "todo el día". */
export function horaValida(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
