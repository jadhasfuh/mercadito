import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// POST /api/push/web-register — guarda la PushSubscription del navegador.
// body: { subscription: { endpoint, keys: { p256dh, auth } } }
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const sub = body?.subscription;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
  }

  // Upsert por endpoint: si el mismo navegador se re-suscribe o cambia de
  // usuario (login distinto en el mismo device), re-apuntamos la suscripción.
  await query(
    `INSERT INTO web_push_subs (endpoint, usuario_id, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET usuario_id = EXCLUDED.usuario_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth`,
    [endpoint, usuario.id, p256dh, auth]
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/push/web-register — borra una suscripción por endpoint (al
// desactivar notificaciones o cerrar sesión). body: { endpoint }
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ error: "Falta endpoint" }, { status: 400 });
  await query("DELETE FROM web_push_subs WHERE endpoint = $1", [endpoint]);
  return NextResponse.json({ ok: true });
}
