import { getUsuarioFromSession } from "@/lib/auth";
import { enviarBienvenidaPendientes } from "@/lib/bienvenida";
import { NextResponse } from "next/server";

// POST — manda el mensaje de bienvenida a los negocios que nunca lo
// recibieron. Idempotente (lo garantiza `mensajes.tipo = 'bienvenida'`), así
// que se puede tocar el botón las veces que sea sin duplicar nada.
export async function POST() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const r = await enviarBienvenidaPendientes();
  return NextResponse.json({ ok: true, ...r });
}
