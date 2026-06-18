// Formateo de fechas SIEMPRE en horario de México (CDMX/GDL/MTY, UTC-6),
// independiente de la zona del dispositivo. Usar en el admin/reportes.
const TZ = "America/Mexico_City";

/** Instante (created_at, etc.) en hora local de México. */
export function fechaHoraMX(
  value: string | number | Date,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" }
): string {
  return new Date(value).toLocaleString("es-MX", { timeZone: TZ, ...opts });
}

/** Fecha de SOLO día ("YYYY-MM-DD") como etiqueta corta, sin corrimiento de TZ. */
export function diaCortoMX(
  ymd: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }
): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("es-MX", opts);
}
