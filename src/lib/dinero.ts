// Formato de dinero único para toda la app. Antes el mismo precio se veía como
// "$35", "$35.5" y "$35.00" en pantallas distintas del mismo flujo. Regla única:
// sin decimales si es entero, 2 decimales si tiene fracción.
export function formatMXN(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (!isFinite(v)) return "$0";
  const entero = Number.isInteger(v);
  return `$${v.toLocaleString("es-MX", {
    minimumFractionDigits: entero ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
