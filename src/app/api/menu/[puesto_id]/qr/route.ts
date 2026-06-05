import { queryOne } from "@/lib/db";
import QRCode from "qrcode";
import { NextResponse } from "next/server";

const BASE_URL = "https://mercadito.cx";

// GET /api/menu/[puesto_id]/qr[?mesa=token]
// PNG del QR que apunta al menú público (o a una mesa). Público: sólo codifica
// una URL pública, no expone datos.
export async function GET(req: Request, { params }: { params: Promise<{ puesto_id: string }> }) {
  const { puesto_id } = await params;

  // Slug bonito si existe, si no el id.
  const puesto = await queryOne<{ menu_slug: string | null }>(
    "SELECT menu_slug FROM puestos WHERE id = $1",
    [puesto_id]
  );
  const ref = puesto?.menu_slug || puesto_id;

  const { searchParams } = new URL(req.url);
  const mesaToken = searchParams.get("mesa");
  const url = mesaToken
    ? `${BASE_URL}/m/${ref}/mesa/${mesaToken}`
    : `${BASE_URL}/m/${ref}`;

  const png = await QRCode.toBuffer(url, { width: 600, margin: 2, errorCorrectionLevel: "M" });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" },
  });
}
