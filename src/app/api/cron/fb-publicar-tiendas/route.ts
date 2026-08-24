import { query, queryOne } from "@/lib/db";
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

// Giro de la tienda, sacado de la categoría dominante de sus productos. Sin
// esto el copy asumía comida y salían cosas como "Antojo resuelto: Farmacia
// Inmaculada". Lo que no cae en ningún grupo va al tono neutral.
type Giro = "antojo" | "despensa" | "general";
const GIRO_POR_CATEGORIA: Record<string, Giro> = {
  restaurante: "antojo", antojitos: "antojo", comidas: "antojo", cafeteria: "antojo",
  panaderia: "antojo", bebidas: "antojo", botanero: "antojo", pizzas: "antojo",
  mariscos: "antojo",
  frutas: "despensa", verduras: "despensa", carnes: "despensa", lacteos: "despensa",
  cremeria: "despensa", abarrotes: "despensa", granos: "despensa",
};

// Emoji según lo que vende. En Facebook la primera línea decide si te detienes,
// y un emoji concreto engancha más que uno genérico. Solo se aplica a comida:
// para lo demás mandamos el ícono que la categoría ya trae en la base
// (💊 farmacia, 🧹 limpieza, 🐾 mascotas…).
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
function emojiDe(texto: string, giro: Giro, iconoCategoria: string | null): string {
  if (giro === "antojo") {
    for (const [re, emoji] of EMOJIS) if (re.test(texto)) return emoji;
    return "🍽️";
  }
  return iconoCategoria || (giro === "despensa" ? "🛒" : "🛍️");
}

interface Datos { emoji: string; nombre: string; quE: string; ciudad: string; colonia: string; url: string; }
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Cinco ángulos por giro para que el muro no se vea plantilla. Nunca decimos
// "nuevo": los negocios llevan años abiertos, lo nuevo es que ya tienen su
// menú aquí. Líneas cortas, CTA claro y la URL en el texto (mucha gente ve
// Facebook en el mismo celular con el que tendría que escanear, así que el QR
// solo no basta).
//
// Mercadito NO entrega: el menú es la carta digital y el pedido sale al
// WhatsApp del negocio, que confirma y entrega por su cuenta. Ninguna
// plantilla puede prometer reparto ("te lo llevamos", "a domicilio") o
// estaríamos vendiendo algo que no existe.
const PLANTILLAS: Record<Giro, ((d: Datos) => string)[]> = {
  antojo: [
    (d) => `${d.emoji} ¡Ya puedes ver el menú de ${d.nombre}!
${mayus(d.quE)} — mira precios y pide por WhatsApp 📲
${d.colonia}
Escanea el QR o entra aquí: ${d.url}`,

    (d) => `${d.emoji} ¿Ya probaste ${d.nombre}?
Su carta completa, con precios al día ✨
${d.colonia}
📲 Míralo aquí: ${d.url}`,

    (d) => `${d.emoji} ${d.nombre} ya tiene su menú digital
${mayus(d.quE)}. Escoge desde el celular y pide directo al negocio 💬
${d.colonia}
📲 Escanea el QR o entra: ${d.url}`,

    (d) => `${d.emoji} Antojo resuelto: ${d.nombre}
Mira el menú, arma tu pedido y mándalo por WhatsApp 🔥
${d.colonia}
📲 Aquí: ${d.url}`,

    (d) => `${d.emoji} ${d.nombre}, ahora con menú digital
Su carta completa en tu celular: ${d.quE} ✨
${d.colonia}
📲 Escanea el QR o entra: ${d.url}`,
  ],

  despensa: [
    (d) => `${d.emoji} ¡Ya puedes ver lo que hay en ${d.nombre}!
${mayus(d.quE)}, con precios al día 📲
${d.colonia}
Escanea el QR o entra aquí: ${d.url}`,

    (d) => `${d.emoji} ${d.nombre} ya tiene su lista digital
Mira qué hay y aparta lo tuyo por WhatsApp 🧺
${d.colonia}
📲 ${d.url}`,

    (d) => `${d.emoji} ¿Te faltó algo? ${d.nombre} te surte
${mayus(d.quE)} — consulta precios antes de salir ✨
${d.colonia}
📲 Escanea el QR o entra: ${d.url}`,

    (d) => `${d.emoji} ${d.nombre}, ahora con catálogo en línea
Arma tu pedido y mándalo por WhatsApp 💬
${d.colonia}
📲 Aquí: ${d.url}`,

    (d) => `${d.emoji} Tu despensa, más fácil: ${d.nombre}
${mayus(d.quE)} en ${d.ciudad}, con precios a la mano 🧺
${d.colonia}
📲 Escanea el QR o entra: ${d.url}`,
  ],

  general: [
    (d) => `${d.emoji} ¡Ya puedes ver el catálogo de ${d.nombre}!
${mayus(d.quE)}, con precios al día 📲
${d.colonia}
Escanea el QR o entra aquí: ${d.url}`,

    (d) => `${d.emoji} ${d.nombre} ya está en Mercadito
Mira lo que tienen y pide por WhatsApp 💬
${d.colonia}
📲 ${d.url}`,

    (d) => `${d.emoji} ¿Necesitas algo de ${d.nombre}?
Consulta su catálogo y precios desde el celular ✨
${d.colonia}
📲 Escanea el QR o entra: ${d.url}`,

    (d) => `${d.emoji} ${d.nombre}, ahora con catálogo en línea
Arma tu pedido y mándalo por WhatsApp 📲
${d.colonia}
Aquí: ${d.url}`,

    (d) => `${d.emoji} ${d.nombre} en Mercadito
${mayus(d.quE)} — mira precios antes de ir ✨
${d.colonia}
📲 Escanea el QR o entra: ${d.url}`,
  ],
};

