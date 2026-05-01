import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// GET — list active announcements, optionally filtered by type
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo");

  let anuncios;
  if (tipo) {
    anuncios = await query(
      "SELECT * FROM anuncios WHERE activo = true AND (tipo = $1 OR tipo = 'general') ORDER BY created_at DESC",
      [tipo]
    );
  } else {
    anuncios = await query("SELECT * FROM anuncios ORDER BY created_at DESC");
  }

  return NextResponse.json(anuncios);
}

// POST — create announcement (admin only)
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { titulo, mensaje, tipo, imagen, link } = await request.json();
  if (!titulo || !mensaje) {
    return NextResponse.json({ error: "Titulo y mensaje son requeridos" }, { status: 400 });
  }

  const id = uuidv4();
  await query(
    "INSERT INTO anuncios (id, titulo, mensaje, tipo, imagen, link) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, titulo, mensaje, tipo || "general", imagen || null, link || null]
  );

  return NextResponse.json({ ok: true, id }, { status: 201 });
}

// PATCH — toggle active/inactive (admin only)
export async function PATCH(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id, activo, titulo, mensaje, imagen, link, tipo } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  // PATCH parcial — solo actualizamos los campos que vienen en el body.
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (activo !== undefined) { updates.push(`activo = $${idx++}`); values.push(activo); }
  if (titulo !== undefined) { updates.push(`titulo = $${idx++}`); values.push(titulo); }
  if (mensaje !== undefined) { updates.push(`mensaje = $${idx++}`); values.push(mensaje); }
  if (imagen !== undefined) { updates.push(`imagen = $${idx++}`); values.push(imagen); }
  if (link !== undefined) { updates.push(`link = $${idx++}`); values.push(link); }
  if (tipo !== undefined) { updates.push(`tipo = $${idx++}`); values.push(tipo); }
  if (updates.length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  values.push(id);
  await query(`UPDATE anuncios SET ${updates.join(", ")} WHERE id = $${idx}`, values);
  return NextResponse.json({ ok: true });
}

// DELETE — delete announcement (admin only)
export async function DELETE(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  await query("DELETE FROM anuncios WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
