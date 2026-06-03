import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// GET /api/servicios?puesto_id=X — lista de servicios de un negocio.
// El público ve solo activos; la tienda dueña (o admin) ve también inactivos.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const puestoId = searchParams.get("puesto_id");
  if (!puestoId) {
    return NextResponse.json({ error: "Falta puesto_id" }, { status: 400 });
  }
  const usuario = await getUsuarioFromSession();
  const esDueno =
    !!usuario &&
    (usuario.rol === "admin" || (usuario.rol === "tienda" && usuario.puesto_id === puestoId));

  const servicios = await query(
    `SELECT id, puesto_id, nombre, descripcion, duracion_min, buffer_min, precio, activo, orden
     FROM servicios
     WHERE puesto_id = $1 ${esDueno ? "" : "AND activo = true"}
     ORDER BY orden, nombre`,
    [puestoId]
  );
  return NextResponse.json(servicios);
}

// POST /api/servicios — crea un servicio (tienda dueña o admin).
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await request.json();
  const puesto_id = usuario.rol === "admin" ? body.puesto_id : usuario.puesto_id;
  if (!puesto_id) {
    return NextResponse.json({ error: "Falta puesto_id" }, { status: 400 });
  }
  const nombre = (body.nombre || "").trim();
  const duracion = parseInt(body.duracion_min, 10);
  if (!nombre || !duracion || duracion <= 0) {
    return NextResponse.json({ error: "Nombre y duración requeridos" }, { status: 400 });
  }

  const id = `serv-${uuidv4().slice(0, 8)}`;
  await query(
    `INSERT INTO servicios (id, puesto_id, nombre, descripcion, duracion_min, buffer_min, precio, orden)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      puesto_id,
      nombre,
      body.descripcion?.trim() || null,
      duracion,
      parseInt(body.buffer_min, 10) || 0,
      body.precio != null && body.precio !== "" ? Number(body.precio) : null,
      parseInt(body.orden, 10) || 0,
    ]
  );
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
