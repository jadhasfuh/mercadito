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

export default function EditorPedido({ pedidoId, items, editadoPor, onSaved, onCancel }: Props) {
  const [editItems, setEditItems] = useState(
    items.map((item) => ({
      ...item,
      cantidad: item.cantidad,
      eliminado: false,
    }))
  );
  const [saving, setSaving] = useState(false);

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
        return { ...item, eliminado: eliminar, cantidad: eliminar ? 0 : items.find((o) => o.id === itemId)?.cantidad || 1 };
      })
    );
  }

  const itemsActivos = editItems.filter((i) => !i.eliminado);
  const nuevoSubtotal = itemsActivos.reduce((sum, i) => sum + i.cantidad * i.precio_unitario, 0);
  const cambios = editItems.some((e) => {
    const original = items.find((o) => o.id === e.id);
    return e.eliminado || (original && e.cantidad !== original.cantidad);
  });

  async function guardar() {
    if (itemsActivos.length === 0) {
      alert("No puedes dejar un pedido sin productos. Mejor cancela el pedido.");
      return;
    }
    if (nuevoSubtotal < 150) {
      alert(`El minimo de compra es $150. El subtotal actual es $${nuevoSubtotal.toFixed(0)}.`);
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/pedidos/${pedidoId}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        editado_por: editadoPor,
        items: itemsActivos.map((i) => ({
          producto_id: i.producto_id,
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

      {editItems.map((item) => (
        <div
          key={item.id}
          className={`flex items-center justify-between py-1.5 ${item.eliminado ? "opacity-30 line-through" : ""}`}
        >
          <div className="flex-1 min-w-0">
            <span className="text-sm text-gray-700 truncate block">{item.producto_nombre}</span>
            <span className="text-xs text-gray-400">${item.precio_unitario}/{item.unidad}</span>
          </div>

          {!item.eliminado && (
            <div className="flex items-center gap-1.5 mx-2">
              <button
                onClick={() => cambiarCantidad(item.id, -1)}
                className="w-7 h-7 bg-red-100 text-red-600 rounded-full font-bold text-sm flex items-center justify-center"
              >
                −
              </button>
              <span className="font-bold w-6 text-center text-sm">{item.cantidad}</span>
              <button
                onClick={() => cambiarCantidad(item.id, 1)}
                className="w-7 h-7 bg-green-100 text-green-700 rounded-full font-bold text-sm flex items-center justify-center"
              >
                +
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            {!item.eliminado && (
              <span className="text-sm font-bold text-gray-600 w-14 text-right">
                ${(item.cantidad * item.precio_unitario).toFixed(0)}
              </span>
            )}
            <button
              onClick={() => toggleEliminar(item.id)}
              className={`w-7 h-7 rounded-full text-xs flex items-center justify-center ${
                item.eliminado ? "bg-green-100 text-green-600" : "bg-red-50 text-red-400"
              }`}
            >
              {item.eliminado ? "↩" : "✕"}
            </button>
          </div>
        </div>
      ))}

      <div className="border-t border-brand/30 pt-2 flex justify-between text-sm font-bold">
        <span>Nuevo subtotal</span>
        <span className={nuevoSubtotal < 150 ? "text-red-600" : "text-navy"}>
          ${nuevoSubtotal.toFixed(2)}
        </span>
      </div>

      {nuevoSubtotal < 150 && (
        <p className="text-xs text-red-600">Minimo $150 — faltan ${(150 - nuevoSubtotal).toFixed(0)}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 bg-gray-200 text-gray-600 rounded-lg font-medium text-sm"
        >
          Cancelar edicion
        </button>
        <button
          onClick={guardar}
          disabled={!cambios || saving || nuevoSubtotal < 150}
          className="flex-1 py-2 bg-brand text-white rounded-lg font-medium text-sm disabled:bg-gray-300 active:scale-95 transition-transform"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
