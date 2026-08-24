// Estado del plan de un negocio de servicios (citas).
//
// Modelo: prueba gratis de 30 días → después suscripción Pro (económica, sin
// comisiones). `suscripcion_hasta` marca hasta cuándo tiene ACCESO (sirve tanto
// para la prueba como para el Pro pagado). `plan='pro'` solo cambia la etiqueta
// (y cómo se renovó). Si `suscripcion_hasta` ya pasó → vencido (se bloquea
// crear citas hasta que el admin reactive tras el pago por WhatsApp).

export const TRIAL_DIAS = 90;

/** Cuota mensual una vez pasada la prueba. Cubre infraestructura (Railway +
 *  Supabase), no busca margen: el objetivo es que al negocio le salga más
 *  barato que no tenerlo. Sin comisiones por venta ni por reserva. */
export const PRECIO_MENSUAL = 49;
export const PRECIO_MENSUAL_TXT = `$${PRECIO_MENSUAL}`;

export type EstadoPlan = "trial" | "pro" | "vencido";

export interface InfoPlan {
  estado: EstadoPlan;
  acceso: boolean; // puede crear/recibir citas
  dias_restantes: number; // días hasta vencer (0 si ya venció)
  hasta: string | null; // ISO de suscripcion_hasta
}

export function infoPlan(
  plan: string | null,
  suscripcionHasta: string | Date | null,
  ahora: Date = new Date()
): InfoPlan {
  const hasta = suscripcionHasta ? new Date(suscripcionHasta) : null;
  const acceso = hasta ? hasta.getTime() > ahora.getTime() : false;
  const dias = hasta ? Math.max(0, Math.ceil((hasta.getTime() - ahora.getTime()) / 86_400_000)) : 0;
  const estado: EstadoPlan = !acceso ? "vencido" : plan === "pro" ? "pro" : "trial";
  return { estado, acceso, dias_restantes: dias, hasta: hasta ? hasta.toISOString() : null };
}
