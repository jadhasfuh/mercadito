"use client";

import type { ProductoConPrecios } from "@/lib/types";
import { unidadFormato } from "@/lib/categorias";
import { avisar } from "@/components/Dialogos";

type Precio = ProductoConPrecios["precios"][number];

interface Props {
  producto: ProductoConPrecios;
  precio: Precio;
  /** Cantidad ya en el carrito (item simple). Solo aplica a productos sin extras. */
  enCarrito?: number;
  /** Para productos con variantes/modificadores/cantidad libre: el botón abre
      el flujo de opciones en lugar de sumar directo. */
  requiereModal?: boolean;
  onAgregar: () => void;
  onCambiarCantidad?: (delta: number) => void;
  onClose: () => void;
}

// Mismo detector de promo que la card del listado, para pintar el mismo chip.
function esPromocion(nombre: string, descripcion?: string | null): boolean {
  const haystack = `${nombre} ${descripcion ?? ""}`.toLowerCase();
  return /\b(3x2|2x1|promo|pack)\b/.test(haystack);
}

/**
 * Modal de detalle de producto. Se abre al tocar la foto en el listado:
 * mismo contenido que la card (precio, tienda, chips y botones de agregar/
 * quitar) pero con la imagen en grande y la descripción completa — que en la
 * card escondemos a propósito para mantener el listado limpio.
 */
export default function ProductoDetalleModal({
  producto,
  precio,
  enCarrito,
  requiereModal,
  onAgregar,
  onCambiarCantidad,
  onClose,
}: Props) {
  const cerrada = precio.cerrada === true;
  const lead = precio.puesto_lead_time_dias ?? 0;
  const tieneMayoreo = precio.precio_mayoreo != null && precio.mayoreo_desde != null;
  const promo = esPromocion(producto.nombre, producto.descripcion);
  const esEmoji = producto.imagen?.startsWith("emoji:");
  const enCarritoNum = enCarrito ?? 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Imagen en grande (zoom respecto a la card) ─── */}
        <div className="relative">
          {esEmoji ? (
            <div className="w-full aspect-square bg-brand-light flex items-center justify-center text-[7rem]">
              {producto.imagen!.slice(6)}
            </div>
          ) : producto.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={producto.imagen}
              alt={producto.nombre}
              className="w-full aspect-square object-contain bg-gray-50"
            />
          ) : (
            <div className="w-full aspect-square bg-gray-100 flex items-center justify-center text-7xl text-gray-300">📦</div>
          )}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 text-white text-2xl leading-none flex items-center justify-center active:scale-90 transition-soft"
          >
            ×
          </button>
        </div>

        {/* ─── Info ─── */}
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-xl font-black text-gray-900 leading-tight">{producto.nombre}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{precio.puesto_nombre}</p>
            </div>
            <button
              onClick={async () => {
                const url = `https://mercadito.cx/producto/${producto.id}`;
                const text = `${producto.nombre} en Mercadito 🛒`;
                try {
                  if (navigator.share) {
                    await navigator.share({ title: producto.nombre, text, url });
                  } else {
                    await navigator.clipboard.writeText(url);
                    avisar({ emoji: "📋", titulo: "Link copiado", mensaje: "Ya lo puedes pegar donde quieras compartirlo." });
                  }
                } catch {
                  /* el usuario canceló el share */
                }
              }}
              aria-label="Compartir producto"
              className="flex-shrink-0 flex items-center gap-1 text-brand-dark bg-brand-light/60 hover:bg-brand-light px-2.5 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-soft"
            >
              <span>🔗</span>
              <span>Compartir</span>
            </button>
          </div>

          <div className="flex items-baseline gap-2">
            <span className={`font-black text-2xl ${cerrada ? "text-gray-400 line-through" : "text-brand-dark"}`}>
              ${precio.precio}
            </span>
            <span className="text-sm text-gray-400">por {producto.unidad}</span>
          </div>

          {/* Chips contextuales — mismos que la card */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {promo && !cerrada && (
              <span className="text-[10px] font-bold uppercase bg-red-600 text-white px-1.5 py-0.5 rounded-full tracking-wide">Promo</span>
            )}
            {cerrada && (
              <span className="text-[10px] font-bold uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Cerrada</span>
            )}
            {!cerrada && lead > 0 && (
              <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                {lead === 1 ? "Mañana" : `${lead} días`}
              </span>
            )}
            {producto.precio_variable_peso && !cerrada && (
              <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                ⚖️ Precio aprox
              </span>
            )}
            {tieneMayoreo && !cerrada && (
              <span className="text-[10px] text-amber-700">
                Mayoreo ${precio.precio_mayoreo}/{unidadFormato(producto.unidad, 1)}
              </span>
            )}
          </div>

          {/* Descripción — el motivo del modal */}
          {producto.descripcion ? (
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{producto.descripcion}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">Sin descripción.</p>
          )}
        </div>

        {/* ─── Acción (sticky abajo) — mismos botones que la card ─── */}
        <div className="sticky bottom-0 bg-white border-t p-4">
          {!requiereModal && enCarritoNum > 0 && onCambiarCantidad ? (
            <div className="flex items-center justify-center gap-5">
              <button
                onClick={() => onCambiarCantidad(-1)}
                className="w-12 h-12 bg-red-100 hover:bg-red-200 text-red-600 rounded-full font-bold text-2xl flex items-center justify-center active:scale-90 transition-soft"
                aria-label="Restar"
              >−</button>
              <span className="font-black text-2xl w-10 text-center">{enCarritoNum}</span>
              <button
                onClick={() => onCambiarCantidad(1)}
                className="w-12 h-12 bg-green-100 hover:bg-green-200 text-green-700 rounded-full font-bold text-2xl flex items-center justify-center active:scale-90 transition-soft"
                aria-label="Sumar"
              >+</button>
            </div>
          ) : (
            <button
              onClick={onAgregar}
              className={`w-full flex items-center justify-center gap-2 font-black text-white py-4 rounded-2xl shadow-md active:scale-95 transition-transform ${cerrada ? "bg-amber-500" : "bg-brand"}`}
            >
              <span className="text-xl">{cerrada ? "📅" : "🛒"}</span>
              <span>{cerrada ? "Agendar pedido" : requiereModal ? "Elegir opciones" : "Agregar al carrito"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
