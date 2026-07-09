import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// PATCH /api/cuentas/[id] — la tienda cierra (o cobra) la cuenta de una mesa.
// action: 'cerrar' (con metodo_pago permitido) | 'reabrir'.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "admin" && usuario.rol !== "tienda" && usuario.rol !== "mesero")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const cuenta = await queryOne<{ id: string; puesto_id: string; estado: string; metodos: unknown }>(
    `SELECT c.id, c.puesto_id, c.estado, p.metodos_pago_mesa AS metodos
     FROM cuentas c JOIN puestos p ON p.id = c.puesto_id WHERE c.id = $1`,
    [id]
  );
  if (!cuenta) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  if ((usuario.rol === "tienda" || usuario.rol === "mesero") && usuario.puesto_id !== cuenta.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === "cerrar") {
    let permitidos: string[] = ["caja"];
    try {
      if (Array.isArray(cuenta.metodos)) permitidos = cuenta.metodos as string[];
      else if (typeof cuenta.metodos === "string") permitidos = JSON.parse(cuenta.metodos);
    } catch { /* default */ }
    const metodo = body.metodo_pago || permitidos[0] || "caja";
    if (!permitidos.includes(metodo)) {
      return NextResponse.json({ error: "Método de pago no permitido por la tienda" }, { status: 400 });
    }
    const propina = Math.max(0, Number(body.propina) || 0);
    await query(
      "UPDATE cuentas SET estado = 'cerrada', metodo_pago = $1, propina = $2, cerrada_at = NOW() WHERE id = $3",
      [metodo, propina, id]
    );
    // Los pedidos de la cuenta pasan a 'entregado' para el historial/contabilidad.
    await query(
      "UPDATE pedidos SET estado = 'entregado', metodo_pago = $1, entregado_at = COALESCE(entregado_at, NOW()) WHERE cuenta_id = $2 AND estado <> 'cancelado'",
      [metodo, id]
    );
    return NextResponse.json({ ok: true, estado: "cerrada", metodo_pago: metodo });
  }

  if (action === "reabrir") {
    await query("UPDATE cuentas SET estado = 'abierta', cerrada_at = NULL WHERE id = $1 AND estado <> 'cerrada'", [id]);
    return NextResponse.json({ ok: true, estado: "abierta" });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
