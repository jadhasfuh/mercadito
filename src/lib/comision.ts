// Comision escalonada por porcentaje segun rango de precio
// El cliente ve precio + comision. La tienda ve su precio original.

/** Calcula la comision para un precio base dado */
export function calcularComision(precioBase: number): number {
  let porcentaje: number;
  if (precioBase <= 50) {
    porcentaje = 0.10;      // 10% para productos hasta $50
  } else if (precioBase <= 200) {
    porcentaje = 0.08;      // 8% de $51 a $200
  } else if (precioBase <= 500) {
    porcentaje = 0.06;      // 6% de $201 a $500
  } else {
    porcentaje = 0.05;      // 5% arriba de $500
  }

  const comision = precioBase * porcentaje;

  // Minimo $1, maximo $50
  const comisionFinal = Math.max(1, Math.min(50, comision));

  // Redondear al peso mas cercano
  return Math.round(comisionFinal);
}

/** Precio que ve el cliente = precio_tienda + comision */
export function precioCliente(precioBase: number): number {
  return precioBase + calcularComision(precioBase);
}

// Legacy export for backwards compatibility during transition
export const COMISION_POR_UNIDAD = 2;
