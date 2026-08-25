import { publicarFotoEnPagina, facebookConfigurado } from "@/lib/facebook";
import { varianteDeLaSemana, VARIANTES } from "@/lib/tarjetaPromo";
import { NextResponse } from "next/server";

/**
 * Cron — publicación SEMANAL sobre Mercadito mismo (no sobre una tienda).
 *
 * El otro cron (fb-publicar-tiendas) presenta negocios: sirve al comensal y
 * de paso al negocio ya registrado. Este habla del producto a quien todavía
 * no lo tiene — qué hace, cuánto cuesta, que hay soporte.
 *
 * Cada semana toca un ángulo distinto (menú, WhatsApp, mesas, reservas,
 * precio, soporte) y vuelve a empezar. Así el muro no repite el mismo
 * argumento y con el tiempo se cuenta el producto completo.
 *
 * Sin idempotencia por base: la variante se deriva de la SEMANA, así que dos
 * disparos el mismo día publicarían lo mismo. Por eso va agendado una vez por
 * semana; si necesitas repetirlo a mano, usa ?v= para elegir otro ángulo.
 *
 * Auth: header X-Cron-Secret.
 */

const BASE_URL = "https://mercadito.cx";

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!facebookConfigurado()) {
    return NextResponse.json({ error: "Facebook no configurado" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const forzada = searchParams.get("v");
  const v = (forzada && VARIANTES.find((x) => x.id === forzada)) || varianteDeLaSemana();
  const imagen = `${BASE_URL}/api/promo/tarjeta?v=${v.id}`;

  // ?dry=1 — ensayo: devuelve lo que se publicaría sin tocar Facebook.
  if (searchParams.get("dry") === "1") {
    return NextResponse.json({ ok: true, dry: true, variante: v.id, mensaje: v.copy, imagen });
  }

  const r = await publicarFotoEnPagina(imagen, v.copy);
  if (!r.ok) {
    return NextResponse.json({ ok: false, variante: v.id, error: r.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, variante: v.id, post_id: r.post_id });
}
