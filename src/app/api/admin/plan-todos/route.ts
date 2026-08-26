import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { TRIAL_DIAS } from "@/lib/plan";
import { NextResponse } from "next/server";

// POST — le da la prueba completa a TODOS los negocios con dueño activo, y se
// la reinicia a los que ya la tenían corriendo.
//
// A diferencia de /api/admin/plan con action "pro" (que EXTIENDE desde la
// fecha vigente), aquí la fecha se fija desde hoy a propósito: el punto es que
// todos queden parejos en el mismo arranque, no premiar a quien ya tenía saldo.
export async function POST() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const filas = await query<{ id: string }>(
    `UPDATE puestos p
        SET plan = 'gratis',
            suscripcion_hasta = NOW() + make_interval(days => $1),
            venc_aviso_at = NULL
      WHERE EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.puesto_id = p.id AND u.rol = 'tienda' AND u.activo = true
      )
      RETURNING p.id`,
    [TRIAL_DIAS]
  );

  return NextResponse.json({ ok: true, negocios: filas.length, dias: TRIAL_DIAS });
}
