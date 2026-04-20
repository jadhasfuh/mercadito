import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { verificarListaNegra } from "@/lib/lista-negra";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoria = searchParams.get("categoria");

  let puestos;
  if (categoria) {
    // Find stores that have products in this category (via precios + productos)
    puestos = await query(
      `SELECT DISTINCT p.* FROM puestos p
       INNER JOIN precios pr ON pr.puesto_id = p.id AND pr.activo = true
       INNER JOIN productos prod ON prod.id = pr.producto_id
       WHERE p.activo = true AND p.aprobado = true AND prod.categoria_id = $1
       ORDER BY p.nombre`,
      [categoria]
    );
  } else {
    puestos = await query("SELECT * FROM puestos WHERE activo = true ORDER BY nombre");
  }

  // Derive categories for each store from their actual products
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puestoIds = puestos.map((p: any) => p.id as string);
  if (puestoIds.length > 0) {
    const placeholders = puestoIds.map((_: string, i: number) => `$${i + 1}`).join(",");
    const cats = await query(
      `SELECT DISTINCT pr.puesto_id, prod.categoria_id
       FROM precios pr
       JOIN productos prod ON prod.id = pr.producto_id
       WHERE pr.activo = true AND pr.puesto_id IN (${placeholders})`,
      puestoIds
    );
    const catMap: Record<string, string[]> = {};
    for (const c of cats) {
      if (!catMap[c.puesto_id]) catMap[c.puesto_id] = [];
      catMap[c.puesto_id].push(c.categoria_id);
    }
    for (const p of puestos) {
      (p as Record<string, unknown>).categorias = catMap[p.id] || [];
    }
  }

  return NextResponse.json(puestos);
}

// PATCH — update store info (owner only)
export async function PATCH(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || !usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { nombre, ubicacion, descripcion, telefono_contacto, lat, lng, logo } = body;

  const bloqueado = verificarListaNegra(nombre || "") || verificarListaNegra(descripcion || "");
  if (bloqueado) {
    return NextResponse.json({ error: "El nombre o descripción contiene contenido no permitido" }, { status: 400 });
  }

  // Only allow editing own store
  const puesto = await queryOne("SELECT id FROM puestos WHERE id = $1", [usuario.puesto_id]);
  if (!puesto) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (nombre !== undefined) { updates.push(`nombre = $${idx++}`); params.push(nombre); }
  if (ubicacion !== undefined) { updates.push(`ubicacion = $${idx++}`); params.push(ubicacion); }
  if (descripcion !== undefined) { updates.push(`descripcion = $${idx++}`); params.push(descripcion); }
  if (telefono_contacto !== undefined) { updates.push(`telefono_contacto = $${idx++}`); params.push(telefono_contacto); }
  if (lat !== undefined) { updates.push(`lat = $${idx++}`); params.push(lat); }
  if (lng !== undefined) { updates.push(`lng = $${idx++}`); params.push(lng); }
  if (logo !== undefined) { updates.push(`logo = $${idx++}`); params.push(logo || null); }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  params.push(usuario.puesto_id);
  await query(`UPDATE puestos SET ${updates.join(", ")} WHERE id = $${idx}`, params);

  return NextResponse.json({ ok: true });
}
