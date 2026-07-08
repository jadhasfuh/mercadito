// Precio AUTORITATIVO del servidor para items de un pedido.
//
// Seguridad: al crear un pedido, NUNCA confiamos en el precio_unitario ni la
// comisión que manda el cliente — los recalculamos aquí desde la BD. Refleja la
// misma lógica que src/lib/variantes.ts (calcularPrecioEfectivo), que es la
// fuente de verdad que usan web y móvil:
//   precio = (override_variante ?? precio_base)   [o su mayoreo]
//          + Σ precio_extra de los valores de la variante
//          + Σ precio_extra de los modificadores elegidos
// Verificado contra pedidos reales: reproduce el precio congelado en 77/77
// items sin deriva de catálogo (los demás cambiaron de precio después).
import { query } from "@/lib/db";

export interface ItemPrecioEntrada {
  producto_id?: string | null;
  puesto_id: string;
  cantidad: number;
  variante_id?: string | null;
  modificadores?: Array<{ opcion_id?: string | null }> | null;
}

/**
 * Devuelve, en el mismo orden que `items`, el precio unitario autoritativo de
 * cada item. `null` si el item no tiene producto de catálogo o no tiene precio
 * activo en ese puesto (el caller debe rechazarlo).
 */
export async function preciosAutoritativos(items: ItemPrecioEntrada[]): Promise<(number | null)[]> {
  if (items.length === 0) return [];

  const productoIds = Array.from(new Set(items.map((i) => i.producto_id).filter(Boolean) as string[]));
  const puestoIds = Array.from(new Set(items.map((i) => i.puesto_id).filter(Boolean)));
  const varianteIds = Array.from(new Set(items.map((i) => i.variante_id).filter(Boolean) as string[]));
  const opcionIds = Array.from(new Set(
    items.flatMap((i) => (i.modificadores ?? []).map((m) => m?.opcion_id).filter(Boolean) as string[])
  ));

  // Precios base activos por (producto, puesto).
  const precios = productoIds.length && puestoIds.length
    ? await query<{ producto_id: string; puesto_id: string; precio: string; precio_mayoreo: string | null; mayoreo_desde: string | null }>(
        `SELECT producto_id, puesto_id, precio, precio_mayoreo, mayoreo_desde
         FROM precios WHERE activo = true AND producto_id = ANY($1) AND puesto_id = ANY($2)`,
        [productoIds, puestoIds]
      )
    : [];
  const precioMap = new Map(precios.map((p) => [`${p.producto_id}|${p.puesto_id}`, p]));

  // Variantes (overrides de precio/mayoreo).
  const variantes = varianteIds.length
    ? await query<{ id: string; producto_id: string; precio_override: string | null; precio_mayoreo_override: string | null; mayoreo_desde_override: string | null }>(
        `SELECT id, producto_id, precio_override, precio_mayoreo_override, mayoreo_desde_override
         FROM producto_variantes WHERE id = ANY($1) AND activo = true`,
        [varianteIds]
      )
    : [];
  const varMap = new Map(variantes.map((v) => [v.id, v]));

  // Suma de precio_extra de los valores de cada variante.
  const valoresExtra = varianteIds.length
    ? await query<{ variante_id: string; ext: string }>(
        `SELECT vv.variante_id, COALESCE(SUM(pov.precio_extra), 0) AS ext
         FROM variante_valores vv
         JOIN producto_opcion_valores pov ON pov.id = vv.valor_id
         WHERE vv.variante_id = ANY($1)
         GROUP BY vv.variante_id`,
        [varianteIds]
      )
    : [];
  const valExtraMap = new Map(valoresExtra.map((r) => [r.variante_id, Number(r.ext)]));

  // precio_extra de cada opción de modificador elegida (por id).
  const modOpciones = opcionIds.length
    ? await query<{ id: string; precio_extra: string }>(
        `SELECT id, precio_extra FROM modificador_opciones WHERE id = ANY($1)`,
        [opcionIds]
      )
    : [];
  const modMap = new Map(modOpciones.map((m) => [m.id, Number(m.precio_extra)]));

  return items.map((item) => {
    if (!item.producto_id) return null;
    const base = precioMap.get(`${item.producto_id}|${item.puesto_id}`);
    if (!base) return null; // sin precio activo → item inválido

    const variante = item.variante_id ? varMap.get(item.variante_id) : undefined;
    const precioBase = variante?.precio_override != null ? Number(variante.precio_override) : Number(base.precio);
    const precioMay = variante?.precio_mayoreo_override != null
      ? Number(variante.precio_mayoreo_override)
      : (base.precio_mayoreo != null ? Number(base.precio_mayoreo) : null);
    const mayDesde = variante?.mayoreo_desde_override != null
      ? Number(variante.mayoreo_desde_override)
      : (base.mayoreo_desde != null ? Number(base.mayoreo_desde) : null);

    const cantidad = Number(item.cantidad) || 0;
    const aplicaMayoreo = precioMay != null && mayDesde != null && cantidad >= mayDesde;
    const precioSinExtras = aplicaMayoreo ? precioMay : precioBase;

    const extrasValores = item.variante_id ? (valExtraMap.get(item.variante_id) ?? 0) : 0;
    const extrasMods = (item.modificadores ?? []).reduce(
      (s, m) => s + (m?.opcion_id ? (modMap.get(m.opcion_id) ?? 0) : 0),
      0
    );

    return precioSinExtras + extrasValores + extrasMods;
  });
}
