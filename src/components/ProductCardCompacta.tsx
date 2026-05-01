"use client";

import type { ProductoConPrecios } from "@/lib/types";
import { unidadFormato } from "@/lib/categorias";

type Precio = ProductoConPrecios["precios"][number];

interface Props {
  producto: ProductoConPrecios;
  precio: Precio;
  /** Cantidad ya en el carrito (item simple). Si es 0 o undefined, mostramos botón +. */
  enCarrito?: number;
  onAgregar: () => void;
  onCambiarCantidad?: (delta: number) => void;
  tieneExtras?: boolean;
}

/**
 * Card horizontal compacta — ~108px alto. Foto cuadrada izquierda, info en
 * 3 líneas, precio + acción a la derecha. Reemplaza el patrón vertical de
 * ~280px que llenaba la pantalla con muy poca info por scroll.
 *
 * Pensada para listas largas (búsqueda global, categoría con muchos
 * productos). Para BannerProductoDestacado seguimos usando una card grande
 * porque ahí el objetivo es destacar, no listar.
 */
export default function ProductCardCompacta({ producto, precio, enCarrito, onAgregar, onCambiarCantidad, tieneExtras }: Props) {
  const cerrada = precio.cerrada === true;
  const lead = precio.puesto_lead_time_dias ?? 0;
  const tieneMayoreo = precio.precio_mayoreo != null && precio.mayoreo_desde != null;

  return (
    <div className={`bg-white rounded-xl p-3 flex gap-3 items-stretch shadow-sm ${cerrada ? "opacity-70" : ""}`}>
      {/* Foto */}
      {producto.imagen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={producto.imagen} alt={producto.nombre} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-2xl text-gray-300">📦</div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-bold text-gray-800 text-[15px] leading-tight truncate">{producto.nombre}</h3>
            <span className={`font-bold text-base whitespace-nowrap ${cerrada ? "text-gray-400 line-through" : "text-navy"}`}>${precio.precio}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">{precio.puesto_nombre}</p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {/* Chips contextuales — solo aparecen los que aplican */}
          {cerrada && (
            <span className="text-[10px] font-bold uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Cerrada</span>
          )}
          {!cerrada && lead > 0 && (
            <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
              {lead === 1 ? "Mañana" : `${lead} días`}
            </span>
          )}
          {tieneExtras && !cerrada && (
            <span className="text-[10px] text-brand-dark">+ opciones</span>
          )}
          {tieneMayoreo && !cerrada && (
            <span className="text-[10px] text-amber-700">
              Mayoreo ${precio.precio_mayoreo}/{unidadFormato(producto.unidad, 1)}
            </span>
          )}
          <span className="text-[11px] text-gray-400 ml-auto">por {producto.unidad}</span>
        </div>
      </div>

      {/* Acción */}
      <div className="flex items-center justify-center flex-shrink-0">
        {enCarrito && enCarrito > 0 && onCambiarCantidad ? (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => onCambiarCantidad(1)}
              className="w-8 h-8 bg-green-100 text-green-700 rounded-full font-bold text-lg flex items-center justify-center active:scale-90"
              aria-label="Sumar"
            >+</button>
            <span className="font-bold text-sm">{enCarrito}</span>
            <button
              onClick={() => onCambiarCantidad(-1)}
              className="w-8 h-8 bg-red-100 text-red-600 rounded-full font-bold text-lg flex items-center justify-center active:scale-90"
              aria-label="Restar"
            >−</button>
          </div>
        ) : (
          <button
            onClick={onAgregar}
            disabled={cerrada}
            className="w-10 h-10 bg-brand text-white rounded-full font-bold text-xl flex items-center justify-center active:scale-90 disabled:bg-gray-200 disabled:text-gray-400"
            aria-label={tieneExtras ? "Elegir opciones" : "Agregar al carrito"}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
