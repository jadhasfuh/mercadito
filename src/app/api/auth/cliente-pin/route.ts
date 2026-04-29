import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUsuarioFromSession, setClientePin, clienteTienePin } from "@/lib/auth";

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

// POST /api/auth/cliente-pin — body: { pin: string | null, pinActual?: string }
// - Crear: pin no null, sin pinActual (cliente sin pin previo).
// - Cambiar/Quitar: requiere pinActual matching el actual antes de aceptar.
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "cliente") {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const body = await request.json();
  const pinNuevo: string | null = typeof body?.pin === "string" ? body.pin.trim() : null;
  const pinActual: string | null = typeof body?.pinActual === "string" ? body.pinActual.trim() : null;

  // Validación de formato del PIN nuevo (si lo está estableciendo).
  if (pinNuevo !== null && !/^\d{4,6}$/.test(pinNuevo)) {
    return NextResponse.json({ error: "El PIN debe ser de 4 a 6 dígitos" }, { status: 400 });
  }

  // Si ya tiene PIN, hay que verificar el actual antes de cambiarlo o quitarlo.
  // Si no tiene, puede establecer uno sin restricción (es la primera vez).
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
