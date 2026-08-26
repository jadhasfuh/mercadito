/**
 * Precio vigente de un producto: el promocional si la promo aplica AHORA, o el
 * de lista.
 *
 * Todo esto es SQL y no TypeScript porque el precio se resuelve en cuatro
 * lugares distintos —el menú digital, el catálogo, la venta en mostrador y la
 * comanda de mesa— y en los cuatro tiene que dar el mismo número. Tener la
 * regla escrita una vez y pegarla en los cuatro queries es lo que impide que
 * el menú anuncie un precio y la caja cobre otro.
 *
 * La hora y el día se evalúan en hora de México, igual que el resto de las
 * reglas de disponibilidad del sistema (horarios de producto, tienda abierta).
 *
 * Reglas de la promo, todas opcionales y acumulativas:
 *   · precio_promo    → sin él no hay promo
 *   · promo_dias      → array [0..6]; vacío o NULL = todos los días
 *   · promo_desde/hasta → franja "HH:MM"; NULL = todo el día
 *   · promo_termina   → último día en que aplica; NULL = sin vencimiento
 */

/** Condición booleana: ¿la promo de la fila `alias` aplica ahora mismo? */
export function promoVigenteSQL(alias = "pr"): string {
  return `(
    ${alias}.precio_promo IS NOT NULL
    AND ${alias}.precio_promo > 0
    AND (${alias}.promo_termina IS NULL
         OR ${alias}.promo_termina >= (NOW() AT TIME ZONE 'America/Mexico_City')::date)
    AND (
      ${alias}.promo_dias IS NULL
      OR jsonb_typeof(${alias}.promo_dias) <> 'array'
      OR jsonb_array_length(${alias}.promo_dias) = 0
      OR ${alias}.promo_dias @> to_jsonb(EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::int)
    )
    AND (
      ${alias}.promo_desde IS NULL OR ${alias}.promo_hasta IS NULL
      OR to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI')
         BETWEEN ${alias}.promo_desde AND ${alias}.promo_hasta
    )
  )`;
}

/** Precio a cobrar: el de promo si aplica, si no el de lista. */
export function precioVigenteSQL(alias = "pr"): string {
  return `(CASE WHEN ${promoVigenteSQL(alias)} THEN ${alias}.precio_promo ELSE ${alias}.precio END)`;
}

/** El precio de lista, sólo cuando hay promo activa — para tacharlo en el
 *  menú. NULL si no hay promo: el cliente no tiene por qué ver un tachado
 *  falso. */
export function precioAntesSQL(alias = "pr"): string {
  return `(CASE WHEN ${promoVigenteSQL(alias)} THEN ${alias}.precio ELSE NULL END)`;
}

/** La etiqueta de la promo, sólo cuando aplica. */
export function promoEtiquetaSQL(alias = "pr"): string {
  return `(CASE WHEN ${promoVigenteSQL(alias)} THEN COALESCE(NULLIF(${alias}.promo_etiqueta, ''), 'Promo') ELSE NULL END)`;
}

// ── Validación de lo que captura el negocio ───────────────────────────────

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

/** Días válidos (0..6), sin repetidos y ordenados. */
export function diasValidos(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const set = new Set<number>();
  for (const d of v) {
    const n = Number(d);
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  return [...set].sort();
}
