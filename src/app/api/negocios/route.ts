import { query } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/negocios — negocios de servicios (peluquerías, consultorios, etc.)
// para el modo "Citas" del home. Incluye los de tipo 'ambos' (que también
// venden productos en el catálogo normal). Devuelve categoría, distancia base
// (lat/lng) y si está abierto ahora (según puesto_horario_atencion + timezone).
export async function GET() {
  const negocios = await query(
    `SELECT p.id, p.nombre, p.descripcion, p.ubicacion, p.lat, p.lng, p.logo,
            p.telefono_contacto, p.tipo, p.categoria_servicio,
            (SELECT COUNT(*) FROM servicios s WHERE s.puesto_id = p.id AND s.activo = true) AS n_servicios,
            (SELECT MIN(precio) FROM servicios s WHERE s.puesto_id = p.id AND s.activo = true AND s.precio IS NOT NULL) AS desde_precio,
            EXISTS (
              SELECT 1 FROM puesto_horario_atencion h
              WHERE h.puesto_id = p.id
                AND h.dia_semana = EXTRACT(DOW FROM (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/Mexico_City')))::int
                AND h.abre IS NOT NULL AND h.cierra IS NOT NULL
                AND to_char(NOW() AT TIME ZONE COALESCE(p.timezone, 'America/Mexico_City'), 'HH24:MI') BETWEEN h.abre AND h.cierra
                AND NOT (
                  h.descanso_desde IS NOT NULL AND h.descanso_hasta IS NOT NULL
                  AND to_char(NOW() AT TIME ZONE COALESCE(p.timezone, 'America/Mexico_City'), 'HH24:MI') BETWEEN h.descanso_desde AND h.descanso_hasta
                )
            ) AS abierto_ahora
     FROM puestos p
     WHERE p.activo = true AND p.aprobado = true AND p.tipo IN ('servicios', 'ambos')
       -- Solo negocios que REALMENTE pueden recibir una cita. Antes bastaba
       -- con el tipo, así que salían dos clases de callejón sin salida:
       --   · sin ningún servicio cargado (McDonald's y cualquiera marcado
       --     'ambos' que nunca configuró su agenda);
       --   · con la suscripción vencida, que al agendar responde 402
       --     "este negocio no está recibiendo reservas".
       -- Mandar al cliente a una ficha donde no puede reservar es peor que
       -- no mostrarla. El admin sí los ve, en su panel de suscripciones.
       AND EXISTS (SELECT 1 FROM servicios s WHERE s.puesto_id = p.id AND s.activo = true)
       AND p.suscripcion_hasta IS NOT NULL AND p.suscripcion_hasta > NOW()
     ORDER BY p.nombre`
  );
  return NextResponse.json(negocios);
}
