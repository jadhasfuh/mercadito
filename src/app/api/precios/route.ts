import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function PUT(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (usuario.rol !== "tienda" && usuario.rol !== "repartidor" && usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { producto_id, puesto_id, precio, precio_mayoreo, mayoreo_desde } = body;

  if (!producto_id || !puesto_id || precio == null) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  if (usuario.rol !== "admin" && puesto_id !== usuario.puesto_id) {
    return NextResponse.json({ error: "Solo puedes actualizar precios de tu tienda" }, { status: 403 });
  }

  // Validación de mayoreo: ambos campos o ninguno, precio_mayoreo < precio, threshold > 0
  let mayoreoPrecio: number | null = null;
  let mayoreoDesde: number | null = null;
  if (precio_mayoreo != null || mayoreo_desde != null) {
    const pm = Number(precio_mayoreo);
    const md = Number(mayoreo_desde);
    if (!isFinite(pm) || pm <= 0) return NextResponse.json({ error: "precio_mayoreo inválido" }, { status: 400 });
    if (!isFinite(md) || md <= 0) return NextResponse.json({ error: "mayoreo_desde debe ser mayor a 0" }, { status: 400 });
    if (pm >= Number(precio)) return NextResponse.json({ error: "El precio de mayoreo debe ser menor al precio normal" }, { status: 400 });
    mayoreoPrecio = pm;
    mayoreoDesde = md;
  }

  const hoy = new Date().toISOString().split("T")[0];

  await query(
    "UPDATE precios SET activo = false WHERE producto_id = $1 AND puesto_id = $2 AND activo = true",
    [producto_id, puesto_id]
  );

  const id = uuidv4();
  await query(
    "INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, precio_mayoreo, mayoreo_desde) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, producto_id, puesto_id, precio, hoy, mayoreoPrecio, mayoreoDesde]
  );

  return NextResponse.json({ ok: true, id, precio, precio_mayoreo: mayoreoPrecio, mayoreo_desde: mayoreoDesde, fecha: hoy });
}
