// Formateo de fechas SIEMPRE en horario de México (CDMX/GDL/MTY, UTC-6),
// independiente de la zona del dispositivo o del servidor (Railway corre en
// UTC). Usar en todo el admin para que los reportes al día sean correctos.
const TZ = "America/Mexico_City";

/**
 * Formatea un instante (created_at, entregado_at, etc. — un timestamptz) en
 * hora local de México. `value` puede ser un ISO string o Date.
 */
export function fechaHoraMX(
  value: string | number | Date,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" }
): string {
  return new Date(value).toLocaleString("es-MX", { timeZone: TZ, ...opts });
}

/**
 * Formatea una fecha de SOLO día ("YYYY-MM-DD", ej. el `fecha` de ventas por
 * día) como etiqueta corta sin corrimiento de zona horaria. Se construye en
 * hora local para que "2026-06-17" no se vuelva "16 jun" al pasar por UTC.
 */
export function diaCortoMX(
  ymd: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }
): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("es-MX", opts);
}
