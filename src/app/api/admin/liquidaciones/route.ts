import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

/**
 * Liquidación de repartidores: cuánto le debe cada repartidor a Mercadito por
 * la comisión de los pedidos en efectivo que cobró completos. Saldo deudor =
 * SUM(cargo) - SUM(abono). El admin registra abonos cuando el repartidor
 * paga (transferencia/efectivo) y puede darlo de baja por morosidad.
 */

// GET — lista de repartidores con su saldo + (opcional) movimientos de uno.
export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const repartidorId = searchParams.get("repartidor_id");

  if (repartidorId) {
    const movimientos = await query(
      `SELECT m.*, p.cliente_nombre, p.total AS pedido_total
       FROM repartidor_movimientos m
       LEFT JOIN pedidos p ON p.id = m.pedido_id
       WHERE m.repartidor_id = $1
       ORDER BY m.created_at DESC
       LIMIT 100`,
      [repartidorId]
    );
    return NextResponse.json(movimientos);
  }

  const repartidores = await query(
    `SELECT u.id, u.nombre, u.telefono, u.ciudad, u.activo, u.repartidor_confianza,
            COALESCE(SUM(CASE WHEN m.tipo = 'cargo' THEN m.monto ELSE 0 END), 0) AS total_cargos,
            COALESCE(SUM(CASE WHEN m.tipo = 'abono' THEN m.monto ELSE 0 END), 0) AS total_abonos,
            COALESCE(SUM(CASE WHEN m.tipo = 'cargo' THEN m.monto ELSE -m.monto END), 0) AS saldo
     FROM usuarios u
     LEFT JOIN repartidor_movimientos m ON m.repartidor_id = u.id
     WHERE u.rol = 'repartidor'
     GROUP BY u.id, u.nombre, u.telefono, u.ciudad, u.activo, u.repartidor_confianza
     ORDER BY saldo DESC, u.nombre`
  );
  return NextResponse.json(repartidores);
}

// POST — registra un abono (el repartidor pagó su deuda al admin).
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { repartidor_id, monto, concepto } = await request.json();
  const m = Number(monto);
  if (!repartidor_id || !isFinite(m) || m <= 0) {
    return NextResponse.json({ error: "Falta repartidor o monto válido" }, { status: 400 });
  }
  const rep = await queryOne<{ id: string }>(
    "SELECT id FROM usuarios WHERE id = $1 AND rol = 'repartidor'",
    [repartidor_id]
  );
  if (!rep) return NextResponse.json({ error: "Repartidor no encontrado" }, { status: 404 });

  await query(
    `INSERT INTO repartidor_movimientos (id, repartidor_id, tipo, monto, concepto, registrado_por)
     VALUES ($1, $2, 'abono', $3, $4, $5)`,
    [uuidv4(), repartidor_id, Math.round(m * 100) / 100, concepto || "Liquidación", usuario.id]
  );
  return NextResponse.json({ ok: true });
}

// PATCH — ajusta ciudad / confianza / alta-baja de un repartidor.
export async function PATCH(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { repartidor_id, ciudad, repartidor_confianza, activo } = await request.json();
  if (!repartidor_id) return NextResponse.json({ error: "Falta repartidor_id" }, { status: 400 });

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (ciudad !== undefined) {
    const ciudadValida = ["sahuayo", "jiquilpan", "venustiano"].includes(ciudad) ? ciudad : "sahuayo";
    sets.push(`ciudad = $${i++}`); vals.push(ciudadValida);
  }
  if (repartidor_confianza !== undefined) { sets.push(`repartidor_confianza = $${i++}`); vals.push(!!repartidor_confianza); }
  if (activo !== undefined) { sets.push(`activo = $${i++}`); vals.push(!!activo); }
  if (sets.length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

  vals.push(repartidor_id);
  await query(
    `UPDATE usuarios SET ${sets.join(", ")} WHERE id = $${i} AND rol = 'repartidor'`,
    vals
  );
  return NextResponse.json({ ok: true });
}
