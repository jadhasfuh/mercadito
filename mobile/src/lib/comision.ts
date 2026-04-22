// Comision escalonada por porcentaje segun rango de precio.
// Mismo algoritmo que el backend (src/lib/comision.ts).

export function calcularComision(precioBase: number): number {
  let porcentaje: number;
  if (precioBase <= 50) porcentaje = 0.10;
  else if (precioBase <= 200) porcentaje = 0.08;
  else if (precioBase <= 500) porcentaje = 0.06;
  else porcentaje = 0.05;

  const comision = precioBase * porcentaje;
  return Math.round(Math.max(1, Math.min(50, comision)));
}
