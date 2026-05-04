import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { esPinValido, PIN_MENSAJE } from "@/lib/validators";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { usuario_id, nuevo_pin, borrar } = await request.json();
  if (!usuario_id) {
    return NextResponse.json({ error: "Falta usuario_id" }, { status: 400 });
  }

  // Dos modos:
  //   - borrar=true → pin pasa a NULL (caso típico: usuario olvidó su PIN).
  //     El usuario crea uno nuevo en el próximo login.
  //   - nuevo_pin=string → setea un PIN concreto (6 dígitos numéricos).
  let pinValue: string | null;
  if (borrar) {
    pinValue = null;
  } else {
    if (!esPinValido(nuevo_pin)) {
      return NextResponse.json({ error: `${PIN_MENSAJE} (o usa borrar=true)` }, { status: 400 });
    }
    pinValue = await bcrypt.hash(nuevo_pin, 10);
  }

  const result = await query(
    "UPDATE usuarios SET pin = $1 WHERE id = $2 RETURNING id, nombre",
    [pinValue, usuario_id]
  );

  if (result.length === 0) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, nombre: result[0].nombre });
}
