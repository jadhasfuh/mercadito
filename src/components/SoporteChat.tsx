"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fechaHoraMX } from "@/lib/fecha";
import { avisar, confirmar, preguntar } from "@/components/Dialogos";

// Hilo de soporte admin ↔ negocio. El mismo componente sirve de los dos
// lados: cambia quién es "yo" y a qué hilo se escribe. Antes `mensajes` era
// de una sola dirección, así que un negocio con dudas no tenía a dónde
// escribir dentro del producto.

interface Mensaje {
  id: string;
  mensaje: string;
  de: string; // 'admin' | 'tienda'
  leido: boolean;
  created_at: string;
  editado_at?: string | null;
  de_nombre?: string | null;
}

interface Props {
  /** Qué lado está escribiendo. */
  yo: "admin" | "tienda";
  /** Hilo a abrir. El negocio siempre escribe al suyo; el admin elige. */
  puestoId?: string;
  /** Nombre del negocio, para el encabezado del lado admin. */
  puestoNombre?: string;
  onCerrar?: () => void;
  /** Se dispara al enviar o al marcar leídos, para refrescar contadores. */
  onCambio?: () => void;
}

export default function SoporteChat({ yo, puestoId, puestoNombre, onCerrar, onCambio }: Props) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    const url = puestoId ? `/api/mensajes?puesto_id=${encodeURIComponent(puestoId)}` : "/api/mensajes";
    try {
      const r = await fetch(url);
      if (!r.ok) return;
      const data: Mensaje[] = await r.json();
      // La API devuelve del más nuevo al más viejo; el hilo se lee al revés.
      setMensajes([...data].reverse());
    } finally {
      setCargando(false);
    }
  }, [puestoId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Marcar leído lo que llegó del otro lado, al abrir el hilo.
  useEffect(() => {
    fetch("/api/mensajes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "all", ...(yo === "admin" && puestoId ? { puesto_id: puestoId } : {}) }),
    }).then(() => onCambio?.()).catch(() => {});
    // Solo al abrir: si dependiera de los mensajes, se repetiría en cada carga.
  }, [yo, puestoId, onCambio]);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes.length]);

  // Cada lado corrige lo suyo; el admin además puede quitar cualquier mensaje
  // del hilo (le sirve para limpiar pruebas). El servidor vuelve a validarlo.
  async function editar(m: Mensaje) {
    const txt = await preguntar({
      emoji: "✏️",
      titulo: "Editar tu mensaje",
      valor: m.mensaje,
      multilinea: true,
      maxLength: 2000,
      ok: "Guardar cambios",
    });
    if (txt === null || txt.trim() === m.mensaje) return;
    const r = await fetch("/api/mensajes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, mensaje: txt }),
    });
    if (r.ok) { await cargar(); onCambio?.(); }
    else { const d = await r.json().catch(() => ({})); avisar({ emoji: "😕", titulo: "No se pudo editar", mensaje: d?.error }); }
  }

  async function borrar(m: Mensaje) {
    if (!(await confirmar({
      emoji: "🗑️",
      titulo: "¿Borrar este mensaje?",
      mensaje: "Desaparece para los dos lados. No se puede deshacer.",
      ok: "Sí, borrarlo",
      peligro: true,
    }))) return;
    const r = await fetch(`/api/mensajes?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    if (r.ok) { await cargar(); onCambio?.(); }
    else { const d = await r.json().catch(() => ({})); avisar({ emoji: "😕", titulo: "No se pudo borrar", mensaje: d?.error }); }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/mensajes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: t, ...(yo === "admin" ? { para_puesto_id: puestoId } : {}) }),
      });
      if (r.ok) {
        setTexto("");
        await cargar();
        onCambio?.();
      } else {
        const d = await r.json().catch(() => ({}));
        avisar({ emoji: "😕", titulo: "No se pudo enviar", mensaje: d.error });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {(puestoNombre || onCerrar) && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <p className="font-bold text-gray-800 truncate">{puestoNombre ?? "Soporte"}</p>
            <p className="text-[11px] text-gray-400">
              {yo === "admin" ? "Soporte al negocio" : "Escríbenos, te contestamos aquí"}
            </p>
          </div>
          {onCerrar && <button onClick={onCerrar} className="text-gray-400 text-2xl leading-none">×</button>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-cream/40 min-h-[240px]">
        {cargando ? (
          <p className="text-center text-gray-400 text-sm py-8">Cargando…</p>
        ) : mensajes.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8 px-6 leading-snug">
            {yo === "admin"
              ? "Todavía no hay mensajes con este negocio."
              : "¿Alguna duda con tu menú, tu cuenta o tu suscripción? Escríbenos aquí."}
          </p>
        ) : (
          mensajes.map((m) => {
            const mio = m.de === yo;
            return (
              <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                    mio ? "bg-brand text-white rounded-br-sm" : "bg-white text-gray-800 ring-1 ring-gray-100 rounded-bl-sm"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{m.mensaje}</p>
                  <p className={`text-[10px] mt-0.5 ${mio ? "text-white/70" : "text-gray-400"}`}>
                    {fechaHoraMX(m.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {m.editado_at ? " · editado" : ""}
                  </p>
                  {(mio || yo === "admin") && (
                    <div className={`flex gap-3 mt-1 text-[10px] font-semibold ${mio ? "text-white/80" : "text-gray-400"}`}>
                      {mio && <button onClick={() => editar(m)}>Editar</button>}
                      <button onClick={() => borrar(m)}>Borrar</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={finRef} />
      </div>

      <form onSubmit={enviar} className="flex items-center gap-2 p-3 border-t border-gray-100 bg-white">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe tu mensaje…"
          maxLength={2000}
          className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
        />
        <button
          type="submit"
          disabled={!texto.trim() || enviando}
          className="bg-brand text-white font-bold px-4 py-2.5 rounded-full text-sm disabled:opacity-40 active:scale-95 transition-transform"
        >
          {enviando ? "…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
