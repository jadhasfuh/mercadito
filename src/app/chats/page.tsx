"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CitasShell from "@/components/CitasShell";

interface Thread {
  puesto_id?: string;
  puesto_nombre?: string;
  logo?: string | null;
  cliente_telefono?: string;
  cliente_nombre?: string | null;
  ultimo_texto: string;
  created_at: string;
  no_leidos: string | number;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export default function ChatsPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [noAuth, setNoAuth] = useState(false);
  const [q, setQ] = useState("");

  function load() {
    fetch("/api/chat/threads")
      .then((r) => {
        if (r.status === 401) {
          setNoAuth(true);
          return [];
        }
        return r.json();
      })
      .then((d) => setThreads(Array.isArray(d) ? d : []))
      .catch(() => setThreads([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);

  async function limpiar() {
    if (!confirm("¿Borrar todas tus conversaciones? No se puede deshacer.")) return;
    await fetch("/api/chat", { method: "DELETE" });
    load();
  }
  async function borrarThread(t: Thread) {
    if (!confirm("¿Borrar esta conversación?")) return;
    await fetch(`/api/chat?puesto_id=${encodeURIComponent(t.puesto_id ?? "")}`, { method: "DELETE" });
    load();
  }
  const filtrados = threads.filter((t) => {
    const n = q.trim().toLowerCase();
    if (!n) return true;
    return String(t.puesto_nombre ?? t.cliente_nombre ?? t.cliente_telefono ?? "").toLowerCase().includes(n);
  });

  return (
    <CitasShell active="mensajes">
      <main className="max-w-lg mx-auto w-full px-4 pb-24 pt-4">
        {loading ? (
          <div className="text-center text-gray-400 py-16">Cargando…</div>
        ) : noAuth ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-3">🔒</div>
            Inicia sesión para ver tus mensajes.
            <div className="mt-4">
              <Link href="/cliente" className="bg-serv text-white rounded-xl px-5 py-2.5 font-semibold">
                Ir a iniciar sesión
              </Link>
            </div>
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-3">💬</div>
            No tienes conversaciones todavía. Los mensajes se activan cuando tienes una cita.
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversación…" className="flex-1 bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
              <button onClick={limpiar} className="border border-danger text-danger text-sm font-semibold rounded-lg px-3">🗑</button>
            </div>
            <div className="space-y-2.5">
            {filtrados.map((t, i) => {
              const noLeidos = Number(t.no_leidos) || 0;
              const titulo = t.puesto_nombre ?? t.cliente_nombre ?? t.cliente_telefono ?? "Conversación";
              const href = t.puesto_id
                ? `/chat/${t.puesto_id}?titulo=${encodeURIComponent(titulo)}`
                : `/chat/x?clienteTelefono=${encodeURIComponent(t.cliente_telefono ?? "")}&titulo=${encodeURIComponent(titulo)}`;
              return (
                <div key={i} className="flex items-center gap-2">
                  <Link href={href} className="flex-1 min-w-0 flex items-center gap-3 bg-white rounded-2xl p-3 shadow-[var(--shadow-card)]">
                    <div className="w-12 h-12 rounded-full bg-serv-light flex items-center justify-center text-serv font-bold text-lg shrink-0">
                      {titulo.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900 truncate">{titulo}</span>
                        <span className="text-[11px] text-gray-400 shrink-0">{fmt(t.created_at)}</span>
                      </div>
                      <div className={`text-sm truncate ${noLeidos > 0 ? "text-gray-900 font-semibold" : "text-gray-500"}`}>
                        {t.ultimo_texto}
                      </div>
                    </div>
                    {noLeidos > 0 && (
                      <span className="bg-serv text-white text-xs font-bold rounded-full min-w-[22px] h-[22px] px-1.5 flex items-center justify-center">
                        {noLeidos}
                      </span>
                    )}
                  </Link>
                  <button onClick={() => borrarThread(t)} className="text-gray-400 hover:text-danger px-2 py-3" aria-label="Borrar conversación">🗑</button>
                </div>
              );
            })}
            </div>
          </>
        )}
      </main>
    </CitasShell>
  );
}
