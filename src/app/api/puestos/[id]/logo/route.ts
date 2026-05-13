import { queryOne } from "@/lib/db";

// Mismo patrón que /api/productos/[id]/imagen — saca el logo del payload
// principal de /api/puestos (que pesaba ~2 MB por los logos base64) y lo
// sirve aparte con cache de 1 día.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await queryOne<{ logo: string | null }>(
    "SELECT logo FROM puestos WHERE id = $1",
    [id]
  );
  if (!row || !row.logo) {
    return new Response(null, { status: 404 });
  }
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(row.logo);
  if (!match) {
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
