import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

function esHora(v: unknown): v is string {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
}

// GET — list opening hours for the current user's store (or ?puesto_id=)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const puestoIdParam = searchParams.get("puesto_id");
  const usuario = await getUsuarioFromSession();

  const puestoId = puestoIdParam || usuario?.puesto_id;
  if (!puestoId) return NextResponse.json([], { status: 200 });

  const rows = await query(
    "SELECT dia_semana, abre, cierra FROM puesto_horario_atencion WHERE puesto_id = $1 ORDER BY dia_semana",
    [puestoId]
  );
  return NextResponse.json(rows);
}

// PUT — bulk replace opening hours for the current user's store
// Body: { dias: [{ dia_semana: 0..6, abre: "HH:MM"|null, cierra: "HH:MM"|null }, ...] }
export async function PUT(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || !usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const dias = Array.isArray(body?.dias) ? body.dias : null;
  if (!dias) return NextResponse.json({ error: "Falta dias" }, { status: 400 });

  for (const d of dias) {
    if (typeof d.dia_semana !== "number" || d.dia_semana < 0 || d.dia_semana > 6) {
      return NextResponse.json({ error: "dia_semana inválido" }, { status: 400 });
    }
    const abre = d.abre == null ? null : d.abre;
    const cierra = d.cierra == null ? null : d.cierra;
    if (abre !== null && !esHora(abre)) return NextResponse.json({ error: "abre inválido" }, { status: 400 });
    if (cierra !== null && !esHora(cierra)) return NextResponse.json({ error: "cierra inválido" }, { status: 400 });
    if (abre && cierra && abre >= cierra) {
      return NextResponse.json({ error: `Dia ${d.dia_semana}: abre debe ser menor a cierra` }, { status: 400 });
    }
  }

  await query("DELETE FROM puesto_horario_atencion WHERE puesto_id = $1", [usuario.puesto_id]);
  for (const d of dias) {
    const abre = d.abre == null ? null : d.abre;
    const cierra = d.cierra == null ? null : d.cierra;
    // Only insert rows with at least one side defined (abre or cierra)
    if (abre === null && cierra === null) continue;
    await query(
      "INSERT INTO puesto_horario_atencion (puesto_id, dia_semana, abre, cierra) VALUES ($1, $2, $3, $4)",
      [usuario.puesto_id, d.dia_semana, abre, cierra]
    );
  }

  return NextResponse.json({ ok: true });
}
