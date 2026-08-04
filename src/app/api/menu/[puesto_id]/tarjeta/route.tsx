import { query, queryOne } from "@/lib/db";
import { labelCiudad } from "@/lib/ciudades";
import { cargarImagenSegura, tarjetaTienda, TARJETA } from "@/lib/tarjeta";
import QRCode from "qrcode";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

const BASE_URL = "https://mercadito.cx";

// GET /api/menu/[puesto_id]/tarjeta
// PNG 1080×1080 de la tienda para redes: foto de su comida, nombre, zona, QR
// del menú y CTA. Es lo que publica el cron de Facebook — Meta descarga esta
// URL, así que tiene que ser pública y no fallar: la foto se resuelve antes de
// renderizar y, si no hay una utilizable, la tarjeta sale igual sin ella.
export async function GET(req: Request, { params }: { params: Promise<{ puesto_id: string }> }) {
  const { puesto_id } = await params;

  const puesto = await queryOne<{
    nombre: string; ubicacion: string | null; menu_slug: string | null;
    ciudad: string; portada: string | null; logo: string | null;
  }>(
    `SELECT nombre, ubicacion, menu_slug, ciudad, portada, logo
     FROM puestos WHERE id = $1 AND activo = true AND aprobado = true`,
    [puesto_id]
  );
  if (!puesto) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

  // Grupos del menú con más productos: dicen qué vende mejor que la categoría
  // global ("Chilaquiles, Hamburguesas" > "Restaurante").
  const grupos = await query<{ seccion: string }>(
    `SELECT p.seccion
     FROM productos p
     JOIN precios pr ON pr.producto_id = p.id AND pr.puesto_id = $1 AND pr.activo = true
     WHERE p.seccion IS NOT NULL AND p.seccion <> ''
     GROUP BY p.seccion
     ORDER BY COUNT(*) DESC
     LIMIT 3`,
    [puesto_id]
  );

  // Foto: portada de la tienda; si no, la imagen de alguno de sus productos.
  let fuenteFoto: string | null = puesto.portada;
  if (!fuenteFoto) {
    const prod = await queryOne<{ imagen: string }>(
      `SELECT p.imagen
       FROM productos p
       JOIN precios pr ON pr.producto_id = p.id AND pr.puesto_id = $1 AND pr.activo = true
       WHERE p.imagen IS NOT NULL AND p.imagen <> '' AND p.imagen NOT LIKE 'emoji:%'
       LIMIT 1`,
      [puesto_id]
    );
    fuenteFoto = prod?.imagen ?? puesto.logo;
  }

  const ref = puesto.menu_slug || puesto_id;
  const [qr, foto] = await Promise.all([
    QRCode.toDataURL(`${BASE_URL}/m/${ref}`, { width: 480, margin: 1, errorCorrectionLevel: "M" }),
    cargarImagenSegura(fuenteFoto),
  ]);

  return new ImageResponse(
    tarjetaTienda({
      nombre: puesto.nombre,
      // Solo la colonia: la dirección completa no se lee de un vistazo.
      colonia: puesto.ubicacion ? puesto.ubicacion.split(",")[0].trim() : null,
      ciudad: labelCiudad(puesto.ciudad),
      ref,
      qr,
      foto,
      categorias: grupos.map((g) => g.seccion),
    }),
    { ...TARJETA, headers: { "Cache-Control": "public, max-age=300" } }
  );
}
