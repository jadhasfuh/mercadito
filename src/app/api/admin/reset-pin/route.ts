import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { usuario_id, nuevo_pin } = await request.json();
  if (!usuario_id || !nuevo_pin) {
    return NextResponse.json({ error: "Falta usuario_id o nuevo_pin" }, { status: 400 });
  }

  const result = await query(
    "UPDATE usuarios SET pin = $1 WHERE id = $2 RETURNING id, nombre",
    [nuevo_pin, usuario_id]
  );

  if (result.length === 0) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, nombre: result[0].nombre });
}
