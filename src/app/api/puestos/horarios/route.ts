import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

function esHora(v: unknown): v is string {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
}

// GET — list horarios for the current user's store (or ?puesto_id= for public/admin read)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const puestoIdParam = searchParams.get("puesto_id");
  const usuario = await getUsuarioFromSession();

  let puestoId: string | null = puestoIdParam;
  if (!puestoId) {
    if (!usuario?.puesto_id) {
      return NextResponse.json([], { status: 200 });
    }
    puestoId = usuario.puesto_id;
  }

  const rows = await query(
    "SELECT id, puesto_id, nombre, desde, hasta FROM puesto_horarios WHERE puesto_id = $1 ORDER BY desde",
    [puestoId]
  );
  return NextResponse.json(rows);
}

// POST — create a horario for the current user's store
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || !usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { nombre, desde, hasta } = body;

  if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }
  if (!esHora(desde) || !esHora(hasta)) {
    return NextResponse.json({ error: "Horas inválidas (formato HH:MM)" }, { status: 400 });
  }
  if (desde >= hasta) {
    return NextResponse.json({ error: "La hora de inicio debe ser menor a la de fin" }, { status: 400 });
  }

  const id = `h-${uuidv4().slice(0, 8)}`;
  await query(
    "INSERT INTO puesto_horarios (id, puesto_id, nombre, desde, hasta) VALUES ($1, $2, $3, $4, $5)",
    [id, usuario.puesto_id, nombre.trim(), desde, hasta]
  );
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
