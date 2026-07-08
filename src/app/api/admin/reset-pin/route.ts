import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { esPinFuerte, esPinValido, PIN_MENSAJE, PIN_DEBIL_MENSAJE } from "@/lib/validators";
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
  //   - borrar=true → pin pasa a NULL. Solo para CLIENTES: ellos sí crean un
  //     PIN nuevo en el próximo login (loginCliente). Las cuentas staff ya NO
  //     pueden auto-crear PIN en login (ver auth.ts loginConPin), así que
  //     borrarles el PIN las dejaría fuera → exigimos asignar uno concreto.
  //   - nuevo_pin=string → setea un PIN concreto (6 dígitos numéricos).
  let pinValue: string | null;
  if (borrar) {
    const objetivo = await query<{ rol: string }>("SELECT rol FROM usuarios WHERE id = $1", [usuario_id]);
    if (objetivo.length && objetivo[0].rol !== "cliente") {
      return NextResponse.json(
        { error: "A las cuentas de tienda/repartidor/admin no se les borra el PIN (quedarían sin poder entrar). Asígnales un PIN nuevo." },
        { status: 400 }
      );
    }
    pinValue = null;
  } else {
    if (!esPinValido(nuevo_pin)) {
      return NextResponse.json({ error: `${PIN_MENSAJE} (o usa borrar=true)` }, { status: 400 });
    }
    if (!esPinFuerte(nuevo_pin)) {
      return NextResponse.json({ error: PIN_DEBIL_MENSAJE }, { status: 400 });
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
