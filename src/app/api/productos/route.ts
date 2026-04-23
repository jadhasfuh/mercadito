import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { verificarListaNegra } from "@/lib/lista-negra";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoriaId = searchParams.get("categoria");
  // Cuando la página /cliente consulta, manda visible_solo=true para forzar la
  // vista de cliente (respeta disponible, horarios y cierre de tienda)
  // aunque la sesión sea de tienda/repartidor/admin.
  const visibleSolo = searchParams.get("visible_solo") === "true";

  const usuario = await getUsuarioFromSession();
  const esTienda = usuario && (usuario.rol === "tienda" || usuario.rol === "repartidor") && usuario.puesto_id;
  const esAdmin = usuario && usuario.rol === "admin";
  const esCliente = !esTienda && !esAdmin;
  const vistaCliente = esCliente || visibleSolo;

  const params: unknown[] = [];
  let puestoFilter: string;

  if (visibleSolo) {
    puestoFilter = "pu.activo = true AND pu.aprobado = true";
  } else if (esAdmin) {
    puestoFilter = "1=1";
  } else if (esTienda) {
    params.push(usuario.puesto_id);
    puestoFilter = `(pu.activo = true AND pu.aprobado = true) OR pu.id = $${params.length}`;
  } else {
    puestoFilter = "pu.activo = true AND pu.aprobado = true";
  }

  const baseQuery = `SELECT p.*,
    COALESCE(json_agg(DISTINCT jsonb_build_object(
      'precio_id', pr.id,
      'puesto_id', pr.puesto_id,
      'puesto_nombre', pu.nombre,
      'precio', pr.precio,
      'precio_mayoreo', pr.precio_mayoreo,
      'mayoreo_desde', pr.mayoreo_desde,
      'fecha', pr.fecha,
      'puesto_lat', pu.lat,
      'puesto_lng', pu.lng,
      'puesto_ubicacion', pu.ubicacion
    )) FILTER (WHERE pr.id IS NOT NULL), '[]') as precios,
    COALESCE((
      SELECT json_agg(jsonb_build_object('id', h.id, 'nombre', h.nombre, 'desde', h.desde, 'hasta', h.hasta))
      FROM producto_horarios ph
      JOIN puesto_horarios h ON h.id = ph.horario_id
      WHERE ph.producto_id = p.id
    ), '[]') as horarios
  FROM productos p
  LEFT JOIN puestos pu ON (${puestoFilter})
  LEFT JOIN precios pr ON pr.producto_id = p.id AND pr.activo = true AND pr.puesto_id = pu.id`;

  const filters: string[] = [];
  if (vistaCliente) {
    filters.push("(p.disponible IS NULL OR p.disponible = true)");
    // Only show products whose horarios include the current Mexico City time,
    // or products with no horarios at all (always available).
    filters.push(`(
      NOT EXISTS (SELECT 1 FROM producto_horarios WHERE producto_id = p.id)
      OR EXISTS (
        SELECT 1 FROM producto_horarios ph2
        JOIN puesto_horarios h2 ON h2.id = ph2.horario_id
        WHERE ph2.producto_id = p.id
          AND to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') BETWEEN h2.desde AND h2.hasta
      )
    )`);
    // Hide products from stores that are currently closed. A horario_atencion row
    // with abre > cierra means the window crosses midnight.
    filters.push(`EXISTS (
      SELECT 1 FROM precios pr3
      JOIN puestos pu3 ON pu3.id = pr3.puesto_id
      WHERE pr3.producto_id = p.id AND pr3.activo = true
        AND pu3.activo = true AND pu3.aprobado = true
        AND (
          NOT EXISTS (SELECT 1 FROM puesto_horario_atencion WHERE puesto_id = pu3.id)
          OR EXISTS (
            SELECT 1 FROM puesto_horario_atencion pha3
            WHERE pha3.puesto_id = pu3.id
              AND pha3.abre IS NOT NULL AND pha3.cierra IS NOT NULL
              AND (
                (pha3.abre <= pha3.cierra
                  AND pha3.dia_semana = EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::int
                  AND to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') BETWEEN pha3.abre AND pha3.cierra)
                OR
                (pha3.abre > pha3.cierra AND (
                  (pha3.dia_semana = EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::int
                    AND to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') >= pha3.abre)
                  OR
                  (pha3.dia_semana = ((EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::int + 6) % 7)
                    AND to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') <= pha3.cierra)
                ))
              )
              AND NOT (pha3.descanso_desde IS NOT NULL AND pha3.descanso_hasta IS NOT NULL AND to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') BETWEEN pha3.descanso_desde AND pha3.descanso_hasta)
          )
        )
    )`);
  }
  if (categoriaId) {
    params.push(categoriaId);
    filters.push(`p.categoria_id = $${params.length}`);
  }

  const whereClause = filters.length > 0 ? ` WHERE ${filters.join(" AND ")}` : "";

  const productos = await query(
    `${baseQuery}${whereClause} GROUP BY p.id ORDER BY p.nombre`,
    params
  );

  return NextResponse.json(productos);
}

