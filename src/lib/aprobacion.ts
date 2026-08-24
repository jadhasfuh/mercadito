import { query } from "@/lib/db";
import { DELIVERY_ACTIVO } from "@/lib/flags";

/**
 * Aprueba al negocio en cuanto tiene su primer producto con precio.
 *
 * Sin delivery, la aprobación manual dejó de proteger nada y sí estorba: el
 * negocio arma su menú, lo comparte y su link no jala hasta que un admin
 * entre al panel — que puede tardar días si nadie está al pendiente. Cargar
 * un producto es prueba suficiente de que el negocio es real y va en serio;
 * los registros abandonados (sin nada cargado) no se aprueban solos y no
 * ensucian el directorio.
 *
 * Con delivery encendido NO aplica: ahí el negocio maneja pedidos y dinero de
 * clientes, así que la revisión previa sigue teniendo sentido.
 *
 * Best-effort: si falla, el negocio simplemente queda pendiente de aprobación
 * manual. Nunca debe tumbar el alta del producto.
 */
export async function aprobarSiTieneProductos(puestoId: string): Promise<void> {
  if (DELIVERY_ACTIVO || !puestoId) return;
  try {
    await query(
      `UPDATE puestos p
          SET aprobado = true
        WHERE p.id = $1
          AND p.aprobado = false
          AND EXISTS (
            SELECT 1 FROM precios pr
            WHERE pr.puesto_id = p.id AND pr.activo = true
          )`,
      [puestoId]
    );
  } catch (e) {
    console.error("[aprobacion] no se pudo auto-aprobar", puestoId, (e as Error).message);
  }
}
