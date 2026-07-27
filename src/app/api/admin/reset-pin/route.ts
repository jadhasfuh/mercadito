import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { esPinFuerte, esPinValido, PIN_MENSAJE, PIN_DEBIL_MENSAJE } from "@/lib/validators";
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

const PIN_COMUNES = new Set([
  "000000", "111111", "222222", "333333", "444444", "555555", "666666",
  "777777", "888888", "999999", "123456", "654321", "121212", "112233",
  "123123", "101010", "012345", "098765",
]);
/** PIN aleatorio de 6 dígitos, CSPRNG, nunca trivial. */
function generarPinAleatorio(): string {
  for (;;) {
    const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
    if (!PIN_COMUNES.has(pin)) return pin;
  }
}

export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { usuario_id, nuevo_pin, borrar } = await request.json();
  if (!usuario_id) {
    return NextResponse.json({ error: "Falta usuario_id" }, { status: 400 });
  }

  // Dos modos, ninguno deja la cuenta sin PIN (un PIN NULL reabre el hueco de
  // "el primer PIN que llega toma la cuenta"):
  //   - borrar=true → genera un PIN aleatorio y LO DEVUELVE para que el admin
  //     se lo dé al usuario (reemplaza el viejo "borrar → NULL").
  //   - nuevo_pin=string → setea un PIN concreto (6 dígitos, no trivial).
  let pinValue: string;
  let pinGenerado: string | null = null;
  if (borrar) {
    pinGenerado = generarPinAleatorio();
    pinValue = await bcrypt.hash(pinGenerado, 10);
  } else {
    if (!esPinValido(nuevo_pin)) {
      return NextResponse.json({ error: `${PIN_MENSAJE} (o usa borrar=true para generar uno)` }, { status: 400 });
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

  // pin_generado presente solo en modo borrar → el admin debe comunicárselo.
  return NextResponse.json({ ok: true, nombre: result[0].nombre, pin_generado: pinGenerado });
}
