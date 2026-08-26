"use client";

import { useState } from "react";
import { DIAS_CORTOS } from "@/lib/precioPromo";

export interface PromoActual {
  precio: number | null;
  etiqueta: string | null;
  dias: number[];
  desde: string | null;
  hasta: string | null;
  termina: string | null;
}

/**
 * Promoción de un producto: precio especial con días y horario.
 *
 * "Martes de tacos a $12", "happy hour de 6 a 8". El precio promocional se
 * resuelve en la MISMA consulta que el precio de lista, así que lo que anuncia
 * el menú es exactamente lo que cobra la caja y lo que llega a la comanda de
 * mesa — no hay forma de que se separen.
 *
 * Lo que NO cubre: combos de varios productos ("café + pan $45"). Eso necesita
 * un producto compuesto y es otro problema.
 */
export default function PromoEditor({ productoNombre, precioLista, promo, onGuardar, onQuitar, onCerrar }: {
  productoNombre: string;
  precioLista: number;
  promo: PromoActual | null;
  onGuardar: (p: { precio: number; etiqueta: string; dias: number[]; desde: string; hasta: string; termina: string }) => Promise<string | null>;
  onQuitar: () => Promise<string | null>;
  onCerrar: () => void;
}) {
  const [precio, setPrecio] = useState(promo?.precio != null ? String(promo.precio) : "");
  const [etiqueta, setEtiqueta] = useState(promo?.etiqueta ?? "");
  const [dias, setDias] = useState<number[]>(promo?.dias ?? []);
  const [desde, setDesde] = useState(promo?.desde ?? "");
  const [hasta, setHasta] = useState(promo?.hasta ?? "");
  const [termina, setTermina] = useState(promo?.termina ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const alternarDia = (d: number) =>
    setDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const ahorro = Number(precio) > 0 && Number(precio) < precioLista
    ? Math.round((1 - Number(precio) / precioLista) * 100)
    : null;

  async function guardar() {
    setOcupado(true); setError(null);
    const err = await onGuardar({ precio: Number(precio), etiqueta, dias, desde, hasta, termina });
    setOcupado(false);
    if (err) setError(err);
    else onCerrar();
  }

  async function quitar() {
    setOcupado(true); setError(null);
    const err = await onQuitar();
    setOcupado(false);
    if (err) setError(err);
    else onCerrar();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-extrabold text-gray-900 truncate">Promoción</h3>
            <p className="text-xs text-gray-400 truncate">{productoNombre} · precio normal ${precioLista.toFixed(0)}</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Precio de promoción</label>
            <input
              value={precio}
              onChange={(e) => setPrecio(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xl font-extrabold tabular-nums outline-none focus:border-brand"
            />
            {ahorro != null && <p className="text-[11.5px] text-emerald-700 font-semibold mt-1">{ahorro}% menos que el precio normal.</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">¿Cómo se llama? (opcional)</label>
            <input
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              maxLength={40}
              placeholder="Martes de tacos, Happy hour…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
            <p className="text-[11px] text-gray-400 mt-1">Es lo que ve el cliente en tu menú.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">¿Qué días?</label>
            <div className="flex gap-1.5">
              {DIAS_CORTOS.map((d, i) => (
                <button
                  key={i}
                  onClick={() => alternarDia(i)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold ${dias.includes(i) ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {dias.length === 0 ? "Sin marcar nada aplica todos los días." : `Sólo ${dias.length} ${dias.length === 1 ? "día" : "días"}.`}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">¿A qué hora? (opcional)</label>
            <div className="flex items-center gap-2">
              <input value={desde} onChange={(e) => setDesde(e.target.value)} placeholder="18:00" className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums outline-none focus:border-brand" />
              <span className="text-gray-400 text-sm">a</span>
              <input value={hasta} onChange={(e) => setHasta(e.target.value)} placeholder="20:00" className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums outline-none focus:border-brand" />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Vacías = todo el día que esté abierto.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">¿Hasta qué día? (opcional)</label>
            <input type="date" value={termina} onChange={(e) => setTermina(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand" />
            <p className="text-[11px] text-gray-400 mt-1">Vacío = corre hasta que la quites.</p>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-2">
          {promo?.precio != null && (
            <button onClick={quitar} disabled={ocupado} className="px-4 py-3 rounded-xl bg-red-50 text-red-700 font-bold text-sm disabled:opacity-50">
              Quitar
            </button>
          )}
          <button
            onClick={guardar}
            disabled={ocupado || !precio}
            className="flex-1 bg-brand text-white font-extrabold py-3 rounded-xl disabled:opacity-50"
          >
            {ocupado ? "Guardando…" : "Guardar promoción"}
          </button>
        </div>
      </div>
    </div>
  );
}
