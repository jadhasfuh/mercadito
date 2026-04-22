import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function PUT(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Only tienda, repartidor, and admin can update prices
  if (usuario.rol !== "tienda" && usuario.rol !== "repartidor" && usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { producto_id, puesto_id, precio } = body;

  if (!producto_id || !puesto_id || precio == null) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  // Anyone but admin must update prices for their own store only
  if (usuario.rol !== "admin" && puesto_id !== usuario.puesto_id) {
    return NextResponse.json({ error: "Solo puedes actualizar precios de tu tienda" }, { status: 403 });
  }

  const hoy = new Date().toISOString().split("T")[0];

  // Deactivate old price
  await query(
    "UPDATE precios SET activo = false WHERE producto_id = $1 AND puesto_id = $2 AND activo = true",
    [producto_id, puesto_id]
  );

  // Insert new price
  const id = uuidv4();
  await query(
    "INSERT INTO precios (id, producto_id, puesto_id, precio, fecha) VALUES ($1, $2, $3, $4, $5)",
    [id, producto_id, puesto_id, precio, hoy]
  );

  return NextResponse.json({ ok: true, id, precio, fecha: hoy });
}
