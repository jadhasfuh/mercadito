"use client";

import { useCallback, useEffect, useState } from "react";
import { fechaHoraMX } from "@/lib/fecha";
import SoporteChat from "@/components/SoporteChat";
import { avisar, confirmar } from "@/components/Dialogos";

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
  const [enviandoAviso, setEnviandoAviso] = useState(false);

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

  async function mandarAviso() {
    if (!(await confirmar({
      emoji: "📣",
      titulo: "¿Mandar el aviso del cambio a los negocios que faltan?",
      mensaje: "Explica que ya no hacemos entregas y que todo lo demás se queda. Solo les llega a los que no lo han recibido.",
      ok: "Sí, mandarlo",
    }))) return;
    setEnviandoAviso(true);
    try {
      const r = await fetch("/api/admin/aviso-negocios", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { avisar({ emoji: "😕", titulo: "No se pudo mandar", mensaje: d?.error }); return; }
      const n = Number(d?.enviados ?? 0);
      avisar({
        emoji: n > 0 ? "📣" : "✅",
        titulo: n === 0 ? "Ya todos lo habían recibido" : n === 1 ? "Listo, le llegó a 1 negocio" : `Listo, les llegó a ${n} negocios`,
        mensaje: n > 0 ? "Lo ven en su panel y les llega una notificación." : undefined,
      });
      cargar();
    } finally {
      setEnviandoAviso(false);
    }
  }

  async function borrarHilo(h: Hilo) {
    if (!(await confirmar({
      emoji: "🗑️",
      titulo: `¿Borrar la conversación con ${h.puesto_nombre}?`,
      mensaje: "Se van todos los mensajes, de los dos lados. No se puede deshacer.",
      ok: "Sí, borrarla",
      peligro: true,
    }))) return;
    const r = await fetch(`/api/mensajes?puesto_id=${encodeURIComponent(h.puesto_id)}`, { method: "DELETE" });
    if (r.ok) cargar();
    else { const d = await r.json().catch(() => ({})); avisar({ emoji: "😕", titulo: "No se pudo borrar", mensaje: d?.error }); }
  }

  return (
    <div className="mt-4 space-y-3">
      <button
        onClick={abrirNuevo}
        className="w-full py-3 border-2 border-dashed border-brand text-brand-dark rounded-xl font-medium active:scale-95 transition-transform"
      >
        + Escribir a un negocio
      </button>

      <div className="bg-white rounded-xl p-3 ring-1 ring-gray-100 flex items-center gap-3">
        <span className="text-xl flex-shrink-0">📣</span>
        <p className="flex-1 min-w-0 text-xs text-gray-500 leading-snug">
          Aviso del cambio para los negocios que ya estaban. Los nuevos reciben
          su bienvenida solos al registrarse.
        </p>
        <button
          onClick={mandarAviso}
          disabled={enviandoAviso}
          className="flex-shrink-0 bg-brand text-white text-xs font-bold rounded-lg px-3 py-2 disabled:opacity-50"
        >
          {enviandoAviso ? "Mandando…" : "Mandar a los que faltan"}
        </button>
      </div>

      {cargando ? (
        <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>
      ) : hilos.length === 0 ? (
        <p className="text-center text-gray-400 py-10 text-sm px-6 leading-snug">
          Todavía no hay conversaciones. Cuando un negocio escriba, aparece aquí.
        </p>
      ) : (
        <div className="space-y-2">
          {hilos.map((h) => (
            // El renglón dejó de ser un <button> completo: el de borrar vive
            // dentro y un botón anidado en otro es HTML inválido.
            <div
              key={h.puesto_id}
              className="flex items-start gap-2 bg-white rounded-2xl p-3.5 ring-1 ring-gray-100 shadow-[var(--shadow-card)]"
            >
              <button onClick={() => setAbierto(h)} className="flex-1 min-w-0 text-left">
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
              </button>
              <button
                onClick={() => borrarHilo(h)}
                className="shrink-0 text-gray-300 hover:text-danger px-1 py-0.5 text-lg leading-none"
                aria-label={`Borrar la conversación con ${h.puesto_nombre}`}
              >
                🗑
              </button>
            </div>
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
