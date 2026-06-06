import { cache } from "react";
import { query, queryOne } from "@/lib/db";
import { infoPlan, type InfoPlan } from "@/lib/plan";

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
export interface MenuProducto {
  id: string; nombre: string; descripcion: string | null; imagen: string | null;
  unidad: string; precio: number; precio_mayoreo: number | null; mayoreo_desde: number | null;
  seccion: string; subseccion: string; modificadores: MenuModificador[];
}
export interface MenuGrupo { seccion: string; productos: MenuProducto[]; }
export interface MenuSeccion { subseccion: string; grupos: MenuGrupo[]; }
export interface MenuPuesto {
  id: string; nombre: string; descripcion: string | null; ubicacion: string | null;
  logo: string | null; portada: string | null; color_marca: string | null;
  telefono_contacto: string | null; tipo: string;
  dine_in_activo: boolean; metodos_pago_mesa: string[];
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
  }>(
    `SELECT p.id, p.nombre, p.descripcion, p.imagen, p.unidad,
            pr.precio, pr.precio_mayoreo, pr.mayoreo_desde,
            p.seccion, COALESCE(p.subseccion, c.nombre) AS subseccion,
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
    });
  }

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
      color_marca: puesto.color_marca, telefono_contacto: puesto.telefono_contacto,
      tipo: puesto.tipo, dine_in_activo: !!puesto.dine_in_activo, metodos_pago_mesa: metodos,
    },
    planInfo,
    secciones,
  };
});
