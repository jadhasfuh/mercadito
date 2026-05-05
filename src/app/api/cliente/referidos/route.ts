import { queryOne, query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/cliente/referidos
 *
 * Devuelve el estado del programa de referidos del cliente actual:
 * - codigo_referido: el suyo, para compartir
 * - saldo_credito: lo acumulado por bonos (referidos exitosos)
 * - referidos_exitosos: cuántas personas ha invitado que ya pidieron
 *
 * Solo cliente. El bono se aplica automáticamente cuando el referido
 * completa su primer pedido (PATCH /api/pedidos/[id] estado=entregado).
 */
export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "cliente") {
    return NextResponse.json({ error: "Solo clientes" }, { status: 403 });
  }

  const row = await queryOne<{ codigo_referido: string | null; saldo_credito: string }>(
    "SELECT codigo_referido, saldo_credito FROM usuarios WHERE id = $1",
    [usuario.id]
  );
  if (!row) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Conteo de referidos exitosos (que ya tuvieron primer pedido entregado).
  const exitosos = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT u.id)::text AS count
     FROM usuarios u
     WHERE u.referido_por_id = $1
       AND EXISTS (SELECT 1 FROM pedidos p WHERE p.cliente_id = u.id AND p.estado = 'entregado')`,
    [usuario.id]
  );

  return NextResponse.json({
    codigo_referido: row.codigo_referido,
    saldo_credito: Number(row.saldo_credito),
    referidos_exitosos: Number(exitosos[0]?.count ?? 0),
  });
}
