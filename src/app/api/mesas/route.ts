import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

function nuevoToken(): string {
  return uuidv4().replace(/-/g, "").slice(0, 12);
}

async function puestoDe(req: Request): Promise<{ puestoId: string } | NextResponse> {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (usuario.rol === "tienda") {
    if (!usuario.puesto_id) return NextResponse.json({ error: "Sin tienda" }, { status: 400 });
    return { puestoId: usuario.puesto_id };
  }
  const { searchParams } = new URL(req.url);
  const pid = searchParams.get("puesto_id");
  if (!pid) return NextResponse.json({ error: "Falta puesto_id" }, { status: 400 });
  return { puestoId: pid };
}

// GET — lista de mesas de la tienda.
export async function GET(req: Request) {
  const ctx = await puestoDe(req);
  if (ctx instanceof NextResponse) return ctx;
  const mesas = await query(
    "SELECT id, etiqueta, token, activa, orden FROM mesas WHERE puesto_id = $1 ORDER BY orden, etiqueta",
    [ctx.puestoId]
  );
  return NextResponse.json(mesas);
}

// POST — crea una mesa. { etiqueta }
export async function POST(req: Request) {
  const ctx = await puestoDe(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await req.json().catch(() => ({}));
  const etiqueta = String(body.etiqueta || "").trim().slice(0, 40);
  if (!etiqueta) return NextResponse.json({ error: "Falta la etiqueta de la mesa" }, { status: 400 });
  const id = uuidv4();
  await query(
    "INSERT INTO mesas (id, puesto_id, etiqueta, token, orden) VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(orden)+1 FROM mesas WHERE puesto_id=$2), 0))",
    [id, ctx.puestoId, etiqueta, nuevoToken()]
  );
  return NextResponse.json({ ok: true, id }, { status: 201 });
}

// PATCH — edita etiqueta / activa, o regenera token. { id, etiqueta?, activa?, regenerar_token? }
export async function PATCH(req: Request) {
  const ctx = await puestoDe(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await req.json().catch(() => ({}));
  const mesa = await queryOne<{ id: string }>("SELECT id FROM mesas WHERE id = $1 AND puesto_id = $2", [body.id, ctx.puestoId]);
  if (!mesa) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 });
  const sets: string[] = []; const vals: unknown[] = []; let i = 1;
  if (body.etiqueta !== undefined) { sets.push(`etiqueta = $${i++}`); vals.push(String(body.etiqueta).trim().slice(0, 40)); }
  if (body.activa !== undefined) { sets.push(`activa = $${i++}`); vals.push(!!body.activa); }
  if (body.regenerar_token) { sets.push(`token = $${i++}`); vals.push(nuevoToken()); }
  if (sets.length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  vals.push(body.id);
  await query(`UPDATE mesas SET ${sets.join(", ")} WHERE id = $${i}`, vals);
  return NextResponse.json({ ok: true });
}

// DELETE — elimina una mesa (cuentas/pedidos quedan por CASCADE de cuentas).
export async function DELETE(req: Request) {
  const ctx = await puestoDe(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await req.json().catch(() => ({}));
  await query("DELETE FROM mesas WHERE id = $1 AND puesto_id = $2", [body.id, ctx.puestoId]);
  return NextResponse.json({ ok: true });
}
