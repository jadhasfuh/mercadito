// Espejo mobile de src/lib/variantes.ts — mismas reglas de precio efectivo,
// clave de carrito y validación de selección.

export interface ProductoOpcionValor {
  id: string;
  opcion_id: string;
  valor: string;
  precio_extra: number;
  orden: number;
}

export interface ProductoOpcion {
  id: string;
  producto_id: string;
  nombre: string;
  orden: number;
  valores: ProductoOpcionValor[];
}

export interface ProductoVariante {
  id: string;
  producto_id: string;
  nombre: string;
  precio_override: number | null;
  precio_mayoreo_override: number | null;
  mayoreo_desde_override: number | null;
  activo: boolean;
  orden: number;
  valor_ids: string[];
}

export interface ModificadorOpcion {
  id: string;
  modificador_id: string;
  nombre: string;
  precio_extra: number;
  orden: number;
}

export interface ProductoModificador {
  id: string;
  producto_id: string;
  nombre: string;
  obligatorio: boolean;
  multiple: boolean;
  maximo: number | null;
  minimo?: number | null;
  orden: number;
  opciones: ModificadorOpcion[];
}

export interface SeleccionModificador {
  modificador_id: string;
  modificador_nombre: string;
  opcion_id: string;
  opcion_nombre: string;
  precio_extra: number;
}

export interface PrecioBase {
  precio: number;
  precio_mayoreo: number | null;
  mayoreo_desde: number | null;
}

export function calcularPrecioEfectivo(
  base: PrecioBase,
  variante: ProductoVariante | null,
  modificadores: SeleccionModificador[],
  cantidad: number,
  valoresExtras: number = 0
): {
  precio_unitario: number;
  precio_base_unitario: number;
  extras_modificadores: number;
  extras_valores: number;
  aplica_mayoreo: boolean;
} {
  const precioBase = variante?.precio_override ?? base.precio;
  const precioMay = variante?.precio_mayoreo_override ?? base.precio_mayoreo;
  const mayDesde = variante?.mayoreo_desde_override ?? base.mayoreo_desde;
  const aplicaMayoreo = precioMay != null && mayDesde != null && cantidad >= mayDesde;
  const precioSinExtras = aplicaMayoreo ? (precioMay as number) : precioBase;
  const extrasMods = modificadores.reduce((s, m) => s + (Number(m.precio_extra) || 0), 0);
  const extrasVals = Number(valoresExtras) || 0;
  return {
    precio_unitario: precioSinExtras + extrasVals + extrasMods,
    precio_base_unitario: precioBase + extrasVals + extrasMods,
    extras_modificadores: extrasMods,
    extras_valores: extrasVals,
    aplica_mayoreo: aplicaMayoreo,
  };
}

export function sumarExtrasDeVariante(
  opciones: ProductoOpcion[],
  variante: ProductoVariante | null
): number {
  if (!variante) return 0;
  const ids = new Set(variante.valor_ids);
  let total = 0;
  for (const op of opciones) {
    for (const v of op.valores) {
      if (ids.has(v.id)) total += Number(v.precio_extra) || 0;
    }
  }
  return total;
}

export function claveItemCarrito(
  producto_id: string,
  puesto_id: string,
  variante_id: string | null,
  modificadores: SeleccionModificador[]
): string {
  const modsKey = modificadores
    .map((m) => m.opcion_id)
    .slice()
    .sort()
    .join(",");
  return `${producto_id}|${puesto_id}|${variante_id ?? ""}|${modsKey}`;
}

export function validarSeleccion(
  modificadoresDefinidos: ProductoModificador[],
  seleccion: SeleccionModificador[]
): string | null {
  for (const m of modificadoresDefinidos) {
    const elegidas = seleccion.filter((s) => s.modificador_id === m.id);
    const min = m.minimo ?? null;
    const max = m.maximo ?? null;
    if (m.obligatorio && elegidas.length === 0) {
      return `Elige al menos una opción en "${m.nombre}"`;
    }
    if (!m.multiple && elegidas.length > 1) {
      return `Solo puedes elegir una opción en "${m.nombre}"`;
    }
    if (m.multiple && max != null && elegidas.length > max) {
      return `Máximo ${max} opciones en "${m.nombre}"`;
    }
    if (m.multiple && min != null && elegidas.length < min) {
      if (max === min) return `Elige exactamente ${min} opciones en "${m.nombre}"`;
      return `Elige al menos ${min} opciones en "${m.nombre}"`;
    }
  }
  return null;
}

export function resumenSeleccion(
  varianteNombre: string | null,
  modificadores: SeleccionModificador[]
): string {
  const partes: string[] = [];
  if (varianteNombre) partes.push(varianteNombre);
  const porGrupo = new Map<string, string[]>();
  for (const m of modificadores) {
    if (!porGrupo.has(m.modificador_nombre)) porGrupo.set(m.modificador_nombre, []);
    porGrupo.get(m.modificador_nombre)!.push(m.opcion_nombre);
  }
  for (const [nombre, valores] of porGrupo) {
    partes.push(`${nombre}: ${valores.join(", ")}`);
  }
  return partes.join(" · ");
}
