import { cache } from "react";
import { query, queryOne } from "@/lib/db";
import { infoPlan, type InfoPlan } from "@/lib/plan";
import { DELIVERY_ACTIVO } from "@/lib/flags";

// Menú digital público de una tienda. Lee productos/precios/modificadores ya
// existentes y los agrupa para mostrar/ordenar. Se usa en la página SSR
// /m/[puesto_id], en /api/menu/[id] (móvil/tablet) y en la página de mesa.
// Modelo de la tienda: `seccion` = grupo chico (ej. "Chilaquiles"),
// `subseccion` = grupo grande (ej. "Desayunos").

export interface MenuModificadorOpcion { id: string; nombre: string; precio_extra: number; }
export interface MenuModificador {
  id: string; nombre: string; obligatorio: boolean; multiple: boolean;
  minimo: number | null; maximo: number | null; opciones: MenuModificadorOpcion[];
}
// Variante = presentación con precio propio (sabor, tamaño, "10 piezas").
// `precio` ya viene resuelto: precio_override de la variante o el base.
export interface MenuVariante { id: string; nombre: string; precio: number; }
export interface MenuProducto {
  id: string; nombre: string; descripcion: string | null; imagen: string | null;
  unidad: string; precio: number; precio_mayoreo: number | null; mayoreo_desde: number | null;
  seccion: string; subseccion: string; modificadores: MenuModificador[];
  // Nombre del grupo de variantes (ej. "Sabor", "Cantidad") y sus opciones.
  opcion_nombre: string | null; variantes: MenuVariante[];
}
export interface MenuGrupo { seccion: string; productos: MenuProducto[]; }
export interface MenuSeccion { subseccion: string; grupos: MenuGrupo[]; }
export interface MenuPuesto {
  id: string; nombre: string; descripcion: string | null; ubicacion: string | null;
  logo: string | null; portada: string | null; color_marca: string | null;
  telefono_contacto: string | null; tipo: string;
  dine_in_activo: boolean; metodos_pago_mesa: string[];
  // Info para el cliente ANTES de armar el carrito (evita sorpresas al final).
  abierto: boolean;            // ¿la tienda está abierta ahora (hora MX)?
  envio_desde: number | null;  // costo de la zona de envío más barata
}
export interface MenuPublico {
  puesto: MenuPuesto; planInfo: InfoPlan; secciones: MenuSeccion[];
}

/** Carga el menú público de una tienda por id o menu_slug. null si no existe,
 *  no está activa/aprobada o tiene el menú apagado. Cacheado por request. */
