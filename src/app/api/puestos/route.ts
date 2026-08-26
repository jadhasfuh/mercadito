import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { verificarListaNegra } from "@/lib/lista-negra";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoria = searchParams.get("categoria");

  // Store is open now iff no opening-hours config exists (= 24/7) or
  // there's a row for today whose abre/cierra bracket the current CDMX time.
  // A horario atencion row covers [abre, cierra]. If abre > cierra the window
  // spans midnight, so we also accept the previous day with now >= abre or
  // today with now <= cierra. Si hay descanso_desde/hasta, ese sub-rango se
  // considera cerrado (la hora de la siesta).
  const enDescanso = `(pha.descanso_desde IS NOT NULL AND pha.descanso_hasta IS NOT NULL AND to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') BETWEEN pha.descanso_desde AND pha.descanso_hasta)`;
  const abiertoSql = `(
    NOT EXISTS (SELECT 1 FROM puesto_horario_atencion WHERE puesto_id = p.id)
    OR EXISTS (
      SELECT 1 FROM puesto_horario_atencion pha
      WHERE pha.puesto_id = p.id
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
        AND NOT ${enDescanso}
    )
  )`;
  const horarioAtencionAgg = `COALESCE((
    SELECT json_agg(json_build_object('dia_semana', pha.dia_semana, 'abre', pha.abre, 'cierra', pha.cierra, 'descanso_desde', pha.descanso_desde, 'descanso_hasta', pha.descanso_hasta) ORDER BY pha.dia_semana)
    FROM puesto_horario_atencion pha WHERE pha.puesto_id = p.id
  ), '[]')`;

  let puestos;
  if (categoria) {
    // Usamos EXISTS para evitar DISTINCT sobre columnas json del aggregate.
    puestos = await query(
      `SELECT p.*, ${abiertoSql} AS abierto_ahora, ${horarioAtencionAgg} AS horario_atencion
       FROM puestos p
       WHERE p.activo = true AND p.aprobado = true
         AND EXISTS (
           SELECT 1 FROM precios pr
           JOIN productos prod ON prod.id = pr.producto_id
           WHERE pr.puesto_id = p.id AND pr.activo = true AND prod.categoria_id = $1
         )
       ORDER BY p.nombre`,
      [categoria]
    );
  } else {
    puestos = await query(
      `SELECT p.*, ${abiertoSql} AS abierto_ahora, ${horarioAtencionAgg} AS horario_atencion
       FROM puestos p WHERE p.activo = true ORDER BY p.nombre`
    );
  }

  // Derive categories for each store from their actual products
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puestoIds = puestos.map((p: any) => p.id as string);
  if (puestoIds.length > 0) {
    const placeholders = puestoIds.map((_: string, i: number) => `$${i + 1}`).join(",");
    const cats = await query(
      `SELECT DISTINCT pr.puesto_id, prod.categoria_id
       FROM precios pr
       JOIN productos prod ON prod.id = pr.producto_id
       WHERE pr.activo = true AND pr.puesto_id IN (${placeholders})`,
      puestoIds
    );
    const catMap: Record<string, string[]> = {};
    for (const c of cats) {
      if (!catMap[c.puesto_id]) catMap[c.puesto_id] = [];
      catMap[c.puesto_id].push(c.categoria_id);
    }
    for (const p of puestos) {
      (p as Record<string, unknown>).categorias = catMap[p.id] || [];
    }
  }

  // Reemplaza logo data:URL inline por URL al endpoint dedicado (mismo
  // patrón que /api/productos/imagen). El payload baja de ~2.3 MB a ~50 KB.
  for (const p of puestos as Array<{ id: string; logo: string | null }>) {
    if (p.logo && p.logo.startsWith("data:")) {
      p.logo = `/api/puestos/${p.id}/logo`;
    }
  }

  return NextResponse.json(puestos, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

// PATCH — update store info (owner only)
export async function PATCH(request: Request) {
  const usuario = await getUsuarioFromSession();
  // El check pedía solo puesto_id, sin mirar el rol: cualquier cuenta ligada
  // al negocio podía editarlo. Un MESERO (sub-cuenta que crea la tienda para
  // su personal) podía renombrar el negocio, cambiar el WhatsApp al que
  // llegan los pedidos o apagar el menú. Editar el negocio es del dueño.
  if (!usuario || !usuario.puesto_id || (usuario.rol !== "tienda" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { nombre, ubicacion, descripcion, telefono_contacto, lat, lng, logo, lead_time_dias,
          color_marca, portada, menu_slug, menu_publico, dine_in_activo, metodos_pago_mesa,
          metodos_pago, servicios_pedido,
          citas_auto_confirmar, citas_capacidad } = body;

  const bloqueado = verificarListaNegra(nombre || "") || verificarListaNegra(descripcion || "");
  if (bloqueado) {
    return NextResponse.json({ error: "El nombre o descripción contiene contenido no permitido" }, { status: 400 });
  }

  // Only allow editing own store
  const puesto = await queryOne("SELECT id FROM puestos WHERE id = $1", [usuario.puesto_id]);
  if (!puesto) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (nombre !== undefined) { updates.push(`nombre = $${idx++}`); params.push(nombre); }
  if (ubicacion !== undefined) { updates.push(`ubicacion = $${idx++}`); params.push(ubicacion); }
  if (descripcion !== undefined) { updates.push(`descripcion = $${idx++}`); params.push(descripcion); }
  if (telefono_contacto !== undefined) { updates.push(`telefono_contacto = $${idx++}`); params.push(telefono_contacto); }
  if (lat !== undefined) { updates.push(`lat = $${idx++}`); params.push(lat); }
  if (lng !== undefined) { updates.push(`lng = $${idx++}`); params.push(lng); }
  if (logo !== undefined) { updates.push(`logo = $${idx++}`); params.push(logo || null); }
  if (lead_time_dias !== undefined) {
    const lead = lead_time_dias == null || lead_time_dias === ""
      ? 0
      : Math.max(0, Math.min(14, Math.floor(Number(lead_time_dias))));
    updates.push(`lead_time_dias = $${idx++}`); params.push(lead);
  }
  // Branding del menú digital
  if (color_marca !== undefined) { updates.push(`color_marca = $${idx++}`); params.push(color_marca || null); }
  if (portada !== undefined) { updates.push(`portada = $${idx++}`); params.push(portada || null); }
  if (menu_publico !== undefined) { updates.push(`menu_publico = $${idx++}`); params.push(!!menu_publico); }
  if (menu_slug !== undefined) {
    const slug = String(menu_slug || "").trim().toLowerCase();
    if (slug && !/^[a-z0-9-]{3,40}$/.test(slug)) {
      return NextResponse.json({ error: "El enlace debe ser de 3-40 letras, números o guiones" }, { status: 400 });
    }
    if (slug && verificarListaNegra(slug)) {
      return NextResponse.json({ error: "Ese enlace no está permitido" }, { status: 400 });
    }
    // Único: rechaza si lo usa otra tienda.
    if (slug) {
      const dup = await queryOne("SELECT id FROM puestos WHERE menu_slug = $1 AND id <> $2", [slug, usuario.puesto_id]);
      if (dup) return NextResponse.json({ error: "Ese enlace ya está en uso" }, { status: 409 });
    }
    updates.push(`menu_slug = $${idx++}`); params.push(slug || null);
  }
  // Config dine-in (Fase 2)
  if (dine_in_activo !== undefined) { updates.push(`dine_in_activo = $${idx++}`); params.push(!!dine_in_activo); }
  if (citas_auto_confirmar !== undefined) { updates.push(`citas_auto_confirmar = $${idx++}`); params.push(!!citas_auto_confirmar); }
  if (citas_capacidad !== undefined) {
    const cap = Math.max(1, Math.min(50, Math.floor(Number(citas_capacidad)) || 1));
    updates.push(`citas_capacidad = $${idx++}`); params.push(cap);
  }
  if (metodos_pago_mesa !== undefined) {
    const permitidos = ["caja", "transferencia", "tarjeta"];
    const arr = Array.isArray(metodos_pago_mesa)
      ? metodos_pago_mesa.filter((m) => permitidos.includes(m))
      : ["caja"];
    updates.push(`metodos_pago_mesa = $${idx++}`); params.push(JSON.stringify(arr.length ? arr : ["caja"]));
  }
  // Ficha del negocio en el menú: formas de pago y de servicio. Van aparte de
  // las de mesa — un negocio sin mesas también tiene que poder decir si
  // acepta tarjeta.
  if (metodos_pago !== undefined) {
    const permitidos = ["efectivo", "tarjeta", "transferencia"];
    const arr = Array.isArray(metodos_pago) ? metodos_pago.filter((m) => permitidos.includes(m)) : [];
    updates.push(`metodos_pago = $${idx++}`); params.push(JSON.stringify(arr.length ? arr : ["efectivo"]));
  }
  if (servicios_pedido !== undefined) {
    const permitidos = ["local", "llevar", "domicilio"];
    const arr = Array.isArray(servicios_pedido) ? servicios_pedido.filter((m) => permitidos.includes(m)) : [];
    // Array vacío es una respuesta válida ("no configurado"), por eso null y
    // no un default: la ficha se salta la sección en vez de mentir.
    updates.push(`servicios_pedido = $${idx++}`); params.push(arr.length ? JSON.stringify(arr) : null);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  params.push(usuario.puesto_id);
  await query(`UPDATE puestos SET ${updates.join(", ")} WHERE id = $${idx}`, params);

  return NextResponse.json({ ok: true });
}
