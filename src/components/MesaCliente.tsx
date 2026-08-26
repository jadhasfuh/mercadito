"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MenuPublico from "@/components/MenuPublico";
import { avisar } from "@/components/Dialogos";
import type { MenuPublico as MenuData, MenuProducto, MenuModificador, MenuVariante } from "@/lib/menu";

type ModSel = { nombre: string; precio_extra: number };
interface Pendiente {
  key: string; producto: MenuProducto; cantidad: number;
  variante: MenuVariante | null; modificadores: ModSel[]; precioUnit: number;
  /** "sin cebolla", "poco picante". Viaja hasta la pantalla de cocina. */
  notas: string;
}
interface CuentaItem { id: string; producto_nombre: string; cantidad: number; subtotal: number; estado_cocina: string; variante_nombre: string | null; notas?: string | null; }
interface Cuenta { cuenta_id: string | null; estado: string | null; items: CuentaItem[]; total: number; }

export default function MesaCliente({ token }: { token: string }) {
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [mesa, setMesa] = useState("");
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [verCuenta, setVerCuenta] = useState(false);
  const [modal, setModal] = useState<MenuProducto | null>(null);

  // Abrir mesa + cargar menú.
  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/mesa/${token}/abrir`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "No se pudo abrir la mesa");
        return;
      }
      const data = await res.json();
      setCuentaId(data.cuenta_id);
      setMesa(data.mesa?.etiqueta || "");
      const m = await fetch(`/api/menu/${data.puesto.id}`);
      if (m.ok) setMenu(await m.json());
    })();
  }, [token]);

  const refrescarCuenta = useCallback(async () => {
    const res = await fetch(`/api/mesa/${token}/cuenta`);
    if (res.ok) setCuenta(await res.json());
  }, [token]);

  useEffect(() => {
    refrescarCuenta();
    const i = setInterval(refrescarCuenta, 20000);
    return () => clearInterval(i);
  }, [refrescarCuenta]);

  const totalPend = useMemo(() => pendientes.reduce((s, p) => s + p.precioUnit * p.cantidad, 0), [pendientes]);
  const countPend = useMemo(() => pendientes.reduce((s, p) => s + p.cantidad, 0), [pendientes]);

  function agregarSimple(p: MenuProducto) {
    // Con extras o con presentaciones (sabor/tamaño/piezas) hay que preguntar.
    if (p.modificadores.length > 0 || p.variantes.length > 0) { setModal(p); return; }
    setPendientes((prev) => {
      const k = p.id;
      const ex = prev.find((x) => x.key === k);
      if (ex) return prev.map((x) => x.key === k ? { ...x, cantidad: x.cantidad + 1 } : x);
      return [...prev, { key: k, producto: p, cantidad: 1, variante: null, modificadores: [], precioUnit: p.precio, notas: "" }];
    });
  }

  function agregarConMods(p: MenuProducto, variante: MenuVariante | null, mods: ModSel[]) {
    const extra = mods.reduce((s, m) => s + m.precio_extra, 0);
    const k = `${p.id}|${variante?.id ?? ""}|${mods.map((m) => m.nombre).sort().join(",")}`;
    setPendientes((prev) => {
      const ex = prev.find((x) => x.key === k);
      if (ex) return prev.map((x) => x.key === k ? { ...x, cantidad: x.cantidad + 1 } : x);
      return [...prev, { key: k, producto: p, cantidad: 1, variante, modificadores: mods, precioUnit: (variante?.precio ?? p.precio) + extra, notas: "" }];
    });
    setModal(null);
  }

  /** Nota de una línea pendiente. Se guarda tal cual y el servidor la recorta. */
  function cambiarNota(key: string, texto: string) {
    setPendientes((prev) => prev.map((x) => (x.key === key ? { ...x, notas: texto } : x)));
  }

  function cambiarPend(key: string, delta: number) {
    setPendientes((prev) => prev.flatMap((x) => {
      if (x.key !== key) return [x];
      const c = x.cantidad + delta;
      return c <= 0 ? [] : [{ ...x, cantidad: c }];
    }));
  }

  async function enviar() {
    if (pendientes.length === 0 || !cuentaId) return;
    setEnviando(true);
    const res = await fetch(`/api/mesa/${token}/pedido`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cuenta_id: cuentaId,
        items: pendientes.map((p) => ({
          producto_id: p.producto.id, cantidad: p.cantidad,
          variante_id: p.variante?.id ?? null,
          modificadores: p.modificadores.map((m) => ({ nombre: m.nombre, precio_extra: m.precio_extra })),
          notas: p.notas.trim() || null,
        })),
      }),
    });
    setEnviando(false);
    if (res.ok) { setPendientes([]); refrescarCuenta(); setVerCuenta(true); }
    else { const d = await res.json().catch(() => ({})); avisar({ emoji: "😕", titulo: "No se pudo enviar", mensaje: d.error }); }
  }

  async function pedirCuenta() {
    await fetch(`/api/mesa/${token}/cuenta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pedir_cuenta" }) });
    refrescarCuenta();
    avisar({ emoji: "🧾", titulo: "Listo, ya viene tu cuenta", mensaje: "Un encargado te la lleva a la mesa." });
  }

  async function llamarMesero() {
    try {
      await fetch(`/api/mesa/${token}/cuenta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "llamar" }) });
      avisar({ emoji: "🙋", titulo: "Listo, ya avisamos", mensaje: "Un encargado va para tu mesa." });
    } catch {
      avisar({ emoji: "😕", titulo: "No se pudo avisar", mensaje: "Inténtalo otra vez en un momento." });
    }
  }

  if (error) return <div className="min-h-screen bg-cream flex items-center justify-center p-6 text-center text-gray-500">{error}</div>;
  if (!menu) return <div className="min-h-screen bg-cream flex items-center justify-center text-gray-400">Cargando menú…</div>;

  const color = menu.puesto.color_marca || "#ED8E3C";

  return (
    <>
      <MenuPublico
        menu={menu}
        encabezado={
          <div className="max-w-lg mx-auto px-4 pt-3">
            <div className="rounded-xl px-3 py-2 text-sm text-white font-semibold text-center" style={{ backgroundColor: color }}>
              🍽️ {mesa || "Tu mesa"} · pide lo que quieras, se suma a tu cuenta
            </div>
          </div>
        }
        accion={(p) => (
          <button onClick={() => agregarSimple(p)} className="text-xs text-white px-3 py-1.5 rounded-lg font-bold active:scale-95 transition-transform" style={{ backgroundColor: color }}>
            Agregar
          </button>
        )}
      />

      {/* Cuenta viva (colapsable) */}
      <button
        onClick={() => setVerCuenta((v) => !v)}
        className="fixed top-3 right-3 z-50 bg-white shadow-lg rounded-full px-3 py-2 text-xs font-bold border"
      >
        🧾 ${cuenta?.total?.toFixed(0) ?? 0}
      </button>
      {verCuenta && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setVerCuenta(false)}>
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-2xl p-4 max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800">Tu cuenta · {mesa}</h3>
              <button onClick={() => setVerCuenta(false)} className="text-gray-400">✕</button>
            </div>
            {(cuenta?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Aún no has pedido nada.</p>
            ) : (
              <div className="space-y-1.5">
                {cuenta!.items.map((i) => (
                  <div key={i.id} className="flex justify-between items-center text-sm border-b border-gray-100 pb-1.5">
                    <span className="text-gray-700">{i.cantidad}× {i.producto_nombre}
                      {i.variante_nombre && <span className="text-gray-500"> · {i.variante_nombre}</span>}
                      <span className="ml-1 text-[10px] text-gray-400">{i.estado_cocina !== "pendiente" ? `· ${i.estado_cocina}` : ""}</span>
                      {i.notas && <span className="block text-[11px] text-gray-500 italic">“{i.notas}”</span>}
                    </span>
                    <span className="font-semibold text-gray-800">${i.subtotal.toFixed(0)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 text-base font-bold">
                  <span>Total</span><span style={{ color }}>${cuenta!.total.toFixed(0)}</span>
                </div>
              </div>
            )}
            {(cuenta?.items.length ?? 0) > 0 && cuenta?.estado === "abierta" && (
              <button onClick={pedirCuenta} className="w-full mt-3 border-2 rounded-xl py-2.5 font-bold text-sm" style={{ borderColor: color, color }}>
                Pedir la cuenta
              </button>
            )}
            {cuentaId && cuenta?.estado !== "cerrada" && (
              <button onClick={llamarMesero} className="w-full mt-2 rounded-xl py-2.5 font-bold text-sm bg-gray-100 text-gray-700 active:scale-95 transition-transform">
                🔔 Llamar al mesero
              </button>
            )}
            {cuenta?.estado === "por_cobrar" && <p className="text-center text-xs text-amber-600 mt-3">Cuenta solicitada — un encargado va para allá.</p>}
          </div>
        </div>
      )}

      {/* Barra de envío de lo pendiente */}
      {countPend > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t">
          <div className="max-w-lg mx-auto px-4 py-3 space-y-2">
            <div className="max-h-32 overflow-y-auto space-y-1">
              {pendientes.map((p) => (
                <div key={p.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 flex-1 min-w-0 truncate">{p.producto.nombre}{(() => {
                      const detalle = [p.variante?.nombre, ...p.modificadores.map((m) => m.nombre)].filter(Boolean).join(", ");
                      return detalle ? ` (${detalle})` : "";
                    })()}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => cambiarPend(p.key, -1)} className="w-6 h-6 rounded-full bg-gray-100 font-bold">−</button>
                      <span className="w-5 text-center">{p.cantidad}</span>
                      <button onClick={() => cambiarPend(p.key, +1)} className="w-6 h-6 rounded-full bg-gray-100 font-bold">+</button>
                    </div>
                  </div>
                  {/* Indicación para cocina. Vive en la línea, no en un paso
                      aparte: quien no la necesita no la ve estorbar, y quien sí
                      la escribe sin salir de lo que está pidiendo. */}
                  <input
                    value={p.notas}
                    onChange={(e) => cambiarNota(p.key, e.target.value)}
                    maxLength={120}
                    placeholder="Nota para cocina (sin cebolla, poco picante…)"
                    aria-label={`Nota para ${p.producto.nombre}`}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-[12px] outline-none focus:border-gray-300 placeholder:text-gray-400"
                  />
                </div>
              ))}
            </div>
            <button onClick={enviar} disabled={enviando} className="w-full text-white font-bold py-3 rounded-xl shadow-sm active:opacity-90 disabled:opacity-60" style={{ backgroundColor: color }}>
              {enviando ? "Enviando…" : `Enviar a cocina · ${countPend} · $${totalPend.toFixed(0)}`}
            </button>
          </div>
        </div>
      )}

      {/* Modal de presentación + modificadores */}
      {modal && <ModalMods producto={modal} color={color} onCancel={() => setModal(null)} onAgregar={(variante, mods) => agregarConMods(modal, variante, mods)} />}
    </>
  );
}

function ModalMods({ producto, color, onCancel, onAgregar }: { producto: MenuProducto; color: string; onCancel: () => void; onAgregar: (v: MenuVariante | null, m: ModSel[]) => void }) {
  // Selección por grupo. Single = radio, multiple = checkbox (hasta maximo).
  const [sel, setSel] = useState<Record<string, ModSel[]>>({});
  // Presentación (sabor/tamaño/piezas): obligatoria si el producto tiene; con
  // una sola opción se preselecciona para no estorbar.
  const variantes = producto.variantes;
  const [varianteSel, setVarianteSel] = useState<MenuVariante | null>(variantes.length === 1 ? variantes[0] : null);
  function toggle(grupo: MenuModificador, op: { nombre: string; precio_extra: number }) {
    setSel((prev) => {
      const actuales = prev[grupo.id] || [];
      if (!grupo.multiple) return { ...prev, [grupo.id]: [{ nombre: op.nombre, precio_extra: op.precio_extra }] };
      const existe = actuales.find((x) => x.nombre === op.nombre);
      if (existe) return { ...prev, [grupo.id]: actuales.filter((x) => x.nombre !== op.nombre) };
      if (grupo.maximo && actuales.length >= grupo.maximo) return prev;
      return { ...prev, [grupo.id]: [...actuales, { nombre: op.nombre, precio_extra: op.precio_extra }] };
    });
  }
  const faltaObligatorio =
    (variantes.length > 0 && !varianteSel) ||
    producto.modificadores.some((g) => g.obligatorio && (sel[g.id]?.length ?? 0) < Math.max(1, g.minimo || 0));
  const todos = Object.values(sel).flat();
  const extra = todos.reduce((s, m) => s + m.precio_extra, 0);
  const base = varianteSel?.precio ?? producto.precio;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end" onClick={onCancel}>
      <div className="bg-white w-full max-w-lg mx-auto rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-gray-800 mb-3">{producto.nombre}</h3>
        {variantes.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-semibold text-gray-700">{producto.opcion_nombre || "Elige una opción"} <span className="text-[10px] text-red-500">obligatorio</span></p>
            <div className="mt-1 space-y-1">
              {variantes.map((v) => {
                const on = varianteSel?.id === v.id;
                return (
                  <button key={v.id} onClick={() => setVarianteSel(v)} className={`w-full flex justify-between items-center px-3 py-2 rounded-lg border text-sm ${on ? "border-2" : "border-gray-200"}`} style={on ? { borderColor: color } : undefined}>
                    <span className="text-gray-700">{v.nombre}</span>
                    <span className="text-gray-500 tabular-nums">${v.precio.toFixed(0)}{on ? " ✓" : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {producto.modificadores.map((g) => (
          <div key={g.id} className="mb-3">
            <p className="text-sm font-semibold text-gray-700">{g.nombre} {g.obligatorio && <span className="text-[10px] text-red-500">obligatorio</span>}</p>
            <div className="mt-1 space-y-1">
              {g.opciones.map((o) => {
                const on = (sel[g.id] || []).some((x) => x.nombre === o.nombre);
                return (
                  <button key={o.id} onClick={() => toggle(g, o)} className={`w-full flex justify-between items-center px-3 py-2 rounded-lg border text-sm ${on ? "border-2" : "border-gray-200"}`} style={on ? { borderColor: color } : undefined}>
                    <span className="text-gray-700">{o.nombre}</span>
                    <span className="text-gray-500">{o.precio_extra > 0 ? `+$${o.precio_extra}` : ""}{on ? " ✓" : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <button disabled={faltaObligatorio} onClick={() => onAgregar(varianteSel, todos)} className="w-full text-white font-bold py-3 rounded-xl disabled:opacity-50" style={{ backgroundColor: color }}>
          Agregar · ${(base + extra).toFixed(0)}
        </button>
      </div>
    </div>
  );
}