export const getMenuPublico = cache(async (idOrSlug: string): Promise<MenuPublico | null> => {
  const puesto = await queryOne<{
    id: string; nombre: string; descripcion: string | null; ubicacion: string | null;
    logo: string | null; portada: string | null; color_marca: string | null;
    telefono_contacto: string | null; tipo: string; plan: string;
    suscripcion_hasta: string | null; menu_publico: boolean;
    dine_in_activo: boolean; metodos_pago_mesa: unknown;
  }>(
    `SELECT id, nombre, descripcion, ubicacion, logo, portada, color_marca,
            telefono_contacto, tipo, plan, suscripcion_hasta, menu_publico,
            dine_in_activo, metodos_pago_mesa
     FROM puestos
     WHERE (id = $1 OR menu_slug = $1) AND activo = true AND aprobado = true
     LIMIT 1`,
    [idOrSlug]
  );
  if (!puesto || puesto.menu_publico === false) return null;

  const planInfo = infoPlan(puesto.plan, puesto.suscripcion_hasta);

  const productos = await query<{
    id: string; nombre: string; descripcion: string | null; imagen: string | null;
    unidad: string; precio: string; precio_mayoreo: string | null; mayoreo_desde: string | null;
    seccion: string | null; subseccion: string | null; modificadores: MenuModificador[];
    opcion_nombre: string | null; variantes: { id: string; nombre: string; precio: string }[];
  }>(
    `SELECT p.id, p.nombre, p.descripcion, p.imagen, p.unidad,
            pr.precio, pr.precio_mayoreo, pr.mayoreo_desde,
            p.seccion, COALESCE(p.subseccion, c.nombre) AS subseccion,
            (SELECT po.nombre FROM producto_opciones po WHERE po.producto_id = p.id ORDER BY po.orden LIMIT 1) AS opcion_nombre,
            COALESCE((
              SELECT json_agg(jsonb_build_object('id', pv.id, 'nombre', pv.nombre,
                                                 'precio', COALESCE(pv.precio_override, pr.precio)) ORDER BY pv.orden)
              FROM producto_variantes pv WHERE pv.producto_id = p.id AND pv.activo = true
            ), '[]') AS variantes,
            COALESCE((
              SELECT json_agg(jsonb_build_object(
                'id', pm.id, 'nombre', pm.nombre, 'obligatorio', pm.obligatorio,
                'multiple', pm.multiple, 'maximo', pm.maximo, 'minimo', pm.minimo,
                'opciones', COALESCE((
                  SELECT json_agg(jsonb_build_object('id', mo.id, 'nombre', mo.nombre, 'precio_extra', mo.precio_extra) ORDER BY mo.orden)
                  FROM modificador_opciones mo WHERE mo.modificador_id = pm.id
                ), '[]')
              ) ORDER BY pm.orden)
              FROM producto_modificadores pm WHERE pm.producto_id = p.id
            ), '[]') AS modificadores
     FROM productos p
     JOIN precios pr ON pr.producto_id = p.id AND pr.puesto_id = $1 AND pr.activo = true
     LEFT JOIN categorias c ON c.id = p.categoria_id
     WHERE (p.disponible IS NULL OR p.disponible = true)
       -- Solo mostrar productos cuyo horario incluye la hora actual (hora de
       -- México), o productos sin horarios (siempre disponibles). Así los
       -- productos de comida no aparecen en horario de desayuno, etc.
       AND (
         NOT EXISTS (SELECT 1 FROM producto_horarios WHERE producto_id = p.id)
         OR EXISTS (
           SELECT 1 FROM producto_horarios ph2
           JOIN puesto_horarios h2 ON h2.id = ph2.horario_id
           WHERE ph2.producto_id = p.id
             AND to_char(NOW() AT TIME ZONE 'America/Mexico_City', 'HH24:MI') BETWEEN h2.desde AND h2.hasta
         )
       )
       -- Días de la semana permitidos. Sin filas en producto_dias = todos los días.
       AND (
         NOT EXISTS (SELECT 1 FROM producto_dias WHERE producto_id = p.id)
         OR EXISTS (
           SELECT 1 FROM producto_dias pd2
           WHERE pd2.producto_id = p.id
             AND pd2.dia_semana = EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::int
         )
       )
     ORDER BY COALESCE(p.subseccion, c.nombre) NULLS LAST, p.seccion NULLS LAST, p.nombre`,
    [puesto.id]
  );

  // Agrupar subseccion → seccion → productos, conservando el orden del query.
  const secciones: MenuSeccion[] = [];
  for (const row of productos) {
    const sub = row.subseccion || "Menú";
    const sec = row.seccion || "General";
    let seccionObj = secciones.find((s) => s.subseccion === sub);
    if (!seccionObj) { seccionObj = { subseccion: sub, grupos: [] }; secciones.push(seccionObj); }
    let grupo = seccionObj.grupos.find((g) => g.seccion === sec);
    if (!grupo) { grupo = { seccion: sec, productos: [] }; seccionObj.grupos.push(grupo); }
    grupo.productos.push({
      id: row.id, nombre: row.nombre, descripcion: row.descripcion, imagen: row.imagen,
      unidad: row.unidad, precio: Number(row.precio),
      precio_mayoreo: row.precio_mayoreo != null ? Number(row.precio_mayoreo) : null,
      mayoreo_desde: row.mayoreo_desde != null ? Number(row.mayoreo_desde) : null,
      seccion: sec, subseccion: sub,
      modificadores: (row.modificadores || []).map((m) => ({
        ...m,
        opciones: (m.opciones || []).map((o) => ({ ...o, precio_extra: Number(o.precio_extra) })),
      })),
      opcion_nombre: row.opcion_nombre,
      variantes: (row.variantes || []).map((v) => ({ ...v, precio: Number(v.precio) })),
    });
  }

  // ¿Abierta ahora? Misma lógica que la validación al cobrar (disponibilidad.ts):
  // si la tienda no configuró horario_atencion, se considera abierta.
  const abiertoRow = await queryOne<{ abierto: boolean }>(
    `SELECT (
       NOT EXISTS (SELECT 1 FROM puesto_horario_atencion WHERE puesto_id = $1)
       OR EXISTS (
         SELECT 1 FROM puesto_horario_atencion pha
         CROSS JOIN (SELECT EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::int AS dow,
                            to_char(NOW() AT TIME ZONE 'America/Mexico_City','HH24:MI') AS hhmm) a
         WHERE pha.puesto_id = $1 AND pha.abre IS NOT NULL AND pha.cierra IS NOT NULL
           AND (
             (pha.abre <= pha.cierra AND pha.dia_semana = a.dow AND a.hhmm BETWEEN pha.abre AND pha.cierra)
             OR (pha.abre > pha.cierra AND (
                  (pha.dia_semana = a.dow AND a.hhmm >= pha.abre)
                  OR (pha.dia_semana = ((a.dow + 6) % 7) AND a.hhmm <= pha.cierra)))
           )
           AND NOT (pha.descanso_desde IS NOT NULL AND pha.descanso_hasta IS NOT NULL
                    AND a.hhmm BETWEEN pha.descanso_desde AND pha.descanso_hasta)
       )
     ) AS abierto`,
    [puesto.id]
  );
  const envioRow = await queryOne<{ min: string | null }>(
    "SELECT MIN(costo_envio) AS min FROM zonas_entrega WHERE activa = true"
  );

  let metodos: string[] = ["caja"];
  try {
    const raw = puesto.metodos_pago_mesa;
    if (Array.isArray(raw)) metodos = raw as string[];
    else if (typeof raw === "string") metodos = JSON.parse(raw);
  } catch { /* default */ }

  return {
    puesto: {
      id: puesto.id, nombre: puesto.nombre, descripcion: puesto.descripcion,
      ubicacion: puesto.ubicacion, logo: puesto.logo, portada: puesto.portada,
      // El teléfono del negocio SÍ va al cliente: con delivery apagado, el
      // pedido del menú sale por WhatsApp directo al negocio. Mientras
      // Mercadito operaba entregas se ocultaba a propósito, para canalizar
      // las compras por el carrito (ver DELIVERY_ACTIVO en lib/flags).
      color_marca: puesto.color_marca,
      telefono_contacto: DELIVERY_ACTIVO ? null : puesto.telefono_contacto,
      tipo: puesto.tipo, dine_in_activo: !!puesto.dine_in_activo, metodos_pago_mesa: metodos,
      abierto: abiertoRow?.abierto ?? true,
      envio_desde: envioRow?.min != null ? Number(envioRow.min) : null,
    },
    planInfo,
    secciones,
  };
});
