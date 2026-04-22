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

export async function loginCliente(nombre: string, telefono: string): Promise<Usuario> {
  const data = await apiFetch<LoginResponse>("/api/auth", {
    method: "POST",
    body: JSON.stringify({ tipo: "cliente", nombre, telefono }),
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
