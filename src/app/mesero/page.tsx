"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/SessionProvider";
import Header from "@/components/Header";
import PinInput from "@/components/PinInput";
import TicketCuenta from "@/components/TicketCuenta";
import { esTelefonoValido, esPinValido } from "@/lib/validators";

// Pantalla del MESERO. El backend existía completo (login, /api/mesero/mesas,
// comandas, cerrar cuenta) pero nunca se construyó la vista: la tienda podía
// dar de alta meseros y esos meseros no tenían dónde entrar.
//
// A propósito NO ve: alta/baja de mesas, productos, precios, reportes ni
// suscripción. Solo lo de su turno — atender mesas y cobrar.

interface MesaMesero {
  id: string; etiqueta: string; token: string;
  cuenta_id: string | null; total_abierto: number;
}
interface ComandaItem {
  id: string; producto_nombre: string; cantidad: number; subtotal: number;
  estado_cocina: string; variante_nombre?: string | null;
  modificadores?: { modificador_nombre?: string; opcion_nombre?: string; nombre?: string }[] | null;
}
interface Comanda {
  cuenta_id: string; estado: string; mesa_id: string; etiqueta: string;
  total: number; items: ComandaItem[];
}

const SIGUIENTE: Record<string, { sig: string; label: string; color: string }> = {
  pendiente: { sig: "preparando", label: "Empezar", color: "#F59E0B" },
  preparando: { sig: "listo", label: "Listo", color: "#0EA5A4" },
  listo: { sig: "servido", label: "Servido", color: "#16A34A" },
  servido: { sig: "servido", label: "✓", color: "#9CA3AF" },
};

const detalle = (i: ComandaItem) =>
  [i.variante_nombre, ...(i.modificadores ?? []).map((m) => m.opcion_nombre || m.nombre)]
    .filter(Boolean).join(" · ");

export default function MeseroPage() {
  const { usuario, loading, login } = useSession();

  if (loading) return <div className="min-h-screen bg-cream" />;
  if (!usuario || usuario.rol !== "mesero") return <LoginMesero onLogin={login} />;
  return <PanelMesero />;
}

// ── Acceso ─────────────────────────────────────────────────────────────
function LoginMesero({ onLogin }: { onLogin: ReturnType<typeof useSession>["login"] }) {
  const [telefono, setTelefono] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    const tel = telefono.replace(/\D/g, "");
    if (!esTelefonoValido(tel)) return setError("El teléfono debe ser de 10 dígitos");
    if (!esPinValido(pin)) return setError("El PIN debe ser de 6 dígitos");
    setError(""); setEnviando(true);
    try {
      // login() del provider ya pega a /api/auth y refresca la sesión.
      const r = await onLogin("mesero", { telefono: tel, pin });
      if (!r.ok) setError(r.error || "Teléfono o PIN incorrectos");
    } finally { setEnviando(false); }
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header title="Mesero" />
      <main className="max-w-sm mx-auto px-4 py-8">
        <form onSubmit={entrar} className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
          <div>
            <h1 className="text-lg font-bold text-gray-800">Entrar como mesero</h1>
            <p className="text-sm text-gray-500 mt-1 leading-snug">
              Con el teléfono y PIN que te dio tu negocio.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Teléfono</label>
            <input
              type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)}
              placeholder="353 123 4567"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">PIN</label>
            <PinInput value={pin} onChange={setPin} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit" disabled={enviando}
            className="w-full bg-brand text-white font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
          <p className="text-xs text-gray-400 text-center leading-snug">
            ¿No tienes cuenta? Tu negocio la crea desde su panel, en Mesas.
          </p>
        </form>
      </main>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────
