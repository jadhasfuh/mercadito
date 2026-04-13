import { query, queryOne } from "./db";
import { v4 as uuidv4 } from "uuid";
import { cookies } from "next/headers";

const SESSION_COOKIE = "mercadito_session";
const SESSION_DAYS = 30;

export type Rol = "cliente" | "repartidor" | "tienda" | "admin";

export interface Usuario {
  id: string;
  nombre: string;
  telefono: string;
  rol: Rol;
  puesto_id: string | null;
}

export async function crearSesion(usuarioId: string): Promise<string> {
  // Invalidate any existing sessions for this user
  await query("DELETE FROM sesiones WHERE usuario_id = $1", [usuarioId]);

  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await query("INSERT INTO sesiones (id, usuario_id, expires_at) VALUES ($1, $2, $3)", [
    sessionId,
    usuarioId,
    expiresAt,
  ]);

  return sessionId;
}

export async function getUsuarioFromSession(): Promise<Usuario | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const row = await queryOne<Usuario>(
    `SELECT u.id, u.nombre, u.telefono, u.rol, u.puesto_id
     FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.id = $1 AND s.expires_at > NOW() AND u.activo = true`,
    [sessionId]
  );

  return row;
}

export async function loginCliente(
  nombre: string,
  telefono: string
): Promise<{ usuario: Usuario; sessionId: string }> {
  const tel = telefono.replace(/\D/g, "");

  let usuario = await queryOne<Usuario>(
    "SELECT id, nombre, telefono, rol, puesto_id FROM usuarios WHERE telefono = $1 AND rol = 'cliente'",
    [tel]
  );

  if (!usuario) {
    const id = `cliente-${uuidv4().slice(0, 8)}`;
    await query("INSERT INTO usuarios (id, nombre, telefono, rol) VALUES ($1, $2, $3, 'cliente')", [
      id,
      nombre,
      tel,
    ]);
    usuario = { id, nombre, telefono: tel, rol: "cliente", puesto_id: null };
  } else {
    await query("UPDATE usuarios SET nombre = $1 WHERE id = $2", [nombre, usuario.id]);
    usuario.nombre = nombre;
  }

  const sessionId = await crearSesion(usuario.id);
  return { usuario, sessionId };
}

export async function loginConPin(
  telefono: string,
  pin: string
): Promise<{ usuario: Usuario; sessionId: string } | null> {
  const tel = telefono.replace(/\D/g, "");

  const usuario = await queryOne<Usuario>(
    "SELECT id, nombre, telefono, rol, puesto_id FROM usuarios WHERE telefono = $1 AND pin = $2 AND activo = true",
    [tel, pin]
  );

  if (!usuario) return null;

  const sessionId = await crearSesion(usuario.id);
  return { usuario, sessionId };
}

export async function cerrarSesion(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return;

  await query("DELETE FROM sesiones WHERE id = $1", [sessionId]);
}

export { SESSION_COOKIE };
