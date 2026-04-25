import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

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
  //   - borrar=true → pin pasa a NULL (caso típico: cliente olvidó su PIN
  //     y quiere volver al modo "sólo teléfono"). El usuario puede crear
  //     uno nuevo después desde su perfil.
  //   - nuevo_pin=string → setea ese PIN (4-6 dígitos). Útil para tienda/
  //     repartidor/admin donde el PIN es obligatorio.
  let pinValue: string | null;
  if (borrar) {
    pinValue = null;
  } else {
    if (!nuevo_pin || typeof nuevo_pin !== "string" || !/^\d{4,6}$/.test(nuevo_pin)) {
      return NextResponse.json({ error: "PIN inválido (4-6 dígitos) o falta `borrar`" }, { status: 400 });
    }
    pinValue = nuevo_pin;
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
