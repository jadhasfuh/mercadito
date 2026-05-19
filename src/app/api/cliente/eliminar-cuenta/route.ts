import { NextResponse } from "next/server";
import { query, withTransaction } from "@/lib/db";
import { getUsuarioFromSession, SESSION_COOKIE } from "@/lib/auth";

/**
 * POST /api/cliente/eliminar-cuenta
 * Endpoint requerido por Google Play (Data Deletion Policy 2024) y por
 * Apple App Store (guideline 5.1.1(v)). Anonimiza el usuario, borra
 * sesiones y, si es tienda, desactiva su puesto. Historial de pedidos
 * se conserva (registro fiscal) pero sin vínculo a datos personales.
 *
 * La ruta se mantiene en /cliente/ por compatibilidad con la web y app
 * móvil que ya la llaman; ahora soporta los 3 roles del flujo móvil.
 */
export async function POST() {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // El admin no puede autoborrarse desde la app — debe quedar en pie para
  // operar la plataforma. Si quiere irse, lo hace manualmente en DB.
  if (usuario.rol === "admin") {
    return NextResponse.json({ error: "Las cuentas admin no se eliminan desde la app" }, { status: 403 });
  }
  try {
    await withTransaction(async (q) => {
      // 1. Si es tienda, desactivar su puesto para que no aparezca en el
      //    catálogo ni acepte pedidos nuevos.
      if (usuario.rol === "tienda" && usuario.puesto_id) {
        await q("UPDATE puestos SET activo = false WHERE id = $1", [usuario.puesto_id]);
      }
      // 2. Anonimizar usuario y desactivar.
      await q(
        `UPDATE usuarios
         SET nombre = 'Cuenta eliminada', telefono = $2,
             pin = NULL, push_token = NULL,
             ubicacion_lat = NULL, ubicacion_lng = NULL, ubicacion_at = NULL,
             activo = false
         WHERE id = $1`,
        [usuario.id, `borrado-${usuario.id}`]
      );
      // 3. Cerrar sesiones activas en todos los dispositivos.
      await q("DELETE FROM sesiones WHERE usuario_id = $1", [usuario.id]);
    });
  } catch (e) {
    console.error("[eliminar-cuenta] error", e);
    return NextResponse.json({ error: "No se pudo eliminar la cuenta. Intenta de nuevo." }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
