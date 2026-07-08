import { queryOne } from "@/lib/db";
import { throttle, ipDe } from "@/lib/ratelimit";
import { NextResponse } from "next/server";

// GET /api/auth/cliente-existe?telefono=...
// Endpoint público que sirve para que el formulario de login decida si pedir
// nombre (cliente nuevo), PIN (cliente con PIN) o solo confirmar teléfono
// (cliente sin PIN). Devuelve solo lo mínimo: existe, tiene_pin y nombre.
export async function GET(request: Request) {
  // Throttle por IP: frena enumeración masiva (harvesting de nombres).
  const rl = throttle(`existe:${ipDe(request)}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Demasiadas consultas" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const telefono = (searchParams.get("telefono") || "").replace(/\D/g, "");
  if (telefono.length < 10) {
    return NextResponse.json({ existe: false });
  }
  const row = await queryOne<{ nombre: string; pin: string | null }>(
    "SELECT nombre, pin FROM usuarios WHERE telefono = $1 AND rol = 'cliente'",
    [telefono]
  );
  if (!row) {
    return NextResponse.json({ existe: false });
  }
  return NextResponse.json({
    existe: true,
    tiene_pin: !!row.pin,
    nombre: row.nombre,
  });
}
