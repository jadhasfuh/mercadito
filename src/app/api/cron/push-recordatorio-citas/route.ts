import { query } from "@/lib/db";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";

/**
 * Cron — recordatorios de citas al cliente:
 *   - 24h antes: cuando la cita queda dentro de las próximas 24h (y a más de
 *     3h, para no solaparse con el de 2h).
 *   - 2h antes: cuando la cita queda dentro de las próximas 2h.
 *
 * Idempotente vía banderas recordatorio_24h_enviado / recordatorio_2h_enviado.
 * Diseñado para correr cada ~15min. Auth: header X-Cron-Secret.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const enviadas = { r24: 0, r2: 0 };

  // ---- 24h antes ----
  const c24 = await query<{ id: string; servicio_nombre: string; hora: string; push_token: string | null }>(
    `SELECT c.id, c.servicio_nombre,
       to_char(c.inicio AT TIME ZONE COALESCE(p.timezone, 'America/Mexico_City'), 'HH24:MI') as hora,
       (SELECT u.push_token FROM usuarios u
        WHERE (u.id = c.cliente_id OR u.telefono = c.cliente_telefono)
          AND u.rol = 'cliente' AND u.push_token IS NOT NULL AND u.activo = true LIMIT 1) as push_token
     FROM citas c JOIN puestos p ON p.id = c.puesto_id
     WHERE c.estado IN ('pendiente','confirmada')
       AND c.recordatorio_24h_enviado = false
       AND c.inicio <= NOW() + INTERVAL '24 hours'
       AND c.inicio > NOW() + INTERVAL '3 hours'`
  );
  for (const c of c24) {
    if (c.push_token) {
      enviarPush([c.push_token], "⏰ Recordatorio de cita", `Mañana tienes ${c.servicio_nombre} a las ${c.hora}.`, {
        tipo: "cita",
        cita_id: c.id,
      });
      enviadas.r24++;
    }
  }
  if (c24.length > 0) {
    await query("UPDATE citas SET recordatorio_24h_enviado = true WHERE id = ANY($1)", [c24.map((c) => c.id)]);
  }

  // ---- 2h antes ----
  const c2 = await query<{ id: string; servicio_nombre: string; hora: string; push_token: string | null }>(
    `SELECT c.id, c.servicio_nombre,
       to_char(c.inicio AT TIME ZONE COALESCE(p.timezone, 'America/Mexico_City'), 'HH24:MI') as hora,
       (SELECT u.push_token FROM usuarios u
        WHERE (u.id = c.cliente_id OR u.telefono = c.cliente_telefono)
          AND u.rol = 'cliente' AND u.push_token IS NOT NULL AND u.activo = true LIMIT 1) as push_token
     FROM citas c JOIN puestos p ON p.id = c.puesto_id
     WHERE c.estado IN ('pendiente','confirmada')
       AND c.recordatorio_2h_enviado = false
       AND c.inicio <= NOW() + INTERVAL '2 hours'
       AND c.inicio > NOW()`
  );
  for (const c of c2) {
    if (c.push_token) {
      enviarPush([c.push_token], "⏰ Tu cita es pronto", `Hoy a las ${c.hora}: ${c.servicio_nombre}.`, {
        tipo: "cita",
        cita_id: c.id,
      });
      enviadas.r2++;
    }
  }
  if (c2.length > 0) {
    await query("UPDATE citas SET recordatorio_2h_enviado = true WHERE id = ANY($1)", [c2.map((c) => c.id)]);
  }

  return NextResponse.json({ ok: true, ...enviadas });
}
