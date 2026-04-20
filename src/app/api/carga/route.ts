import { query } from "@/lib/db";
import { NextResponse } from "next/server";

// GET — current delivery workload (public, no auth needed)
export async function GET() {
  const [result] = await query(
    `SELECT
      COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes,
      COUNT(*) FILTER (WHERE estado = 'en_compra') as en_compra,
      COUNT(*) FILTER (WHERE estado = 'en_camino') as en_camino
    FROM pedidos
    WHERE estado NOT IN ('entregado', 'cancelado')`
  );

  const pendientes = parseInt(result.pendientes);
  const enCompra = parseInt(result.en_compra);
  const enCamino = parseInt(result.en_camino);
  const total = pendientes + enCompra + enCamino;

  // Estimate extra wait time based on active orders
  // Each pending/en_compra order = ~15 min, en_camino = ~10 min
  const minutosEspera = pendientes * 15 + enCompra * 10 + enCamino * 5;

  return NextResponse.json({
    pedidos_activos: total,
    pendientes,
    en_compra: enCompra,
    en_camino: enCamino,
    minutos_espera: minutosEspera,
  });
}
