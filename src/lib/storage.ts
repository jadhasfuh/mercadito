// Subida de imágenes a Supabase Storage (bucket público) vía REST.
//
// Antes las imágenes se guardaban como base64 dentro de la DB → páginas pesadas
// (el menú digital incrustaba MB de imágenes) y DB inflada. Ahora se suben a un
// bucket y en la DB se guarda solo la URL (CDN), que el navegador carga lazy.
//
// FALLBACK SEGURO: si no hay `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` (bucket sin
// configurar), las funciones devuelven la imagen tal cual (base64) y la app sigue
// funcionando igual que antes. Al poner las env vars en Railway, se activa solo.

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
export const BUCKET_IMAGENES = "productos";

export function storageDisponible(): boolean {
  return !!(SUPABASE_URL && SERVICE_KEY);
}

// Si `imagen` es un data-URI base64, lo sube al bucket en `path` y devuelve la
// URL pública. Si ya es una URL (http) o null, o si no hay storage configurado,
// lo devuelve sin cambios. Nunca lanza: ante cualquier fallo, deja el valor
// original (no rompe el guardado del producto).
export async function subirImagenSiBase64(
  imagen: string | null | undefined,
  path: string,
  bucket: string = BUCKET_IMAGENES
): Promise<string | null | undefined> {
  if (!imagen || typeof imagen !== "string" || !imagen.startsWith("data:image")) return imagen;
  if (!storageDisponible()) return imagen;
  try {
    const m = imagen.match(/^data:(image\/([a-zA-Z0-9.+-]+));base64,(.+)$/);
    if (!m) return imagen;
    const contentType = m[1];
    const ext = m[2].toLowerCase() === "jpeg" ? "jpg" : m[2].toLowerCase();
    const bytes = Buffer.from(m[3], "base64");
    const objectPath = `${path}.${ext}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": contentType,
        "x-upsert": "true", // permite re-subir al editar
        "cache-control": "public, max-age=31536000",
      },
      body: bytes,
    });
    if (!res.ok) {
      console.error("[storage] upload falló", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return imagen; // fallback: deja base64
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
  } catch (e) {
    console.error("[storage] error subiendo imagen", e);
    return imagen;
  }
}
