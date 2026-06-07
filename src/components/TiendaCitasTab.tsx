"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listarCitasOffline, crearCitaOffline, quitarDeColaWeb } from "@/lib/offlineCitasWeb";
import { waUrl } from "@/lib/contacto";

// Sección "Citas" del panel de tienda en web — paridad con la app móvil:
// Agenda, Servicios (CRUD), Ventas, Contactos y Mensajes. Usa los mismos
// endpoints (/api/citas, /api/servicios, /api/citas/stats, /api/chat/threads),
// autenticados por cookie de sesión de la tienda.

type Num = number | string | null;
type EstadoCita = "pendiente" | "confirmada" | "completada" | "cancelada" | "no_show";

interface Cita {
  id: string; cliente_nombre: string; cliente_telefono: string;
  servicio_nombre: string; precio: Num; monto_cobrado?: Num; inicio: string; estado: EstadoCita; notas: string | null;
  puesto_id: string;
  _offline?: boolean; _localId?: string; _syncError?: string;
}
interface Servicio {
  id: string; nombre: string; descripcion: string | null; duracion_min: number;
  buffer_min: number; precio: Num; activo: boolean;
}
interface Slot { inicio: string; label: string }

const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (iso: string) => { const d = new Date(iso); return `${DOW[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtCorto = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MESES[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const ESTADO: Record<EstadoCita, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-warning-light text-warning-dark" },
  confirmada: { label: "Confirmada", cls: "bg-accent-light text-accent-dark" },
  completada: { label: "Completada", cls: "bg-gray-100 text-gray-600" },
  cancelada: { label: "Cancelada", cls: "bg-danger-light text-danger-dark" },
  no_show: { label: "No asistió", cls: "bg-danger-light text-danger-dark" },
};

type Sub = "agenda" | "servicios" | "contactos" | "mensajes";

// Ventas como sección propia (antes era sub-pestaña de Reservas). Reusa el mismo
// gate: si el negocio no tiene reservas activas, muestra la tarjeta de activación.
export function TiendaVentasTab({ puestoId }: { puestoId: string | null }) {
  const [reservasActiva, setReservasActiva] = useState<boolean | null>(null);
  useEffect(() => {
    if (!puestoId) return;
    fetch("/api/puestos")
      .then((r) => r.json())
      .then((puestos) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mi = Array.isArray(puestos) ? puestos.find((p: any) => p.id === puestoId) : null;
        setReservasActiva(!!mi && (mi.tipo === "servicios" || mi.tipo === "ambos"));
      })
      .catch(() => setReservasActiva(true));
  }, [puestoId]);
  if (reservasActiva === false) return <ActivarReservas onListo={() => setReservasActiva(true)} />;
  return <div className="max-w-lg mx-auto w-full px-4 pb-24 pt-3"><Ventas /></div>;
}

export default function TiendaCitasTab({ puestoId }: { puestoId: string | null }) {
  const [sub, setSub] = useState<Sub>("agenda");
  // ¿El negocio ya tiene Reservas activas? (tipo 'servicios' o 'ambos'). null =
  // cargando. false = es un negocio de catálogo que aún no las activó → mostramos
  // la tarjeta de activación (restaurantes/cafés pueden ofrecer reservas).
  const [reservasActiva, setReservasActiva] = useState<boolean | null>(null);
  useEffect(() => {
    if (!puestoId) return;
    fetch("/api/puestos")
      .then((r) => r.json())
      .then((puestos) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mi = Array.isArray(puestos) ? puestos.find((p: any) => p.id === puestoId) : null;
        setReservasActiva(!!mi && (mi.tipo === "servicios" || mi.tipo === "ambos"));
      })
      .catch(() => setReservasActiva(true)); // ante error, no bloquear el panel
  }, [puestoId]);

  const subs: { id: Sub; label: string; icon: string }[] = [
    { id: "agenda", label: "Agenda", icon: "📅" },
    { id: "servicios", label: "Servicios", icon: "✂️" },
    { id: "contactos", label: "Contactos", icon: "👥" },
    { id: "mensajes", label: "Mensajes", icon: "💬" },
  ];

  if (reservasActiva === false) return <ActivarReservas onListo={() => setReservasActiva(true)} />;

  return (
    <div className="max-w-lg mx-auto w-full px-4 pb-24 pt-3">
      {/* Sub-pestañas (slider) */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
        {subs.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={`shrink-0 px-3.5 py-2 rounded-full text-sm font-semibold transition-soft ${
              sub === s.id ? "bg-serv text-white" : "bg-serv-light text-serv-dark"
            }`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {sub === "agenda" && <Agenda puestoId={puestoId} />}
      {sub === "servicios" && <Servicios puestoId={puestoId} />}
      {sub === "contactos" && <Contactos />}
      {sub === "mensajes" && <Mensajes puestoId={puestoId} />}
    </div>
  );
}

/* ──────────────────── Activar Reservas (onboarding) ──────────────────── */
function ActivarReservas({ onListo }: { onListo: () => void }) {
  const [activando, setActivando] = useState(false);
  const activar = async () => {
    setActivando(true);
    try {
      const res = await fetch("/api/puestos/activar-reservas", { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "No se pudo activar"); return; }
      onListo();
    } finally {
      setActivando(false);
    }
  };
  return (
    <div className="max-w-lg mx-auto w-full px-4 pt-6 pb-24">
      <div className="bg-white rounded-2xl p-6 text-center shadow-sm border-2 border-dashed border-serv/30">
        <div className="text-4xl mb-2">📅</div>
        <h3 className="font-bold text-gray-800 text-lg">Activa Reservas para tu negocio</h3>
        <p className="text-sm text-gray-500 mt-2">
          Restaurantes, cafés, salones y cualquier negocio pueden recibir reservas en línea:
          tus clientes eligen día y hora, y tú las administras desde aquí. Tu catálogo y pedidos
          a domicilio siguen igual.
        </p>
        <ul className="text-sm text-gray-600 text-left mt-3 space-y-1 mx-auto max-w-xs">
          <li>✅ Agenda con horarios y disponibilidad</li>
          <li>✅ Recordatorios automáticos al cliente</li>
          <li>✅ Reportes de reservas e ingresos</li>
        </ul>
        <p className="text-serv font-extrabold text-lg mt-4">Prueba 30 días gratis</p>
        <p className="text-xs text-gray-400">Después $99/mes. Sin comisiones por reserva.</p>
        <button
          onClick={activar}
          disabled={activando}
          className="mt-4 bg-serv text-white font-bold rounded-xl px-6 py-3 text-sm disabled:opacity-60"
        >
          {activando ? "Activando…" : "Activar Reservas"}
        </button>
        <p className="text-[11px] text-gray-400 mt-3">Te dejamos lista una reserva de ejemplo (“Reservar mesa”) que puedes editar.</p>
      </div>
    </div>
  );
}

/* ───────────────────────── Agenda ───────────────────────── */
function Agenda({ puestoId }: { puestoId: string | null }) {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"hoy" | "proximas" | "historial">("hoy");
  const [nueva, setNueva] = useState(false);
  const [q, setQ] = useState("");
  const [offline, setOffline] = useState(false);

  const load = useCallback(() => {
    listarCitasOffline()
      .then((r) => { setOffline(r.offline); setCitas(r.citas as unknown as Cita[]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function cambiar(c: Cita, estado: EstadoCita) {
    await fetch(`/api/citas/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado }) });
    load();
  }
  async function eliminar(c: Cita) {
    if (!confirm(`¿Eliminar esta reserva de ${c.cliente_nombre}? No se puede deshacer.`)) return;
    await fetch(`/api/citas/${c.id}`, { method: "DELETE" });
    load();
  }
  async function ajustarMonto(c: Cita) {
    const actual = c.monto_cobrado ?? c.precio;
    const val = window.prompt(
      `Monto cobrado de "${c.servicio_nombre}" (precio $${Number(c.precio ?? 0)}). Déjalo vacío para usar el precio normal.`,
      actual != null ? String(Number(actual)) : ""
    );
    if (val === null) return; // canceló
    const limpio = val.replace(/[^0-9.]/g, "");
    const monto = limpio === "" ? null : Number(limpio);
    if (monto !== null && (isNaN(monto) || monto < 0)) { alert("Monto inválido."); return; }
    await fetch(`/api/citas/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monto_cobrado: monto }) });
    load();
  }
  async function limpiar() {
    if (!confirm("Se borrarán todas las reservas canceladas y de 'no asistió'. Las completadas se conservan (cuentan en ventas). ¿Continuar?")) return;
    const res = await fetch("/api/citas", { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    load();
    alert(`${d?.borradas ?? 0} reserva(s) eliminada(s).`);
  }

  const ahora = Date.now();
  const esActiva = (e: EstadoCita) => e === "pendiente" || e === "confirmada";
  const hoy = (iso: string) => { const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };
  const needle = q.trim().toLowerCase();
  const visibles = citas
    .filter((c) => {
      if (needle && !(c.cliente_nombre.toLowerCase().includes(needle) || c.cliente_telefono.includes(needle))) return false;
      const t = new Date(c.inicio).getTime();
      if (filtro === "hoy") return hoy(c.inicio) && esActiva(c.estado);
      if (filtro === "proximas") return t > ahora && esActiva(c.estado);
      return !esActiva(c.estado) || t < ahora;
    })
    .sort((a, b) => (filtro === "historial" ? new Date(b.inicio).getTime() - new Date(a.inicio).getTime() : new Date(a.inicio).getTime() - new Date(b.inicio).getTime()));

  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente o teléfono…" className="w-full bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm mb-3" />
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-2">
          {(["hoy", "proximas", "historial"] as const).map((f) => (
            <button key={f} onClick={() => setFiltro(f)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${filtro === f ? "bg-serv text-white" : "bg-white text-gray-600"}`}>
              {f === "hoy" ? "Hoy" : f === "proximas" ? "Próximas" : "Historial"}
            </button>
          ))}
        </div>
        {filtro === "historial" && (
          <button onClick={limpiar} aria-label="Limpiar historial" className="border border-danger text-danger rounded-full w-8 h-8 flex items-center justify-center">🗑</button>
        )}
      </div>

      {offline && (
        <div className="bg-warning-light text-warning-dark rounded-xl px-4 py-2.5 text-sm font-medium mb-3">
          📴 Sin conexión — mostrando tu última copia. Las reservas nuevas se enviarán al volver el internet.
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12">Cargando…</div>
      ) : visibles.length === 0 ? (
        <div className="text-center text-gray-500 py-12">No hay reservas {filtro === "hoy" ? "para hoy" : filtro === "proximas" ? "próximas" : "en el historial"}.</div>
      ) : (
        <div className="space-y-3">
          {visibles.map((c) => {
            if (c._offline) {
              return (
                <div key={c.id} className={`bg-white rounded-2xl p-4 border ${c._syncError ? "border-red-300" : "border-amber-300"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900 truncate">{c.cliente_nombre || "Cliente"}</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${c._syncError ? "bg-danger-light text-danger-dark" : "bg-warning-light text-warning-dark"}`}>
                      {c._syncError ? "No se envió" : "Sin conexión"}
                    </span>
                  </div>
                  <div className="text-sm text-serv mt-0.5">{c.servicio_nombre}</div>
                  <div className="text-sm text-gray-700 mt-1">🕐 {fmtCorto(c.inicio)}</div>
                  <div className="text-sm text-gray-600 mt-2">
                    {c._syncError ? `⚠️ ${c._syncError}. Vuelve a agendarla.` : "📴 Se enviará sola cuando vuelva el internet."}
                  </div>
                  {c._syncError && (
                    <button onClick={() => { if (c._localId) quitarDeColaWeb(c._localId); load(); }} className="mt-2.5 text-gray-500 text-sm">Descartar</button>
                  )}
                </div>
              );
            }
            const est = ESTADO[c.estado]; const pasada = new Date(c.inicio).getTime() <= ahora;
            return (
              <div key={c.id} className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900 truncate">{c.cliente_nombre}</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${est.cls}`}>{est.label}</span>
                </div>
                <div className="text-sm text-serv mt-0.5">{c.servicio_nombre}</div>
                <div className="text-sm text-gray-700 mt-1 flex items-center gap-2 flex-wrap">
                  🕐 {fmtCorto(c.inicio)}
                  <a href={`tel:${c.cliente_telefono}`} className="text-accent-dark bg-accent-light rounded-full px-2 py-0.5 text-xs">📞 {c.cliente_telefono}</a>
                  <a href={`https://wa.me/52${c.cliente_telefono}`} target="_blank" rel="noreferrer" className="text-white bg-[#25D366] rounded-full px-2 py-0.5 text-xs">WhatsApp</a>
                </div>
                {c.notas && <div className="text-sm text-gray-500 italic mt-1.5">“{c.notas}”</div>}
                {esActiva(c.estado) && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {c.estado === "pendiente" && <Btn label="Confirmar" cls="bg-accent text-white" onClick={() => cambiar(c, "confirmada")} />}
                    <Link href={`/chat/${c.puesto_id}?clienteTelefono=${encodeURIComponent(c.cliente_telefono)}&titulo=${encodeURIComponent(c.cliente_nombre)}`} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-serv-light text-serv-dark">💬 Mensaje</Link>
                    <Link href={`/agendar/${c.puesto_id}?editar=${c.id}`} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-serv-light text-serv-dark">🕐 Reagendar</Link>
                    {pasada && c.estado === "confirmada" && <Btn label="Completada" cls="bg-serv text-white" onClick={() => cambiar(c, "completada")} />}
                    {pasada && c.estado === "confirmada" && <Btn label="No asistió" cls="border border-gray-300 text-gray-600" onClick={() => cambiar(c, "no_show")} />}
                    <Btn label="Cancelar" cls="border border-danger text-danger" onClick={() => cambiar(c, "cancelada")} />
                  </div>
                )}
                {!esActiva(c.estado) && (
                  <div className="mt-2.5 flex items-center gap-3 flex-wrap">
                    {c.estado === "completada" && (
                      <span className="text-sm text-gray-700">
                        Cobrado: <b className="text-gray-900">${Number(c.monto_cobrado ?? c.precio ?? 0)}</b>
                        {c.monto_cobrado != null && Number(c.monto_cobrado) !== Number(c.precio ?? 0) ? " (ajustado)" : ""}
                        <button onClick={() => ajustarMonto(c)} className="ml-2 text-serv font-semibold">✏️ Ajustar</button>
                      </span>
                    )}
                    <button onClick={() => eliminar(c)} className="flex items-center gap-1.5 text-gray-500 text-sm">🗑 Eliminar</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* FAB flotante para nueva cita (como en la app móvil) */}
      <button
        onClick={() => setNueva(true)}
        aria-label="Nueva reserva"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-serv text-white text-3xl leading-none shadow-[0_4px_16px_rgba(0,0,0,0.25)] flex items-center justify-center z-40"
      >
        +
      </button>

      {nueva && <NuevaCitaModal puestoId={puestoId} onClose={() => setNueva(false)} onSaved={() => { setNueva(false); load(); }} />}
    </div>
  );
}

function Btn({ label, cls, onClick }: { label: string; cls: string; onClick: () => void }) {
  return <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${cls}`}>{label}</button>;
}

/* ─────────────────── Nueva cita (manual) ─────────────────── */
function NuevaCitaModal({ puestoId, onClose, onSaved }: { puestoId: string | null; onClose: () => void; onSaved: () => void }) {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [servicioId, setServicioId] = useState<string | null>(null);
  const hoy = ymd(new Date());
  const maxF = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return ymd(d); }, []);
  const [fecha, setFecha] = useState(hoy);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [nombre, setNombre] = useState(""); const [tel, setTel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!puestoId) return; fetch(`/api/servicios?puesto_id=${puestoId}`).then((r) => r.json()).then((d: Servicio[]) => { const a = Array.isArray(d) ? d.filter((s) => s.activo) : []; setServicios(a); if (a.length === 1) setServicioId(a[0].id); }).catch(() => {}); }, [puestoId]);
  useEffect(() => { if (!puestoId || !servicioId || !fecha) { setSlots([]); return; } setSlot(null); fetch(`/api/citas/slots?puesto_id=${puestoId}&servicio_id=${servicioId}&fecha=${fecha}`).then((r) => r.json()).then((d) => setSlots(d?.slots ?? [])).catch(() => setSlots([])); }, [puestoId, servicioId, fecha]);

  async function guardar() {
    if (!servicioId || !slot || !nombre.trim() || tel.replace(/\D/g, "").length < 10) { alert("Completa cliente, teléfono (10 díg.), servicio y hora."); return; }
    setSaving(true);
    try {
      const s = servicios.find((x) => x.id === servicioId);
      const r = await crearCitaOffline(
        { puesto_id: puestoId, servicio_id: servicioId, inicio: slot, cliente_nombre: nombre.trim(), cliente_telefono: tel.replace(/\D/g, "") },
        { id: "", puesto_id: puestoId ?? "", servicio_nombre: s?.nombre ?? "Reserva", precio: s?.precio ?? null, inicio: slot, estado: "confirmada", cliente_nombre: nombre.trim(), cliente_telefono: tel.replace(/\D/g, "") }
      );
      if (r.offline) { alert("📴 Sin internet. La reserva se guardó y se enviará sola cuando vuelva la señal."); onSaved(); return; }
      if (r.status) { alert(r.error ?? "No se pudo agendar."); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Nueva reserva</h3>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente" className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
          <input value={tel} onChange={(e) => setTel(e.target.value.replace(/\D/g, ""))} placeholder="Teléfono" maxLength={10} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
        </div>
        <div className="text-sm font-semibold text-gray-700 mb-1.5">Servicio</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {servicios.map((s) => (
            <button key={s.id} onClick={() => setServicioId(s.id)} className={`px-3 py-2 rounded-lg border-2 text-sm ${servicioId === s.id ? "bg-serv border-serv text-white" : "bg-gray-100 border-transparent text-gray-700"}`}>{s.nombre}{s.precio != null ? ` · $${Number(s.precio)}` : ""} · {s.duracion_min}m</button>
          ))}
        </div>
        <div className="text-sm font-semibold text-gray-700 mb-1.5">Fecha</div>
        <input type="date" value={fecha} min={hoy} max={maxF} onChange={(e) => setFecha(e.target.value)} className="w-full bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm mb-3" />
        <div className="text-sm font-semibold text-gray-700 mb-1.5">Hora</div>
        {!servicioId ? <div className="text-gray-400 text-sm mb-3">Elige un servicio.</div> : slots.length === 0 ? <div className="text-gray-400 text-sm mb-3">Sin horarios ese día.</div> : (
          <div className="flex flex-wrap gap-2 mb-4">
            {slots.map((s) => <button key={s.inicio} onClick={() => setSlot(s.inicio)} className={`px-3 py-2 rounded-lg border-2 text-sm ${slot === s.inicio ? "bg-serv border-serv text-white" : "bg-white border-gray-200 text-gray-700"}`}>{s.label}</button>)}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="flex-[2] py-3 rounded-xl bg-serv text-white font-semibold disabled:opacity-60">{saving ? "…" : "Agendar"}</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Servicios (CRUD) ───────────────────────── */
function Servicios({ puestoId }: { puestoId: string | null }) {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ id: string | null; nombre: string; descripcion: string; duracion_min: string; buffer_min: string; precio: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { if (!puestoId) return; fetch(`/api/servicios?puesto_id=${puestoId}`).then((r) => r.json()).then((d) => setServicios(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false)); }, [puestoId]);
  useEffect(() => { load(); }, [load]);

  async function guardar() {
    if (!form) return;
    const dur = parseInt(form.duracion_min, 10);
    if (!form.nombre.trim() || !dur) { alert("Nombre y duración requeridos."); return; }
    setSaving(true);
    const payload = { nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, duracion_min: dur, buffer_min: parseInt(form.buffer_min, 10) || 0, precio: form.precio.trim() ? Number(form.precio) : null };
    try {
      if (form.id) await fetch(`/api/servicios/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      else await fetch("/api/servicios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setForm(null); load();
    } finally { setSaving(false); }
  }
  async function borrar(s: Servicio) { if (!confirm(`¿Eliminar "${s.nombre}"?`)) return; await fetch(`/api/servicios/${s.id}`, { method: "DELETE" }); load(); }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold text-gray-800">Mis servicios</span>
        <button onClick={() => setForm({ id: null, nombre: "", descripcion: "", duracion_min: "30", buffer_min: "0", precio: "" })} className="bg-serv text-white text-sm font-semibold rounded-full px-3 py-1.5">+ Nuevo</button>
      </div>
      {loading ? <div className="text-center text-gray-400 py-10">Cargando…</div> : servicios.length === 0 ? <div className="text-center text-gray-500 py-10">Aún no tienes servicios.</div> : (
        <div className="space-y-2">
          {servicios.map((s) => (
            <div key={s.id} className={`flex items-center gap-3 bg-white rounded-xl p-3 shadow-[var(--shadow-card)] ${!s.activo ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900">{s.nombre}</div>
                {s.descripcion && <div className="text-xs text-gray-500">{s.descripcion}</div>}
                <div className="text-xs text-serv mt-0.5">{s.duracion_min} min{s.buffer_min ? ` (+${s.buffer_min} descanso)` : ""}{s.precio != null ? ` · $${Number(s.precio)}` : " · a consultar"}{!s.activo ? " · inactivo" : ""}</div>
              </div>
              <button onClick={() => setForm({ id: s.id, nombre: s.nombre, descripcion: s.descripcion ?? "", duracion_min: String(s.duracion_min), buffer_min: String(s.buffer_min), precio: s.precio != null ? String(Number(s.precio)) : "" })} className="text-serv text-sm font-semibold">Editar</button>
              <button onClick={() => borrar(s)} className="text-danger text-sm font-semibold">Eliminar</button>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={() => setForm(null)}>
          <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">{form.id ? "Editar servicio" : "Nuevo servicio"}</h3>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre (ej. Corte de dama)" className="w-full bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm mb-2" />
            <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción (opcional)" className="w-full bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm mb-2" />
            <div className="grid grid-cols-3 gap-2 mb-2">
              <input value={form.duracion_min} onChange={(e) => setForm({ ...form, duracion_min: e.target.value.replace(/\D/g, "") })} placeholder="Min" inputMode="numeric" className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
              <input value={form.buffer_min} onChange={(e) => setForm({ ...form, buffer_min: e.target.value.replace(/\D/g, "") })} placeholder="Descanso" inputMode="numeric" className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
              <input value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Precio" inputMode="decimal" className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setForm(null)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold">Cancelar</button>
              <button onClick={guardar} disabled={saving} className="flex-[2] py-3 rounded-xl bg-serv text-white font-semibold disabled:opacity-60">{saving ? "…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Ventas ───────────────────────── */
// Emoji por tipo de negocio de servicios (espejo de CATEGORIAS_SERVICIOS).
// Genérico 📅 si no hay categoría.
const SERV_EMOJI: Record<string, string> = {
  peluqueria: "💇", barberia: "💈", unas: "💅", spa: "💆", dentista: "🦷",
  doctor: "🩺", dermatologo: "🧴", veterinaria: "🐾", otro_servicio: "📅",
};

interface PlanInfo { estado: "trial" | "pro" | "vencido"; acceso: boolean; dias_restantes: number; hasta: string | null }
function fechaCorta(iso: string) { return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" }); }
function PlanCard({ info }: { info: PlanInfo }) {
  const wa = waUrl("Hola, quiero activar/renovar el plan Pro de reservas de mi negocio en Mercadito.");
  const Boton = ({ txt }: { txt: string }) => (
    <a href={wa} target="_blank" rel="noreferrer" className="inline-block mt-2 bg-[#25D366] text-white font-semibold rounded-lg px-4 py-2 text-sm">{txt}</a>
  );
  if (info.estado === "vencido") {
    return (
      <div className="bg-danger-light border border-red-300 rounded-2xl p-4 mb-4">
        <div className="font-bold text-danger-dark">Tu prueba terminó</div>
        <div className="text-sm text-gray-600 mt-0.5">Reactiva tu plan para seguir agendando reservas.</div>
        <Boton txt="Reactivar por WhatsApp" />
      </div>
    );
  }
  if (info.estado === "pro") {
    return (
      <div className="bg-serv text-white rounded-2xl p-4 mb-4">
        <div className="font-bold">⭐ Plan Pro activo</div>
        <div className="text-sm text-white/85 mt-0.5">Reservas ilimitadas{info.hasta ? ` · hasta ${fechaCorta(info.hasta)}` : ""}.{info.dias_restantes <= 5 ? ` Vence en ${info.dias_restantes} día(s).` : ""}</div>
        {info.dias_restantes <= 5 && <Boton txt="Renovar por WhatsApp" />}
      </div>
    );
  }
  return (
    <div className="bg-warning-light border border-amber-300 rounded-2xl p-4 mb-4">
      <div className="font-bold text-warning-dark">🎁 Prueba gratis · quedan {info.dias_restantes} {info.dias_restantes === 1 ? "día" : "días"}</div>
      <div className="text-sm text-gray-600 mt-0.5">Disfruta todo sin límite. Sin comisiones por reserva.</div>
      {info.dias_restantes <= 7 && <Boton txt="Pásate a Pro por WhatsApp" />}
    </div>
  );
}

function Ventas() {
  const [dias, setDias] = useState(30);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); fetch(`/api/citas/stats?dias=${dias}`).then((r) => (r.ok ? r.json() : null)).then(setStats).catch(() => {}).finally(() => setLoading(false)); }, [dias]);
  const r = stats?.resumen;
  return (
    <div>
      <div className="flex gap-2 mb-4">
        {[{ d: 7, l: "1 semana" }, { d: 15, l: "15 días" }, { d: 30, l: "1 mes" }].map((p) => (
          <button key={p.d} onClick={() => setDias(p.d)} className={`flex-1 py-2 rounded-full text-sm font-bold ${dias === p.d ? "bg-serv text-white" : "bg-white text-gray-600"}`}>{p.l}</button>
        ))}
      </div>
      {loading || !r ? <div className="text-center text-gray-400 py-10">Cargando…</div> : (
        <>
          {stats.planInfo && <PlanCard info={stats.planInfo} />}
          <div className="text-xs font-bold text-serv-dark uppercase tracking-wide mb-1">{(stats.categoria_servicio && SERV_EMOJI[stats.categoria_servicio]) || "📅"} Reservas</div>
          <div className="bg-white rounded-2xl p-5 text-center shadow-[var(--shadow-card)] mb-3">
            <div className="text-xs text-gray-500">Ingreso por reservas completadas</div>
            <div className="text-3xl font-extrabold text-serv mt-1">${(Number(r.ingreso) || 0).toLocaleString("es-MX")}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Metric label="Completadas" value={Number(r.completadas) || 0} />
            <Metric label="Pendientes" value={Number(r.pendientes) || 0} />
            <Metric label="Canceladas" value={Number(r.canceladas) || 0} />
            <Metric label="No asistió" value={Number(r.no_shows) || 0} />
          </div>
          {stats.top?.length > 0 && (
            <>
              <div className="text-sm font-bold text-gray-700 mb-2">Servicios más solicitados</div>
              {stats.top.map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-2 bg-white rounded-lg p-2.5 mb-1.5 text-sm"><span className="text-serv font-bold w-5">{i + 1}</span><span className="flex-1 truncate">{t.servicio_nombre}</span><span className="text-gray-500 text-xs">{Number(t.n)} reservas</span><span className="text-serv font-semibold">${Number(t.ingreso) || 0}</span></div>
              ))}
            </>
          )}
          {stats.tieneProductos && (
            <div className="mt-4">
              <div className="text-xs font-bold text-brand uppercase tracking-wide mb-1">🛒 Productos (Mercadito)</div>
              <div className="bg-white rounded-2xl p-5 text-center shadow-[var(--shadow-card)] mb-3">
                <div className="text-xs text-gray-500">Ingreso por productos</div>
                <div className="text-3xl font-extrabold text-brand mt-1">${(Number(stats.productos?.ingreso) || 0).toLocaleString("es-MX")}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Pedidos" value={Number(stats.productos?.pedidos) || 0} />
                <Metric label="Artículos" value={Number(stats.productos?.items) || 0} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-white rounded-xl p-3 text-center shadow-[var(--shadow-card)]"><div className="text-xl font-extrabold text-gray-800">{value}</div><div className="text-xs text-gray-500">{label}</div></div>;
}

/* ───────────────────────── Contactos ───────────────────────── */
function Contactos() {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  useEffect(() => { fetch("/api/citas").then((r) => (r.ok ? r.json() : [])).then((d) => setCitas(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false)); }, []);
  const contactos = useMemo(() => {
    const m = new Map<string, { nombre: string; telefono: string; total: number; ultima: string }>();
    for (const c of citas) { const p = m.get(c.cliente_telefono); if (p) { p.total++; if (new Date(c.inicio) > new Date(p.ultima)) p.ultima = c.inicio; } else m.set(c.cliente_telefono, { nombre: c.cliente_nombre, telefono: c.cliente_telefono, total: 1, ultima: c.inicio }); }
    let arr = Array.from(m.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (q.trim()) { const n = q.toLowerCase(); arr = arr.filter((c) => c.nombre.toLowerCase().includes(n) || c.telefono.includes(n)); }
    return arr;
  }, [citas, q]);
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…" className="w-full bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm mb-3" />
      {loading ? <div className="text-center text-gray-400 py-10">Cargando…</div> : contactos.length === 0 ? <div className="text-center text-gray-500 py-10">Aún no tienes contactos.</div> : (
        <div className="space-y-2">
          {contactos.map((c) => (
            <div key={c.telefono} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-[var(--shadow-card)]">
              <div className="w-11 h-11 rounded-full bg-serv-light flex items-center justify-center text-serv font-bold shrink-0">{c.nombre.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0"><div className="font-semibold text-gray-900 truncate">{c.nombre}</div><div className="text-xs text-gray-500">{c.telefono} · {c.total} {c.total === 1 ? "reserva" : "reservas"} · últ. {fmtCorto(c.ultima)}</div></div>
              <a href={`https://wa.me/52${c.telefono}`} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-[#25D366] text-white flex items-center justify-center shrink-0">✆</a>
              <a href={`tel:${c.telefono}`} className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shrink-0">📞</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Mensajes ───────────────────────── */
function Mensajes({ puestoId }: { puestoId: string | null }) {
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const load = useCallback(() => { fetch("/api/chat/threads").then((r) => (r.ok ? r.json() : [])).then((d) => setThreads(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);
  async function limpiar() {
    if (!confirm("¿Borrar todas las conversaciones? No se puede deshacer.")) return;
    await fetch("/api/chat", { method: "DELETE" });
    load();
  }
  const filtrados = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return threads;
    return threads.filter((t) => String(t.cliente_nombre ?? t.cliente_telefono ?? "").toLowerCase().includes(n) || String(t.cliente_telefono ?? "").includes(n));
  }, [threads, q]);
  return (
    <div>
      {threads.length > 0 && (
        <div className="flex gap-2 mb-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…" className="flex-1 bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
          <button onClick={limpiar} className="border border-danger text-danger text-sm font-semibold rounded-lg px-3">🗑</button>
        </div>
      )}
      {loading ? <div className="text-center text-gray-400 py-10">Cargando…</div> : threads.length === 0 ? <div className="text-center text-gray-500 py-10">No tienes conversaciones todavía.</div> : (
        <div className="space-y-2">
          {filtrados.map((t, i) => {
            const titulo = t.cliente_nombre ?? t.cliente_telefono ?? "Cliente"; const noLeidos = Number(t.no_leidos) || 0;
            return (
              <div key={i} className="flex items-center gap-2">
                <Link href={`/chat/${puestoId}?clienteTelefono=${encodeURIComponent(t.cliente_telefono ?? "")}&titulo=${encodeURIComponent(titulo)}`} className="flex-1 min-w-0 flex items-center gap-3 bg-white rounded-xl p-3 shadow-[var(--shadow-card)]">
                  <div className="w-11 h-11 rounded-full bg-serv-light flex items-center justify-center text-serv font-bold shrink-0">{titulo.charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0"><div className="font-semibold text-gray-900 truncate">{titulo}</div><div className={`text-sm truncate ${noLeidos > 0 ? "text-gray-900 font-semibold" : "text-gray-500"}`}>{t.ultimo_texto}</div></div>
                  {noLeidos > 0 && <span className="bg-serv text-white text-xs font-bold rounded-full min-w-[22px] h-[22px] px-1.5 flex items-center justify-center">{noLeidos}</span>}
                </Link>
                <button onClick={async () => { if (confirm("¿Borrar esta conversación?")) { await fetch(`/api/chat?cliente_telefono=${encodeURIComponent(t.cliente_telefono ?? "")}`, { method: "DELETE" }); load(); } }} className="text-gray-400 hover:text-danger px-2 py-3" aria-label="Borrar">🗑</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
