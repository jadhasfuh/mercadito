import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUsuarioFromSession, setClientePin, clienteTienePin } from "@/lib/auth";
import { esPinValido, PIN_MENSAJE } from "@/lib/validators";

// GET /api/auth/cliente-pin — devuelve { tienePin: boolean } para que la UI
// sepa si mostrar "Cambiar PIN" / "Quitar PIN" o "Crear PIN".
export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "cliente") {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const tienePin = await clienteTienePin(usuario.id);
  return NextResponse.json({ tienePin });
}

// POST /api/auth/cliente-pin — body: { pin: string, pinActual: string }
// Cambia el PIN del cliente. Requiere pinActual (todas las cuentas tienen PIN).
// Ya NO se permite QUITAR el PIN (pin=null): dejar una cuenta sin PIN reabría
// el hueco de "el primer PIN que llega toma la cuenta". La recuperación de un
// PIN olvidado es vía admin (reset-pin).
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "cliente") {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const body = await request.json();
  const pinNuevo: string | null = typeof body?.pin === "string" ? body.pin.trim() : null;
  const pinActual: string | null = typeof body?.pinActual === "string" ? body.pinActual.trim() : null;

  // El PIN nuevo es obligatorio y con formato válido: no se puede dejar sin PIN.
  if (pinNuevo === null || pinNuevo === "") {
    return NextResponse.json({ error: "No se puede quitar el PIN. Para recuperarlo, contacta soporte." }, { status: 400 });
  }
  if (!esPinValido(pinNuevo)) {
    return NextResponse.json({ error: PIN_MENSAJE }, { status: 400 });
  }

  // Siempre hay PIN previo: verificar el actual antes de cambiarlo.
  const yaTienePin = await clienteTienePin(usuario.id);
  if (yaTienePin) {
    // Comparamos contra DB usando bcrypt (con fallback a comparación plana
    // para PINs legacy aún no migrados).
    const { query } = await import("@/lib/db");
    const rows = await query<{ pin: string | null }>(
      "SELECT pin FROM usuarios WHERE id = $1",
      [usuario.id]
    );
    const actualEnDb = rows[0]?.pin ?? null;
    if (!actualEnDb || !pinActual) {
      return NextResponse.json({ error: "PIN actual incorrecto" }, { status: 401 });
    }
    const esHash = /^\$2[aby]\$/.test(actualEnDb);
    const ok = esHash
      ? await bcrypt.compare(pinActual, actualEnDb)
      : pinActual === actualEnDb;
    if (!ok) {
      return NextResponse.json({ error: "PIN actual incorrecto" }, { status: 401 });
    }
  }

  await setClientePin(usuario.id, pinNuevo);
  return NextResponse.json({ ok: true, tienePin: pinNuevo !== null });
}
