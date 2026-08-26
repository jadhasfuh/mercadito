"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMXN } from "@/lib/dinero";

interface Resumen {
  dias: number;
  menu: { vistas: number; pedidos: number; conversion: number | null };
  mas_vendidos: { producto_id: string; nombre: string; pedidos: number; cantidad: number }[];
  mesas: {
    cuentas: number; total: number; propinas: number; ticket_promedio: number;
    por_dia: { fecha: string; total: number; cuentas: number }[];
    horas_pico: { hora: number; cuentas: number; total: number }[];
  };
}

const PERIODOS = [
  { dias: 7, label: "7 días" },
  { dias: 15, label: "15 días" },
  { dias: 30, label: "30 días" },
];

const diaCorto = (fecha: string) => {
  // La fecha viene ya en hora de México como "YYYY-MM-DD"; se parsea a mano
  // para que el navegador no la corra un día por la zona horaria.
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric" });
};

const hora12 = (h: number) => (h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`);

/**
 * "Tu resumen" — el negocio visto por sus propios números.
 *
 * Los reportes ya existían pero vivían en el panel de admin: el negocio solo
 * veía un contador de vistas de su menú. Aquí ve lo suyo — cuánto convierte su
 * menú, qué se pide más, cuánto vendió en mesa y a qué hora se le junta la
 * gente — sin una sola tabla nueva.
 */
export default function TiendaResumen() {
  const [dias, setDias] = useState(7);
  const [data, setData] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);

  // Sin setCargando aquí: el spinner se prende al cambiar de periodo (que es
  // un evento) y arranca prendido en el primer render. Así el effect no hace
  // setState de forma síncrona y no encadena renders de más.
  const cargar = useCallback(() => {
    fetch(`/api/tienda/resumen?dias=${dias}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setCargando(false));
  }, [dias]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando && !data) return <div className="text-center text-gray-400 py-16">Cargando tu resumen…</div>;
  if (!data) return <div className="text-center text-gray-400 py-16">No pudimos cargar tu resumen.</div>;

  const { menu, mas_vendidos: top, mesas } = data;
  const maxDia = Math.max(1, ...mesas.por_dia.map((d) => d.total));
  const maxTop = Math.max(1, ...top.map((t) => t.pedidos));

  return (
    <div className="space-y-4">
      {/* ── Menú digital ────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-0.5">Tu menú digital</h3>
        <p className="text-[11px] text-gray-400 mb-3">Desde que lo publicaste</p>
        <div className="grid grid-cols-3 gap-2">
          <Dato n={menu.vistas.toLocaleString("es-MX")} label="veces abierto" />
          <Dato n={menu.pedidos.toLocaleString("es-MX")} label="pedidos enviados" />
          <Dato n={menu.conversion != null ? `${menu.conversion}%` : "—"} label="de los que lo abren, piden" />
        </div>
        {menu.vistas === 0 && (
          <p className="text-xs text-gray-500 mt-3 leading-snug">
            Todavía nadie ha abierto tu menú. Comparte tu enlace por WhatsApp o pega tu QR en el mostrador.
          </p>
        )}
      </section>

      {/* ── Más vendidos ───────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-0.5">Lo que más se pide</h3>
        <p className="text-[11px] text-gray-400 mb-3">Pedidos de tu menú y comandas de mesa</p>
        {top.length === 0 ? (
          <p className="text-xs text-gray-500 leading-snug">
            Todavía no hay pedidos suficientes. En cuanto empiecen a llegar, aquí sale tu top.
          </p>
        ) : (
          <div className="space-y-2">
            {top.map((t, i) => (
              <div key={t.producto_id} className="flex items-center gap-2.5">
                <span className="w-4 text-[11px] font-bold text-gray-400 tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{t.nombre}</p>
                  <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-brand rounded-full" style={{ width: `${(t.pedidos / maxTop) * 100}%` }} />
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-800 tabular-nums">{t.pedidos}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Ventas de mesa ─────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-bold text-gray-800 mb-0.5">Ventas en mesa</h3>
            <p className="text-[11px] text-gray-400">Cuentas que cerraste</p>
          </div>
          <div className="flex gap-1">
            {PERIODOS.map((p) => (
              <button
                key={p.dias}
                onClick={() => { setCargando(true); setDias(p.dias); }}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${dias === p.dias ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {mesas.cuentas === 0 ? (
          <p className="text-xs text-gray-500 leading-snug">
            No cerraste ninguna cuenta en este periodo. Lo que cobras por fuera —WhatsApp, mostrador— no
            pasa por aquí, así que no lo podemos contar.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Dato n={formatMXN(mesas.total)} label="vendido" />
              <Dato n={String(mesas.cuentas)} label={mesas.cuentas === 1 ? "cuenta" : "cuentas"} />
              <Dato n={formatMXN(mesas.ticket_promedio)} label="ticket promedio" />
            </div>

            {mesas.propinas > 0 && (
              <p className="text-[11px] text-gray-400 mt-2">
                Más {formatMXN(mesas.propinas)} de propinas registradas.
              </p>
            )}

            {mesas.por_dia.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Por día</p>
                <div className="flex items-end gap-1.5 h-24">
                  {mesas.por_dia.map((d) => (
                    <div key={d.fecha} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${diaCorto(d.fecha)}: ${formatMXN(d.total)}`}>
                      <div className="w-full bg-gray-100 rounded-t flex items-end" style={{ height: "100%" }}>
                        <div className="w-full bg-brand rounded-t" style={{ height: `${Math.max(4, (d.total / maxDia) * 100)}%` }} />
                      </div>
                      <span className="text-[9px] text-gray-400 truncate w-full text-center">{diaCorto(d.fecha)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mesas.horas_pico.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Tus horas más fuertes</p>
                <div className="flex flex-wrap gap-2">
                  {mesas.horas_pico.map((h) => (
                    <span key={h.hora} className="text-[12px] font-semibold bg-brand-light text-brand-dark px-3 py-1.5 rounded-full">
                      {hora12(h.hora)} · {h.cuentas} {h.cuentas === 1 ? "cuenta" : "cuentas"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Dato({ n, label }: { n: string; label: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <p className="text-[19px] font-extrabold text-gray-800 leading-tight tabular-nums">{n}</p>
      <p className="text-[10.5px] text-gray-400 leading-tight mt-0.5">{label}</p>
    </div>
  );
}
