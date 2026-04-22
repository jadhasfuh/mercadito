// Expo Push notifications helper.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
  sound?: "default" | null;
  channelId?: string;
}

/**
 * Fire-and-forget: sends a push notification to a list of Expo push tokens.
 * Errors are swallowed (logged) so they never break the caller (e.g. order creation).
 */
export async function enviarPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const valid = tokens.filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken"));
  if (valid.length === 0) return;

  const messages: PushMessage[] = valid.map((to) => ({
    to,
    title,
    body,
    data,
    priority: "high",
    sound: "default",
    channelId: "default",
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error("[push] Expo returned", res.status, await res.text());
    }
  } catch (e) {
    console.error("[push] send failed", e);
  }
}
