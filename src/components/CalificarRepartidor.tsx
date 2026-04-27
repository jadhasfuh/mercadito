"use client";

import { useState } from "react";
import type { PedidoConItems } from "@/lib/types";

interface Props {
  pedido: PedidoConItems;
  onSaved: () => void;
}

/**
 * Permite al cliente calificar (1–5 estrellas) y dejar comentario sobre el
 * repartidor de un pedido entregado. Cuando ya hay rating guardado, se
 * muestra read-only con un botón "Editar" por si quiere cambiar la nota.
 */
export default function CalificarRepartidor({ pedido, onSaved }: Props) {
  const yaCalifico = pedido.repartidor_rating != null;
  const [editando, setEditando] = useState(false);
  const [rating, setRating] = useState<number | null>(pedido.repartidor_rating ?? null);
  const [comentario, setComentario] = useState(pedido.repartidor_review ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (rating == null) {
      setError("Toca las estrellas para calificar");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repartidor_rating: rating,
          repartidor_review: comentario.trim() || null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e?.error || "No se pudo guardar tu calificación");
      } else {
        setEditando(false);
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  // Vista solo-lectura cuando ya calificó y no está editando.
  if (yaCalifico && !editando) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] uppercase tracking-wider text-amber-700 font-bold">
            Tu calificación
          </p>
          <button
            onClick={() => setEditando(true)}
            className="text-[11px] text-brand-dark underline"
          >
            Editar
          </button>
        </div>
        <div className="flex items-center gap-0.5 mt-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className="text-lg leading-none"
              style={{ opacity: n <= (pedido.repartidor_rating ?? 0) ? 1 : 0.25, filter: n <= (pedido.repartidor_rating ?? 0) ? "none" : "grayscale(1)" }}
            >
              ⭐
            </span>
          ))}
          <span className="ml-1 text-xs font-bold text-amber-700">{pedido.repartidor_rating}/5</span>
        </div>
        {pedido.repartidor_review && (
          <p className="text-xs text-gray-700 italic break-words mt-1">
            &ldquo;{pedido.repartidor_review}&rdquo;
          </p>
        )}
      </div>
    );
  }

  // Modo edición / primera calificación.
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
      <p className="text-xs text-gray-700 mb-2">
        ¿Cómo te trató {pedido.repartidor_nombre || "el repartidor"}?
      </p>
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(rating === n ? null : n)}
            className="text-3xl leading-none active:scale-90 transition-transform"
            style={{ opacity: rating !== null && n <= rating ? 1 : 0.3, filter: rating !== null && n <= rating ? "none" : "grayscale(1)" }}
            aria-label={`${n} estrellas`}
          >
            ⭐
          </button>
        ))}
      </div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Cuéntanos cómo fue el servicio (opcional)…"
        rows={2}
        className="w-full text-xs border border-gray-200 rounded-lg p-2 focus:border-brand outline-none resize-none"
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <div className="flex gap-2 mt-2">
        {yaCalifico && (
          <button
            type="button"
            onClick={() => { setEditando(false); setRating(pedido.repartidor_rating ?? null); setComentario(pedido.repartidor_review ?? ""); }}
            className="flex-1 py-1.5 text-xs font-bold rounded-full bg-gray-100 text-gray-600 active:scale-95 transition-transform"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={guardar}
          disabled={saving}
          className="flex-1 py-1.5 text-xs font-bold rounded-full bg-brand text-white disabled:bg-gray-200 active:scale-95 transition-transform"
        >
          {saving ? "Guardando…" : yaCalifico ? "Actualizar" : "Enviar calificación"}
        </button>
      </div>
    </div>
  );
}
