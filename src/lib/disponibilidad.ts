// Validación final al crear pedido: que cada (producto, puesto) del carrito
// realmente esté disponible AHORA en zona MX. La página ya filtra estos
// criterios en GET /api/productos, pero el carrito puede haber quedado
// abierto mientras una tienda cerraba o un producto se marcaba como no
// disponible. Este helper repite todas esas validaciones en el momento
// del POST /pedidos.
import { query } from "@/lib/db";

export interface ItemDisponibilidad {
  producto_id: string;
  puesto_id: string;
}

export interface BloqueoDisponibilidad {
  producto_id: string;
  puesto_id: string;
  producto_nombre: string;
  puesto_nombre: string;
  motivo: "producto_no_disponible" | "producto_fuera_horario" | "tienda_cerrada" | "tienda_inactiva";
}

/**
 * Devuelve la lista de items que NO se pueden cobrar en este momento, con
 * el motivo. Si todo está OK regresa array vacío.
 *
 * El `descanso_desde/hasta` se interpreta como "ventana de siesta" — si
 * la hora actual cae ahí, la tienda se considera cerrada aunque esté
 * dentro del horario abre/cierra.
 */
export async function validarDisponibilidadItems(
  items: ItemDisponibilidad[]
): Promise<BloqueoDisponibilidad[]> {
  if (items.length === 0) return [];
  const productoIds = items.map((i) => i.producto_id);
  const puestoIds = items.map((i) => i.puesto_id);

  const rows = await query<BloqueoDisponibilidad>(
    `WITH ahora AS (
      SELECT EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::int AS dow,
             to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') AS hhmm
    ),
    input AS (
      SELECT * FROM unnest($1::text[], $2::text[]) AS x(producto_id, puesto_id)
    )
    SELECT
      i.producto_id,
      i.puesto_id,
      p.nombre AS producto_nombre,
      pu.nombre AS puesto_nombre,
      CASE
        WHEN pu.activo = false OR pu.aprobado = false THEN 'tienda_inactiva'
        WHEN p.disponible = false THEN 'producto_no_disponible'
        WHEN EXISTS (SELECT 1 FROM producto_horarios ph WHERE ph.producto_id = p.id)
             AND NOT EXISTS (
               SELECT 1 FROM producto_horarios ph
               JOIN puesto_horarios h ON h.id = ph.horario_id
               CROSS JOIN ahora
               WHERE ph.producto_id = p.id
                 AND ahora.hhmm BETWEEN h.desde AND h.hasta
             )
          THEN 'producto_fuera_horario'
        WHEN EXISTS (SELECT 1 FROM puesto_horario_atencion pha WHERE pha.puesto_id = pu.id)
             AND NOT EXISTS (
               SELECT 1 FROM puesto_horario_atencion pha
               CROSS JOIN ahora
               WHERE pha.puesto_id = pu.id
                 AND pha.abre IS NOT NULL AND pha.cierra IS NOT NULL
                 AND (
                   (pha.abre <= pha.cierra
                     AND pha.dia_semana = ahora.dow
                     AND ahora.hhmm BETWEEN pha.abre AND pha.cierra)
                   OR
                   (pha.abre > pha.cierra AND (
                     (pha.dia_semana = ahora.dow AND ahora.hhmm >= pha.abre)
                     OR
                     (pha.dia_semana = ((ahora.dow + 6) % 7) AND ahora.hhmm <= pha.cierra)
                   ))
                 )
                 AND NOT (
                   pha.descanso_desde IS NOT NULL
                   AND pha.descanso_hasta IS NOT NULL
                   AND ahora.hhmm BETWEEN pha.descanso_desde AND pha.descanso_hasta
                 )
             )
          THEN 'tienda_cerrada'
        ELSE NULL
      END AS motivo
    FROM input i
    JOIN productos p ON p.id = i.producto_id
    JOIN puestos pu ON pu.id = i.puesto_id`,
    [productoIds, puestoIds]
  );

  return rows.filter((r) => r.motivo != null);
}

/** Mensaje legible para el cliente, agrupando por motivo. */
export function mensajeBloqueo(bloqueos: BloqueoDisponibilidad[]): string {
  if (bloqueos.length === 0) return "";
  const cerradas = bloqueos.filter((b) => b.motivo === "tienda_cerrada" || b.motivo === "tienda_inactiva");
  const productos = bloqueos.filter((b) => b.motivo === "producto_no_disponible" || b.motivo === "producto_fuera_horario");

  const partes: string[] = [];
  if (cerradas.length > 0) {
    const tiendas = Array.from(new Set(cerradas.map((b) => b.puesto_nombre.trim())));
    partes.push(
      tiendas.length === 1
        ? `La tienda "${tiendas[0]}" cerró mientras armabas tu pedido.`
        : `Estas tiendas ya cerraron: ${tiendas.join(", ")}.`
    );
  }
  if (productos.length > 0) {
    const nombres = Array.from(new Set(productos.map((b) => b.producto_nombre.trim())));
    partes.push(
      nombres.length === 1
        ? `"${nombres[0]}" ya no está disponible en este momento.`
        : `Productos no disponibles: ${nombres.join(", ")}.`
    );
  }
  partes.push("Quita los productos afectados de tu carrito y vuelve a intentar.");
  return partes.join(" ");
}
