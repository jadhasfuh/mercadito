import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "Solo admin puede validar pagos" }, { status: 403 });
  }

  const pedido = await queryOne<{
    id: string;
    metodo_pago: string;
    pago_validado_at: string | null;
    cliente_nombre: string;
    cliente_telefono: string;
    cliente_id: string | null;
    total: string;
  }>(
    "SELECT id, metodo_pago, pago_validado_at, cliente_nombre, cliente_telefono, cliente_id, total FROM pedidos WHERE id = $1",
    [id]
  );
  if (!pedido) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }
  if (pedido.metodo_pago !== "transferencia") {
    return NextResponse.json({ error: "Este pedido no es transferencia" }, { status: 400 });
  }
  if (pedido.pago_validado_at) {
    return NextResponse.json({ error: "Este pago ya fue validado" }, { status: 400 });
  }

  await query(
    "UPDATE pedidos SET pago_validado_at = NOW(), pago_validado_por = $1 WHERE id = $2",
    [usuario.id, id]
  );

  // 1) Avisar al cliente que su pago fue validado.
  try {
    const rows = await query<{ push_token: string }>(
      `SELECT push_token FROM usuarios
       WHERE push_token IS NOT NULL AND activo = true AND rol = 'cliente'
         AND (id = $1 OR telefono = $2)`,
      [pedido.cliente_id, pedido.cliente_telefono]
    );
    enviarPush(
      rows.map((r) => r.push_token),
      "Pago confirmado",
      "Tu transferencia fue validada. Tu pedido ya fue recibido 🛒",
      { pedidoId: id, tipo: "pago_validado" }
    );
  } catch (e) {
    console.error("[push] validar-pago cliente failed", e);
  }

  // 2) Avisar a repartidores + tiendas involucradas (equivalente al push al crear pedido efectivo).
  try {
    const puestos = await query<{ puesto_id: string }>(
      "SELECT DISTINCT puesto_id FROM pedido_items WHERE pedido_id = $1",
      [id]
    );
    const puestoIds = puestos.map((p) => p.puesto_id);
    const rows = await query<{ push_token: string }>(
      `SELECT push_token FROM usuarios
       WHERE push_token IS NOT NULL AND activo = true
         AND (
           rol = 'repartidor'
           OR (rol = 'tienda' AND puesto_id = ANY($1))
         )`,
      [puestoIds]
    );
    enviarPush(
      rows.map((r) => r.push_token),
      "Nuevo pedido en Mercadito",
      `${pedido.cliente_nombre} — $${parseFloat(pedido.total).toFixed(0)}`,
      { pedidoId: id, tipo: "nuevo_pedido" }
    );
  } catch (e) {
    console.error("[push] validar-pago repartidores failed", e);
  }

  return NextResponse.json({ ok: true });
}
