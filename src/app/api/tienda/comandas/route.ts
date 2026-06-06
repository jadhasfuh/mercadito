import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/tienda/comandas — cuentas abiertas de la tienda con sus ítems
// (board de cocina + cierre de cuenta). Agrupado por mesa.
export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "admin" && usuario.rol !== "mesero") || !usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const rows = await query<{
    cuenta_id: string; cuenta_estado: string; mesa_id: string; etiqueta: string;
    item_id: string; producto_nombre: string; cantidad: string; subtotal: string;
    estado_cocina: string; variante_nombre: string | null; modificadores: unknown; created_at: string;
  }>(
    `SELECT c.id AS cuenta_id, c.estado AS cuenta_estado, m.id AS mesa_id, m.etiqueta,
            pi.id AS item_id, COALESCE(pr.nombre, pi.producto_nombre, 'Producto') AS producto_nombre,
            pi.cantidad, pi.subtotal, pi.estado_cocina, pi.variante_nombre, pi.modificadores, p.created_at
     FROM cuentas c
     JOIN mesas m ON m.id = c.mesa_id
     LEFT JOIN pedidos p ON p.cuenta_id = c.id
     LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
     LEFT JOIN productos pr ON pr.id = pi.producto_id
     WHERE c.puesto_id = $1 AND c.estado <> 'cerrada'
     ORDER BY m.etiqueta, p.created_at, pi.id`,
    [usuario.puesto_id]
  );

  // Agrupar por cuenta/mesa.
  const mapa = new Map<string, { cuenta_id: string; estado: string; mesa_id: string; etiqueta: string; total: number; items: unknown[] }>();
  for (const r of rows) {
    let g = mapa.get(r.cuenta_id);
    if (!g) { g = { cuenta_id: r.cuenta_id, estado: r.cuenta_estado, mesa_id: r.mesa_id, etiqueta: r.etiqueta, total: 0, items: [] }; mapa.set(r.cuenta_id, g); }
    if (r.item_id) {
      g.total += Number(r.subtotal);
      g.items.push({
        id: r.item_id, producto_nombre: r.producto_nombre, cantidad: Number(r.cantidad),
        subtotal: Number(r.subtotal), estado_cocina: r.estado_cocina,
        variante_nombre: r.variante_nombre, modificadores: r.modificadores,
      });
    }
  }
  return NextResponse.json(Array.from(mapa.values()));
}

// PATCH /api/tienda/comandas { item_id, estado_cocina } — marca un ítem en cocina.
export async function PATCH(req: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "admin" && usuario.rol !== "mesero") || !usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const estados = ["pendiente", "preparando", "listo", "servido"];
  if (!body.item_id || !estados.includes(body.estado_cocina)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  // Sólo ítems de la propia tienda.
  await query(
    "UPDATE pedido_items SET estado_cocina = $1 WHERE id = $2 AND puesto_id = $3",
    [body.estado_cocina, body.item_id, usuario.puesto_id]
  );
  return NextResponse.json({ ok: true });
}
