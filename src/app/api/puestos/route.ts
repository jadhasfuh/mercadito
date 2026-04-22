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
  // today with now <= cierra.
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
    )
  )`;
  const horarioAtencionAgg = `COALESCE((
    SELECT json_agg(json_build_object('dia_semana', pha.dia_semana, 'abre', pha.abre, 'cierra', pha.cierra) ORDER BY pha.dia_semana)
    FROM puesto_horario_atencion pha WHERE pha.puesto_id = p.id
  ), '[]')`;

  let puestos;
  if (categoria) {
    puestos = await query(
      `SELECT DISTINCT p.*, ${abiertoSql} AS abierto_ahora, ${horarioAtencionAgg} AS horario_atencion
       FROM puestos p
       INNER JOIN precios pr ON pr.puesto_id = p.id AND pr.activo = true
       INNER JOIN productos prod ON prod.id = pr.producto_id
       WHERE p.activo = true AND p.aprobado = true AND prod.categoria_id = $1
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

  return NextResponse.json(puestos);
}

// PATCH — update store info (owner only)
export async function PATCH(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || !usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { nombre, ubicacion, descripcion, telefono_contacto, lat, lng, logo } = body;

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

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  params.push(usuario.puesto_id);
  await query(`UPDATE puestos SET ${updates.join(", ")} WHERE id = $${idx}`, params);

  return NextResponse.json({ ok: true });
}
