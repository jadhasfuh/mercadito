import { createContext, useContext, useState, type ReactNode } from "react";

interface BusquedaContextValue {
  query: string;
  setQuery: (q: string) => void;
}

const BusquedaContext = createContext<BusquedaContextValue>({
  query: "",
  setQuery: () => {},
});

export function BusquedaProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  return (
    <BusquedaContext.Provider value={{ query, setQuery }}>
      {children}
    </BusquedaContext.Provider>
  );
}

export function useBusqueda() {
  return useContext(BusquedaContext);
}
