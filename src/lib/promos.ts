// Configuración de promociones por temporada. Se mantiene la lógica activa
// detrás de un flag para poder reactivarla sin reescribirla cuando termina
// el rango de fechas.

import { queryOne } from "@/lib/db";

export interface PromoEnvioGratis {
  activa: boolean;
  /** Fecha (inclusiva) desde la que aplica. ISO con offset MX. */
  inicia: string;
  /** Fecha (inclusiva) hasta la que aplica. */
  termina: string;
  /** Cada cuántos entregados se regala el siguiente envío. 3 = el 4to es gratis. */
  cada: number;
}

export const PROMO_ENVIO_GRATIS: PromoEnvioGratis = {
  activa: true,
  inicia: "2026-05-01T00:00:00-06:00",
  termina: "2026-05-31T23:59:59-06:00",
  cada: 3,
};

/** ¿La promo está vigente en `at`? Activa + dentro del rango de fechas. */
export function promoEnvioGratisActiva(at: Date = new Date()): boolean {
  if (!PROMO_ENVIO_GRATIS.activa) return false;
  const t = at.getTime();
  return t >= new Date(PROMO_ENVIO_GRATIS.inicia).getTime()
    && t <= new Date(PROMO_ENVIO_GRATIS.termina).getTime();
}

export type EstadoPromo = "vigente" | "proximamente" | "expirada" | "off";

/**
 * Estado completo de la promo. "proximamente" si arranca en los próximos
 * 7 días — útil para mostrar el banner anticipado y crear expectativa.
 */
export function estadoPromoEnvioGratis(at: Date = new Date()): EstadoPromo {
  if (!PROMO_ENVIO_GRATIS.activa) return "off";
  const t = at.getTime();
  const ini = new Date(PROMO_ENVIO_GRATIS.inicia).getTime();
  const fin = new Date(PROMO_ENVIO_GRATIS.termina).getTime();
  if (t < ini) return ini - t <= 7 * 24 * 3600 * 1000 ? "proximamente" : "off";
  if (t > fin) return "expirada";
  return "vigente";
}

/**
 * Dado el conteo de pedidos entregados previos, ¿el siguiente pedido aplica
 * para envío gratis? Regla: cada `cada` entregados → el próximo es gratis.
 * Ejemplo con cada=3: tras 3, 6, 9... entregados → siguiente gratis.
 */
export function siguienteEnvioGratis(entregadosPrevios: number, cfg: PromoEnvioGratis = PROMO_ENVIO_GRATIS): boolean {
  if (!cfg.activa) return false;
  if (entregadosPrevios <= 0) return false;
  return entregadosPrevios % cfg.cada === 0;
}

/** Cuenta pedidos entregados (no cancelados) de un cliente por teléfono. */
export async function contarEntregadosCliente(telefono: string): Promise<number> {
  const tel = telefono.replace(/\D/g, "");
  if (!tel) return 0;
  const row = await queryOne<{ n: string | number }>(
    `SELECT COUNT(*) AS n FROM pedidos
     WHERE cliente_telefono = $1 AND estado = 'entregado'`,
    [tel]
  );
  return row ? Number(row.n) : 0;
}
