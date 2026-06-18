import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/repartidor/resumen
 *
 * Resumen del propio repartidor: entregas, envíos cobrados y — lo más
 * importante — cuánto le DEBE a Mercadito (comisión de pedidos en efectivo
 * que cobró completos). Saldo = SUM(cargo) - SUM(abono). Los de confianza
 * (Fernando) no acumulan. Opcional ?desde&hasta para el periodo de entregas.
 */
export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "repartidor") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  // El rango de fechas va DENTRO de cada FILTER (solo afecta entregas/envíos;
  // los pedidos activos no se acotan por fecha).
  const rango = desde && hasta
    ? "AND created_at >= ($2::date)::timestamp AT TIME ZONE 'America/Mexico_City' AND created_at < ($3::date + interval '1 day')::timestamp AT TIME ZONE 'America/Mexico_City'"
    : "";
  const params: unknown[] = [usuario.id];
  if (desde && hasta) params.push(desde, hasta);

  // Entregas y envíos cobrados del periodo.
  const entregas = await queryOne<{ entregados: string; envios: string; activos: string }>(
    `SELECT
       (COUNT(*) FILTER (WHERE estado = 'entregado' ${rango}))::text AS entregados,
       COALESCE(SUM(costo_envio) FILTER (WHERE estado = 'entregado' ${rango}), 0)::text AS envios,
       (COUNT(*) FILTER (WHERE estado IN ('pendiente','en_compra','en_camino')))::text AS activos
     FROM pedidos
     WHERE repartidor_id = $1`,
    params
  );

  // Saldo con Mercadito (deuda por comisión de efectivo).
  const saldoRow = await queryOne<{ cargos: string; abonos: string; saldo: string }>(
    `SELECT
       COALESCE(SUM(monto) FILTER (WHERE tipo = 'cargo'), 0)::text AS cargos,
       COALESCE(SUM(monto) FILTER (WHERE tipo = 'abono'), 0)::text AS abonos,
       COALESCE(SUM(CASE WHEN tipo = 'cargo' THEN monto ELSE -monto END), 0)::text AS saldo
     FROM repartidor_movimientos WHERE repartidor_id = $1`,
    [usuario.id]
  );

  const confianza = await queryOne<{ repartidor_confianza: boolean }>(
    "SELECT repartidor_confianza FROM usuarios WHERE id = $1",
    [usuario.id]
  );

  // Últimos movimientos para que el repartidor entienda su saldo.
  const movimientos = await query(
    `SELECT m.id, m.tipo, m.monto, m.concepto, m.created_at, p.cliente_nombre
     FROM repartidor_movimientos m
     LEFT JOIN pedidos p ON p.id = m.pedido_id
     WHERE m.repartidor_id = $1
     ORDER BY m.created_at DESC LIMIT 30`,
    [usuario.id]
  );

  return NextResponse.json({
    entregados: Number(entregas?.entregados ?? 0),
    envios_cobrados: Number(entregas?.envios ?? 0),
    pedidos_activos: Number(entregas?.activos ?? 0),
    saldo: Number(saldoRow?.saldo ?? 0),
    total_cargos: Number(saldoRow?.cargos ?? 0),
    total_abonos: Number(saldoRow?.abonos ?? 0),
    confianza: !!confianza?.repartidor_confianza,
    movimientos,
  });
}
