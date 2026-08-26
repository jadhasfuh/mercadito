import { cache } from "react";
import { query, queryOne } from "@/lib/db";
import { infoPlan, type InfoPlan } from "@/lib/plan";
import { DELIVERY_ACTIVO } from "@/lib/flags";
import { precioVigenteSQL, precioAntesSQL, promoEtiquetaSQL } from "@/lib/precioPromo";

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
  /** Precio de lista cuando hay una promo corriendo — para tacharlo. null =
   *  sin promo (nunca se pinta un tachado falso). */
  precio_antes: number | null;
  /** Etiqueta de la promo activa ("Martes de tacos"). null = sin promo. */
  promo_etiqueta: string | null;
  seccion: string; subseccion: string; modificadores: MenuModificador[];
  // Nombre del grupo de variantes (ej. "Sabor", "Cantidad") y sus opciones.
  opcion_nombre: string | null; variantes: MenuVariante[];
  // Cuántos pedidos del menú lo incluyeron (tabla menu_ventas). Alimenta la
  // sección "Más vendidos"; 0 = nunca se ha pedido desde aquí.
  vendidos: number;
}
export interface MenuGrupo { seccion: string; productos: MenuProducto[]; }
export interface MenuSeccion { subseccion: string; grupos: MenuGrupo[]; }
export interface MenuHorarioDia {
  dia_semana: number;            // 0 = domingo
  abre: string | null;           // "HH:MM"
  cierra: string | null;
  descanso_desde: string | null;
  descanso_hasta: string | null;
}
export interface MenuPuesto {
  id: string; nombre: string; descripcion: string | null; ubicacion: string | null;
  logo: string | null; portada: string | null; color_marca: string | null;
  telefono_contacto: string | null; tipo: string;
  dine_in_activo: boolean; metodos_pago_mesa: string[];
  // Info para el cliente ANTES de armar el carrito (evita sorpresas al final).
  abierto: boolean;            // ¿la tienda está abierta ahora (hora MX)?
  envio_desde: number | null;  // costo de la zona de envío más barata
  // ── Ficha del negocio ────────────────────────────────────────────────
  // Lo que el cliente preguntaba por WhatsApp antes de pedir: a qué hora
  // abren, dónde están, si aceptan tarjeta y si hay para llevar.
  lat: number | null; lng: number | null; ciudad: string | null;
  horario: MenuHorarioDia[];       // vacío = sin horario configurado (siempre abierto)
  metodos_pago: string[];          // 'efectivo' | 'tarjeta' | 'transferencia'
  servicios_pedido: string[] | null; // 'local' | 'llevar' | 'domicilio'; null = sin configurar
}
export interface MenuPublico {
  puesto: MenuPuesto; planInfo: InfoPlan; secciones: MenuSeccion[];
}

/**
 * Suma las líneas de un pedido al "más vendidos" del menú (tabla menu_ventas).
 *
 * Es un contador PROPIO, no derivado de pedido_items: sin delivery el pedido
 * sale por WhatsApp y nunca pasa por la plataforma, así que un top calculado
 * desde pedido_items saldría vacío en casi todos los negocios. Aquí entran las
 * dos fuentes que sí tenemos: el beacon del menú (web y app) y las comandas de
 * mesa. `pedidos` = cuántos pedidos lo incluyeron — una compra de 10 tortas no
 * corona al producto por sí sola.
 *
 * Silencioso ante datos basura y ante fallos: esto es telemetría y nunca debe
 * romper el pedido del cliente. `puestoId` tiene que ser el id real (no slug).
 */
