import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/mesero/mesas — el mesero ve las mesas de SU puesto (con token, para
// reusar el flujo de pedido por token) + el estado de la cuenta abierta de cada
// una. Solo rol 'mesero'.
export async function GET() {
  const u = await getUsuarioFromSession();
  if (!u || u.rol !== "mesero" || !u.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const puesto = await queryOne<{ nombre: string }>("SELECT nombre FROM puestos WHERE id = $1", [u.puesto_id]);
  const mesas = await query<{ id: string; etiqueta: string; token: string }>(
    `SELECT m.id, m.etiqueta, m.token,
            (SELECT c.id FROM cuentas c WHERE c.mesa_id = m.id AND c.estado <> 'cerrada' LIMIT 1) AS cuenta_id,
            COALESCE((SELECT SUM(pe.total) FROM pedidos pe
                      JOIN cuentas c ON c.id = pe.cuenta_id
                      WHERE c.mesa_id = m.id AND c.estado <> 'cerrada'), 0) AS total_abierto
     FROM mesas m
     WHERE m.puesto_id = $1 AND m.activa = true
     ORDER BY m.orden, m.etiqueta`,
    [u.puesto_id]
  );
  return NextResponse.json({ puesto_id: u.puesto_id, puesto_nombre: puesto?.nombre ?? "", mesas });
}
