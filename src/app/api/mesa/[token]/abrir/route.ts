import { query, queryOne } from "@/lib/db";
import { resolverMesa, dineInDisponible } from "@/lib/mesa";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// POST /api/mesa/[token]/abrir — abre (o se une a) la cuenta abierta de la mesa.
// Público: el token del QR autoriza. Idempotente y race-safe (índice único parcial).
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await resolverMesa(token);
  if (!r) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 });
  if (!dineInDisponible(r)) {
    return NextResponse.json(
      { error: "Esta tienda no está recibiendo pedidos en mesa por ahora.", code: "PLAN_VENCIDO" },
      { status: 402 }
    );
  }

  // Abrir o unirse: insertar si no hay cuenta abierta, luego seleccionar la abierta.
  await query(
    `INSERT INTO cuentas (id, puesto_id, mesa_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [uuidv4(), r.puesto.id, r.mesa.id]
  );
  const cuenta = await queryOne<{ id: string }>(
    "SELECT id FROM cuentas WHERE mesa_id = $1 AND estado <> 'cerrada' LIMIT 1",
    [r.mesa.id]
  );

  return NextResponse.json({
    cuenta_id: cuenta?.id,
    mesa: { id: r.mesa.id, etiqueta: r.mesa.etiqueta },
    puesto: { id: r.puesto.id, nombre: r.puesto.nombre, metodos_pago_mesa: r.puesto.metodos_pago_mesa },
  });
}
