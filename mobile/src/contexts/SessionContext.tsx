import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  fetchSession,
  loginCliente as loginClienteApi,
  loginConPin as loginConPinApi,
  logout as logoutApi,
  type Usuario,
} from "../api/auth";
import { registrarPushToken, desregistrarPushToken } from "../api/push";

interface SessionContextValue {
  usuario: Usuario | null;
  loading: boolean;
  loginCliente: (nombre: string, telefono: string) => Promise<{ ok: boolean; error?: string }>;
  loginConPin: (tipo: "repartidor" | "tienda", telefono: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
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

  const loginCliente = useCallback(async (nombre: string, telefono: string) => {
    try {
      const u = await loginClienteApi(nombre, telefono);
      setUsuario(u);
      tryRegistrarPush();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as { error?: string })?.error ?? "Error al iniciar sesion" };
    }
  }, []);

  const loginConPin = useCallback(async (tipo: "repartidor" | "tienda", telefono: string, pin: string) => {
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
    await desregistrarPushToken();
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
