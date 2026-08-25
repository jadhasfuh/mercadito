import { ImageResponse } from "next/og";
import { TARJETA } from "@/lib/tarjeta";
import { tarjetaPromo, varianteDeLaSemana, VARIANTES } from "@/lib/tarjetaPromo";

// GET /api/promo/tarjeta[?v=<id>]
// PNG 1080×1080 promocionando Mercadito. Sin `v` sale la variante de la
// semana; con `v` se fuerza una (para revisarlas antes de publicar).
//
// Pública a propósito: Meta descarga la imagen desde su lado al publicar.
// No toca la base — es todo estático, así que no puede fallar por datos.
export function GET(req: Request) {
  const pedida = new URL(req.url).searchParams.get("v");
  const v = (pedida && VARIANTES.find((x) => x.id === pedida)) || varianteDeLaSemana();

  return new ImageResponse(tarjetaPromo(v), {
    ...TARJETA,
    headers: { "Cache-Control": "public, max-age=600" },
  });
}
