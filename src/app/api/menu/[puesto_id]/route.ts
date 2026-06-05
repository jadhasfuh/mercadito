import { getMenuPublico } from "@/lib/menu";
import { NextResponse } from "next/server";

// GET /api/menu/[puesto_id]  — menú público (móvil / tablet / dine-in).
// Devuelve el menú a todos + planInfo; la visibilidad NO se bloquea (las CTAs
// premium se gatean en el cliente con planInfo).
export async function GET(_req: Request, { params }: { params: Promise<{ puesto_id: string }> }) {
  const { puesto_id } = await params;
  const menu = await getMenuPublico(puesto_id);
  if (!menu) return NextResponse.json({ error: "Menú no encontrado" }, { status: 404 });
  return NextResponse.json(menu, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
