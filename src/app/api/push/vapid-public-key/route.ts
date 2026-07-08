import { vapidPublicKey } from "@/lib/webpush";
import { NextResponse } from "next/server";

// GET /api/push/vapid-public-key — la clave pública VAPID que el navegador
// necesita para suscribirse al push. No es secreta. "" si el servidor no tiene
// web push configurado (el cliente entonces no intenta suscribirse).
export async function GET() {
  return NextResponse.json({ publicKey: vapidPublicKey() });
}
