"use client";

import { useEffect, useState } from "react";
import { minutosDesde, textoEspera, nivelEspera, COLOR_ESPERA } from "@/lib/espera";

/** Reloj compartido del board: un solo intervalo para todos los chips en
 *  pantalla, en vez de uno por comanda. Tick de 15 s — el chip muestra
 *  minutos, así que más frecuencia solo gastaría renders. */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

/**
 * Cuánto lleva esperando una comanda. Se pinta verde, ámbar o rojo según el
 * tiempo, para que cocina vea de un vistazo qué se está atrasando sin leer
 * ningún número.
 */
export default function ChipEspera({ desde, className = "" }: { desde: string | null; className?: string }) {
  const ahora = useAhora();
  const min = minutosDesde(desde, ahora);
  if (min == null) return null;
  const c = COLOR_ESPERA[nivelEspera(min)];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full tabular-nums ${className}`}
      style={{ backgroundColor: c.fondo, color: c.texto }}
      title={`Esperando desde hace ${textoEspera(min)}`}
    >
      ⏱ {textoEspera(min)}
    </span>
  );
}
