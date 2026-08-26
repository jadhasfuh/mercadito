"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMXN } from "@/lib/dinero";
import { fechaHoraMX } from "@/lib/fecha";
import { LABEL_METODO, type Metodo } from "@/lib/mostrador";
import InputBuscar from "@/components/InputBuscar";
import TicketCuenta from "@/components/TicketCuenta";

interface TicketItem { nombre: string; cantidad: number; subtotal: number; notas: string | null; variante: string | null }
interface Ticket {
  id: string; folio: number | null; titulo: string; metodo_pago: string | null;
  propina: number; total: number; cerrada_at: string; cliente_nombre: string | null;
  items: TicketItem[];
}

const cuando = (iso: string) => fechaHoraMX(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Tickets cobrados, para volver a imprimirlos.
 *
 * "Se cortó el papel", "el cliente quiere su copia", "¿qué llevaba el folio
 * 214?". Sin esto, un ticket impreso mal se perdía: la venta quedaba
 * registrada pero no había forma de volver a sacarla en papel.
 */
export default function TicketsPanel({ negocioNombre }: { negocioNombre: string }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<Ticket | null>(null);

  const cargar = useCallback((busqueda: string) => {
    fetch(`/api/tienda/tickets${busqueda ? `?q=${encodeURIComponent(busqueda)}` : ""}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTickets)
      .catch(() => setTickets([]));
  }, []);

  useEffect(() => {
    // Debounce: el folio se teclea dígito por dígito y no vale pegarle al
    // servidor en cada uno.
    const t = setTimeout(() => cargar(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q, cargar]);

  return (
    <div className="space-y-3">
      <InputBuscar value={q} onChange={setQ} placeholder="Busca por folio (ej. 214)…" />

      {tickets === null ? (
        <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>
      ) : tickets.length === 0 ? (
        <p className="text-center text-gray-400 py-10 text-sm leading-snug">
          {q.trim() ? `No encontramos el folio ${q.trim()}.` : "Todavía no has cobrado ningún ticket."}
        </p>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => setAbierto(t)}
              className="w-full flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm text-left active:scale-[0.99] transition-transform"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-800 truncate">
                  {t.folio != null && <span className="text-gray-400 font-mono mr-1.5">#{t.folio}</span>}
                  {t.titulo}
                </p>
                <p className="text-[11px] text-gray-400">
                  {cuando(t.cerrada_at)}
                  {t.metodo_pago && ` · ${LABEL_METODO[t.metodo_pago as Metodo] ?? t.metodo_pago}`}
                  {t.cliente_nombre && ` · ${t.cliente_nombre}`}
                </p>
              </div>
              <span className="font-bold text-gray-800 tabular-nums shrink-0">{formatMXN(t.total + t.propina)}</span>
              <span className="text-gray-300 shrink-0">🖨️</span>
            </button>
          ))}
        </div>
      )}

      {abierto && (
        <TicketCuenta
          negocioNombre={negocioNombre}
          etiqueta={abierto.folio != null ? `#${abierto.folio} · ${abierto.titulo}` : abierto.titulo}
          items={abierto.items.map((i, n) => ({
            id: String(n), producto_nombre: i.nombre, cantidad: i.cantidad,
            subtotal: i.subtotal, variante_nombre: i.variante, notas: i.notas,
          }))}
          total={abierto.total + abierto.propina}
          onClose={() => setAbierto(null)}
        />
      )}
    </div>
  );
}
