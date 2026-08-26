"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMXN } from "@/lib/dinero";
import { SERVICIOS, LABEL_SERVICIO, METODOS, LABEL_METODO, type Servicio, type Metodo } from "@/lib/mostrador";
import InputBuscar from "@/components/InputBuscar";

interface ProductoCaja { id: string; nombre: string; precio: number; seccion: string | null; subseccion: string | null }
interface Linea { key: string; producto_id: string; nombre: string; precio: number; cantidad: number; notas: string }
interface Venta {
  cuenta_id: string; folio: number | null; servicio: Servicio; total: number; propina: number;
  pagos: { metodo: Metodo; monto: number }[];
  items: { nombre: string; cantidad: number; precio: number; subtotal: number; notas: string | null }[];
  cliente: { nombre: string | null; telefono: string | null; direccion: string | null };
  a_cocina: boolean; en_turno: boolean;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Ventas desde mostrador — la pantalla del cajero.
 *
 * El cliente que llega a la caja, el que pide para llevar y el que llama por
 * teléfono. Se captura, se cobra y se cierra en un solo movimiento, y la venta
 * entra sola al corte de caja, al tablero de cocina y al resumen: no es un
 * flujo aparte que después haya que sumar a mano.
 *
 * Lo que la hace rápida: cero pasos obligatorios de más. Servicio y pago traen
 * el default de siempre (comer aquí, efectivo), los datos del cliente sólo
 * aparecen si el pedido es a domicilio o el cajero los pide, y el pago mixto
 * está escondido detrás de un botón para quien lo necesite.
 */
export default function MostradorPanel({ puestoId }: { puestoId: string }) {
  const [productos, setProductos] = useState<ProductoCaja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [servicio, setServicio] = useState<Servicio>("local");
  const [cobrando, setCobrando] = useState(false);
  const [venta, setVenta] = useState<Venta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Cobro
  const [mixto, setMixto] = useState(false);
  const [metodo, setMetodo] = useState<Metodo>("caja");
  const [montos, setMontos] = useState<Record<Metodo, string>>({ caja: "", tarjeta: "", transferencia: "" });
  const [recibido, setRecibido] = useState("");
  const [propina, setPropina] = useState("");
  const [aCocina, setACocina] = useState(true);
  const [notaLinea, setNotaLinea] = useState<string | null>(null);
  const [cliente, setCliente] = useState({ nombre: "", telefono: "", direccion: "" });
  const [verCliente, setVerCliente] = useState(false);

  useEffect(() => {
    fetch("/api/productos?visible_solo=false")
      .then((r) => (r.ok ? r.json() : []))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        const mios: ProductoCaja[] = [];
        for (const p of data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pr = (p.precios ?? []).find((x: any) => x.puesto_id === puestoId);
          if (pr) mios.push({ id: p.id, nombre: p.nombre, precio: Number(pr.precio), seccion: p.seccion, subseccion: p.subseccion });
        }
        setProductos(mios.sort((a, b) => a.nombre.localeCompare(b.nombre)));
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [puestoId]);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const p of productos) {
      const c = p.subseccion?.trim() || p.seccion?.trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [productos]);

  const visibles = useMemo(() => {
    const nq = norm(q.trim());
    return productos.filter((p) => {
      if (nq && !norm(p.nombre).includes(nq)) return false;
      if (cat && (p.subseccion?.trim() || p.seccion?.trim()) !== cat) return false;
      return true;
    });
  }, [productos, q, cat]);

  const total = useMemo(() => Math.round(lineas.reduce((s, l) => s + l.precio * l.cantidad, 0) * 100) / 100, [lineas]);
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
  const propinaNum = Math.max(0, Number(propina) || 0);
  const cobrar = Math.round((total + propinaNum) * 100) / 100;

  // Con pago mixto el cajero teclea cuánto entró por cada vía; sin él, todo va
  // al método elegido.
  const pagos = useMemo(() => {
    if (!mixto) return [{ metodo, monto: cobrar }];
    return METODOS
      .map((m) => ({ metodo: m, monto: Math.round((Number(montos[m]) || 0) * 100) / 100 }))
      .filter((p) => p.monto > 0);
  }, [mixto, metodo, cobrar, montos]);
  const sumaPagos = Math.round(pagos.reduce((s, p) => s + p.monto, 0) * 100) / 100;
  const restante = Math.round((cobrar - sumaPagos) * 100) / 100;
  const cambio = metodo === "caja" && !mixto && recibido ? Math.round((Number(recibido) - cobrar) * 100) / 100 : null;

  const agregar = (p: ProductoCaja) =>
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.producto_id === p.id && !l.notas);
      if (i >= 0) {
        const n = [...prev];
        n[i] = { ...n[i], cantidad: n[i].cantidad + 1 };
        return n;
      }
      return [...prev, { key: `${p.id}-${prev.length}`, producto_id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1, notas: "" }];
    });

  const cambiarCant = (key: string, delta: number) =>
    setLineas((prev) => prev.flatMap((l) => {
      if (l.key !== key) return [l];
      const c = l.cantidad + delta;
      return c <= 0 ? [] : [{ ...l, cantidad: c }];
    }));

  const limpiar = useCallback(() => {
    setLineas([]); setServicio("local"); setCobrando(false); setMixto(false);
    setMetodo("caja"); setMontos({ caja: "", tarjeta: "", transferencia: "" });
    setRecibido(""); setPropina(""); setACocina(true); setError(null);
    setCliente({ nombre: "", telefono: "", direccion: "" }); setVerCliente(false);
  }, []);

  async function confirmar() {
    setOcupado(true); setError(null);
    try {
      const res = await fetch("/api/tienda/mostrador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, notas: l.notas || null })),
          servicio, pagos, propina: propinaNum, a_cocina: aCocina,
          cliente_nombre: cliente.nombre, cliente_telefono: cliente.telefono, cliente_direccion: cliente.direccion,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "No se pudo registrar la venta"); return; }
      setVenta(data.venta);
      limpiar();
    } finally {
      setOcupado(false);
    }
  }

  // ── Ticket de la venta recién cobrada ─────────────────────────────────
  if (venta) {
    return (
      <div className="space-y-3">
        <section className="bg-white rounded-2xl p-5 shadow-sm print:shadow-none">
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Venta registrada</p>
            <p className="text-3xl font-extrabold text-gray-900 tabular-nums mt-1">{formatMXN(venta.total + venta.propina)}</p>
            {venta.folio != null && <p className="text-xs text-gray-400 mt-1">Folio #{venta.folio} · {LABEL_SERVICIO[venta.servicio]}</p>}
          </div>

          <div className="mt-4 space-y-1 text-sm">
            {venta.items.map((i, n) => (
              <div key={n} className="flex justify-between gap-3">
                <span className="min-w-0">
                  {i.cantidad}× {i.nombre}
                  {i.notas && <span className="block text-[11px] text-gray-500 italic">“{i.notas}”</span>}
                </span>
                <span className="tabular-nums whitespace-nowrap">{formatMXN(i.subtotal)}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-sm">
            {venta.pagos.map((p) => (
              <div key={p.metodo} className="flex justify-between text-gray-600">
                <span>{LABEL_METODO[p.metodo]}</span>
                <span className="tabular-nums">{formatMXN(p.monto)}</span>
              </div>
            ))}
          </div>

          {!venta.en_turno && (
            <p className="mt-3 text-[11.5px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 leading-snug">
              La caja no estaba abierta, así que esta venta no entra a ningún corte. Abre la caja para
              que el efectivo del día cuadre.
            </p>
          )}

          <div className="flex gap-2 mt-4 print:hidden">
            <button onClick={() => window.print()} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-bold text-sm">🖨️ Imprimir</button>
            <button onClick={() => setVenta(null)} className="flex-1 bg-brand text-white py-2.5 rounded-xl font-bold text-sm">Nueva venta</button>
          </div>
        </section>
      </div>
    );
  }

  if (cargando) return <div className="text-center text-gray-400 py-16">Cargando tus productos…</div>;

  if (productos.length === 0) {
    return (
      <div className="text-center py-16 px-6">
        <span className="text-4xl block mb-2">🧾</span>
        <p className="text-gray-500 text-sm leading-snug">
          Todavía no tienes productos con precio. Cárgalos en la pestaña Productos y podrás cobrar desde aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-40">
      {/* Tipo de servicio: cocina no empaca igual para comer aquí que para llevar. */}
      <div className="flex gap-1.5">
        {SERVICIOS.map((s) => (
          <button
            key={s}
            onClick={() => { setServicio(s); if (s === "domicilio") setVerCliente(true); }}
            className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
              servicio === s ? "bg-brand text-white" : "bg-white text-gray-500 ring-1 ring-gray-200"
            }`}
          >
            {LABEL_SERVICIO[s]}
          </button>
        ))}
      </div>

      <InputBuscar value={q} onChange={setQ} placeholder="Busca un producto…" />

      {categorias.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          <button
            onClick={() => setCat(null)}
            className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${!cat ? "bg-gray-900 text-white" : "bg-white text-gray-500 ring-1 ring-gray-200"}`}
          >
            Todo
          </button>
          {categorias.map((c) => (
            <button
              key={c}
              onClick={() => setCat(cat === c ? null : c)}
              className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${cat === c ? "bg-gray-900 text-white" : "bg-white text-gray-500 ring-1 ring-gray-200"}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Cuadrícula de productos: un toque = una pieza. Es la forma más rápida
          de capturar en caja, sin abrir modales por producto. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visibles.map((p) => (
          <button
            key={p.id}
            onClick={() => agregar(p)}
            className="bg-white rounded-xl ring-1 ring-gray-200 px-3 py-2.5 text-left active:scale-[0.97] transition-transform"
          >
            <p className="text-[13px] font-semibold text-gray-800 leading-snug line-clamp-2">{p.nombre}</p>
            <p className="text-sm font-extrabold text-brand-dark tabular-nums mt-1">{formatMXN(p.precio)}</p>
          </button>
        ))}
        {visibles.length === 0 && <p className="col-span-full text-center text-sm text-gray-400 py-8">Sin resultados.</p>}
      </div>

      {/* ── Ticket en curso ─────────────────────────────────────────────── */}
      {lineas.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="max-w-lg mx-auto px-4 py-3 space-y-2">
            {!cobrando ? (
              <>
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {lineas.map((l) => (
                    <div key={l.key}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex-1 min-w-0 truncate text-gray-700">{l.nombre}</span>
                        <span className="tabular-nums text-gray-500 text-xs">{formatMXN(l.precio * l.cantidad)}</span>
                        <button onClick={() => cambiarCant(l.key, -1)} className="w-7 h-7 rounded-full bg-gray-100 font-bold leading-none">−</button>
                        <span className="w-5 text-center font-bold tabular-nums">{l.cantidad}</span>
                        <button onClick={() => cambiarCant(l.key, +1)} className="w-7 h-7 rounded-full bg-gray-100 font-bold leading-none">+</button>
                        <button
                          onClick={() => setNotaLinea(notaLinea === l.key ? null : l.key)}
                          aria-label="Nota para cocina"
                          className={`w-7 h-7 rounded-full text-xs ${l.notas ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"}`}
                        >
                          📝
                        </button>
                      </div>
                      {(notaLinea === l.key || l.notas) && (
                        <input
                          value={l.notas}
                          onChange={(e) => setLineas((prev) => prev.map((x) => x.key === l.key ? { ...x, notas: e.target.value } : x))}
                          maxLength={120}
                          placeholder="Sin cebolla, bien cocido…"
                          className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-[12px] outline-none"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={limpiar} className="px-4 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Cancelar</button>
                  <button
                    onClick={() => setCobrando(true)}
                    className="flex-1 bg-brand text-white font-extrabold py-3 rounded-xl active:scale-[0.99] transition-transform flex items-center justify-between px-4"
                  >
                    <span className="text-[13px]">Cobrar {piezas} {piezas === 1 ? "pieza" : "piezas"}</span>
                    <span className="text-lg tabular-nums">{formatMXN(total)}</span>
                  </button>
                </div>
              </>
            ) : (
              // ── Cobro ────────────────────────────────────────────────
              <div className="space-y-2.5 max-h-[70vh] overflow-y-auto">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold text-gray-800">Total a cobrar</span>
                  <span className="text-2xl font-extrabold tabular-nums">{formatMXN(cobrar)}</span>
                </div>

                {!mixto ? (
                  <>
                    <div className="flex gap-1.5">
                      {METODOS.map((m) => (
                        <button
                          key={m}
                          onClick={() => setMetodo(m)}
                          className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold ${metodo === m ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
                        >
                          {LABEL_METODO[m]}
                        </button>
                      ))}
                    </div>
                    {metodo === "caja" && (
                      <div className="flex items-center gap-2">
                        <input
                          value={recibido}
                          onChange={(e) => setRecibido(e.target.value.replace(/[^\d.]/g, ""))}
                          inputMode="decimal"
                          placeholder="¿Con cuánto paga?"
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-base font-bold tabular-nums outline-none focus:border-brand"
                        />
                        {cambio != null && cambio >= 0 && (
                          <span className="text-sm font-bold text-emerald-700 whitespace-nowrap">
                            Cambio {formatMXN(cambio)}
                          </span>
                        )}
                      </div>
                    )}
                    <button onClick={() => setMixto(true)} className="text-[12px] font-bold text-brand-dark underline">
                      Pagó con dos formas
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[12px] text-gray-500">Escribe cuánto entró por cada vía.</p>
                    {METODOS.map((m) => (
                      <div key={m} className="flex items-center gap-2">
                        <span className="w-28 text-[13px] text-gray-600">{LABEL_METODO[m]}</span>
                        <input
                          value={montos[m]}
                          onChange={(e) => setMontos((prev) => ({ ...prev, [m]: e.target.value.replace(/[^\d.]/g, "") }))}
                          inputMode="decimal"
                          placeholder="0"
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold tabular-nums outline-none focus:border-brand"
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-[12px]">
                      <button onClick={() => setMixto(false)} className="font-bold text-brand-dark underline">Una sola forma</button>
                      <span className={restante === 0 ? "text-emerald-700 font-bold" : "text-red-600 font-bold"}>
                        {restante === 0 ? "Cuadra" : restante > 0 ? `Faltan ${formatMXN(restante)}` : `Sobran ${formatMXN(-restante)}`}
                      </span>
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  <input
                    value={propina}
                    onChange={(e) => setPropina(e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    placeholder="Propina (opcional)"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums outline-none focus:border-brand"
                  />
                  <label className="flex items-center gap-1.5 text-[12px] text-gray-600 whitespace-nowrap">
                    <input type="checkbox" checked={aCocina} onChange={(e) => setACocina(e.target.checked)} />
                    Mandar a cocina
                  </label>
                </div>

                {(verCliente || servicio === "domicilio") && (
                  <div className="space-y-1.5 border-t border-gray-100 pt-2">
                    <input value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} placeholder="Nombre del cliente" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand" />
                    <input value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value.replace(/\D/g, "") })} inputMode="tel" placeholder="Teléfono" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand" />
                    {servicio === "domicilio" && (
                      <input value={cliente.direccion} onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })} placeholder="Dirección de entrega" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand" />
                    )}
                  </div>
                )}
                {!verCliente && servicio !== "domicilio" && (
                  <button onClick={() => setVerCliente(true)} className="text-[12px] font-bold text-brand-dark underline">
                    Agregar datos del cliente
                  </button>
                )}

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex gap-2">
                  <button onClick={() => setCobrando(false)} className="px-4 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Atrás</button>
                  <button
                    onClick={confirmar}
                    disabled={ocupado || (mixto && restante !== 0)}
                    className="flex-1 bg-gray-900 text-white font-extrabold py-3 rounded-xl disabled:opacity-50"
                  >
                    {ocupado ? "Registrando…" : `Cobrar ${formatMXN(cobrar)}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
