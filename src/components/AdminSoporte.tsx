"use client";

import { useCallback, useEffect, useState } from "react";
import { fechaHoraMX } from "@/lib/fecha";
import SoporteChat from "@/components/SoporteChat";

// Bandeja de soporte del admin: un renglón por negocio, los que escribieron
// y siguen sin respuesta hasta arriba.

interface Hilo {
  puesto_id: string;
  puesto_nombre: string;
  telefono_contacto: string | null;
  ultimo: string;
  ultimo_de: string;
  ultimo_at: string;
  sin_leer: number;
}

export default function AdminSoporte() {
  const [hilos, setHilos] = useState<Hilo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<Hilo | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [negocios, setNegocios] = useState<{ id: string; nombre: string }[]>([]);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/mensajes/hilos");
      if (r.ok) setHilos((await r.json()).hilos ?? []);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // La lista completa solo se pide al abrir "escribir a un negocio": no hace
  // falta cargarla de entrada si el admin solo va a contestar.
  async function abrirNuevo() {
    setNuevo(true);
    if (negocios.length === 0) {
      const r = await fetch("/api/puestos");
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) {
          setNegocios(data.map((p: { id: string; nombre: string }) => ({ id: p.id, nombre: p.nombre }))
            .sort((a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre)));
        }
      }
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <button
        onClick={abrirNuevo}
        className="w-full py-3 border-2 border-dashed border-brand text-brand-dark rounded-xl font-medium active:scale-95 transition-transform"
      >
        + Escribir a un negocio
      </button>

      {cargando ? (
        <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>
      ) : hilos.length === 0 ? (
        <p className="text-center text-gray-400 py-10 text-sm px-6 leading-snug">
          Todavía no hay conversaciones. Cuando un negocio escriba, aparece aquí.
        </p>
      ) : (
        <div className="space-y-2">
          {hilos.map((h) => (
            <button
              key={h.puesto_id}
              onClick={() => setAbierto(h)}
              className="w-full text-left flex items-start gap-3 bg-white rounded-2xl p-3.5 ring-1 ring-gray-100 shadow-[var(--shadow-card)]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-gray-900 truncate flex-1 min-w-0">{h.puesto_nombre}</p>
                  {h.sin_leer > 0 && (
                    <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full shrink-0">
                      {h.sin_leer}
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-gray-500 truncate mt-0.5">
                  {h.ultimo_de === "admin" && <span className="text-gray-400">Tú: </span>}
                  {h.ultimo}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {fechaHoraMX(h.ultimo_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => { setAbierto(null); cargar(); }}>
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden h-[85vh] sm:h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <SoporteChat
              yo="admin"
              puestoId={abierto.puesto_id}
              puestoNombre={abierto.puesto_nombre}
              onCerrar={() => { setAbierto(null); cargar(); }}
              onCambio={cargar}
            />
          </div>
        </div>
      )}

      {nuevo && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setNuevo(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-bold text-gray-800">¿A qué negocio?</p>
              <button onClick={() => setNuevo(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="p-2">
              {negocios.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">Cargando…</p>
              ) : negocios.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setNuevo(false);
                    setAbierto({
                      puesto_id: n.id, puesto_nombre: n.nombre, telefono_contacto: null,
                      ultimo: "", ultimo_de: "admin", ultimo_at: new Date().toISOString(), sin_leer: 0,
                    });
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 text-sm text-gray-700"
                >
                  {n.nombre}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
