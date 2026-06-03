"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

interface ChatMensaje {
  id: string;
  de: "cliente" | "negocio";
  texto: string;
  created_at: string;
}

function fmtHora(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ChatInner() {
  const params = useParams<{ puestoId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { usuario } = useSession();
  const puestoId = params.puestoId;
  const clienteTelefono = search.get("clienteTelefono") ?? undefined;
  const titulo = search.get("titulo") ?? "Conversación";
  const esTienda = usuario?.rol === "tienda" || usuario?.rol === "admin";
  const miLado = esTienda ? "negocio" : "cliente";

  const [mensajes, setMensajes] = useState<ChatMensaje[]>([]);
  const [texto, setTexto] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  function load() {
    const q = new URLSearchParams({ puesto_id: puestoId });
    if (esTienda && clienteTelefono) q.set("cliente_telefono", clienteTelefono);
    fetch(`/api/chat?${q.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setMensajes(Array.isArray(d) ? d : []))
      .catch(() => {});
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 8000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puestoId, clienteTelefono]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes.length]);

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        esTienda ? { puesto_id: puestoId, cliente_telefono: clienteTelefono, texto: t } : { puesto_id: puestoId, texto: t }
      ),
    }).catch(() => {});
    load();
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="bg-serv text-white sticky top-0 z-20 shadow-[var(--shadow-card)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-2xl leading-none -ml-1" aria-label="Atrás">
            ‹
          </button>
          <h1 className="text-lg font-bold flex-1 truncate">{titulo}</h1>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 overflow-y-auto">
        {mensajes.length === 0 && <div className="text-center text-gray-400 mt-10">Aún no hay mensajes. Escribe el primero 👋</div>}
        <div className="space-y-2">
          {mensajes.map((m) => {
            const mio = m.de === miLado;
            return (
              <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2 ${
                    mio ? "bg-serv text-white rounded-br-sm" : "bg-white text-gray-900 rounded-bl-sm shadow-[var(--shadow-card)]"
                  }`}
                >
                  <div className="text-[15px]">{m.texto}</div>
                  <div className={`text-[11px] mt-0.5 text-right ${mio ? "text-white/70" : "text-gray-400"}`}>{fmtHora(m.created_at)}</div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </main>

      <div className="bg-white border-t border-gray-100 sticky bottom-0">
        <div className="max-w-lg mx-auto px-3 py-2 flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder="Escribe un mensaje…"
            rows={1}
            className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-gray-900 resize-none max-h-28"
          />
          <button onClick={enviar} className="w-11 h-11 rounded-full bg-serv text-white flex items-center justify-center shrink-0">
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <ChatInner />
    </Suspense>
  );
}
