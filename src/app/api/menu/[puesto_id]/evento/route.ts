import { query, queryOne } from "@/lib/db";
import { registrarVentasMenu } from "@/lib/menu";
import { NextResponse } from "next/server";

// POST /api/menu/[puesto_id]/evento
//   { tipo: "vista" | "pedido", items?: [{ producto_id, cantidad }] }
// Beacon público y ligero para atribución del menú digital: cuenta vistas del
// menú y pedidos a domicilio iniciados desde él. No toca el flujo de pedidos
// (sólo incrementa un contador en `puestos`). El param puede ser id o menu_slug.
//
// Con `items` (sólo en tipo "pedido") además suma el "más vendidos" del menú:
// qué productos llevaba ese pedido. Es la ÚNICA señal de popularidad que
// tenemos sin delivery — el pedido se va a WhatsApp y nunca vuelve.
export async function POST(req: Request, { params }: { params: Promise<{ puesto_id: string }> }) {
  const { puesto_id } = await params;
  const body = await req.json().catch(() => ({}));
  const esPedido = body?.tipo === "pedido";
  const col = esPedido ? "menu_pedidos" : "menu_vistas";
  // Columna fija (no viene del usuario), así que es seguro interpolarla.
  await query(`UPDATE puestos SET ${col} = ${col} + 1 WHERE id = $1 OR menu_slug = $1`, [puesto_id]).catch(() => {});

  if (esPedido && Array.isArray(body?.items) && body.items.length > 0) {
    // El beacon puede venir con el slug bonito de la URL; menu_ventas guarda ids.
    await queryOne<{ id: string }>("SELECT id FROM puestos WHERE id = $1 OR menu_slug = $1 LIMIT 1", [puesto_id])
      .then((p) => (p ? registrarVentasMenu(p.id, body.items) : undefined))
      .catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
