// Comision escalonada por porcentaje segun rango de precio
// El cliente ve precio + comision. La tienda ve su precio original.

// Promoción de lanzamiento: primer tramo (≤$50) al 5% en vez de 10%
// para atraer clientes nuevos que compran productos chicos (tortillas,
// fruta, pan). Los demás tramos no cambian. Auto-expira al pasar la
// fecha — sin redeploy. La comparación usa fecha en zona MX porque los
// contenedores corren UTC y sin TZ explícito un cliente pidiendo a las
// 20:00 locales del último día vería la promo ya expirada.
const PROMO_PRIMER_TRAMO = {
  desde: "2026-04-24",
  hasta: "2026-05-24",
  porcentaje: 0.05, // normalmente 0.10
};

function hoyEnMX(): string {
  // en-CA formatea "YYYY-MM-DD", que comparable con string sort.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function promoPrimerTramoActiva(): boolean {
  const hoy = hoyEnMX();
  return hoy >= PROMO_PRIMER_TRAMO.desde && hoy <= PROMO_PRIMER_TRAMO.hasta;
}

/** Calcula la comision para un precio base dado */
export function calcularComision(precioBase: number): number {
  let porcentaje: number;
  if (precioBase <= 50) {
    porcentaje = promoPrimerTramoActiva() ? PROMO_PRIMER_TRAMO.porcentaje : 0.10;
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
