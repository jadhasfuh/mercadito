"use client";

import { useState } from "react";
import type { ItemPedido } from "@/lib/types";

interface Props {
  pedidoId: string;
  items: ItemPedido[];
  editadoPor: string;
  onSaved: () => void;
  onCancel: () => void;
}

// Estado interno: combina items existentes (catalogo) con manuales agregados
// en esta sesión de edición. Para distinguirlos al guardar, los manuales tienen
// producto_id null y un id local "nuevo-…" — al persistir se mapean a items
// con producto_id null + producto_nombre, que el back acepta tras la
// migración.
type EditItem = ItemPedido & { eliminado?: boolean; nuevoManual?: boolean };

export default function EditorPedido({ pedidoId, items, editadoPor, onSaved, onCancel }: Props) {
  const [editItems, setEditItems] = useState<EditItem[]>(
    items.map((item) => ({
      ...item,
      cantidad: item.cantidad,
      eliminado: false,
    }))
  );
  const [saving, setSaving] = useState(false);
  // Form para agregar item manual (sustitución). Vacío hasta que el repartidor
  // toca "Agregar similar"; null = oculto.
  const [nuevoForm, setNuevoForm] = useState<{
    nombre: string;
    precio: string;
    cantidad: string;
    puesto_id: string;
  } | null>(null);

  // Tiendas presentes en el pedido — se las ofrecemos al repartidor para
  // elegir a cuál pertenece el similar. Si solo hay una, queda preseleccionada.
  const tiendas = (() => {
    const map = new Map<string, string>();
    for (const it of items) {
      if (it.puesto_id) map.set(it.puesto_id, it.puesto_nombre || it.puesto_id);
    }
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
  })();

  function cambiarCantidad(itemId: string, delta: number) {
    setEditItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const nueva = item.cantidad + delta;
        if (nueva <= 0) return { ...item, eliminado: true, cantidad: 0 };
        return { ...item, cantidad: nueva, eliminado: false };
      })
    );
  }

  function toggleEliminar(itemId: string) {
    setEditItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const eliminar = !item.eliminado;
        // Para items manuales recién agregados, eliminar significa quitar de la lista.
        if (eliminar && item.nuevoManual) {
          return { ...item, eliminado: true, cantidad: 0 };
        }
        return { ...item, eliminado: eliminar, cantidad: eliminar ? 0 : items.find((o) => o.id === itemId)?.cantidad || 1 };
      })
    );
  }

  function abrirNuevo() {
    setNuevoForm({
      nombre: "",
      precio: "",
      cantidad: "1",
      puesto_id: tiendas.length === 1 ? tiendas[0].id : "",
    });
  }

  function agregarManual() {
    if (!nuevoForm) return;
    const nombre = nuevoForm.nombre.trim();
    const precio = parseFloat(nuevoForm.precio);
    const cantidad = parseFloat(nuevoForm.cantidad);
    if (!nombre) { alert("Falta el nombre del producto similar"); return; }
    if (!isFinite(precio) || precio <= 0) { alert("Precio invalido"); return; }
    if (!isFinite(cantidad) || cantidad <= 0) { alert("Cantidad invalida"); return; }
    if (!nuevoForm.puesto_id) { alert("Elige la tienda"); return; }
    const tienda = tiendas.find((t) => t.id === nuevoForm.puesto_id);
    const nuevo: EditItem = {
      id: `nuevo-${Date.now()}`,
      pedido_id: pedidoId,
      producto_id: null,
      producto_nombre: nombre,
      puesto_id: nuevoForm.puesto_id,
      puesto_nombre: tienda?.nombre,
      cantidad,
      precio_unitario: precio,
      subtotal: cantidad * precio,
      comision: 0,
      unidad: "pieza",
      manual: true,
      nuevoManual: true,
      eliminado: false,
    };
    setEditItems((prev) => [...prev, nuevo]);
    setNuevoForm(null);
  }

  function cambiarPrecio(itemId: string, valor: string) {
    const num = parseFloat(valor);
    setEditItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        // Permitir el campo vacío mientras el repartidor escribe; al guardar
        // se valida >0. Mantenemos el estado como número, los <= 0 los
        // bloquea el botón Guardar abajo.
        return { ...it, precio_unitario: isFinite(num) && num >= 0 ? num : 0 };
      })
    );
  }

  const itemsActivos = editItems.filter((i) => !i.eliminado);
  const nuevoSubtotal = itemsActivos.reduce((sum, i) => sum + i.cantidad * i.precio_unitario, 0);
  const precioInvalido = itemsActivos.some((i) => !isFinite(i.precio_unitario) || i.precio_unitario <= 0);
  const cambios = editItems.some((e) => {
    const original = items.find((o) => o.id === e.id);
    return (
      e.eliminado ||
      e.nuevoManual ||
      (original && (e.cantidad !== original.cantidad || e.precio_unitario !== original.precio_unitario))
    );
  });

  async function guardar() {
    if (itemsActivos.length === 0) {
      alert("No puedes dejar un pedido sin productos. Mejor cancela el pedido.");
      return;
    }
    if (precioInvalido) {
      alert("Hay items con precio invalido. Llena el precio de todos antes de guardar.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/pedidos/${pedidoId}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        editado_por: editadoPor,
        items: itemsActivos.map((i) => ({
          // Items manuales: producto_id null, producto_nombre con el texto.
          producto_id: i.producto_id || null,
          producto_nombre: i.producto_id ? undefined : (i.producto_nombre || ""),
          puesto_id: i.puesto_id,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
        })),
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json();
      alert(data.error || "Error al guardar");
    }
    setSaving(false);
  }

  return (
    <div className="bg-brand-light border-2 border-brand rounded-xl p-3 space-y-2">
      <p className="text-xs font-bold text-brand-dark">EDITANDO PEDIDO</p>

      {editItems.map((item) => {
        const original = items.find((o) => o.id === item.id);
        const cambiado = !item.eliminado && original && Number(item.precio_unitario) !== Number(original.precio_unitario);
        return (
          <div
            key={item.id}
            className={`py-1.5 border-b border-brand/15 last:border-0 ${item.eliminado ? "opacity-30" : ""}`}
          >
            {/* Fila superior: nombre + cantidad + subtotal + eliminar */}
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm text-gray-700 flex-1 min-w-0 truncate ${item.eliminado ? "line-through" : ""}`}>
                {item.producto_nombre}
                {item.manual && !item.eliminado && (
                  <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">✏️ Sustitución</span>
                )}
              </span>

              {!item.eliminado && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => cambiarCantidad(item.id, -1)}
                    className="w-7 h-7 bg-red-100 text-red-600 rounded-full font-bold text-sm flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="font-bold w-5 text-center text-sm">{item.cantidad}</span>
                  <button
                    onClick={() => cambiarCantidad(item.id, 1)}
                    className="w-7 h-7 bg-green-100 text-green-700 rounded-full font-bold text-sm flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              )}

              {!item.eliminado && (
                <span className="text-sm font-bold text-gray-600 w-14 text-right flex-shrink-0">
                  ${(item.cantidad * item.precio_unitario).toFixed(0)}
                </span>
              )}

              <button
                onClick={() => toggleEliminar(item.id)}
                className={`w-7 h-7 rounded-full text-xs flex items-center justify-center flex-shrink-0 ${
                  item.eliminado ? "bg-green-100 text-green-600" : "bg-red-50 text-red-400"
                }`}
              >
                {item.eliminado ? "↩" : "✕"}
              </button>
            </div>

            {/* Variantes / modificadores */}
            {(item.variante_nombre || (item.modificadores && item.modificadores.length > 0)) && (
              <p className="text-[11px] text-brand-dark leading-tight mt-0.5">
                {[item.variante_nombre, ...(item.modificadores ?? []).map((m) => `${m.modificador_nombre}: ${m.opcion_nombre}`)].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* Fila inferior: precio editable (en su propia linea para que no
                pelee espacio con cantidad y subtotal) */}
            {!item.eliminado ? (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-xs text-gray-400">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  value={item.precio_unitario}
                  onChange={(e) => cambiarPrecio(item.id, e.target.value)}
                  className={`text-xs w-20 border rounded px-1 py-0.5 bg-white ${cambiado ? "border-amber-400 text-amber-700 font-bold" : "border-gray-200 text-gray-500"}`}
                />
                <span className="text-xs text-gray-400">/{item.unidad}</span>
                {cambiado && <span className="text-[10px] text-amber-600">(antes ${original?.precio_unitario})</span>}
              </div>
            ) : (
              <span className="text-xs text-gray-400 line-through">${item.precio_unitario}/{item.unidad}</span>
            )}
          </div>
        );
      })}

      {/* Form para agregar producto similar (sustitución) */}
      {nuevoForm ? (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-2 space-y-2">
          <p className="text-[11px] font-bold text-amber-800">AGREGAR SIMILAR</p>
          <input
            type="text"
            value={nuevoForm.nombre}
            onChange={(e) => setNuevoForm({ ...nuevoForm, nombre: e.target.value })}
            placeholder="Nombre del producto similar"
            className="w-full border border-amber-200 rounded px-2 py-1.5 text-sm bg-white"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-amber-700 uppercase">Precio</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={nuevoForm.precio}
                onChange={(e) => setNuevoForm({ ...nuevoForm, precio: e.target.value })}
                placeholder="0.00"
                className="w-full border border-amber-200 rounded px-2 py-1.5 text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-amber-700 uppercase">Cantidad</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={nuevoForm.cantidad}
                onChange={(e) => setNuevoForm({ ...nuevoForm, cantidad: e.target.value })}
                placeholder="1"
                className="w-full border border-amber-200 rounded px-2 py-1.5 text-sm bg-white"
              />
            </div>
          </div>
          {tiendas.length > 1 && (
            <select
              value={nuevoForm.puesto_id}
              onChange={(e) => setNuevoForm({ ...nuevoForm, puesto_id: e.target.value })}
              className="w-full border border-amber-200 rounded px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Elige tienda…</option>
              {tiendas.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setNuevoForm(null)}
              className="flex-1 py-1.5 bg-gray-200 text-gray-700 rounded text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={agregarManual}
              className="flex-1 py-1.5 bg-amber-500 text-white rounded text-sm font-bold active:scale-95 transition-transform"
            >
              Agregar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={abrirNuevo}
          className="w-full py-2 border-2 border-dashed border-amber-300 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-50"
        >
          + Agregar producto similar
        </button>
      )}

      <div className="border-t border-brand/30 pt-2 flex justify-between text-sm font-bold">
        <span>Nuevo subtotal</span>
        <span className="text-navy">${nuevoSubtotal.toFixed(2)}</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 bg-gray-200 text-gray-600 rounded-lg font-medium text-sm"
        >
          Cancelar edicion
        </button>
        <button
          onClick={guardar}
          disabled={!cambios || saving || precioInvalido}
          className="flex-1 py-2 bg-brand text-white rounded-lg font-medium text-sm disabled:bg-gray-300 active:scale-95 transition-transform"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
