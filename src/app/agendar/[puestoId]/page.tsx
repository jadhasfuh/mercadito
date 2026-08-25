"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { crearCitaOffline } from "@/lib/offlineCitasWeb";
import { DELIVERY_ACTIVO } from "@/lib/flags";

interface Servicio {
  id: string;
  nombre: string;
  descripcion: string | null;
  duracion_min: number;
  precio: string | number | null;
  activo: boolean;
}
interface Slot {
  inicio: string;
  fin: string;
  label: string;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function AgendarInner() {
  const params = useParams<{ puestoId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { usuario, loading: sesionLoading } = useSession();
  const puestoId = params.puestoId;
  const servicioParam = search.get("servicio");
  const editar = search.get("editar"); // id de cita a reagendar

  // Datos de contacto: prellenados con la cuenta logueada, pero editables
  // (por si agenda para alguien más).
  const [contNombre, setContNombre] = useState("");
  const [contTel, setContTel] = useState("");
  useEffect(() => {
    if (usuario) {
      setContNombre((v) => v || usuario.nombre);
      setContTel((v) => v || usuario.telefono);
    }
  }, [usuario]);

  const hoy = useMemo(() => ymd(new Date()), []);
  const maxFecha = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return ymd(d);
  }, []);

  const [servicios, setServicios] = useState<Servicio[]>([]);
  // Una entrada por persona: su servicio y nombre (opcional).
  const [personas, setPersonas] = useState<{ servicioId: string | null; nombre: string }[]>([
    { servicioId: servicioParam, nombre: "" },
  ]);
  const [fecha, setFecha] = useState(hoy);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [grid, setGrid] = useState<{ inicio: string; label: string; estado: "libre" | "ocupado" | "actual"; seleccionable: boolean }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Guard síncrono anti doble-tap: evita una fila duplicada antes de que el estado deshabilite el botón.
  const enviandoRef = useRef(false);

  // Modo edición (reagendar): precarga personas/servicios y fecha de la cita.
  useEffect(() => {
    if (!editar) return;
    fetch("/api/citas")
      .then((r) => (r.ok ? r.json() : []))
      .then((cs) => {
        const c = (cs || []).find((x: any) => x.id === editar);
        if (!c) return;
        if (c.personas?.length) setPersonas(c.personas.map((pp: any) => ({ servicioId: pp.servicio_id, nombre: pp.nombre ?? "" })));
        else if (c.servicio_id) setPersonas([{ servicioId: c.servicio_id, nombre: "" }]);
        setFecha(ymd(new Date(c.inicio)));
      })
      .catch(() => {});
  }, [editar]);

  const durDe = (sid: string | null) => servicios.find((s) => s.id === sid)?.duracion_min ?? 0;
  const totalDuracion = personas.reduce((a, p) => a + durDe(p.servicioId), 0);
  const todosElegidos = personas.length > 0 && personas.every((p) => !!p.servicioId);
  const primerServicioId = personas.find((p) => p.servicioId)?.servicioId ?? null;
  const setPersonaServicio = (i: number, sid: string) =>
    setPersonas((ps) => ps.map((p, idx) => (idx === i ? { ...p, servicioId: sid } : p)));
  const setPersonaNombre = (i: number, nombre: string) =>
    setPersonas((ps) => ps.map((p, idx) => (idx === i ? { ...p, nombre } : p)));

  useEffect(() => {
    if (!puestoId) return;
    fetch(`/api/servicios?puesto_id=${puestoId}`)
      .then((r) => r.json())
      .then((d: Servicio[]) => {
        const activos = Array.isArray(d) ? d.filter((s) => s.activo) : [];
        setServicios(activos);
        if (activos.length === 1) {
          setPersonas((ps) => ps.map((p, i) => (i === 0 && !p.servicioId ? { ...p, servicioId: activos[0].id } : p)));
        }
      })
      .catch(() => {});
  }, [puestoId]);

