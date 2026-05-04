import { query, queryOne } from "./db";
import { v4 as uuidv4 } from "uuid";
import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";

const SESSION_COOKIE = "mercadito_session";
const SESSION_HEADER = "x-session-token";
const SESSION_DAYS = 30;
const BCRYPT_ROUNDS = 10;

export type Rol = "cliente" | "repartidor" | "tienda" | "admin";

export interface Usuario {
  id: string;
  nombre: string;
  telefono: string;
  rol: Rol;
  puesto_id: string | null;
}

// =====================================================================
// PIN: hash con bcrypt + migración transparente desde texto plano.
// =====================================================================

function isHashed(stored: string): boolean {
  return /^\$2[aby]\$/.test(stored);
}

async function hashPin(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Verifica si `plain` corresponde al PIN guardado. Soporta entradas
 * legacy en texto plano (PINs guardados antes del switch a hash). Si el
 * stored es legacy y el match es exacto, devolvemos true y el caller
 * debería migrarlo a hash al primer login exitoso.
 */
async function verifyPin(plain: string, stored: string): Promise<boolean> {
  if (!plain || !stored) return false;
  if (isHashed(stored)) return bcrypt.compare(plain, stored);
  // Legacy: texto plano. Comparación constante-time-ish.
  if (plain.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < plain.length; i++) diff |= plain.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

async function migrarPinALegado(usuarioId: string, plain: string): Promise<void> {
  const hashed = await hashPin(plain);
  await query("UPDATE usuarios SET pin = $1 WHERE id = $2", [hashed, usuarioId]);
}

// =====================================================================
// Rate limit en memoria — 5 intentos por minuto por (rol+telefono).
// Suficiente para detener brute force de PIN de 6 dígitos. Si después
// hay multi-instancia se mueve a Redis o tabla DB.
// =====================================================================

interface IntentoLogin { count: number; until: number; }
const RL_MAX = 5;
const RL_WINDOW_MS = 60 * 1000;
const intentos = new Map<string, IntentoLogin>();

function rlKey(rol: string, telefono: string): string {
  return `${rol}:${telefono.replace(/\D/g, "")}`;
}

function rlCheck(rol: string, telefono: string): { ok: boolean; segundos?: number } {
  const k = rlKey(rol, telefono);
  const now = Date.now();
  const x = intentos.get(k);
  if (!x || x.until < now) return { ok: true };
  if (x.count < RL_MAX) return { ok: true };
  return { ok: false, segundos: Math.ceil((x.until - now) / 1000) };
}

function rlBumpFail(rol: string, telefono: string): void {
  const k = rlKey(rol, telefono);
  const now = Date.now();
  const x = intentos.get(k);
  if (!x || x.until < now) {
    intentos.set(k, { count: 1, until: now + RL_WINDOW_MS });
  } else {
    x.count += 1;
    if (x.count >= RL_MAX) x.until = now + RL_WINDOW_MS;
  }
}

function rlReset(rol: string, telefono: string): void {
  intentos.delete(rlKey(rol, telefono));
}

// =====================================================================
// Sesiones
// =====================================================================

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
  constructor(public code: "PIN_REQUIRED" | "PIN_INVALID" | "TOO_MANY_ATTEMPTS", message: string) {
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

  // Rate limit antes de tocar DB.
  const rl = rlCheck("cliente", tel);
  if (!rl.ok) {
    throw new LoginError("TOO_MANY_ATTEMPTS", `Demasiados intentos. Espera ${rl.segundos}s.`);
  }

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
    // Cliente nuevo: nombre + PIN obligatorios. PIN es de 6 dígitos
    // (validado en el endpoint antes de llegar acá). Sin PIN, cualquiera
    // con el teléfono podría ver pedidos, así que ya no lo permitimos.
    if (!nombreTrim) {
      throw new LoginError("PIN_INVALID", "Nombre requerido para crear tu cuenta");
    }
    if (!pinTrim) {
      throw new LoginError("PIN_REQUIRED", "Crea un PIN de 6 dígitos para tu cuenta");
    }
    const id = `cliente-${uuidv4().slice(0, 8)}`;
    const pinAlmacenado = await hashPin(pinTrim);
    await query(
      "INSERT INTO usuarios (id, nombre, telefono, rol, pin) VALUES ($1, $2, $3, 'cliente', $4)",
      [id, nombreTrim, tel, pinAlmacenado]
    );
    usuario = { id, nombre: nombreTrim, telefono: tel, rol: "cliente", puesto_id: null };
  } else {
    if (row.pin) {
      if (!pinTrim) throw new LoginError("PIN_REQUIRED", "PIN requerido");
      const ok = await verifyPin(pinTrim, row.pin);
      if (!ok) {
        rlBumpFail("cliente", tel);
        throw new LoginError("PIN_INVALID", "PIN incorrecto");
      }
      // Si el PIN guardado es legacy (texto plano), migrar a hash ahora que
      // sabemos el plain. Una vez por cliente, transparente.
      if (!isHashed(row.pin)) {
        await migrarPinALegado(row.id, pinTrim);
      }
    } else {
      // Cliente existente sin PIN (ej. cuentas viejas o reseteadas en
      // bulk). Exigimos crear PIN ahora — sin él, no creamos sesión.
      if (!pinTrim) {
        throw new LoginError("PIN_REQUIRED", "Necesitas crear un PIN de 6 dígitos para entrar");
      }
      const hashed = await hashPin(pinTrim);
      await query("UPDATE usuarios SET pin = $1 WHERE id = $2", [hashed, row.id]);
    }
    const nombreFinal = nombreTrim || row.nombre;
    if (nombreTrim && nombreTrim !== row.nombre) {
      await query("UPDATE usuarios SET nombre = $1 WHERE id = $2", [nombreTrim, row.id]);
    }
    usuario = { id: row.id, nombre: nombreFinal, telefono: row.telefono, rol: row.rol, puesto_id: row.puesto_id };
  }

  const sessionId = await crearSesion(usuario.id);
  rlReset("cliente", tel);
  return { usuario, sessionId };
}

/**
 * Cambia o elimina el PIN del usuario logueado. `pin=null` lo borra.
 * Usar SOLO para clientes — los demás roles tienen PIN obligatorio.
 */
export async function setClientePin(usuarioId: string, pin: string | null): Promise<void> {
  const v = pin && pin.trim() ? pin.trim() : null;
  const stored = v ? await hashPin(v) : null;
  await query("UPDATE usuarios SET pin = $1 WHERE id = $2 AND rol = 'cliente'", [stored, usuarioId]);
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
  const rolKey = rol || "any";
  const rl = rlCheck(rolKey, tel);
  if (!rl.ok) {
    throw new LoginError("TOO_MANY_ATTEMPTS", `Demasiados intentos. Espera ${rl.segundos}s.`);
  }

  type Row = Usuario & { pin: string | null };
  let row: Row | null;
  if (rol) {
    const roles = rol === "tienda" ? ["tienda", "repartidor"] : [rol];
    row = await queryOne<Row>(
      "SELECT id, nombre, telefono, rol, puesto_id, pin FROM usuarios WHERE telefono = $1 AND activo = true AND rol = ANY($2)",
      [tel, roles]
    );
  } else {
    row = await queryOne<Row>(
      "SELECT id, nombre, telefono, rol, puesto_id, pin FROM usuarios WHERE telefono = $1 AND activo = true",
      [tel]
    );
  }

  if (!row || !row.pin) {
    rlBumpFail(rolKey, tel);
    return null;
  }

  const ok = await verifyPin(pin, row.pin);
  if (!ok) {
    rlBumpFail(rolKey, tel);
    return null;
  }

  if (!isHashed(row.pin)) {
    await migrarPinALegado(row.id, pin);
  }

  const usuario: Usuario = {
    id: row.id, nombre: row.nombre, telefono: row.telefono, rol: row.rol, puesto_id: row.puesto_id,
  };
  const sessionId = await crearSesion(usuario.id);
  rlReset(rolKey, tel);
  return { usuario, sessionId };
}

export async function cerrarSesion(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return;

  await query("DELETE FROM sesiones WHERE id = $1", [sessionId]);
}

export { SESSION_COOKIE };
