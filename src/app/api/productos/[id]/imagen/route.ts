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
