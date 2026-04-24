// Comision escalonada por porcentaje segun rango de precio.
// Mismo algoritmo que el backend (src/lib/comision.ts).
// El backend recalcula server-side al crear el pedido, así que si este
// archivo quedara desfasado en una APK vieja, el cliente vería la comisión
// vieja en el preview pero se cobraría la correcta — nunca al revés.

// Promoción de lanzamiento: primer tramo (≤$50) al 5% en vez de 10%.
// Auto-expira al pasar la fecha. Mantener sincronizado con backend.
const PROMO_PRIMER_TRAMO = {
  desde: "2026-04-24",
  hasta: "2026-05-24",
  porcentaje: 0.05,
};

function hoyEnMX(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function promoPrimerTramoActiva(): boolean {
  const hoy = hoyEnMX();
  return hoy >= PROMO_PRIMER_TRAMO.desde && hoy <= PROMO_PRIMER_TRAMO.hasta;
}

export function calcularComision(precioBase: number): number {
  let porcentaje: number;
  if (precioBase <= 50) porcentaje = promoPrimerTramoActiva() ? PROMO_PRIMER_TRAMO.porcentaje : 0.10;
  else if (precioBase <= 200) porcentaje = 0.08;
  else if (precioBase <= 500) porcentaje = 0.06;
  else porcentaje = 0.05;

  const comision = precioBase * porcentaje;
  return Math.round(Math.max(1, Math.min(50, comision)));
}
