import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { verificarListaNegra } from "@/lib/lista-negra";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoriaId = searchParams.get("categoria");

  // Check if user is a store owner — they should see their own prices even if not approved
  const usuario = await getUsuarioFromSession();
  const esTienda = usuario && (usuario.rol === "tienda" || usuario.rol === "repartidor") && usuario.puesto_id;
  const esAdmin = usuario && usuario.rol === "admin";

  // Build query based on role
  // Store owners see their own prices even if not approved; clients only see approved stores
  const params: unknown[] = [];
  let puestoFilter: string;

  if (esAdmin) {
    puestoFilter = "1=1";
  } else if (esTienda) {
    params.push(usuario.puesto_id);
    puestoFilter = `(pu.activo = true AND pu.aprobado = true) OR pu.id = $${params.length}`;
  } else {
    puestoFilter = "pu.activo = true AND pu.aprobado = true";
  }

  const baseQuery = `SELECT p.*,
    COALESCE(json_agg(json_build_object(
      'precio_id', pr.id,
      'puesto_id', pr.puesto_id,
      'puesto_nombre', pu.nombre,
      'precio', pr.precio,
      'fecha', pr.fecha,
      'puesto_lat', pu.lat,
      'puesto_lng', pu.lng,
      'puesto_ubicacion', pu.ubicacion
    )) FILTER (WHERE pr.id IS NOT NULL), '[]') as precios
  FROM productos p
  LEFT JOIN puestos pu ON (${puestoFilter})
  LEFT JOIN precios pr ON pr.producto_id = p.id AND pr.activo = true AND pr.puesto_id = pu.id`;

  let productos;
  if (categoriaId) {
    params.push(categoriaId);
    productos = await query(
      `${baseQuery} WHERE p.categoria_id = $${params.length} GROUP BY p.id ORDER BY p.nombre`,
      params
    );
  } else {
    productos = await query(
      `${baseQuery} GROUP BY p.id ORDER BY p.nombre`,
      params
    );
  }

  return NextResponse.json(productos);
}

// POST — create a new product (tienda, repartidor, admin)
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "repartidor" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { nombre, categoria_id, unidad, descripcion, imagen, precio, puesto_id, seccion } = body;

  if (!nombre || !categoria_id || !unidad) {
    return NextResponse.json({ error: "Nombre, categoría y unidad son requeridos" }, { status: 400 });
  }

  const bloqueado = verificarListaNegra(nombre);
  if (bloqueado) {
    return NextResponse.json({ error: "El nombre del producto contiene contenido no permitido" }, { status: 400 });
  }

  // Generate slug-style ID
  const id = nombre.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    + "-" + uuidv4().slice(0, 4);

  await query(
    "INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, imagen, seccion) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, nombre, categoria_id, unidad, descripcion || null, imagen || null, seccion || null]
  );

  // If price provided, add it too
  if (precio && puesto_id) {
    const hoy = new Date().toISOString().split("T")[0];
    await query(
      "INSERT INTO precios (id, producto_id, puesto_id, precio, fecha) VALUES ($1, $2, $3, $4, $5)",
      [uuidv4(), id, puesto_id, precio, hoy]
    );
  }

  return NextResponse.json({ ok: true, id }, { status: 201 });
}
