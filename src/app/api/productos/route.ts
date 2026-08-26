import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { verificarListaNegra } from "@/lib/lista-negra";
import { aplicarOpcionesYVariantes, aplicarModificadores } from "@/lib/productoExtras";
import { subirImagenSiBase64 } from "@/lib/storage";
import { aprobarSiTieneProductos } from "@/lib/aprobacion";
import { precioVigenteSQL, precioAntesSQL, promoEtiquetaSQL } from "@/lib/precioPromo";
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

  // Estilo Uber: las tiendas cerradas siguen apareciendo en el catálogo
  // pero marcadas como cerradas (frontend las muestra deshabilitadas).
  // Esta expresión devuelve true si la tienda está abierta AHORA en MX,
  // y se incluye como columna `cerrada = NOT(...)` en cada precio para
  // que el cliente decida cómo renderizar.
  const tiendaAbiertaSql = `(
    NOT EXISTS (SELECT 1 FROM puesto_horario_atencion WHERE puesto_id = pu.id)
    OR EXISTS (
      SELECT 1 FROM puesto_horario_atencion pha
      WHERE pha.puesto_id = pu.id
        AND pha.abre IS NOT NULL AND pha.cierra IS NOT NULL
        AND (
          (pha.abre <= pha.cierra
            AND pha.dia_semana = EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::int
            AND to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') BETWEEN pha.abre AND pha.cierra)
          OR
          (pha.abre > pha.cierra AND (
            (pha.dia_semana = EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::int
              AND to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') >= pha.abre)
            OR
            (pha.dia_semana = ((EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::int + 6) % 7)
              AND to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') <= pha.cierra)
          ))
        )
        AND NOT (pha.descanso_desde IS NOT NULL AND pha.descanso_hasta IS NOT NULL AND to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') BETWEEN pha.descanso_desde AND pha.descanso_hasta)
    )
  )`;

  if (esAdmin) {
    puestoFilter = "1=1";
  } else if (esTienda) {
    params.push(usuario.puesto_id);
    puestoFilter = `(pu.activo = true AND pu.aprobado = true) OR pu.id = $${params.length}`;
  } else {
    // Cliente (visible_solo o anónimo): tiendas activas y aprobadas
    // sin importar horario. La columna `cerrada` por precio identifica
    // las que están fuera de horario.
    puestoFilter = `pu.activo = true AND pu.aprobado = true`;
  }

  // Rating promedio por puesto: agregamos repartidor_rating de pedidos
  // entregados que incluyan items de cada tienda. Es aproximación (la
  // calificación es del pedido completo, no específica de la tienda),
  // pero sirve como señal pasiva para ordenar el catálogo.
  const ratingPuesto = `(SELECT AVG(p2.repartidor_rating)::numeric(3,2)
    FROM pedidos p2
    JOIN pedido_items pi2 ON pi2.pedido_id = p2.id
    WHERE pi2.puesto_id = pu.id
      AND p2.estado = 'entregado'
      AND p2.repartidor_rating IS NOT NULL)`;

  const baseQuery = `SELECT p.*,
    COALESCE(json_agg(DISTINCT jsonb_build_object(
      'precio_id', pr.id,
      'puesto_id', pr.puesto_id,
      'puesto_nombre', pu.nombre,
      'precio', ${precioVigenteSQL("pr")},
      'precio_antes', ${precioAntesSQL("pr")},
      'promo_etiqueta', ${promoEtiquetaSQL("pr")},
      'precio_mayoreo', pr.precio_mayoreo,
      'mayoreo_desde', pr.mayoreo_desde,
      'fecha', pr.fecha,
      'puesto_lat', pu.lat,
      'puesto_lead_time_dias', COALESCE(p.lead_time_dias, pu.lead_time_dias),
      'puesto_lng', pu.lng,
      'puesto_ubicacion', pu.ubicacion,
      'puesto_ciudad', pu.ciudad,
      'puesto_rating', ${ratingPuesto},
      'cerrada', NOT ${tiendaAbiertaSql}
    )) FILTER (WHERE pr.id IS NOT NULL), '[]') as precios,
    COALESCE((
      SELECT json_agg(jsonb_build_object('id', h.id, 'nombre', h.nombre, 'desde', h.desde, 'hasta', h.hasta))
      FROM producto_horarios ph
      JOIN puesto_horarios h ON h.id = ph.horario_id
      WHERE ph.producto_id = p.id
    ), '[]') as horarios,
    COALESCE((
      SELECT json_agg(pd.dia_semana ORDER BY pd.dia_semana)
      FROM producto_dias pd
      WHERE pd.producto_id = p.id
    ), '[]') as dias_semana,
    COALESCE((
      SELECT json_agg(jsonb_build_object(
        'id', op.id,
        'producto_id', op.producto_id,
        'nombre', op.nombre,
        'orden', op.orden,
        'valores', COALESCE((
          SELECT json_agg(jsonb_build_object('id', v.id, 'opcion_id', v.opcion_id, 'valor', v.valor, 'precio_extra', v.precio_extra, 'orden', v.orden) ORDER BY v.orden)
          FROM producto_opcion_valores v WHERE v.opcion_id = op.id
        ), '[]')
      ) ORDER BY op.orden)
      FROM producto_opciones op WHERE op.producto_id = p.id
    ), '[]') as opciones,
    COALESCE((
      SELECT json_agg(jsonb_build_object(
        'id', pv.id,
        'producto_id', pv.producto_id,
        'nombre', pv.nombre,
        'precio_override', pv.precio_override,
        'precio_mayoreo_override', pv.precio_mayoreo_override,
        'mayoreo_desde_override', pv.mayoreo_desde_override,
        'activo', pv.activo,
        'orden', pv.orden,
        'valor_ids', COALESCE((SELECT json_agg(vv.valor_id) FROM variante_valores vv WHERE vv.variante_id = pv.id), '[]')
      ) ORDER BY pv.orden)
      FROM producto_variantes pv WHERE pv.producto_id = p.id AND pv.activo = true
    ), '[]') as variantes,
    COALESCE((
      SELECT json_agg(jsonb_build_object(
        'id', pm.id,
        'producto_id', pm.producto_id,
        'nombre', pm.nombre,
        'obligatorio', pm.obligatorio,
        'multiple', pm.multiple,
        'maximo', pm.maximo,
        'minimo', pm.minimo,
        'orden', pm.orden,
        'opciones', COALESCE((
          SELECT json_agg(jsonb_build_object('id', mo.id, 'modificador_id', mo.modificador_id, 'nombre', mo.nombre, 'precio_extra', mo.precio_extra, 'orden', mo.orden) ORDER BY mo.orden)
          FROM modificador_opciones mo WHERE mo.modificador_id = pm.id
        ), '[]')
      ) ORDER BY pm.orden)
      FROM producto_modificadores pm WHERE pm.producto_id = p.id
    ), '[]') as modificadores,
    COALESCE((
      SELECT json_agg(pc.categoria_id ORDER BY pc.categoria_id)
      FROM producto_categorias pc WHERE pc.producto_id = p.id
    ), '[]') as categorias
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
    // Días de la semana en que el producto está disponible. Sin filas en
    // producto_dias = todos los días. Si hay filas, hoy debe estar en la lista.
    filters.push(`(
      NOT EXISTS (SELECT 1 FROM producto_dias WHERE producto_id = p.id)
      OR EXISTS (
        SELECT 1 FROM producto_dias pd2
        WHERE pd2.producto_id = p.id
          AND pd2.dia_semana = EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::int
      )
    )`);
    // Antes filtrábamos productos cuyas tiendas estuvieran TODAS cerradas,
    // pero queremos que aparezcan igualmente para que el cliente vea el
    // catálogo completo y el menú de la tienda permanezca visible aunque
    // ya cerraron. La marca `cerrada` por precio (calculada arriba) le
    // indica al frontend cómo renderizarlo (deshabilitado).
  }
  if (categoriaId) {
    params.push(categoriaId);
    // Coincide por categoría principal O por cualquier categoría secundaria (M:N).
    filters.push(`(p.categoria_id = $${params.length} OR EXISTS (SELECT 1 FROM producto_categorias pc WHERE pc.producto_id = p.id AND pc.categoria_id = $${params.length}))`);
  }

  const whereClause = filters.length > 0 ? ` WHERE ${filters.join(" AND ")}` : "";

  const productos = await query(
    `${baseQuery}${whereClause} GROUP BY p.id ORDER BY p.nombre`,
    params
  );

  // Reemplaza imagen data:URL inline por URL al endpoint dedicado. Antes
  // este endpoint devolvía ~30 MB porque cada producto cargaba su foto
  // en base64; ahora cae a ~1.5 MB y las imágenes se piden por separado
  // y solo cuando entran al viewport. Emojis (emoji:🍕) y nulls quedan
  // como están — el frontend ya los renderiza diferente.
  for (const p of productos as Array<{ id: string; imagen: string | null }>) {
    if (p.imagen && p.imagen.startsWith("data:")) {
      p.imagen = `/api/productos/${p.id}/imagen`;
    }
  }

  return NextResponse.json(productos, {
    headers: {
      // Cache corto en cliente + window de stale-while-revalidate para
      // suavizar repetidos hits. El catálogo cambia con frecuencia pero
      // 60s de tolerancia no se nota.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

// POST — create a new product (tienda, repartidor, admin)
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "repartidor" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { nombre, categoria_id, unidad, descripcion, imagen, precio, puesto_id, seccion, subseccion, horario_ids, dias_semana, precio_mayoreo, mayoreo_desde, opciones, variantes, modificadores, lead_time_dias, permite_fraccion, permite_por_dinero, precio_variable_peso, categorias } = body;

  if (!nombre || !categoria_id || !unidad) {
    return NextResponse.json({ error: "Nombre, categoría y unidad son requeridos" }, { status: 400 });
  }

  // Cantidad libre (fracción o por dinero) no convive con variantes —
  // medio rompope tamaño grande no tiene sentido.
  const tieneOpcionesNuevas = Array.isArray(opciones) && opciones.length > 0;
  if ((permite_fraccion || permite_por_dinero) && tieneOpcionesNuevas) {
    return NextResponse.json(
      { error: "Cantidad libre (fracción/por dinero) no aplica a productos con variantes" },
      { status: 400 }
    );
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

  // lead_time_dias: null/undefined → hereda del puesto. Número >= 0 sobrescribe.
  const leadProducto = lead_time_dias == null || lead_time_dias === ""
    ? null
    : Math.max(0, Math.floor(Number(lead_time_dias)));

  // Solo aceptamos data: (foto) o emoji: (ícono) — igual que el PATCH. Una URL
  // servida (/api/productos/{id}/imagen) es el espejo de LECTURA: si un flujo
  // que duplica productos la reenvía, se guardaba tal cual y quedaba una
  // imagen rota auto-referente (pasó con Little Caesars y Elotillos).
  const imagenLimpia = typeof imagen === "string" && (imagen.startsWith("data:") || imagen.startsWith("emoji:"))
    ? imagen
    : null;
  // Sube la imagen al bucket (si viene en base64) y guarda la URL. Fallback a
  // base64 si el bucket no está configurado.
  const imagenFinal = await subirImagenSiBase64(imagenLimpia, id);

  await query(
    "INSERT INTO productos (id, nombre, categoria_id, unidad, descripcion, imagen, seccion, subseccion, lead_time_dias, permite_fraccion, permite_por_dinero, precio_variable_peso) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
    [id, nombre, categoria_id, unidad, descripcion || null, imagenFinal || null, seccion || null, subseccion || null, leadProducto, !!permite_fraccion, !!permite_por_dinero, !!precio_variable_peso]
  );

  // Categorías M:N: la principal (categoria_id) + extras opcionales (categorias[]).
  const catsSet = Array.from(new Set([categoria_id, ...(Array.isArray(categorias) ? categorias : [])].filter(Boolean)));
  for (const c of catsSet) {
    await query("INSERT INTO producto_categorias (producto_id, categoria_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, c]);
  }

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
    // Su primer producto aprueba al negocio y publica su menú (ver lib/aprobacion).
    await aprobarSiTieneProductos(puesto_id);
  }

  await aplicarOpcionesYVariantes(id, opciones, variantes);
  await aplicarModificadores(id, modificadores);

  if (Array.isArray(dias_semana) && dias_semana.length > 0) {
    const limpios = Array.from(new Set(
      dias_semana
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ));
    for (const d of limpios) {
      await query(
        "INSERT INTO producto_dias (producto_id, dia_semana) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [id, d]
      );
    }
  }

  return NextResponse.json({ ok: true, id }, { status: 201 });
}