function PanelMesero() {
  const [tab, setTab] = useState<"mesas" | "comandas">("mesas");
  const [puestoId, setPuestoId] = useState("");
  const [negocio, setNegocio] = useState("");
  const [mesas, setMesas] = useState<MesaMesero[]>([]);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [cobrando, setCobrando] = useState<Comanda | null>(null);
  const [metodos, setMetodos] = useState<string[]>(["caja"]);
  const [propina, setPropina] = useState(0);
  const [ticket, setTicket] = useState<Comanda | null>(null);

  const cargar = useCallback(async () => {
    const [m, c] = await Promise.all([
      fetch("/api/mesero/mesas").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/tienda/comandas").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    if (m) { setMesas(m.mesas ?? []); setPuestoId(m.puesto_id); setNegocio(m.puesto_nombre); }
    setComandas(Array.isArray(c) ? c : []);
  }, []);

  useEffect(() => {
    cargar();
    // El mesero deja la pantalla abierta durante el turno: sin refresco
    // periódico no vería entrar los pedidos que mandan los comensales.
    const i = setInterval(cargar, 20000);
    return () => clearInterval(i);
  }, [cargar]);

  // Métodos de pago permitidos por el negocio — los mismos que ve la tienda.
  useEffect(() => {
    if (!puestoId) return;
    fetch(`/api/menu/${puestoId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.puesto?.metodos_pago_mesa?.length) setMetodos(d.puesto.metodos_pago_mesa); })
      .catch(() => {});
  }, [puestoId]);

  async function marcar(itemId: string, estado: string) {
    await fetch("/api/tienda/comandas", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId, estado_cocina: estado }),
    });
    cargar();
  }

  async function cobrar(metodo: string) {
    if (!cobrando) return;
    await fetch(`/api/cuentas/${cobrando.cuenta_id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cerrar", metodo_pago: metodo, propina }),
    });
    setCobrando(null); setPropina(0); cargar();
  }

  const abiertas = comandas.length;

  return (
    <div className="min-h-screen bg-cream">
      <Header title={negocio || "Mesero"} />

      <div className="max-w-lg mx-auto flex bg-white border-b sticky top-14 z-30">
        {([
          { id: "mesas" as const, label: "Mesas", icon: "🍽️" },
          { id: "comandas" as const, label: "Comandas", icon: "🧾", badge: abiertas || undefined },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-center font-bold text-sm border-b-2 transition-colors relative ${
              tab === t.id ? "border-brand text-brand-dark" : "border-transparent text-gray-400"
            }`}
          >
            {t.icon} {t.label}
            {t.badge ? (
              <span className="ml-1 text-[10px] bg-brand text-white rounded-full px-1.5 py-0.5">{t.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto px-3 py-4 space-y-2.5 pb-20">
        {tab === "mesas" && (
          mesas.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm px-6 leading-snug">
              Tu negocio todavía no tiene mesas dadas de alta.
            </p>
          ) : mesas.map((m) => (
            // Tomar el pedido reusa la MISMA pantalla que usa el comensal con
            // el QR: el mesero abre la mesa por su token y ordena igual.
            <Link
              key={m.id}
              href={`/m/${puestoId}/mesa/${m.token}`}
              className="flex items-center gap-3 bg-white rounded-2xl p-4 ring-1 ring-gray-100 shadow-[var(--shadow-card)]"
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900">{m.etiqueta}</p>
                <p className="text-[12px] text-gray-500">
                  {m.cuenta_id ? "Cuenta abierta" : "Libre · toca para tomar el pedido"}
                </p>
              </div>
              {m.cuenta_id && Number(m.total_abierto) > 0 && (
                <span className="font-bold text-gray-800 tabular-nums">
                  ${Number(m.total_abierto).toFixed(0)}
                </span>
              )}
              <span className="text-gray-300 text-lg leading-none">›</span>
            </Link>
          ))
        )}

        {tab === "comandas" && (
          comandas.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">No hay mesas con cuenta abierta.</p>
          ) : comandas.map((c) => (
            <div key={c.cuenta_id} className="bg-white rounded-2xl p-4 ring-1 ring-gray-100 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-gray-800">
                  {c.etiqueta}
                  {c.estado === "por_cobrar" && (
                    <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">pidió cuenta</span>
                  )}
                </h3>
                <span className="font-bold text-gray-800 tabular-nums">${c.total.toFixed(0)}</span>
              </div>

              <div className="space-y-1.5">
                {c.items.map((i) => {
                  const e = SIGUIENTE[i.estado_cocina] || SIGUIENTE.pendiente;
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700 flex-1 min-w-0">
                        <span className="block truncate">{i.cantidad}× {i.producto_nombre}</span>
                        {detalle(i) && <span className="block text-[11px] text-gray-500 truncate">{detalle(i)}</span>}
                      </span>
                      <button
                        onClick={() => marcar(i.id, e.sig)}
                        disabled={i.estado_cocina === "servido"}
                        className="text-[11px] text-white px-2 py-1 rounded-md font-semibold disabled:opacity-60 shrink-0"
                        style={{ backgroundColor: e.color }}
                      >
                        {e.label}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setTicket(c)}
                  className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-700 active:scale-95 transition-transform"
                >
                  🖨️ Ticket
                </button>
                <button
                  onClick={() => { setPropina(0); setCobrando(c); }}
                  className="flex-1 bg-brand text-white py-2 rounded-lg text-sm font-bold active:scale-95 transition-transform"
                >
                  Cobrar ${c.total.toFixed(0)}
                </button>
              </div>
            </div>
          ))
        )}
      </main>

      {ticket && (
        <TicketCuenta
          negocioNombre={negocio}
          etiqueta={ticket.etiqueta}
          items={ticket.items}
          total={ticket.total}
          onClose={() => setTicket(null)}
        />
      )}

      {cobrando && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setCobrando(null)}>
          <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800">Cobrar {cobrando.etiqueta}</h3>
            <p className="text-2xl font-black text-gray-900 mt-1 tabular-nums">
              ${(cobrando.total + propina).toFixed(0)}
            </p>

            <div className="mt-4">
              <p className="text-sm font-semibold text-gray-700 mb-1.5">Propina (opcional)</p>
              <div className="flex gap-2">
                {[0, 10, 15, 20].map((p) => {
                  const monto = Math.round((cobrando.total * p) / 100);
                  const activo = propina === monto;
                  return (
                    <button
                      key={p}
                      onClick={() => setPropina(monto)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 ${
                        activo ? "border-brand bg-brand-light text-brand-dark" : "border-gray-200 text-gray-500"
                      }`}
                    >
                      {p === 0 ? "Sin" : `${p}%`}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-sm font-semibold text-gray-700 mt-4 mb-1.5">¿Cómo pagó?</p>
            <div className="space-y-2">
              {metodos.map((m) => (
                <button
                  key={m}
                  onClick={() => cobrar(m)}
                  className="w-full bg-brand text-white font-bold py-3 rounded-xl active:scale-95 transition-transform capitalize"
                >
                  {m}
                </button>
              ))}
            </div>
            <button onClick={() => setCobrando(null)} className="w-full mt-2 text-gray-500 py-2 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
