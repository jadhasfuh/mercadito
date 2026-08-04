import { query } from "@/lib/db";
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

// Varias plantillas para que el muro no se lea robot. La elección es estable
// por tienda (hash del id), así un reintento manda exactamente el mismo texto.
const PLANTILLAS = [
  (n: string, u: string) => `¿Ya probaste ${n}?${u} Escanea el código y pide a domicilio desde tu celular. 🛵`,
  (n: string, u: string) => `Nuevo en Mercadito: ${n}.${u} Mira su menú completo con el código y pide sin salir de casa. 📲`,
  (n: string, u: string) => `${n} ya tiene su menú digital.${u} Apunta la cámara al código, arma tu pedido y te lo llevamos. 🧾`,
  (n: string, u: string) => `Antojo resuelto: ${n}.${u} Escanea, pide y espera en tu casa. 🍽️`,
];

function elegirPlantilla(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PLANTILLAS[h % PLANTILLAS.length];
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!facebookConfigurado()) {
    return NextResponse.json({ error: "Facebook no configurado" }, { status: 503 });
  }

  const candidatas = await query<{ id: string; nombre: string; ubicacion: string | null; n: number }>(
    `SELECT p.id, p.nombre, p.ubicacion, COUNT(pr.id)::int AS n
     FROM puestos p
     JOIN precios pr ON pr.puesto_id = p.id AND pr.activo = true
     WHERE p.activo = true AND p.aprobado = true AND p.menu_publico = true
       AND p.fb_post_at IS NULL
     GROUP BY p.id, p.nombre, p.ubicacion
     HAVING COUNT(pr.id) >= $1
     ORDER BY COUNT(pr.id) DESC, p.nombre
     LIMIT 1`,
    [MIN_PRODUCTOS]
  );

  const tienda = candidatas[0];
  if (!tienda) return NextResponse.json({ ok: true, publicadas: 0, motivo: "sin tiendas pendientes" });

  const ubic = tienda.ubicacion ? ` Están en ${tienda.ubicacion}.` : "";
  const mensaje = elegirPlantilla(tienda.id)(tienda.nombre, ubic);
  const imagen = `${BASE_URL}/api/menu/${tienda.id}/tarjeta`;

  const r = await publicarFotoEnPagina(imagen, mensaje);
  if (!r.ok) {
    // No marcamos fb_post_at: la tienda queda pendiente para el día siguiente.
    return NextResponse.json({ ok: false, tienda: tienda.nombre, error: r.error }, { status: 502 });
  }

  await query("UPDATE puestos SET fb_post_at = NOW(), fb_post_id = $1 WHERE id = $2", [r.post_id ?? null, tienda.id]);

  return NextResponse.json({ ok: true, publicadas: 1, tienda: tienda.nombre, post_id: r.post_id });
}
