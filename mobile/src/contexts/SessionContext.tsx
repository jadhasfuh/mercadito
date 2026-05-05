import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  fetchSession,
  loginCliente as loginClienteApi,
  loginConPin as loginConPinApi,
  logout as logoutApi,
  type Usuario,
} from "../api/auth";
import { setOnUnauthorized } from "../api/client";
import { registrarPushToken } from "../api/push";

interface LoginResult {
  ok: boolean;
  error?: string;
  /** Código del backend cuando aplica (ej "PIN_REQUIRED", "PIN_INVALID"). */
  code?: string;
}

interface SessionContextValue {
  usuario: Usuario | null;
  loading: boolean;
  loginCliente: (nombre: string, telefono: string, pin?: string, codigoReferidoAmigo?: string) => Promise<LoginResult>;
  loginConPin: (tipo: "repartidor" | "tienda" | "admin", telefono: string, pin: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  usuario: null,
  loading: true,
  loginCliente: async () => ({ ok: false }),
  loginConPin: async () => ({ ok: false }),
  logout: async () => {},
  refresh: async () => {},
});

function tryRegistrarPush() {
  // No bloquea; ignora errores silenciosamente.
  registrarPushToken().catch(() => {});
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const u = await fetchSession();
    setUsuario(u);
    setLoading(false);
    if (u) tryRegistrarPush();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Si una llamada al backend devuelve 401 con token, apiFetch limpia el
  // token de SecureStore y dispara este handler. Aquí soltamos el estado
  // del usuario; los layouts (tabs / repartidor / tienda / admin) tienen
  // useEffect que hace router.replace("/login") cuando usuario===null.
  useEffect(() => {
    setOnUnauthorized(() => {
      setUsuario(null);
    });
    return () => setOnUnauthorized(null);
  }, []);

  const loginCliente = useCallback(async (nombre: string, telefono: string, pin?: string, codigoReferidoAmigo?: string) => {
    try {
      const u = await loginClienteApi(nombre, telefono, pin, codigoReferidoAmigo);
      setUsuario(u);
      tryRegistrarPush();
      return { ok: true };
    } catch (e) {
      const err = e as { error?: string; code?: string };
      return { ok: false, error: err?.error ?? "Error al iniciar sesion", code: err?.code };
    }
  }, []);

  const loginConPin = useCallback(async (tipo: "repartidor" | "tienda" | "admin", telefono: string, pin: string) => {
    try {
      const u = await loginConPinApi(tipo, telefono, pin);
      setUsuario(u);
      tryRegistrarPush();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as { error?: string })?.error ?? "Error al iniciar sesion" };
    }
  }, []);

  const logout = useCallback(async () => {
    // No desregistramos el push_token en logout: el celular es personal del
    // repartidor/tienda y debe seguir recibiendo alertas aunque cierre sesión.
    // Si otro usuario se loguea en el mismo device, `registrarPushToken`
    // sobrescribirá el token al nuevo user. Si el usuario quiere dejar de
    // recibir push del todo, debe desinstalar la app.
    await logoutApi();
    setUsuario(null);
  }, []);

  return (
    <SessionContext.Provider value={{ usuario, loading, loginCliente, loginConPin, logout, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