/** Plantilla estable por tienda: un reintento manda exactamente el mismo texto. */
function elegirPlantilla(id: string, giro: Giro) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const pool = PLANTILLAS[giro];
  return pool[h % pool.length];
}

/** "chilaquiles, hamburguesas y más" a partir de los grupos del menú. */
function queVende(grupos: string[], giro: Giro): string {
  const g = grupos.map((s) => s.toLowerCase()).slice(0, 2);
  if (g.length === 0) {
    // Sin grupos capturados: "su menú completo" no aplica a una farmacia.
    return giro === "antojo" ? "su menú completo" : giro === "despensa" ? "todo lo de tu despensa" : "lo que necesitas";
  }
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

  // Categoría dominante de sus productos: define el tono del copy y el emoji.
  const cat = await queryOne<{ id: string; icono: string | null }>(
    `SELECT c.id, c.icono
     FROM productos p
     JOIN precios pr ON pr.producto_id = p.id AND pr.puesto_id = $1 AND pr.activo = true
     JOIN categorias c ON c.id = p.categoria_id
     GROUP BY c.id, c.icono
     ORDER BY COUNT(*) DESC
     LIMIT 1`,
    [tienda.id]
  );
  const giro: Giro = (cat && GIRO_POR_CATEGORIA[cat.id]) || "general";

  const mensaje = elegirPlantilla(tienda.id, giro)({
    emoji: emojiDe(`${tienda.nombre} ${nombresGrupos.join(" ")}`, giro, cat?.icono ?? null),
    nombre: tienda.nombre,
    quE: queVende(nombresGrupos, giro),
    ciudad: labelCiudad(tienda.ciudad),
    // Solo la colonia: la dirección completa no se lee de un vistazo.
    colonia: tienda.ubicacion ? `📍 ${tienda.ubicacion.split(",")[0].trim()}` : "",
    url: `mercadito.cx/m/${ref}`,
  }).replace(/\n{2,}/g, "\n"); // sin la colonia no queda un renglón vacío

  const imagen = `${BASE_URL}/api/menu/${tienda.id}/tarjeta`;

  // ?dry=1 — ensayo: devuelve el texto y la imagen que se publicarían, sin
  // tocar Facebook ni marcar la tienda. Para revisar el copy antes de soltarlo.
  if (new URL(request.url).searchParams.get("dry") === "1") {
    return NextResponse.json({ ok: true, dry: true, tienda: tienda.nombre, giro, mensaje, imagen });
  }

  const r = await publicarFotoEnPagina(imagen, mensaje);
  if (!r.ok) {
    // No marcamos fb_post_at: la tienda queda pendiente para el día siguiente.
    return NextResponse.json({ ok: false, tienda: tienda.nombre, error: r.error }, { status: 502 });
  }

  await query("UPDATE puestos SET fb_post_at = NOW(), fb_post_id = $1 WHERE id = $2", [r.post_id ?? null, tienda.id]);

  return NextResponse.json({ ok: true, publicadas: 1, tienda: tienda.nombre, post_id: r.post_id });
}
