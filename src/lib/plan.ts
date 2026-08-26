// Estado del plan de un negocio de servicios (citas).
//
// Modelo: prueba gratis → después suscripción Pro (económica, sin comisiones).
// `suscripcion_hasta` marca hasta cuándo tiene ACCESO (sirve tanto para la
// prueba como para el Pro pagado). `plan='pro'` solo cambia la etiqueta (y cómo
// se renovó). Si `suscripcion_hasta` ya pasó → vencido (se bloquea crear citas
// hasta que el admin reactive tras el pago por WhatsApp).

/** Duración de la prueba gratis. Bajó de 90 a 60 días (agosto 2026): tres meses
 *  daban tiempo de sobra para olvidarse del producto antes de decidir, y el
 *  negocio que sí lo usa se convence en las primeras semanas. */
export const TRIAL_DIAS = 60;

/** Cómo se dice la prueba en la interfaz. "2 meses" se lee más corto y más
 *  generoso que "60 días", y no obliga a nadie a hacer la división mental.
 *  Todo texto visible usa esto; TRIAL_DIAS es solo para la aritmética. */
export const TRIAL_TXT = "2 meses";

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
