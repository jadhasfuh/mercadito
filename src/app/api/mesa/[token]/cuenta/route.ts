import { query, queryOne } from "@/lib/db";
import { resolverMesa } from "@/lib/mesa";
import { NextResponse } from "next/server";

// GET /api/mesa/[token]/cuenta — cuenta corriente viva de la mesa.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await resolverMesa(token);
  if (!r) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 });

  const cuenta = await queryOne<{ id: string; estado: string }>(
    "SELECT id, estado FROM cuentas WHERE mesa_id = $1 AND estado <> 'cerrada' LIMIT 1",
    [r.mesa.id]
  );
  if (!cuenta) {
    return NextResponse.json({ cuenta_id: null, estado: null, items: [], total: 0, mesa: r.mesa.etiqueta });
  }

  const items = await query<{
    id: string; producto_nombre: string; cantidad: string; precio_unitario: string;
    subtotal: string; estado_cocina: string; variante_nombre: string | null; modificadores: unknown; created_at: string;
  }>(
    `SELECT pi.id, COALESCE(pr.nombre, pi.producto_nombre, 'Producto') AS producto_nombre,
            pi.cantidad, pi.precio_unitario, pi.subtotal, pi.estado_cocina,
            pi.variante_nombre, pi.modificadores, p.created_at
     FROM pedidos p
     JOIN pedido_items pi ON pi.pedido_id = p.id
     LEFT JOIN productos pr ON pr.id = pi.producto_id
     WHERE p.cuenta_id = $1
     ORDER BY p.created_at, pi.id`,
    [cuenta.id]
  );

  const parsed = items.map((i) => ({
    id: i.id, producto_nombre: i.producto_nombre, cantidad: Number(i.cantidad),
    precio_unitario: Number(i.precio_unitario), subtotal: Number(i.subtotal),
    estado_cocina: i.estado_cocina, variante_nombre: i.variante_nombre, modificadores: i.modificadores,
  }));
  const total = parsed.reduce((s, i) => s + i.subtotal, 0);

  return NextResponse.json({ cuenta_id: cuenta.id, estado: cuenta.estado, items: parsed, total, mesa: r.mesa.etiqueta });
}

// POST /api/mesa/[token]/cuenta { action:'pedir_cuenta' } — el comensal pide la cuenta.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await resolverMesa(token);
  if (!r) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "pedir_cuenta") {
    await query(
      "UPDATE cuentas SET estado = 'por_cobrar' WHERE mesa_id = $1 AND estado = 'abierta'",
      [r.mesa.id]
    );
    return NextResponse.json({ ok: true, estado: "por_cobrar" });
  }
  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
