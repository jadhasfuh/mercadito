/**
 * Calcula el precio unitario aplicable segun la cantidad.
 * Si la cantidad alcanza `mayoreo_desde` y hay un `precio_mayoreo` configurado,
 * se aplica el mayoreo. Si no, se usa el precio normal.
 */
export function precioEfectivo(
  precio: { precio: number; precio_mayoreo?: number | null; mayoreo_desde?: number | null },
  cantidad: number
): number {
  const pm = precio.precio_mayoreo;
  const md = precio.mayoreo_desde;
  if (pm != null && md != null && cantidad >= md) {
    return Number(pm);
  }
  return Number(precio.precio);
}

/** Devuelve true si esta combinación de precio+cantidad está usando mayoreo. */
export function usaMayoreo(
  precio: { precio_mayoreo?: number | null; mayoreo_desde?: number | null },
  cantidad: number
): boolean {
  return precio.precio_mayoreo != null &&
    precio.mayoreo_desde != null &&
    cantidad >= Number(precio.mayoreo_desde);
}
