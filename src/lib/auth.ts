import { query, queryOne } from "./db";
import { v4 as uuidv4 } from "uuid";
import { cookies, headers } from "next/headers";

const SESSION_COOKIE = "mercadito_session";
const SESSION_HEADER = "x-session-token";
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
  // No invalidamos las sesiones previas del usuario: queremos multi-dispositivo
  // (la web del admin y el móvil del repartidor a la vez, por ejemplo). Antes
  // borrábamos todas y eso cerraba la sesión activa cada vez que el usuario
  // tocaba login en otra superficie. Limpiamos solo las expiradas para no
  // acumular ruido.
  await query("DELETE FROM sesiones WHERE usuario_id = $1 AND expires_at <= NOW()", [usuarioId]);

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
  // Cookie-based auth (web)
  const cookieStore = await cookies();
  let sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  // Header-based auth (native/mobile fallback)
  if (!sessionId) {
    const headerStore = await headers();
    sessionId = headerStore.get(SESSION_HEADER) ?? undefined;
  }

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

export class LoginError extends Error {
  constructor(public code: "PIN_REQUIRED" | "PIN_INVALID", message: string) {
    super(message);
    this.name = "LoginError";
  }
}

export async function loginCliente(
  nombre: string,
  telefono: string,
  pin?: string | null
): Promise<{ usuario: Usuario; sessionId: string }> {
  const tel = telefono.replace(/\D/g, "");
  const pinTrim = typeof pin === "string" ? pin.trim() : "";

  // Necesitamos saber si el usuario tiene PIN configurado para validar antes
  // de crear sesión. Por eso traemos también la columna `pin` aparte del
  // shape de Usuario público (que no la incluye por seguridad).
  const row = await queryOne<Usuario & { pin: string | null }>(
    "SELECT id, nombre, telefono, rol, puesto_id, pin FROM usuarios WHERE telefono = $1 AND rol = 'cliente'",
    [tel]
  );

  const nombreTrim = (nombre || "").trim();

  let usuario: Usuario;
  if (!row) {
    // Cliente nuevo: el nombre es obligatorio. Si trae PIN, lo guardamos como
    // PIN inicial; si no, queda sin protección (puede agregarlo luego desde
    // "Configurar PIN").
    if (!nombreTrim) {
      throw new LoginError("PIN_INVALID", "Nombre requerido para crear tu cuenta");
    }
    const id = `cliente-${uuidv4().slice(0, 8)}`;
    await query(
      "INSERT INTO usuarios (id, nombre, telefono, rol, pin) VALUES ($1, $2, $3, 'cliente', $4)",
      [id, nombreTrim, tel, pinTrim || null]
    );
    usuario = { id, nombre: nombreTrim, telefono: tel, rol: "cliente", puesto_id: null };
  } else {
    // Cliente existente:
    if (row.pin) {
      // Tiene PIN guardado → exigir match.
      if (!pinTrim) throw new LoginError("PIN_REQUIRED", "PIN requerido");
      if (pinTrim !== row.pin) throw new LoginError("PIN_INVALID", "PIN incorrecto");
    } else if (pinTrim) {
      // No tenía PIN y el cliente lo está estableciendo en este login.
      await query("UPDATE usuarios SET pin = $1 WHERE id = $2", [pinTrim, row.id]);
    }
    // Si el cliente provee un nombre nuevo lo actualizamos; si no, mantenemos
    // el guardado (el flujo nuevo ya no pide nombre a clientes con cuenta).
    const nombreFinal = nombreTrim || row.nombre;
    if (nombreTrim && nombreTrim !== row.nombre) {
      await query("UPDATE usuarios SET nombre = $1 WHERE id = $2", [nombreTrim, row.id]);
    }
    usuario = { id: row.id, nombre: nombreFinal, telefono: row.telefono, rol: row.rol, puesto_id: row.puesto_id };
  }

  const sessionId = await crearSesion(usuario.id);
  return { usuario, sessionId };
}

/**
 * Cambia o elimina el PIN del usuario logueado. `pin=null` lo borra.
 * Usar SOLO para clientes — los demás roles tienen PIN obligatorio.
 */
export async function setClientePin(usuarioId: string, pin: string | null): Promise<void> {
  const v = pin && pin.trim() ? pin.trim() : null;
  await query("UPDATE usuarios SET pin = $1 WHERE id = $2 AND rol = 'cliente'", [v, usuarioId]);
}

/** Indica si el cliente tiene PIN configurado (para mostrar UI apropiada). */
export async function clienteTienePin(usuarioId: string): Promise<boolean> {
  const row = await queryOne<{ pin: string | null }>(
    "SELECT pin FROM usuarios WHERE id = $1 AND rol = 'cliente'",
    [usuarioId]
  );
  return !!(row && row.pin);
}

export async function loginConPin(
  telefono: string,
  pin: string,
  rol?: string
): Promise<{ usuario: Usuario; sessionId: string } | null> {
  const tel = telefono.replace(/\D/g, "");

  let usuario: Usuario | null;
  if (rol) {
    // When role is specified, filter by it (supports same phone on multiple roles)
    const roles = rol === "tienda" ? ["tienda", "repartidor"] : [rol];
    usuario = await queryOne<Usuario>(
      "SELECT id, nombre, telefono, rol, puesto_id FROM usuarios WHERE telefono = $1 AND pin = $2 AND activo = true AND rol = ANY($3)",
      [tel, pin, roles]
    );
  } else {
    usuario = await queryOne<Usuario>(
      "SELECT id, nombre, telefono, rol, puesto_id FROM usuarios WHERE telefono = $1 AND pin = $2 AND activo = true",
      [tel, pin]
    );
  }

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
