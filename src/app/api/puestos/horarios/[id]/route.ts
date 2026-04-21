import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

function esHora(v: unknown): v is string {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
}

async function asegurarPropietario(horarioId: string, usuarioPuestoId: string | null, esAdmin: boolean) {
  const row = await queryOne<{ puesto_id: string }>(
    "SELECT puesto_id FROM puesto_horarios WHERE id = $1",
    [horarioId]
  );
  if (!row) return { ok: false as const, status: 404, error: "Horario no encontrado" };
  if (!esAdmin && row.puesto_id !== usuarioPuestoId) {
    return { ok: false as const, status: 403, error: "No autorizado" };
  }
  return { ok: true as const };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (!usuario.puesto_id && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id } = await params;
  const auth = await asegurarPropietario(id, usuario.puesto_id, usuario.rol === "admin");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const { nombre, desde, hasta } = body;

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (nombre !== undefined) {
    if (typeof nombre !== "string" || !nombre.trim()) {
      return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
    }
    updates.push(`nombre = $${idx++}`); values.push(nombre.trim());
  }
  if (desde !== undefined) {
    if (!esHora(desde)) return NextResponse.json({ error: "desde inválido" }, { status: 400 });
    updates.push(`desde = $${idx++}`); values.push(desde);
  }
  if (hasta !== undefined) {
    if (!esHora(hasta)) return NextResponse.json({ error: "hasta inválido" }, { status: 400 });
    updates.push(`hasta = $${idx++}`); values.push(hasta);
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  values.push(id);
  await query(`UPDATE puesto_horarios SET ${updates.join(", ")} WHERE id = $${idx}`, values);

  // Sanity check that desde < hasta after the update
  const final = await queryOne<{ desde: string; hasta: string }>(
    "SELECT desde, hasta FROM puesto_horarios WHERE id = $1",
    [id]
  );
  if (final && final.desde >= final.hasta) {
    return NextResponse.json({ error: "La hora de inicio debe ser menor a la de fin" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (!usuario.puesto_id && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { id } = await params;
  const auth = await asegurarPropietario(id, usuario.puesto_id, usuario.rol === "admin");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await query("DELETE FROM puesto_horarios WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
