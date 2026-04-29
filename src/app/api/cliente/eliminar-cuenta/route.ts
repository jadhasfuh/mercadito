import { NextResponse } from "next/server";
import { query, withTransaction } from "@/lib/db";
import { getUsuarioFromSession, SESSION_COOKIE } from "@/lib/auth";

/**
 * POST /api/cliente/eliminar-cuenta
 * Endpoint requerido por Google Play (Data Deletion Policy 2024).
 * Marca la cuenta del cliente como inactiva, anonimiza el perfil y borra
 * sesiones. Los pedidos históricos se conservan (registro fiscal y de
 * cobro al repartidor) pero quedan sin vínculo con un usuario activo.
 */
export async function POST() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "cliente") {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    await withTransaction(async (q) => {
      // 1. Anonimizar usuario y desactivar.
      await q(
        `UPDATE usuarios
         SET nombre = 'Cuenta eliminada', telefono = $2,
             pin = NULL, push_token = NULL, activo = false
         WHERE id = $1`,
        [usuario.id, `borrado-${usuario.id}`]
      );
      // 2. Cerrar sesiones activas.
      await q("DELETE FROM sesiones WHERE usuario_id = $1", [usuario.id]);
      // 3. Despegar el cliente de pedidos históricos manteniendo el registro
      //    contable: nombre y teléfono ya están anonimizados arriba.
    });
  } catch (e) {
    console.error("[eliminar-cuenta] error", e);
    return NextResponse.json({ error: "No se pudo eliminar la cuenta. Intenta de nuevo." }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
