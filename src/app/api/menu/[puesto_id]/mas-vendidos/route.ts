import { query } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/menu/[puesto_id]/mas-vendidos → [{ producto_id, pedidos, cantidad }]
//
// La web lee el conteo dentro de getMenuPublico (va en el mismo payload del
// menú), pero la app arma su menú desde el catálogo — que no sabe nada de
// menu_ventas. Este endpoint es su única pieza faltante para pintar la misma
// sección "Más vendidos" que la web. Público: es el mismo dato que ya se ve
// en el menú.
export async function GET(_req: Request, { params }: { params: Promise<{ puesto_id: string }> }) {
  const { puesto_id } = await params;
  const filas = await query<{ producto_id: string; pedidos: number; cantidad: string }>(
    `SELECT mv.producto_id, mv.pedidos, mv.cantidad
     FROM menu_ventas mv
     JOIN puestos p ON p.id = mv.puesto_id
     WHERE (p.id = $1 OR p.menu_slug = $1) AND mv.pedidos > 0
     ORDER BY mv.pedidos DESC, mv.cantidad DESC
     LIMIT 30`,
    [puesto_id]
  ).catch(() => []);

  return NextResponse.json(
    filas.map((f) => ({ producto_id: f.producto_id, pedidos: Number(f.pedidos), cantidad: Number(f.cantidad) })),
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