export async function registrarVentasMenu(
  puestoId: string,
  items: { producto_id?: unknown; cantidad?: unknown }[]
): Promise<void> {
  // Agrupamos por producto antes de escribir: un mismo platillo puede venir en
  // varias líneas (distintas variantes) y debe contar como UN pedido suyo.
  const porProducto = new Map<string, number>();
  for (const it of items.slice(0, 200)) {
    const id = typeof it?.producto_id === "string" ? it.producto_id : null;
    const cant = Number(it?.cantidad);
    if (!id || !Number.isFinite(cant) || cant <= 0) continue;
    // Tope defensivo: el beacon del menú es público y sin sesión, así que nadie
    // puede inflar el top con un solo POST de cantidad absurda.
    porProducto.set(id, (porProducto.get(id) ?? 0) + Math.min(cant, 500));
  }

  for (const [productoId, cantidad] of porProducto) {
    await query(
      `INSERT INTO menu_ventas (puesto_id, producto_id, cantidad, pedidos, ultimo_at)
       SELECT $1, $2, $3, 1, NOW()
       WHERE EXISTS (SELECT 1 FROM productos WHERE id = $2)
       ON CONFLICT (puesto_id, producto_id) DO UPDATE
         SET cantidad = menu_ventas.cantidad + EXCLUDED.cantidad,
             pedidos = menu_ventas.pedidos + 1,
             ultimo_at = NOW()`,
      [puestoId, productoId, cantidad]
    ).catch(() => {});
  }
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
    lat: number | null; lng: number | null; ciudad: string | null;
    metodos_pago: unknown; servicios_pedido: unknown;
  }>(
    `SELECT id, nombre, descripcion, ubicacion, logo, portada, color_marca,
            telefono_contacto, tipo, plan, suscripcion_hasta, menu_publico,
            dine_in_activo, metodos_pago_mesa, lat, lng, ciudad,
            metodos_pago, servicios_pedido
     FROM puestos
     WHERE (id = $1 OR menu_slug = $1) AND activo = true AND aprobado = true
     LIMIT 1`,
    [idOrSlug]
  );
  if (!puesto || puesto.menu_publico === false) return null;

  const planInfo = infoPlan(puesto.plan, puesto.suscripcion_hasta);

  const productos = await query<{
    id: string; nombre: string; descripcion: string | null; imagen: string | null;
    unidad: string; precio: string; precio_antes: string | null; promo_etiqueta: string | null;
    precio_mayoreo: string | null; mayoreo_desde: string | null;
    seccion: string | null; subseccion: string | null; modificadores: MenuModificador[];
    opcion_nombre: string | null; variantes: { id: string; nombre: string; precio: string }[];
  }>(
    `SELECT p.id, p.nombre, p.descripcion, p.imagen, p.unidad,
            ${precioVigenteSQL("pr")} AS precio,
            ${precioAntesSQL("pr")} AS precio_antes,
            ${promoEtiquetaSQL("pr")} AS promo_etiqueta,
            pr.precio_mayoreo, pr.mayoreo_desde,
            p.seccion, COALESCE(p.subseccion, c.nombre) AS subseccion,
            (SELECT po.nombre FROM producto_opciones po WHERE po.producto_id = p.id ORDER BY po.orden LIMIT 1) AS opcion_nombre,
            COALESCE((
              SELECT json_agg(jsonb_build_object('id', pv.id, 'nombre', pv.nombre,
                                                 'precio', COALESCE(pv.precio_override, ${precioVigenteSQL("pr")})) ORDER BY pv.orden)
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

  // "Más vendidos": query aparte y tolerante a fallo, NO un JOIN en el query de
  // arriba. Es un contador accesorio; si la tabla no existiera (migración que no
  // corrió en una DB) un JOIN reventaría el menú entero de todos los negocios.
  const ventas = await query<{ producto_id: string; pedidos: number }>(
    "SELECT producto_id, pedidos FROM menu_ventas WHERE puesto_id = $1",
    [puesto.id]
  ).catch(() => [] as { producto_id: string; pedidos: number }[]);
  const vendidosDe = new Map(ventas.map((v) => [v.producto_id, Number(v.pedidos) || 0]));

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
      precio_antes: row.precio_antes != null ? Number(row.precio_antes) : null,
      promo_etiqueta: row.promo_etiqueta,
      precio_mayoreo: row.precio_mayoreo != null ? Number(row.precio_mayoreo) : null,
      mayoreo_desde: row.mayoreo_desde != null ? Number(row.mayoreo_desde) : null,
      seccion: sec, subseccion: sub,
      modificadores: (row.modificadores || []).map((m) => ({
        ...m,
        opciones: (m.opciones || []).map((o) => ({ ...o, precio_extra: Number(o.precio_extra) })),
      })),
      opcion_nombre: row.opcion_nombre,
      variantes: (row.variantes || []).map((v) => ({ ...v, precio: Number(v.precio) })),
      vendidos: vendidosDe.get(row.id) ?? 0,
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

  // Horario de la semana para la ficha del negocio. Sin filas = el negocio no
  // lo configuró; la ficha lo dice ("siempre abierto") en vez de inventar.
  const horario = await query<{
    dia_semana: number; abre: string | null; cierra: string | null;
    descanso_desde: string | null; descanso_hasta: string | null;
  }>(
    `SELECT dia_semana, abre, cierra, descanso_desde, descanso_hasta
     FROM puesto_horario_atencion WHERE puesto_id = $1 ORDER BY dia_semana`,
    [puesto.id]
  ).catch(() => []);

  // Las columnas JSONB llegan como array desde pg, pero en DBs viejas pueden
  // venir como string; parseamos defensivamente en los tres casos.
  const comoArray = (raw: unknown): string[] | null => {
    if (Array.isArray(raw)) return raw as string[];
    if (typeof raw === "string") {
      try { const v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch { return null; }
    }
    return null;
  };
  const metodos: string[] = comoArray(puesto.metodos_pago_mesa) ?? ["caja"];
  const metodosPago: string[] = comoArray(puesto.metodos_pago) ?? ["efectivo"];
  const serviciosPedido = comoArray(puesto.servicios_pedido);

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
      lat: puesto.lat != null ? Number(puesto.lat) : null,
      lng: puesto.lng != null ? Number(puesto.lng) : null,
      ciudad: puesto.ciudad,
      horario: horario.map((h) => ({
        dia_semana: Number(h.dia_semana),
        abre: h.abre, cierra: h.cierra,
        descanso_desde: h.descanso_desde, descanso_hasta: h.descanso_hasta,
      })),
      metodos_pago: metodosPago,
      servicios_pedido: serviciosPedido,
    },
    planInfo,
    secciones,
  };
});
