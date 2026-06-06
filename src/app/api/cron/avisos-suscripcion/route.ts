import { query } from "@/lib/db";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";

/**
 * Cron — avisos de vencimiento de la suscripción de citas.
 *
 * Notifica al NEGOCIO cuando su prueba/plan está por vencer (≤3 días) o ya
 * venció, y manda un RESUMEN al admin para que cobre a tiempo. Idempotente vía
 * `venc_aviso_at` (se manda una vez por ventana; el admin lo limpia al renovar).
 * Diseñado para correr 1 vez al día. Auth: header X-Cron-Secret.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Negocios de servicios por vencer (≤3 días) o vencidos, aún sin avisar.
  const negocios = await query<{
    id: string;
    nombre: string;
    suscripcion_hasta: string;
    vencido: boolean;
    dias: number;
  }>(
    `SELECT id, nombre, suscripcion_hasta,
            (suscripcion_hasta <= NOW()) AS vencido,
            GREATEST(0, CEIL(EXTRACT(EPOCH FROM (suscripcion_hasta - NOW())) / 86400))::int AS dias
     FROM puestos
     WHERE tipo IN ('servicios','ambos')
       AND suscripcion_hasta IS NOT NULL
       AND suscripcion_hasta <= NOW() + INTERVAL '3 days'
       AND venc_aviso_at IS NULL`
  );

  if (negocios.length === 0) return NextResponse.json({ ok: true, avisados: 0 });

  let avisados = 0;
  for (const n of negocios) {
    const tokens = await query<{ push_token: string }>(
      `SELECT push_token FROM usuarios
       WHERE puesto_id = $1 AND rol = 'tienda' AND push_token IS NOT NULL AND activo = true`,
      [n.id]
    );
    const title = n.vencido ? "Tu plan de reservas venció" : "Tu plan de reservas está por vencer";
    const body = n.vencido
      ? "Reactívalo por WhatsApp para seguir agendando reservas."
      : `Vence en ${n.dias} ${n.dias === 1 ? "día" : "días"}. Renueva por WhatsApp para no perder tus reservas.`;
    if (tokens.length > 0) {
      enviarPush(tokens.map((t) => t.push_token), title, body, { tipo: "plan", puesto_id: n.id });
      avisados++;
    }
  }

  // Marca los avisados para no repetir hasta que el admin renueve.
  await query("UPDATE puestos SET venc_aviso_at = NOW() WHERE id = ANY($1)", [negocios.map((n) => n.id)]);

  // Resumen al admin (para que cobre a tiempo).
  const admins = await query<{ push_token: string }>(
    "SELECT push_token FROM usuarios WHERE rol = 'admin' AND push_token IS NOT NULL AND activo = true"
  );
  if (admins.length > 0) {
    const vencidos = negocios.filter((n) => n.vencido).length;
    const porVencer = negocios.length - vencidos;
    const partes = [];
    if (porVencer > 0) partes.push(`${porVencer} por vencer`);
    if (vencidos > 0) partes.push(`${vencidos} vencido(s)`);
    enviarPush(
      admins.map((a) => a.push_token),
      "💳 Suscripciones de reservas",
      `${partes.join(" · ")}. Revisa el panel para cobrar.`,
      { tipo: "plan_admin" }
    );
  }

  return NextResponse.json({ ok: true, avisados, total: negocios.length });
}
