import { getUsuarioFromSession } from "@/lib/auth";
import { enviarAvisoCambioPendientes } from "@/lib/bienvenida";
import { NextResponse } from "next/server";

// POST — manda el aviso del cambio (adiós entregas, se queda todo lo demás) a
// los negocios que no lo hayan recibido. Idempotente: lo garantiza
// `mensajes.tipo = 'aviso_cambio'`, así que se puede tocar el botón las veces
// que sea sin duplicarle el hilo a nadie.
export async function POST() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const r = await enviarAvisoCambioPendientes();
  return NextResponse.json({ ok: true, ...r });
}
