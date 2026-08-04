import { query } from "@/lib/db";
import { labelCiudad } from "@/lib/ciudades";
import { publicarFotoEnPagina, facebookConfigurado } from "@/lib/facebook";
import { NextResponse } from "next/server";

/**
 * Cron — presenta UNA tienda por corrida en la página de Facebook de
 * Mercadito, con la tarjeta del QR de su menú digital.
 *
 * Filtros:
 *   - tienda activa, aprobada y con el menú público prendido
 *   - al menos 2 productos con precio activo (un menú de 1 artículo se ve mal)
 *   - fb_post_at IS NULL (una publicación por tienda; idempotente)
 *
 * Orden: primero las que tienen más productos — la primera impresión de quien
 * escanea es un menú lleno. Diseñado para correr 1 vez al día; publicar en
 * ráfaga se ve spam y Meta lo penaliza. Auth: header X-Cron-Secret.
 */

const BASE_URL = "https://mercadito.cx";
const MIN_PRODUCTOS = 2;

// Emoji según lo que vende. En Facebook la primera línea decide si te detienes,
// y un emoji de comida concreta engancha más que uno genérico.
const EMOJIS: [RegExp, string][] = [
  [/sushi|roll|nigiri/i, "🍣"],
  [/taco|birria|barbacoa/i, "🌮"],
  [/pizza/i, "🍕"],
  [/hamburgues|burger/i, "🍔"],
  [/pollo|alit|rostiz/i, "🍗"],
  [/marisc|camar|pescad|ceviche|ostion/i, "🦐"],
  [/caf[eé]|capuchino|latte/i, "☕"],
  [/postre|pastel|dona|helado|churro|crep/i, "🍰"],
  [/jugo|smoothie|frapp|malteada|agua fresca/i, "🥤"],
  [/pan|panader|bolill|concha/i, "🥖"],
  [/carne|asad|steak|arrachera/i, "🥩"],
  [/desayun|hotcake|chilaquil|huevo/i, "🍳"],
  [/torta|baguet|sandwich/i, "🥪"],
  [/frut|verdur|abarrot/i, "🥑"],
];
function emojiDe(texto: string): string {
  for (const [re, emoji] of EMOJIS) if (re.test(texto)) return emoji;
  return "🍽️";
}

interface Datos { emoji: string; nombre: string; quE: string; ciudad: string; colonia: string; url: string; }

// Cinco ángulos distintos para que el muro no se vea plantilla: directo,
// antojo, conveniencia, lanzamiento y marca. Nunca decimos "nuevo": los
// negocios llevan años abiertos, lo nuevo es que ya se les pide por aquí.
// Todos con línea corta, CTA claro
// y la URL en el texto (mucha gente ve Facebook en el mismo celular con el que
// tendría que escanear, así que el QR solo no basta).
const PLANTILLAS: ((d: Datos) => string)[] = [
  (d) => `${d.emoji} ¡Ya encuentras ${d.nombre} en Mercadito!
Pide ${d.quE} a domicilio en ${d.ciudad} 🛵
${d.colonia}
📲 Escanea el QR o entra aquí: ${d.url}`,

  (d) => `${d.emoji} ¿Ya probaste ${d.nombre}?
${d.quE.charAt(0).toUpperCase() + d.quE.slice(1)} hasta tu puerta, sin salir de casa ✨
${d.colonia}
📲 ${d.url}`,

  (d) => `${d.emoji} ${d.nombre} ya está en Mercadito
Pide ${d.quE} desde el celular y te lo llevamos 🛵
${d.colonia}
📲 Escanea el QR o entra: ${d.url}`,

  (d) => `${d.emoji} Antojo resuelto: ${d.nombre}
${d.quE.charAt(0).toUpperCase() + d.quE.slice(1)} en ${d.ciudad}, a domicilio 🔥
${d.colonia}
📲 Pide aquí: ${d.url}`,

  (d) => `${d.emoji} ${d.nombre}, ahora a domicilio
Su menú completo ya está en Mercadito: ${d.quE} y más ✨
${d.colonia}
📲 Escanea el QR o entra: ${d.url}`,
];

/** Plantilla estable por tienda: un reintento manda exactamente el mismo texto. */
function elegirPlantilla(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PLANTILLAS[h % PLANTILLAS.length];
}

/** "chilaquiles, hamburguesas y más" a partir de los grupos del menú. */
function queVende(grupos: string[]): string {
  const g = grupos.map((s) => s.toLowerCase()).slice(0, 2);
  if (g.length === 0) return "su menú completo";
  if (g.length === 1) return `${g[0]} y más`;
  return `${g[0]}, ${g[1]} y más`;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!facebookConfigurado()) {
    return NextResponse.json({ error: "Facebook no configurado" }, { status: 503 });
  }

  const candidatas = await query<{
    id: string; nombre: string; ubicacion: string | null; ciudad: string; menu_slug: string | null; n: number;
  }>(
    `SELECT p.id, p.nombre, p.ubicacion, p.ciudad, p.menu_slug, COUNT(pr.id)::int AS n
     FROM puestos p
     JOIN precios pr ON pr.puesto_id = p.id AND pr.activo = true
     WHERE p.activo = true AND p.aprobado = true AND p.menu_publico = true
       AND p.fb_post_at IS NULL
     GROUP BY p.id, p.nombre, p.ubicacion, p.ciudad, p.menu_slug
     HAVING COUNT(pr.id) >= $1
     ORDER BY COUNT(pr.id) DESC, p.nombre
     LIMIT 1`,
    [MIN_PRODUCTOS]
  );

  const tienda = candidatas[0];
  if (!tienda) return NextResponse.json({ ok: true, publicadas: 0, motivo: "sin tiendas pendientes" });

  const grupos = await query<{ seccion: string }>(
    `SELECT p.seccion
     FROM productos p
     JOIN precios pr ON pr.producto_id = p.id AND pr.puesto_id = $1 AND pr.activo = true
     WHERE p.seccion IS NOT NULL AND p.seccion <> ''
     GROUP BY p.seccion
     ORDER BY COUNT(*) DESC
     LIMIT 3`,
    [tienda.id]
  );
  const nombresGrupos = grupos.map((g) => g.seccion);
  const ref = tienda.menu_slug || tienda.id;

  const mensaje = elegirPlantilla(tienda.id)({
    emoji: emojiDe(`${tienda.nombre} ${nombresGrupos.join(" ")}`),
    nombre: tienda.nombre,
    quE: queVende(nombresGrupos),
    ciudad: labelCiudad(tienda.ciudad),
    // Solo la colonia: la dirección completa no se lee de un vistazo.
    colonia: tienda.ubicacion ? `📍 ${tienda.ubicacion.split(",")[0].trim()}` : "",
    url: `mercadito.cx/m/${ref}`,
  }).replace(/\n{2,}/g, "\n"); // sin la colonia no queda un renglón vacío

  const r = await publicarFotoEnPagina(`${BASE_URL}/api/menu/${tienda.id}/tarjeta`, mensaje);
  if (!r.ok) {
    // No marcamos fb_post_at: la tienda queda pendiente para el día siguiente.
    return NextResponse.json({ ok: false, tienda: tienda.nombre, error: r.error }, { status: 502 });
  }

  await query("UPDATE puestos SET fb_post_at = NOW(), fb_post_id = $1 WHERE id = $2", [r.post_id ?? null, tienda.id]);

  return NextResponse.json({ ok: true, publicadas: 1, tienda: tienda.nombre, post_id: r.post_id });
}
