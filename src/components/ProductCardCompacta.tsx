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
// Detecta promociones tipo 3x2 / Pack / Promo en nombre o descripción.
// Pinta un chip rojo "PROMO" para que el cliente lo identifique al vuelo.
function esPromocion(nombre: string, descripcion?: string | null): boolean {
  const haystack = `${nombre} ${descripcion ?? ""}`.toLowerCase();
  return /\b(3x2|2x1|promo|pack)\b/.test(haystack);
}

export default function ProductCardCompacta({ producto, precio, enCarrito, onAgregar, onCambiarCantidad, tieneExtras }: Props) {
  const cerrada = precio.cerrada === true;
  const lead = precio.puesto_lead_time_dias ?? 0;
  const tieneMayoreo = precio.precio_mayoreo != null && precio.mayoreo_desde != null;
  const promo = esPromocion(producto.nombre, producto.descripcion);

  return (
    <div className={`bg-white rounded-xl p-3 flex gap-3 items-stretch shadow-sm ${cerrada ? "opacity-70" : ""}`}>
      {/* Foto: si imagen empieza con 'emoji:', renderiza el emoji en grande
          (placeholder para productos sin foto real, como farmacia). */}
      {producto.imagen?.startsWith("emoji:") ? (
        <div className="w-20 h-20 rounded-lg bg-brand-light flex items-center justify-center flex-shrink-0 text-4xl">
          {producto.imagen.slice(6)}
        </div>
      ) : producto.imagen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={producto.imagen} alt={producto.nombre} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-2xl text-gray-300">📦</div>
      )}

      {/* Info — título a ancho completo (sin clamp) y precio en la fila
          de abajo junto al nombre de la tienda. Tienda también sin truncar
          para que el cliente vea el nombre completo aunque la card crezca
          un poco. */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <h3 className="font-bold text-gray-800 text-[15px] leading-tight break-words">{producto.nombre}</h3>
          <div className="flex items-baseline justify-between gap-2 mt-0.5">
            <p className="text-xs text-gray-500 break-words flex-1 min-w-0">{precio.puesto_nombre}</p>
            <span className={`font-bold text-base whitespace-nowrap ${cerrada ? "text-gray-400 line-through" : "text-navy"}`}>${precio.precio}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {/* Chips contextuales — solo aparecen los que aplican */}
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
          {tieneExtras && !cerrada && (
            <span className="text-[10px] text-brand-dark">+ opciones</span>
          )}
          {producto.precio_variable_peso && !cerrada && (
            <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full" title="El precio es referencia. Se ajusta al pesar la pieza real.">
              ⚖️ Precio aprox
            </span>
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
            className={`w-10 h-10 rounded-full font-bold text-xl flex items-center justify-center active:scale-90 text-white ${cerrada ? "bg-amber-500" : "bg-brand"}`}
            title={cerrada ? "Esta tienda está cerrada. Tu pedido se agendará para cuando abra." : undefined}
            aria-label={cerrada ? "Agendar pedido" : tieneExtras ? "Elegir opciones" : "Agregar al carrito"}
          >
            {cerrada ? "📅" : "+"}
          </button>
        )}
      </div>
    </div>
  );
}
