import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// GET — list messages for a store
export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  if (usuario.rol === "admin") {
    // Admin can see messages for any store
    const puestoId = searchParams.get("puesto_id");
    if (puestoId) {
      const mensajes = await query(
        `SELECT m.*, u.nombre as de_nombre
         FROM mensajes m
         LEFT JOIN usuarios u ON u.id = m.de_usuario_id
         WHERE m.para_puesto_id = $1
         ORDER BY m.created_at DESC`,
        [puestoId]
      );
      return NextResponse.json(mensajes);
    }
    // All messages
    const mensajes = await query(
      `SELECT m.*, u.nombre as de_nombre, p.nombre as puesto_nombre
       FROM mensajes m
       LEFT JOIN usuarios u ON u.id = m.de_usuario_id
       LEFT JOIN puestos p ON p.id = m.para_puesto_id
       ORDER BY m.created_at DESC`
    );
    return NextResponse.json(mensajes);
  }

  // Store owner sees their own messages
  if (!usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const mensajes = await query(
    `SELECT m.*, u.nombre as de_nombre
     FROM mensajes m
     LEFT JOIN usuarios u ON u.id = m.de_usuario_id
     WHERE m.para_puesto_id = $1
     ORDER BY m.created_at DESC`,
    [usuario.puesto_id]
  );
  return NextResponse.json(mensajes);
}

// POST — send message (admin only)
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { para_puesto_id, mensaje } = await request.json();
  if (!para_puesto_id || !mensaje) {
    return NextResponse.json({ error: "Falta puesto_id o mensaje" }, { status: 400 });
  }

  const id = uuidv4();
  await query(
    "INSERT INTO mensajes (id, de_usuario_id, para_puesto_id, mensaje) VALUES ($1, $2, $3, $4)",
    [id, usuario.id, para_puesto_id, mensaje]
  );

  return NextResponse.json({ ok: true, id }, { status: 201 });
}

// PATCH — mark as read (store owner)
export async function PATCH(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id, leido } = await request.json();

  if (id === "all" && usuario.puesto_id) {
    // Mark all messages as read for this store
    await query("UPDATE mensajes SET leido = true WHERE para_puesto_id = $1", [usuario.puesto_id]);
    return NextResponse.json({ ok: true });
  }

  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  await query("UPDATE mensajes SET leido = $1 WHERE id = $2", [leido ?? true, id]);
  return NextResponse.json({ ok: true });
}
