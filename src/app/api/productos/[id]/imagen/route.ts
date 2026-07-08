import { queryOne } from "@/lib/db";

// Servidor de imágenes de producto. La columna `productos.imagen` puede
// contener:
//   - data:image/...;base64,...   (carga histórica desde la app de tiendas)
//   - emoji:🍕                    (icono ASCII para productos sin foto)
//   - null                        (sin imagen)
//
// /api/productos antes devolvía el data-URL inline en el JSON, lo cual
// inflaba el payload a 30 MB con 849 productos. Ahora ese endpoint
// reemplaza el data-URL por la URL relativa a este handler, y los clientes
// (web vía <img>, mobile vía <Image>) descargan solo las que se ven.
//
// Cache largo (1 día) porque las imágenes raramente cambian; si llega a
// cambiar, el cliente verá la vieja por hasta 24h — aceptable.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await queryOne<{ imagen: string | null }>(
    "SELECT imagen FROM productos WHERE id = $1",
    [id]
  );
  if (!row || !row.imagen) {
    return new Response(null, { status: 404 });
  }
  // Ya migrada a Supabase Storage (URL) → redirige al CDN, pero SOLO a nuestro
  // almacenamiento. Sin la allowlist, una tienda podía poner la imagen a un
  // sitio de phishing y quedaba servido como redirect desde nuestro dominio
  // (open redirect). Todas las imágenes reales viven en *.supabase.co.
  if (row.imagen.startsWith("http")) {
    try {
      const host = new URL(row.imagen).hostname;
      if (host === "supabase.co" || host.endsWith(".supabase.co")) {
        return Response.redirect(row.imagen, 302);
      }
    } catch {
      // URL inválida → cae al 404 de abajo.
    }
    return new Response(null, { status: 404 });
  }
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(row.imagen);
  if (!match) {
    // emoji: o cualquier otro formato que no sea data-URL no se sirve por
    // acá — el frontend ya los detecta y renderiza diferente.
    return new Response(null, { status: 404 });
  }
  const [, mime, b64] = match;
  const bytes = Buffer.from(b64, "base64");
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
