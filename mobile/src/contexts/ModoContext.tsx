import { createContext, useContext, useState, type ReactNode } from "react";

// Modo del home: "mercado" (catálogo, naranja) o "servicios" (citas, índigo).
// El switch del home lo alterna y recolorea las superficies del modo servicios.
// NO se persiste: la app siempre arranca en "mercado" (decisión de producto).
export type Modo = "mercado" | "servicios";

interface ModoCtx {
  modo: Modo;
  setModo: (m: Modo) => void;
  toggle: () => void;
}

const Ctx = createContext<ModoCtx>({ modo: "mercado", setModo: () => {}, toggle: () => {} });

export function ModoProvider({ children }: { children: ReactNode }) {
  const [modo, setModo] = useState<Modo>("mercado");
  const toggle = () => setModo(modo === "mercado" ? "servicios" : "mercado");
  return <Ctx.Provider value={{ modo, setModo, toggle }}>{children}</Ctx.Provider>;
}

export const useModo = () => useContext(Ctx);
