import { apiFetch, setSessionToken } from "./client";

export type Rol = "cliente" | "repartidor" | "tienda" | "admin";

export interface Usuario {
  id: string;
  nombre: string;
  telefono: string;
  rol: Rol;
  puesto_id: string | null;
}

interface LoginResponse {
  ok: true;
  usuario: Usuario;
  sessionId: string;
}

interface AuthStatus {
  authenticated: boolean;
  usuario?: Usuario;
}

export async function loginCliente(
  nombre: string,
  telefono: string,
  pin?: string,
  codigoReferidoAmigo?: string,
): Promise<Usuario> {
  const data = await apiFetch<LoginResponse>("/api/auth", {
    method: "POST",
    body: JSON.stringify({
      tipo: "cliente",
      nombre,
      telefono,
      pin: pin ?? "",
      codigo_referido_amigo: codigoReferidoAmigo ?? "",
    }),
  });
  await setSessionToken(data.sessionId);
  return data.usuario;
}

export interface ReferidoStatus {
  codigo_referido: string | null;
  saldo_credito: number;
  referidos_exitosos: number;
}

export async function obtenerEstadoReferidos(): Promise<ReferidoStatus> {
  return apiFetch<ReferidoStatus>("/api/cliente/referidos");
}

export interface ClienteExisteResp {
  existe: boolean;
  tiene_pin?: boolean;
  nombre?: string;
}

/** Lookup pre-login para decidir si pedir nombre, PIN, ambos o ninguno. */
export async function checkClienteExiste(telefono: string): Promise<ClienteExisteResp> {
  const tel = telefono.replace(/\D/g, "");
  if (tel.length < 10) return { existe: false };
  try {
    return await apiFetch<ClienteExisteResp>(`/api/auth/cliente-existe?telefono=${tel}`);
  } catch {
    return { existe: false };
  }
}

export interface UsuarioExisteResp {
  existe: boolean;
  tiene_pin?: boolean;
  nombre?: string;
  rol?: string;
}

/** Lookup pre-login para roles con PIN obligatorio (tienda/repartidor/admin).
 *  Permite distinguir "Tu PIN" vs "Crea tu PIN" en cuentas viejas sin PIN. */
export async function checkUsuarioExiste(
  telefono: string,
  rol: "tienda" | "repartidor" | "admin"
): Promise<UsuarioExisteResp> {
  const tel = telefono.replace(/\D/g, "");
  if (tel.length < 10) return { existe: false };
  try {
    return await apiFetch<UsuarioExisteResp>(
      `/api/auth/usuario-existe?telefono=${tel}&rol=${rol}`
    );
  } catch {
    return { existe: false };
  }
}

/** Estado actual del PIN para mostrar UI apropiada en perfil. */
export async function getClientePinStatus(): Promise<{ tienePin: boolean }> {
  return apiFetch<{ tienePin: boolean }>("/api/auth/cliente-pin");
}

/** Crear o cambiar PIN. Si ya hay uno, requiere `pinActual`. `pin=null` lo borra. */
export async function setClientePin(pin: string | null, pinActual?: string): Promise<{ tienePin: boolean }> {
  return apiFetch<{ ok: true; tienePin: boolean }>("/api/auth/cliente-pin", {
    method: "POST",
    body: JSON.stringify({ pin, pinActual: pinActual ?? null }),
  });
}

export async function loginConPin(
  tipo: "repartidor" | "tienda" | "admin",
  telefono: string,
  pin: string
): Promise<Usuario> {
  const data = await apiFetch<LoginResponse>("/api/auth", {
    method: "POST",
    body: JSON.stringify({ tipo, telefono, pin }),
  });
  await setSessionToken(data.sessionId);
  return data.usuario;
}

export async function fetchSession(): Promise<Usuario | null> {
  try {
    const data = await apiFetch<AuthStatus>("/api/auth");
    return data.authenticated && data.usuario ? data.usuario : null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/api/auth", { method: "DELETE" });
  } finally {
    await setSessionToken(null);
  }
}