// POST — create a new product (tienda, repartidor, admin)
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "repartidor" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { nombre, categoria_id, unidad, descripcion, imagen, precio, puesto_id, seccion, subseccion, horario_ids, precio_mayoreo, mayoreo_desde } = body;

  if (!nombre || !categoria_id || !unidad) {
    return NextResponse.json({ error: "Nombre, categoría y unidad son requeridos" }, { status: 400 });
  }

  const bloqueado = verificarListaNegra(nombre);
  if (bloqueado) {
    return NextResponse.json({ error: "El nombre del producto contiene contenido no permitido" }, { status: 400 });
  }

  const id = nombre.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    + "-" + uuidv4().slice(0, 4);

  await query(
    "INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, imagen, seccion, subseccion) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [id, nombre, categoria_id, unidad, descripcion || null, imagen || null, seccion || null, subseccion || null]
  );

  // Anyone but admin can only attach prices/horarios to their own puesto
  if (puesto_id && usuario.rol !== "admin" && puesto_id !== usuario.puesto_id) {
    return NextResponse.json({ error: "Solo puedes crear productos para tu tienda" }, { status: 403 });
  }

  if (Array.isArray(horario_ids) && horario_ids.length > 0 && puesto_id) {
    const validos = await query(
      "SELECT id FROM puesto_horarios WHERE puesto_id = $1 AND id = ANY($2)",
      [puesto_id, horario_ids]
    );
    for (const { id: hid } of validos) {
      await query(
        "INSERT INTO producto_horarios (producto_id, horario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [id, hid]
      );
    }
  }

  if (precio && puesto_id) {
    // Mayoreo opcional: ambos campos o ninguno; pm < precio; md > 0.
    let mayoreoPrecio: number | null = null;
    let mayoreoDesde: number | null = null;
    if (precio_mayoreo != null && mayoreo_desde != null) {
      const pm = Number(precio_mayoreo);
      const md = Number(mayoreo_desde);
      if (!isFinite(pm) || pm <= 0 || !isFinite(md) || md <= 0) {
        return NextResponse.json({ error: "Datos de mayoreo inválidos" }, { status: 400 });
      }
      if (pm >= Number(precio)) {
        return NextResponse.json({ error: "El precio de mayoreo debe ser menor al precio normal" }, { status: 400 });
      }
      mayoreoPrecio = pm;
      mayoreoDesde = md;
    }
    const hoy = new Date().toISOString().split("T")[0];
    await query(
      "INSERT INTO precios (id, producto_id, puesto_id, precio, fecha, precio_mayoreo, mayoreo_desde) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [uuidv4(), id, puesto_id, precio, hoy, mayoreoPrecio, mayoreoDesde]
    );
  }

  return NextResponse.json({ ok: true, id }, { status: 201 });
}
