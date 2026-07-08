// Web Push (navegador / PWA) con VAPID. Complementa src/lib/push.ts (Expo, app
// nativa): los usuarios web guardan su PushSubscription en `web_push_subs` y
// aquí les mandamos notificaciones que llegan aunque la pestaña esté cerrada.
//
// Requiere estas env vars (ver scripts/generar-vapid.mjs para generarlas):
//   VAPID_PUBLIC_KEY   — clave pública (también la usa el cliente para suscribirse)
//   VAPID_PRIVATE_KEY  — clave privada (SECRETA)
//   VAPID_SUBJECT      — "mailto:tu-correo@dominio" o una URL. Default mercadito.cx
//
// Si no están configuradas, todo es no-op silencioso (igual que enviarPush).
import webpush from "web-push";
import { query } from "@/lib/db";

const PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:soporte@mercadito.cx";

let configurado = false;
function asegurarVapid(): boolean {
  if (configurado) return true;
  if (!PUBLIC || !PRIVATE) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  configurado = true;
  return true;
}

/** Clave pública VAPID que el navegador necesita para suscribirse. "" si no hay. */
export function vapidPublicKey(): string {
  return PUBLIC;
}

interface SubRow { endpoint: string; p256dh: string; auth: string; }

/**
 * Envía a una lista de suscripciones. Fire-and-forget: nunca lanza. Las
 * suscripciones expiradas (404/410) se borran de la BD automáticamente.
 */
export async function enviarWebPush(
  subs: SubRow[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (subs.length === 0) return;
  if (!asegurarVapid()) return;

  const payload = JSON.stringify({ title, body, data: data ?? {} });
  const muertos: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 } // 1h: si el navegador no está online, no vale la pena guardarlo más
        );
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) muertos.push(s.endpoint);
        else console.error("[webpush] send failed", code, (e as Error)?.message);
      }
    })
  );

  if (muertos.length) {
    try {
      await query("DELETE FROM web_push_subs WHERE endpoint = ANY($1)", [muertos]);
    } catch { /* no-op */ }
  }
}

/**
 * Busca las suscripciones web de una lista de usuarios y les envía el push.
 * Se llama junto a `enviarPush` (Expo) para cubrir ambos canales.
 */
export async function enviarWebPushAUsuarios(
  usuarioIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const ids = usuarioIds.filter(Boolean);
  if (ids.length === 0) return;
  if (!asegurarVapid()) return;
  try {
    const subs = await query<SubRow>(
      "SELECT endpoint, p256dh, auth FROM web_push_subs WHERE usuario_id = ANY($1)",
      [ids]
    );
    await enviarWebPush(subs, title, body, data);
  } catch (e) {
    console.error("[webpush] enviarWebPushAUsuarios failed", (e as Error)?.message);
  }
}
