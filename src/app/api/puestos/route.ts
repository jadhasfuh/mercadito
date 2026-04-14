import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { verificarListaNegra } from "@/lib/lista-negra";
import { NextResponse } from "next/server";

export async function GET() {
  const puestos = await query("SELECT * FROM puestos WHERE activo = true ORDER BY nombre");
  return NextResponse.json(puestos);
}

// PATCH — update store info (owner only)
export async function PATCH(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || !usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { nombre, ubicacion, descripcion, telefono_contacto, lat, lng } = body;

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

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  params.push(usuario.puesto_id);
  await query(`UPDATE puestos SET ${updates.join(", ")} WHERE id = $${idx}`, params);

  return NextResponse.json({ ok: true });
}
