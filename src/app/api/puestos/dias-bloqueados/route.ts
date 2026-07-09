import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// Días bloqueados de reservas de una tienda (vacaciones / día libre).
// GET  → lista las fechas bloqueadas del puesto del dueño (o ?puesto_id admin).
// POST → agrega una fecha { fecha: "YYYY-MM-DD" }.
// DELETE → quita una fecha { fecha: "YYYY-MM-DD" }.

function fechaValida(f: unknown): f is string {
  return typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f);
}

async function puestoDelUsuario(request: Request): Promise<{ puestoId: string } | { error: string; status: number }> {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return { error: "No autenticado", status: 401 };
  if (usuario.rol === "admin") {
    const pid = new URL(request.url).searchParams.get("puesto_id");
    if (!pid) return { error: "Falta puesto_id", status: 400 };
    return { puestoId: pid };
  }
  if (usuario.rol !== "tienda" || !usuario.puesto_id) return { error: "No autorizado", status: 403 };
  return { puestoId: usuario.puesto_id };
}

export async function GET(request: Request) {
  const r = await puestoDelUsuario(request);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const rows = await query<{ fecha: string }>(
    "SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM puesto_dias_bloqueados WHERE puesto_id = $1 AND fecha >= CURRENT_DATE ORDER BY fecha",
    [r.puestoId]
  );
  return NextResponse.json(rows.map((x) => x.fecha));
}

export async function POST(request: Request) {
  const r = await puestoDelUsuario(request);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const body = await request.json().catch(() => ({}));
  if (!fechaValida(body.fecha)) return NextResponse.json({ error: "Fecha inválida (YYYY-MM-DD)" }, { status: 400 });
  await query(
    "INSERT INTO puesto_dias_bloqueados (puesto_id, fecha) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [r.puestoId, body.fecha]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const r = await puestoDelUsuario(request);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const body = await request.json().catch(() => ({}));
  if (!fechaValida(body.fecha)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  await query("DELETE FROM puesto_dias_bloqueados WHERE puesto_id = $1 AND fecha = $2", [r.puestoId, body.fecha]);
  return NextResponse.json({ ok: true });
}
