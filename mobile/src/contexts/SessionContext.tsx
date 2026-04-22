import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchSession, loginCliente as loginClienteApi, logout as logoutApi, type Usuario } from "../api/auth";

interface SessionContextValue {
  usuario: Usuario | null;
  loading: boolean;
  loginCliente: (nombre: string, telefono: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  usuario: null,
  loading: true,
  loginCliente: async () => ({ ok: false }),
  logout: async () => {},
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const u = await fetchSession();
    setUsuario(u);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loginCliente = useCallback(async (nombre: string, telefono: string) => {
    try {
      const u = await loginClienteApi(nombre, telefono);
      setUsuario(u);
      return { ok: true };
    } catch (e) {
      const msg = (e as { error?: string })?.error ?? "Error al iniciar sesion";
      return { ok: false, error: msg };
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutApi();
    setUsuario(null);
  }, []);

  return (
    <SessionContext.Provider value={{ usuario, loading, loginCliente, logout, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
