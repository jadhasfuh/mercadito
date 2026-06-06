"use client";

import { useCallback, useEffect, useState } from "react";
import { waUrl } from "@/lib/contacto";

interface Mesa { id: string; etiqueta: string; token: string; activa: boolean; }
interface ComandaItem { id: string; producto_nombre: string; cantidad: number; subtotal: number; estado_cocina: string; }
interface Comanda { cuenta_id: string; estado: string; mesa_id: string; etiqueta: string; total: number; items: ComandaItem[]; }

const ESTADOS: Record<string, { sig: string; label: string; color: string }> = {
  pendiente: { sig: "preparando", label: "Empezar", color: "#F59E0B" },
  preparando: { sig: "listo", label: "Marcar listo", color: "#0EA5A4" },
  listo: { sig: "servido", label: "Servido", color: "#16A34A" },
  servido: { sig: "servido", label: "Servido ✓", color: "#9CA3AF" },
};

export default function MesasPanel({ puestoId }: { puestoId: string }) {
  const [sub, setSub] = useState<"comandas" | "mesas">("comandas");
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [nueva, setNueva] = useState("");
  const [dineIn, setDineIn] = useState(false);
  const [metodos, setMetodos] = useState<string[]>(["caja"]);
  const [qrMesa, setQrMesa] = useState<Mesa | null>(null);
  const [premium, setPremium] = useState<boolean | null>(null);
  const [meseros, setMeseros] = useState<{ id: string; nombre: string; telefono: string }[]>([]);
  const [nuevoM, setNuevoM] = useState({ nombre: "", telefono: "", pin: "" });

  const cargarMesas = useCallback(async () => {
    const r = await fetch("/api/mesas"); if (r.ok) setMesas(await r.json());
  }, []);
  const cargarComandas = useCallback(async () => {
    const r = await fetch("/api/tienda/comandas"); if (r.ok) setComandas(await r.json());
  }, []);
  const cargarConfig = useCallback(async () => {
    const r = await fetch("/api/menu/" + puestoId);
    if (r.ok) { const d = await r.json(); setDineIn(!!d.puesto.dine_in_activo); setMetodos(d.puesto.metodos_pago_mesa || ["caja"]); setPremium(!!d.planInfo?.acceso); }
  }, [puestoId]);

  const cargarMeseros = useCallback(async () => {
    const r = await fetch("/api/tienda/meseros"); if (r.ok) setMeseros(await r.json());
  }, []);
  useEffect(() => { cargarMesas(); cargarConfig(); cargarMeseros(); }, [cargarMesas, cargarConfig, cargarMeseros]);

  async function crearMesero() {
    const tel = nuevoM.telefono.replace(/\D/g, "");
    if (!nuevoM.nombre.trim() || tel.length < 10 || nuevoM.pin.length !== 6) { alert("Nombre, teléfono (10 díg.) y PIN (6 díg.)."); return; }
    const r = await fetch("/api/tienda/meseros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nuevoM.nombre.trim(), telefono: tel, pin: nuevoM.pin }) });
    if (r.ok) { setNuevoM({ nombre: "", telefono: "", pin: "" }); cargarMeseros(); }
    else { const d = await r.json().catch(() => ({})); alert(d?.error ?? "No se pudo crear el mesero."); }
  }
  async function borrarMesero(id: string) {
    if (!confirm("¿Quitar este mesero?")) return;
    await fetch("/api/tienda/meseros", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    cargarMeseros();
  }
  useEffect(() => {
    cargarComandas();
    const i = setInterval(cargarComandas, 15000);
    return () => clearInterval(i);
  }, [cargarComandas]);

  async function guardarConfig(campo: Record<string, unknown>) {
    await fetch("/api/puestos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(campo) });
  }
  function toggleMetodo(m: string) {
    const next = metodos.includes(m) ? metodos.filter((x) => x !== m) : [...metodos, m];
    const arr = next.length ? next : ["caja"];
    setMetodos(arr); guardarConfig({ metodos_pago_mesa: arr });
  }
  async function crearMesa() {
    if (!nueva.trim()) return;
    await fetch("/api/mesas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etiqueta: nueva.trim() }) });
    setNueva(""); cargarMesas();
  }
  async function borrarMesa(id: string) {
    if (!confirm("¿Eliminar esta mesa?")) return;
    await fetch("/api/mesas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    cargarMesas();
  }
  async function marcarItem(item_id: string, estado_cocina: string) {
    await fetch("/api/tienda/comandas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id, estado_cocina }) });
    cargarComandas();
  }
  async function cerrarCuenta(c: Comanda) {
    const metodo = metodos[0] || "caja";
    const etiquetaMetodo = metodo === "caja" ? "pago en caja" : metodo;
    if (!confirm(`Cerrar ${c.etiqueta} · $${c.total.toFixed(0)} (${etiquetaMetodo})?`)) return;
    const r = await fetch(`/api/cuentas/${c.cuenta_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cerrar", metodo_pago: metodo }) });
    if (r.ok) cargarComandas(); else alert("No se pudo cerrar");
  }

  // Gate por plan: si la tienda no es Premium, ocultar mesas/QR y mostrar upsell.
  if (premium === false) {
    return (
      <div className="mt-4">
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm border-2 border-dashed border-brand/30">
          <div className="text-4xl mb-2">✨</div>
          <h3 className="font-bold text-gray-800 text-lg">Menú digital, QR y Citas</h3>
          <p className="text-sm text-gray-500 mt-1">
            Pedidos en mesa con código QR, agenda de citas y más — en el plan <b>Premium</b>.
          </p>
          <p className="text-brand font-extrabold text-2xl mt-3">$99 <span className="text-sm font-bold text-gray-400">/ mes</span></p>
          <p className="text-xs text-gray-400">Sin comisiones por venta.</p>
          <a
            href={waUrl("Hola, quiero activar el plan Premium ($99/mes) para mi negocio en Mercadito (menú digital, QR y citas).")}
            target="_blank" rel="noreferrer"
            className="inline-block mt-4 bg-[#25D366] text-white font-bold rounded-xl px-5 py-3 text-sm"
          >
            Activar Premium por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Config dine-in */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <label className="flex items-center justify-between">
          <span className="font-bold text-gray-700">Pedido en mesa (sin mesero)</span>
          <input type="checkbox" checked={dineIn} onChange={(e) => { setDineIn(e.target.checked); guardarConfig({ dine_in_activo: e.target.checked }); }} />
        </label>
        <p className="text-xs text-gray-400 mt-1">Los clientes escanean el QR de su mesa y piden desde su celular. Requiere plan Pro.</p>
        {dineIn && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-600 mb-1">Cómo cobras la cuenta (tú decides):</p>
            <div className="flex gap-2 flex-wrap">
              {[["caja", "En caja / efectivo"], ["transferencia", "Transferencia"], ["tarjeta", "Tarjeta"]].map(([m, label]) => (
                <button key={m} onClick={() => toggleMetodo(m)} className={`text-xs px-3 py-1.5 rounded-full border ${metodos.includes(m) ? "bg-brand text-white border-brand" : "bg-white text-gray-500 border-gray-200"}`}>{label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Meseros */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <p className="font-bold text-gray-700">Meseros</p>
        <p className="text-xs text-gray-400 mt-0.5">Entran con su teléfono + PIN y toman pedidos en mesa desde su celular.</p>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <input value={nuevoM.nombre} onChange={(e) => setNuevoM({ ...nuevoM, nombre: e.target.value })} placeholder="Nombre" className="bg-gray-50 rounded-lg border border-gray-200 px-2 py-2 text-sm" />
          <input value={nuevoM.telefono} onChange={(e) => setNuevoM({ ...nuevoM, telefono: e.target.value.replace(/\D/g, "") })} placeholder="Teléfono" maxLength={10} inputMode="numeric" className="bg-gray-50 rounded-lg border border-gray-200 px-2 py-2 text-sm" />
          <input value={nuevoM.pin} onChange={(e) => setNuevoM({ ...nuevoM, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="PIN (6)" maxLength={6} inputMode="numeric" className="bg-gray-50 rounded-lg border border-gray-200 px-2 py-2 text-sm" />
        </div>
        <button onClick={crearMesero} className="mt-2 w-full bg-brand text-white rounded-lg py-2 text-sm font-bold">+ Agregar mesero</button>
        {meseros.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {meseros.map((m) => (
              <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div><span className="text-sm font-semibold text-gray-800">{m.nombre}</span> <span className="text-xs text-gray-400">{m.telefono}</span></div>
                <button onClick={() => borrarMesero(m.id)} className="text-danger text-xs font-semibold">Quitar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1">
        <button onClick={() => setSub("comandas")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${sub === "comandas" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}>Comandas ({comandas.length})</button>
        <button onClick={() => setSub("mesas")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${sub === "mesas" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}>Mesas ({mesas.length})</button>
      </div>

      {sub === "comandas" && (
        comandas.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><span className="text-4xl block mb-2">🍽️</span>No hay mesas con cuenta abierta.</div>
        ) : (
          <div className="space-y-3">
            {comandas.map((c) => (
              <div key={c.cuenta_id} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-gray-800">{c.etiqueta} {c.estado === "por_cobrar" && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">pidió cuenta</span>}</h3>
                  <span className="font-bold text-gray-800">${c.total.toFixed(0)}</span>
                </div>
                <div className="space-y-1.5">
                  {c.items.map((i) => {
                    const e = ESTADOS[i.estado_cocina] || ESTADOS.pendiente;
                    return (
                      <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-gray-700 flex-1 min-w-0 truncate">{i.cantidad}× {i.producto_nombre}</span>
                        <button onClick={() => marcarItem(i.id, e.sig)} disabled={i.estado_cocina === "servido"} className="text-[11px] text-white px-2 py-1 rounded-md font-semibold disabled:opacity-60" style={{ backgroundColor: e.color }}>{e.label}</button>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => cerrarCuenta(c)} className="w-full mt-3 bg-brand text-white py-2 rounded-lg text-sm font-bold active:scale-95 transition-transform">Cerrar cuenta · cobrar ${c.total.toFixed(0)}</button>
              </div>
            ))}
          </div>
        )
      )}

      {sub === "mesas" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Ej. Mesa 1, Barra 3" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button onClick={crearMesa} className="bg-brand text-white px-4 rounded-lg text-sm font-bold">+ Agregar</button>
          </div>
          {mesas.map((m) => (
            <div key={m.id} className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/menu/${puestoId}/qr?mesa=${m.token}`} alt="" className="w-16 h-16 rounded-lg border cursor-pointer" onClick={() => setQrMesa(m)} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800">{m.etiqueta}</p>
                <p className="text-[11px] text-gray-400 truncate">mercadito.cx/m/{puestoId}/mesa/{m.token.slice(0, 6)}…</p>
              </div>
              <button onClick={() => borrarMesa(m.id)} className="text-red-500 text-xs">Eliminar</button>
            </div>
          ))}
          {mesas.length === 0 && <p className="text-center text-gray-400 text-sm py-6">Agrega tus mesas para imprimir su QR.</p>}
        </div>
      )}

      {/* Modal QR grande para imprimir */}
      {qrMesa && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setQrMesa(null)}>
          <div className="bg-white rounded-2xl p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-2">{qrMesa.etiqueta}</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/menu/${puestoId}/qr?mesa=${qrMesa.token}`} alt="QR" className="w-64 h-64" />
            <a href={`/api/menu/${puestoId}/qr?mesa=${qrMesa.token}`} download={`qr-${qrMesa.etiqueta}.png`} className="block mt-3 bg-brand text-white py-2 rounded-lg text-sm font-bold">⬇️ Descargar para imprimir</a>
          </div>
        </div>
      )}
    </div>
  );
}
