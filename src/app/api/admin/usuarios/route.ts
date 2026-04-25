import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/admin/usuarios?q=texto&rol=cliente
//
// Lista de usuarios con flag `tiene_pin` (sin retornar el PIN en sí). Para
// uso del panel admin: ver todos los registrados, buscar por nombre/teléfono,
// resetear PIN, etc. Acepta filtros opcionales:
//   - q: búsqueda por nombre o teléfono (LIKE case-insensitive)
//   - rol: filtra por rol exacto (cliente, repartidor, tienda, admin)
export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const rol = (searchParams.get("rol") ?? "").trim();

  const filters: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    filters.push(`(u.nombre ILIKE $${params.length} OR u.telefono ILIKE $${params.length})`);
  }
  if (rol && ["cliente", "repartidor", "tienda", "admin"].includes(rol)) {
    params.push(rol);
    filters.push(`u.rol = $${params.length}`);
  }
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = await query(
    `SELECT
      u.id,
      u.nombre,
      u.telefono,
      u.rol,
      u.activo,
      u.puesto_id,
      pu.nombre AS puesto_nombre,
      (u.pin IS NOT NULL) AS tiene_pin,
      u.created_at,
      (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = u.id) AS pedidos_count
    FROM usuarios u
    LEFT JOIN puestos pu ON pu.id = u.puesto_id
    ${whereClause}
    ORDER BY u.created_at DESC NULLS LAST, u.nombre
    LIMIT 500`,
    params
  );
  return NextResponse.json(rows);
}
