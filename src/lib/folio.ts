import { queryOne } from "@/lib/db";

/**
 * Folio consecutivo por negocio, para tickets.
 *
 * Vive aparte de `lib/mostrador.ts` porque toca la base de datos y ese módulo
 * lo importan componentes de cliente: meter `pg` ahí arrastraba el driver de
 * Postgres al bundle del navegador y el build fallaba.
 *
 * `UPDATE ... RETURNING` es atómico, así que dos cajas cobrando al mismo tiempo
 * no pueden sacar el mismo número — que es todo el punto de un folio.
 */
export async function siguienteFolio(puestoId: string): Promise<number | null> {
  const row = await queryOne<{ folio_actual: number }>(
    "UPDATE puestos SET folio_actual = COALESCE(folio_actual, 0) + 1 WHERE id = $1 RETURNING folio_actual",
    [puestoId]
  ).catch(() => null);
  return row ? Number(row.folio_actual) : null;
}