  useEffect(() => {
    if (!puestoId || !todosElegidos || !primerServicioId || !fecha) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSlot(null);
    const exc = editar ? `&excluir=${editar}` : "";
    fetch(`/api/citas/slots?puesto_id=${puestoId}&servicio_id=${primerServicioId}&fecha=${fecha}&duracion=${totalDuracion}${exc}`)
      .then((r) => r.json())
      .then((d) => setSlots(d?.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [puestoId, primerServicioId, totalDuracion, todosElegidos, fecha, editar]);

  // Cuadrícula visual (solo al reagendar).
  useEffect(() => {
    if (!editar || !puestoId || !todosElegidos || !primerServicioId || !fecha) {
      setGrid([]);
      return;
    }
    fetch(`/api/citas/slots?puesto_id=${puestoId}&servicio_id=${primerServicioId}&fecha=${fecha}&duracion=${totalDuracion}&vista=grid&excluir=${editar}`)
      .then((r) => r.json())
      .then((d) => setGrid(d?.grid ?? []))
      .catch(() => setGrid([]));
  }, [editar, puestoId, primerServicioId, totalDuracion, todosElegidos, fecha]);

  const grupos = useMemo(() => {
    const g: { titulo: string; items: Slot[] }[] = [
      { titulo: "Mañana", items: [] },
      { titulo: "Tarde", items: [] },
      { titulo: "Noche", items: [] },
    ];
    for (const s of slots) {
      const h = parseInt(s.label.slice(0, 2), 10);
      if (h < 12) g[0].items.push(s);
      else if (h < 18) g[1].items.push(s);
      else g[2].items.push(s);
    }
    return g.filter((x) => x.items.length > 0);
  }, [slots]);

  async function confirmar() {
    if (!todosElegidos || !slot) return;
    // Reagendar: solo mueve la hora (conserva servicios/cliente).
    if (editar) {
      if (enviandoRef.current) return;
      enviandoRef.current = true;
      setSubmitting(true);
      try {
        const res = await fetch(`/api/citas/${editar}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inicio: slot.inicio }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          alert(d?.error ?? "No se pudo reagendar.");
          return;
        }
        alert("Reserva reagendada ✅");
        router.back();
      } finally {
        enviandoRef.current = false;
        setSubmitting(false);
      }
      return;
    }
    // Sin muro de login: se puede reservar como invitado con nombre + teléfono.
    // El servidor acepta la cita de invitado (cliente_id null) y la liga si el
    // teléfono ya es un cliente registrado.
    if (!contNombre.trim() || contTel.replace(/\D/g, "").length < 10) {
      alert("Escribe el nombre y un teléfono válido (10 dígitos).");
      return;
    }
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setSubmitting(true);
    try {
      // Datos para la cita optimista si se guarda sin conexión.
      const servSel = personas.map((p) => servicios.find((s) => s.id === p.servicioId)).filter(Boolean) as Servicio[];
      const resumen = servSel.length === 1 ? servSel[0].nombre : servSel.length > 1 ? `${servSel[0].nombre} +${servSel.length - 1} más` : "Reserva";
      const precios = servSel.map((s) => (s.precio != null ? Number(s.precio) : null));
      const totalPrecio = precios.some((x) => x != null) ? precios.reduce<number>((a, x) => a + (x ?? 0), 0) : null;
      const r = await crearCitaOffline(
        {
          puesto_id: puestoId,
          personas: personas.map((p) => ({ servicio_id: p.servicioId, nombre: p.nombre.trim() || undefined })),
          inicio: slot.inicio,
          notas: notas.trim() || null,
          cliente_nombre: contNombre.trim(),
          cliente_telefono: contTel.replace(/\D/g, ""),
        },
        {
          id: "",
          puesto_id: puestoId,
          puesto_nombre: "",
          servicio_nombre: resumen,
          precio: totalPrecio,
          inicio: slot.inicio,
          fin: new Date(new Date(slot.inicio).getTime() + totalDuracion * 60_000).toISOString(),
          estado: "pendiente",
          cliente_nombre: contNombre.trim(),
          cliente_telefono: contTel.replace(/\D/g, ""),
        }
      );
      if (r.offline) {
        alert("📴 Sin internet. Tu reserva se guardó y se enviará sola cuando vuelva la señal.");
        router.push("/mis-citas");
        return;
      }
      if (r.status === 401) {
        alert("Inicia sesión como cliente para agendar tu reserva.");
        router.push(DELIVERY_ACTIVO ? "/cliente" : "/entrar?redirect=" + encodeURIComponent(window.location.pathname));
        return;
      }
      if (r.status) {
        alert(r.error ?? "No se pudo agendar.");
        return;
      }
      alert("¡Reserva agendada! El negocio la confirmará pronto.");
      router.push("/mis-citas");
    } finally {
      enviandoRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-serv text-white sticky top-0 z-20 shadow-[var(--shadow-card)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-2xl leading-none -ml-1" aria-label="Atrás">
            ‹
          </button>
          <h1 className="text-lg font-bold flex-1">{editar ? "Reagendar reserva" : "Agendar reserva"}</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto w-full px-4 pb-40 pt-4">
        {/* Nudge OPCIONAL de login: reservar como invitado ya es posible; tener
            cuenta solo sirve para ver tus reservas después. No bloquea. */}
        {!editar && !sesionLoading && !usuario && (
          <button
            onClick={() => router.push(DELIVERY_ACTIVO ? "/cliente" : "/entrar?redirect=" + encodeURIComponent(window.location.pathname))}
            className="w-full flex items-center gap-2 bg-serv-light text-serv-dark rounded-xl px-4 py-3 mb-4 text-sm font-semibold text-left"
          >
            👤 ¿Tienes cuenta? Inicia sesión para ver tus reservas — o reserva como invitado abajo
          </button>
        )}

        {/* Datos de contacto (al reagendar se conservan, no se piden) */}
        {!editar && (
          <>
            <h2 className="text-base font-semibold text-gray-800 mb-2.5">Tus datos</h2>
            <div className="grid grid-cols-2 gap-2 mb-6">
              <input
                value={contNombre}
                onChange={(e) => setContNombre(e.target.value)}
                placeholder="Nombre"
                className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              />
              <input
                value={contTel}
                onChange={(e) => setContTel(e.target.value.replace(/\D/g, ""))}
                placeholder="Teléfono"
                maxLength={10}
                inputMode="numeric"
                className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              />
            </div>
          </>
        )}

        {/* 1. Personas y servicios */}
        <h2 className="text-base font-semibold text-gray-800 mb-2.5">1 · Personas y servicios</h2>
        {servicios.length === 0 ? (
          <div className="text-gray-500 mb-6">Cargando servicios…</div>
        ) : (
          <div className="mb-6">
            {personas.map((persona, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-serv">Persona {i + 1}</span>
                  {personas.length > 1 && (
                    <button
                      onClick={() => setPersonas((ps) => ps.filter((_, idx) => idx !== i))}
                      className="text-gray-400 text-lg leading-none"
                      aria-label="Quitar persona"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <input
                  value={persona.nombre}
                  onChange={(e) => setPersonaNombre(i, e.target.value)}
                  placeholder="Nombre (opcional)"
                  className="w-full bg-gray-50 rounded-lg border border-gray-200 px-3 py-2 text-sm mb-2"
                />
                <div className="flex flex-wrap gap-2">
                  {servicios.map((s) => {
                    const sel = persona.servicioId === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setPersonaServicio(i, s.id)}
                        className={`px-3 py-2 rounded-lg border-2 text-sm transition-soft ${
                          sel ? "bg-serv border-serv text-white" : "bg-gray-100 border-transparent text-gray-700"
                        }`}
                      >
                        {s.nombre}
                        {s.precio != null ? ` · $${Number(s.precio)}` : ""} · {s.duracion_min}m
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              onClick={() => setPersonas((ps) => [...ps, { servicioId: servicios.length === 1 ? servicios[0].id : null, nombre: "" }])}
              className="w-full border-2 border-dashed border-serv text-serv rounded-xl py-2.5 font-semibold text-sm"
            >
              + Agregar persona
            </button>
            {totalDuracion > 0 && <div className="text-right text-sm text-gray-500 mt-2">Duración total: {totalDuracion} min</div>}
          </div>
        )}

        {/* 2. Fecha */}
        <h2 className="text-base font-semibold text-gray-800 mb-2.5">2 · Fecha</h2>
        <input
          type="date"
          value={fecha}
          min={hoy}
          max={maxFecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full bg-white rounded-xl border border-gray-200 px-4 py-3 text-gray-900 mb-6"
        />

        {/* 3. Hora */}
        <h2 className="text-base font-semibold text-gray-800 mb-2.5">3 · Hora</h2>
        {!todosElegidos ? (
          <div className="text-gray-500">Elige el servicio de cada persona.</div>
        ) : editar ? (
          /* Cuadrícula visual al reagendar: gris=ocupado, azul=esta cita, libres seleccionables */
          grid.length === 0 ? (
            <div className="text-gray-500">Sin horarios ese día.</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 mb-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 inline-block" /> Ocupado</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-serv-light border border-serv inline-block" /> Esta reserva</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-serv inline-block" /> Nuevo horario</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border border-gray-300 inline-block" /> Libre</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {grid.map((g) => {
                  // Franja que cubrirá la nueva cita: desde el inicio elegido por la
                  // duración total (p. ej. 60 min = 4 casillas de 15 min).
                  const selStart = slot ? new Date(slot.inicio).getTime() : null;
                  const blockMs = new Date(g.inicio).getTime();
                  const enNuevo = selStart != null && blockMs >= selStart && blockMs < selStart + totalDuracion * 60_000;
                  let cls = "bg-white border-gray-200 text-gray-700";
                  if (g.estado === "ocupado") cls = "bg-gray-200 border-gray-200 text-gray-400";
                  else if (g.estado === "actual") cls = "bg-serv-light border-serv text-serv-dark";
                  else if (!g.seleccionable) cls = "bg-gray-50 border-gray-100 text-gray-300";
                  if (enNuevo) cls = "bg-serv border-serv text-white";
                  return (
                    <button
                      key={g.inicio}
                      disabled={!g.seleccionable}
                      onClick={() => setSlot({ inicio: g.inicio, fin: g.inicio, label: g.label })}
                      className={`py-2 rounded-lg border-2 text-xs font-semibold ${cls}`}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </>
          )
        ) : loadingSlots ? (
          <div className="text-gray-400">Cargando horarios…</div>
        ) : slots.length === 0 ? (
          <div className="text-gray-500">No hay horarios disponibles ese día. Prueba otra fecha.</div>
        ) : (
          grupos.map((g) => (
            <div key={g.titulo} className="mb-4">
              <div className="text-sm font-semibold text-gray-500 mb-2">{g.titulo}</div>
              <div className="flex flex-wrap gap-2">
                {g.items.map((s) => {
                  const sel = slot?.inicio === s.inicio;
                  return (
                    <button
                      key={s.inicio}
                      onClick={() => setSlot(s)}
                      className={`px-4 py-2.5 rounded-xl border-2 font-medium transition-soft ${
                        sel ? "bg-serv border-serv text-white" : "bg-white border-gray-200 text-gray-700"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Notas */}
        <h2 className="text-base font-semibold text-gray-800 mb-2.5 mt-6">Notas (opcional)</h2>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Algo que el negocio deba saber…"
          className="w-full bg-white rounded-xl border border-gray-200 px-4 py-3 text-gray-900 min-h-[70px]"
        />
      </main>

      {/* Barra de confirmación */}
      {slot && todosElegidos && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[var(--shadow-modal)]">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 truncate">
                {personas.length} {personas.length === 1 ? "persona" : "personas"} · {totalDuracion} min
              </div>
              <div className="text-sm text-serv">{slot.label}</div>
            </div>
            <button
              onClick={confirmar}
              disabled={submitting}
              className="bg-serv text-white font-semibold rounded-xl px-7 py-3.5 disabled:opacity-60"
            >
              {submitting ? "…" : "Confirmar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgendarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <AgendarInner />
    </Suspense>
  );
}
