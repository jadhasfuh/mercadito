import { queryOne } from "@/lib/db";
import { infoPlan, type InfoPlan } from "@/lib/plan";

export interface MesaResuelta {
  mesa: { id: string; puesto_id: string; etiqueta: string; token: string; activa: boolean };
  puesto: { id: string; nombre: string; dine_in_activo: boolean; metodos_pago_mesa: string[] };
  planInfo: InfoPlan;
}

/** Resuelve una mesa por su token (el de la URL del QR) + su tienda + plan.
 *  null si no existe o la mesa está inactiva. */
export async function resolverMesa(token: string): Promise<MesaResuelta | null> {
  const row = await queryOne<{
    id: string; puesto_id: string; etiqueta: string; token: string; activa: boolean;
    p_nombre: string; dine_in_activo: boolean; metodos_pago_mesa: unknown;
    plan: string; suscripcion_hasta: string | null; p_activo: boolean; p_aprobado: boolean;
  }>(
    `SELECT m.id, m.puesto_id, m.etiqueta, m.token, m.activa,
            p.nombre AS p_nombre, p.dine_in_activo, p.metodos_pago_mesa,
            p.plan, p.suscripcion_hasta, p.activo AS p_activo, p.aprobado AS p_aprobado
     FROM mesas m JOIN puestos p ON p.id = m.puesto_id
     WHERE m.token = $1`,
    [token]
  );
  if (!row || !row.activa || !row.p_activo || !row.p_aprobado) return null;
  let metodos: string[] = ["caja"];
  try {
    if (Array.isArray(row.metodos_pago_mesa)) metodos = row.metodos_pago_mesa as string[];
    else if (typeof row.metodos_pago_mesa === "string") metodos = JSON.parse(row.metodos_pago_mesa);
  } catch { /* default */ }
  return {
    mesa: { id: row.id, puesto_id: row.puesto_id, etiqueta: row.etiqueta, token: row.token, activa: row.activa },
    puesto: { id: row.puesto_id, nombre: row.p_nombre, dine_in_activo: !!row.dine_in_activo, metodos_pago_mesa: metodos },
    planInfo: infoPlan(row.plan, row.suscripcion_hasta),
  };
}

/** Gating: dine-in requiere que la tienda lo tenga activo y plan con acceso. */
export function dineInDisponible(r: MesaResuelta): boolean {
  return r.puesto.dine_in_activo && r.planInfo.acceso;
}
