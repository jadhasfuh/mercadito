import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// POST /api/push/register — body: { token: "ExponentPushToken[...]" }
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json();
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "Falta token" }, { status: 400 });
  if (!token.startsWith("ExponentPushToken")) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  await query("UPDATE usuarios SET push_token = $1 WHERE id = $2", [token, usuario.id]);
  return NextResponse.json({ ok: true });
}

// DELETE /api/push/register — clears the user's push token (on logout from mobile)
export async function DELETE() {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  await query("UPDATE usuarios SET push_token = NULL WHERE id = $1", [usuario.id]);
  return NextResponse.json({ ok: true });
}
