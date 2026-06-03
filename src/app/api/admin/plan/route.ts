import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { infoPlan } from "@/lib/plan";
import { NextResponse } from "next/server";

// POST /api/admin/plan — activación MANUAL del plan de un negocio (solo admin).
// El cobro es por fuera (WhatsApp/transferencia); aquí Adrian prende el acceso.
//   action "pro"    → activa/renueva Pro N meses (default 1). Extiende desde la
//                     fecha vigente si aún tiene acceso; si no, desde hoy.
//   action "trial"  → reinicia 30 días de prueba (para negocios nuevos o que
//                     convirtieron a servicios después).
//   action "cancelar" → vence el acceso ya (suscripcion_hasta = ahora).
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await request.json();
  const puestoId = body.puesto_id as string;
  const action = body.action as "pro" | "trial" | "cancelar";
  if (!puestoId || !["pro", "trial", "cancelar"].includes(action)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const meses = Math.min(Math.max(parseInt(String(body.meses ?? 1), 10) || 1, 1), 12);

  if (action === "pro") {
    // Extiende desde la fecha vigente si aún está activo; si venció, desde hoy.
    await query(
      `UPDATE puestos
       SET plan = 'pro',
           suscripcion_hasta = GREATEST(NOW(), COALESCE(suscripcion_hasta, NOW())) + make_interval(months => $2),
           venc_aviso_at = NULL
       WHERE id = $1`,
      [puestoId, meses]
    );
  } else if (action === "trial") {
    await query(
      `UPDATE puestos
       SET plan = 'gratis', suscripcion_hasta = NOW() + INTERVAL '30 days', venc_aviso_at = NULL
       WHERE id = $1`,
      [puestoId]
    );
  } else {
    await query("UPDATE puestos SET suscripcion_hasta = NOW() WHERE id = $1", [puestoId]);
  }

  const p = await queryOne<{ plan: string; suscripcion_hasta: string | null }>(
    "SELECT plan, suscripcion_hasta FROM puestos WHERE id = $1",
    [puestoId]
  );
  return NextResponse.json({ ok: true, planInfo: infoPlan(p?.plan ?? "gratis", p?.suscripcion_hasta ?? null) });
}
