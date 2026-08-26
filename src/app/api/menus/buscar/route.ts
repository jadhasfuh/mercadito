import { query } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * GET /api/menus/buscar?q=hamburguesa
 *
 * Busca NEGOCIOS, no productos: sin delivery no hay catálogo cruzado que
 * mostrar, pero la gente no piensa en nombres de negocio — piensa en lo que
 * se le antoja. Así que además del nombre y la descripción del negocio, se
 * busca dentro de los productos de su menú y se devuelve el negocio, con una
 * muestra de lo que hizo match para poder decir "vende: hamburguesa al
 * pastor, hamburguesa doble".
 *
 * Público: solo devuelve negocios que ya son visibles en el directorio.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json([]);

  // unaccent no está garantizado en la instancia, así que se normaliza a mano:
  // minúsculas + comparación con LIKE sobre el texto ya sin acentos vía
  // translate. Es suficiente para nombres de producto en español.
  const patron = `%${q.toLowerCase()}%`;

  const filas = await query<{ id: string; coincidencias: string[] }>(
    `WITH norm AS (
       SELECT translate(lower($1), 'áéíóúüñ', 'aeiouun') AS q
     )
     SELECT p.id,
            COALESCE(
              array_agg(DISTINCT pr.nombre) FILTER (
                WHERE translate(lower(pr.nombre), 'áéíóúüñ', 'aeiouun') LIKE (SELECT q FROM norm)
              ), '{}'
            ) AS coincidencias
     FROM puestos p
     LEFT JOIN precios pc ON pc.puesto_id = p.id AND pc.activo = true
     LEFT JOIN productos pr ON pr.id = pc.producto_id
     WHERE p.activo = true AND p.aprobado = true AND p.menu_publico = true
       AND (
         translate(lower(p.nombre), 'áéíóúüñ', 'aeiouun') LIKE (SELECT q FROM norm)
         OR translate(lower(COALESCE(p.descripcion, '')), 'áéíóúüñ', 'aeiouun') LIKE (SELECT q FROM norm)
         OR translate(lower(COALESCE(pr.nombre, '')), 'áéíóúüñ', 'aeiouun') LIKE (SELECT q FROM norm)
       )
     GROUP BY p.id
     LIMIT 60`,
    [patron]
  );

  return NextResponse.json(
    filas.map((f) => ({ id: f.id, coincidencias: (f.coincidencias ?? []).slice(0, 3) }))
  );
}
