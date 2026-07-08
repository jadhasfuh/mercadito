// Throttle genérico en memoria por clave (ej. IP). Ligero, sin dependencias.
// Limitación conocida: por proceso — en multi-instancia no se comparte y se
// reinicia en cada deploy. Suficiente para frenar abuso básico (enumeración,
// scraping) de endpoints públicos. Si escala, mover a Redis/DB.

interface Ventana { count: number; until: number; }
const buckets = new Map<string, Ventana>();

// Limpieza perezosa: si el mapa crece, purga entradas expiradas.
function gc(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
}

/**
 * Registra un golpe para `key`. Devuelve { ok:false, segundos } si ya excedió
 * `max` golpes dentro de `windowMs`. Cuenta también el golpe actual.
 */
export function throttle(key: string, max: number, windowMs: number): { ok: boolean; segundos?: number } {
  const now = Date.now();
  gc(now);
  const b = buckets.get(key);
  if (!b || b.until < now) {
    buckets.set(key, { count: 1, until: now + windowMs });
    return { ok: true };
  }
  b.count += 1;
  if (b.count > max) return { ok: false, segundos: Math.ceil((b.until - now) / 1000) };
  return { ok: true };
}

/** IP del cliente detrás de proxy (Railway/Vercel setean x-forwarded-for). */
export function ipDe(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
