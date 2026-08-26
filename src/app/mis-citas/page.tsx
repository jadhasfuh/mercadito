"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CitasShell from "@/components/CitasShell";
import { confirmar } from "@/components/Dialogos";
import { listarCitasOffline, quitarDeColaWeb } from "@/lib/offlineCitasWeb";
import { DELIVERY_ACTIVO } from "@/lib/flags";

interface Cita {
  id: string;
  puesto_id: string;
  puesto_nombre: string;
  servicio_nombre: string;
  precio: string | number | null;
  inicio: string;
  estado: "pendiente" | "confirmada" | "completada" | "cancelada" | "no_show";
  _offline?: boolean;
  _localId?: string;
  _syncError?: string;
}

// Descarga un archivo .ics para agregar la reserva al calendario del cliente.
// No tenemos la duración en esta vista, así que bloqueamos 1h por defecto.
function icsFecha(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function descargarICS(c: Cita) {
  const dtStart = icsFecha(c.inicio);
  const dtEnd = icsFecha(new Date(new Date(c.inicio).getTime() + 60 * 60000).toISOString());
  const stamp = icsFecha(new Date().toISOString());
  const summary = `${c.servicio_nombre || "Reserva"} — ${c.puesto_nombre || "Mercadito"}`.replace(/\n/g, " ");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mercadito//Reservas//ES",
    "BEGIN:VEVENT", `UID:${c.id || stamp}@mercadito.cx`,
    `DTSTAMP:${stamp}`, `DTSTART:${dtStart}`, `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`, "DESCRIPTION:Reserva agendada en Mercadito",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reserva-${c.id || "cita"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ESTADO: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-warning-light text-warning-dark" },
  confirmada: { label: "Confirmada", cls: "bg-accent-light text-accent-dark" },
  completada: { label: "Completada", cls: "bg-gray-100 text-gray-600" },
  cancelada: { label: "Cancelada", cls: "bg-danger-light text-danger-dark" },
  no_show: { label: "No asistió", cls: "bg-danger-light text-danger-dark" },
};

const DOW = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${DOW[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Ordena: primero las citas activas y futuras (de la más próxima a la más
// lejana), luego el historial (lo más reciente primero).
function ordenarCitas(citas: Cita[]): Cita[] {
  const ahora = Date.now();
  const proxima = (c: Cita) =>
    (c.estado === "pendiente" || c.estado === "confirmada") && new Date(c.inicio).getTime() > ahora;
  return [...citas].sort((a, b) => {
    const pa = proxima(a), pb = proxima(b);
    if (pa && pb) return new Date(a.inicio).getTime() - new Date(b.inicio).getTime();
    if (pa !== pb) return pa ? -1 : 1;
    return new Date(b.inicio).getTime() - new Date(a.inicio).getTime();
  });
}

export default function MisCitasPage() {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);
  const [noAuth, setNoAuth] = useState(false);
  const [offline, setOffline] = useState(false);

  function load() {
    listarCitasOffline()
      .then((r) => {
        if (r.unauthorized) {
          setNoAuth(true);
          setCitas([]);
          return;
        }
        setOffline(r.offline);
        setCitas(r.citas as unknown as Cita[]);
      })
      .catch(() => setCitas([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function cancelar(c: Cita) {
    if (!(await confirmar({
      emoji: "😕",
      titulo: `¿Cancelar tu reserva de ${c.servicio_nombre}?`,
      mensaje: "Si cambias de opinión vas a tener que agendar de nuevo.",
      ok: "Sí, cancelarla",
      cancelar: "No, la conservo",
      peligro: true,
    }))) return;
    await fetch(`/api/citas/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "cancelada" }),
    });
    load();
  }

  return (
    <CitasShell active="citas">
      <main className="max-w-lg mx-auto w-full px-4 pb-24 pt-4">
        {loading ? (
          <div className="text-center text-gray-400 py-16">Cargando…</div>
        ) : noAuth ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-3">🔒</div>
            Inicia sesión para ver tus reservas.
            <div className="mt-4">
              <Link href={DELIVERY_ACTIVO ? "/cliente" : "/entrar?redirect=/mis-citas"} className="bg-serv text-white rounded-xl px-5 py-2.5 font-semibold">
                Ir a iniciar sesión
              </Link>
            </div>
          </div>
        ) : citas.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-3">📅</div>
            Aún no tienes reservas agendadas.
            <div className="mt-4">
              <Link href="/cliente/servicios" className="bg-serv text-white rounded-xl px-5 py-2.5 font-semibold">
                Explorar negocios
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {offline && (
              <div className="bg-warning-light text-warning-dark rounded-xl px-4 py-2.5 text-sm font-medium">
                📴 Sin conexión — mostrando tu última copia. Las reservas nuevas se enviarán al volver el internet.
              </div>
            )}
            {ordenarCitas(citas).map((c) => {
              if (c._offline) {
                return (
                  <div key={c.id} className={`bg-white rounded-2xl p-4 border ${c._syncError ? "border-red-300" : "border-amber-300"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-gray-900 truncate">{c.servicio_nombre}</div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${c._syncError ? "bg-danger-light text-danger-dark" : "bg-warning-light text-warning-dark"}`}>
                        {c._syncError ? "No se envió" : "Sin conexión"}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">{c.puesto_nombre || "Reserva pendiente de enviar"}</div>
                    <div className="text-sm text-gray-700 mt-2">🗓 {fmt(c.inicio)}</div>
                    <div className="text-sm text-gray-600 mt-2">
                      {c._syncError ? `⚠️ ${c._syncError}. Vuelve a agendarla.` : "📴 Se enviará sola cuando vuelva el internet."}
                    </div>
                    {c._syncError && (
                      <button
                        onClick={() => { if (c._localId) quitarDeColaWeb(c._localId); load(); }}
                        className="mt-3 border-2 border-danger text-danger text-sm font-semibold rounded-lg px-4 py-2"
                      >
                        Descartar
                      </button>
                    )}
                  </div>
                );
              }
              const est = ESTADO[c.estado] ?? ESTADO.pendiente;
              const futura = new Date(c.inicio).getTime() > Date.now();
              const activa = c.estado === "pendiente" || c.estado === "confirmada";
              return (
                <div key={c.id} className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-gray-900 truncate">{c.servicio_nombre}</div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${est.cls}`}>{est.label}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">{c.puesto_nombre}</div>
                  <div className="text-sm text-gray-700 mt-2">🗓 {fmt(c.inicio)}</div>
                  {c.precio != null && <div className="text-serv font-bold mt-1">${Number(c.precio)}</div>}
                  {/* Cuatro acciones no caben en una fila de teléfono: sumaban
                      ~450 px contra los ~300 disponibles. Con `overflow-x:
                      hidden` en el body eso no se veía como scroll sino como
                      un "Cancelar" cortado e inalcanzable. `flex-wrap` las
                      acomoda en dos renglones en móvil y deja una sola fila
                      en pantallas anchas. */}
                  {activa && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Link
                        href={`/chat/${c.puesto_id}?titulo=${encodeURIComponent(c.puesto_nombre)}`}
                        className="bg-serv-light text-serv-dark text-sm font-semibold rounded-lg px-3.5 py-2 whitespace-nowrap"
                      >
                        💬 Mensaje
                      </Link>
                      {futura && (
                        <Link
                          href={`/agendar/${c.puesto_id}?editar=${c.id}`}
                          className="bg-serv-light text-serv-dark text-sm font-semibold rounded-lg px-3.5 py-2 whitespace-nowrap"
                        >
                          🕐 Reagendar
                        </Link>
                      )}
                      {futura && (
                        <button
                          onClick={() => descargarICS(c)}
                          className="bg-serv-light text-serv-dark text-sm font-semibold rounded-lg px-3.5 py-2 whitespace-nowrap"
                        >
                          📅 Calendario
                        </button>
                      )}
                      {futura && (
                        <button
                          onClick={() => cancelar(c)}
                          className="border-2 border-danger text-danger text-sm font-semibold rounded-lg px-3.5 py-2 whitespace-nowrap"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </CitasShell>
  );
}
