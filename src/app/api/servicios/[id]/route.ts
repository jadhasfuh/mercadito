import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// Verifica que el usuario sea dueño del servicio (tienda del puesto) o admin.
async function autorizar(servicioId: string) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return { error: "No autenticado", status: 401 as const };
  const serv = await queryOne<{ puesto_id: string }>(
    "SELECT puesto_id FROM servicios WHERE id = $1",
    [servicioId]
  );
  if (!serv) return { error: "Servicio no existe", status: 404 as const };
  const ok =
    usuario.rol === "admin" || (usuario.rol === "tienda" && usuario.puesto_id === serv.puesto_id);
  if (!ok) return { error: "No autorizado", status: 403 as const };
  return { usuario, serv };
}

// PATCH /api/servicios/[id] — edita campos del servicio.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await autorizar(id);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const campos: string[] = [];
  const valores: unknown[] = [];
  let i = 1;
  const set = (col: string, val: unknown) => {
    campos.push(`${col} = $${i++}`);
    valores.push(val);
  };

  if (body.nombre !== undefined) set("nombre", String(body.nombre).trim());
  if (body.descripcion !== undefined) set("descripcion", body.descripcion?.trim() || null);
  if (body.duracion_min !== undefined) set("duracion_min", parseInt(body.duracion_min, 10) || 30);
  if (body.buffer_min !== undefined) set("buffer_min", parseInt(body.buffer_min, 10) || 0);
  if (body.precio !== undefined)
    set("precio", body.precio != null && body.precio !== "" ? Number(body.precio) : null);
  if (body.orden !== undefined) set("orden", parseInt(body.orden, 10) || 0);
  if (body.activo !== undefined) set("activo", !!body.activo);

  if (campos.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  valores.push(id);
  await query(`UPDATE servicios SET ${campos.join(", ")} WHERE id = $${i}`, valores);
  return NextResponse.json({ ok: true });
}

// DELETE /api/servicios/[id] — soft delete (activo = false) para preservar el
// historial de citas que lo referencian. Si no tiene citas, borra de verdad.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await autorizar(id);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tieneCitas = await queryOne<{ n: string }>(
    "SELECT COUNT(*) as n FROM citas WHERE servicio_id = $1",
    [id]
  );
  if (tieneCitas && parseInt(tieneCitas.n, 10) > 0) {
    await query("UPDATE servicios SET activo = false WHERE id = $1", [id]);
    return NextResponse.json({ ok: true, soft: true });
  }
  await query("DELETE FROM servicios WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
