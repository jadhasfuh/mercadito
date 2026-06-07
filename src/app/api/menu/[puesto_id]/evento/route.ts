import { query } from "@/lib/db";
import { NextResponse } from "next/server";

// POST /api/menu/[puesto_id]/evento  { tipo: "vista" | "pedido" }
// Beacon público y ligero para atribución del menú digital: cuenta vistas del
// menú y pedidos a domicilio iniciados desde él. No toca el flujo de pedidos
// (sólo incrementa un contador en `puestos`). El param puede ser id o menu_slug.
export async function POST(req: Request, { params }: { params: Promise<{ puesto_id: string }> }) {
  const { puesto_id } = await params;
  const body = await req.json().catch(() => ({}));
  const col = body?.tipo === "pedido" ? "menu_pedidos" : "menu_vistas";
  // Columna fija (no viene del usuario), así que es seguro interpolarla.
  await query(`UPDATE puestos SET ${col} = ${col} + 1 WHERE id = $1 OR menu_slug = $1`, [puesto_id]).catch(() => {});
  return NextResponse.json({ ok: true });
}
