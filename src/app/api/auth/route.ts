import { NextResponse } from "next/server";
import { loginCliente, loginConPin, getUsuarioFromSession, cerrarSesion, SESSION_COOKIE } from "@/lib/auth";

// GET /api/auth — get current session
export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({ authenticated: true, usuario });
}

// POST /api/auth — login
export async function POST(request: Request) {
  const body = await request.json();
  const { tipo, nombre, telefono, pin } = body;

  if (tipo === "cliente") {
    if (!nombre || !telefono) {
      return NextResponse.json({ error: "Nombre y teléfono requeridos" }, { status: 400 });
    }
    const result = await loginCliente(nombre, telefono);
    const res = NextResponse.json({ ok: true, usuario: result.usuario });
    res.cookies.set(SESSION_COOKIE, result.sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });
    return res;
  }

  if (tipo === "repartidor" || tipo === "tienda" || tipo === "admin") {
    if (!telefono || !pin) {
      return NextResponse.json({ error: "Teléfono y PIN requeridos" }, { status: 400 });
    }
    const result = await loginConPin(telefono, pin, tipo);
    if (!result) {
      return NextResponse.json({ error: "Teléfono o PIN incorrectos" }, { status: 401 });
    }
    // Verify role access
    if (tipo === "repartidor" && result.usuario.rol !== "repartidor") {
      return NextResponse.json({ error: "No tienes acceso como repartidor" }, { status: 403 });
    }
    if (tipo === "tienda" && result.usuario.rol !== "tienda" && result.usuario.rol !== "repartidor") {
      return NextResponse.json({ error: "No tienes acceso como tienda" }, { status: 403 });
    }
    if (tipo === "tienda" && result.usuario.rol === "repartidor" && !result.usuario.puesto_id) {
      return NextResponse.json({ error: "No tienes un puesto asignado" }, { status: 403 });
    }
    if (tipo === "admin" && result.usuario.rol !== "admin") {
      return NextResponse.json({ error: "No tienes acceso como administrador" }, { status: 403 });
    }
    const res = NextResponse.json({ ok: true, usuario: result.usuario });
    res.cookies.set(SESSION_COOKIE, result.sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });
    return res;
  }

  return NextResponse.json({ error: "Tipo de login no válido" }, { status: 400 });
}

// DELETE /api/auth — logout
export async function DELETE() {
  await cerrarSesion();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
