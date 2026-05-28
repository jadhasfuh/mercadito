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
  /** Tap en la card → modal de detalle (imagen grande + opciones). */
  onVerDetalle?: () => void;
  /** Próxima apertura en formato "HH:MM". Cuando el padre la pasa, el badge
   *  cerrada muestra "Abre 12:30" en vez del genérico "Cerrada". */
  proximaAperturaHora?: string;
}

/**
 * Card horizontal compacta — ~108px alto. Foto cuadrada izquierda, info en
 * 3 líneas, precio + acción a la derecha.
 *
 * Toda la card es presionable: tap → modal de detalle. El botón +/stepper a
 * la derecha captura su propio click (stopPropagation) para no abrir el modal
 * mientras se agrega o ajusta cantidad.
 *
 * Estado "cerrada":
 * - Overlay gris semi-transparente sobre la foto.
 * - Badge prominente abajo de la foto: "Cerrada · Abre 12:30" cuando tenemos
 *   hora, o solo "Cerrada".
 * - Precio sin tachar (antes line-through hacía parecer oferta expirada).
 * - Botón "+" en color warning con icono de calendario (agenda al abrir).
 */
function esPromocion(nombre: string, descripcion?: string | null): boolean {
  const haystack = `${nombre} ${descripcion ?? ""}`.toLowerCase();
  return /\b(3x2|2x1|promo|pack)\b/.test(haystack);
}

export default function ProductCardCompacta({
  producto,
  precio,
  enCarrito,
  onAgregar,
  onCambiarCantidad,
  tieneExtras,
  onVerDetalle,
  proximaAperturaHora,
}: Props) {
  const cerrada = precio.cerrada === true;
  const lead = precio.puesto_lead_time_dias ?? 0;
  const tieneMayoreo = precio.precio_mayoreo != null && precio.mayoreo_desde != null;
  const promo = esPromocion(producto.nombre, producto.descripcion);

  // Wrapper outer: si hay onVerDetalle, toda la card es un <button> con el
  // tap delegado. Los botones interiores hacen e.stopPropagation() para
  // capturar su acción sin abrir el modal de detalle.
  const Outer = onVerDetalle ? "button" : "div";
  const outerProps = onVerDetalle
    ? ({
        type: "button" as const,
        onClick: onVerDetalle,
        "aria-label": "Ver detalle",
      })
    : {};

  return (
    <Outer
      {...outerProps}
      className="w-full text-left bg-white rounded-2xl p-4 flex gap-3 items-stretch shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-lg)] ring-1 ring-gray-100 transition-soft"
    >
      {/* Columna foto con overlay si está cerrada */}
      <div className="relative w-20 h-20 flex-shrink-0">
        <div className="w-full h-full rounded-xl overflow-hidden">
          {producto.imagen?.startsWith("emoji:") ? (
            <div className="w-full h-full bg-brand-light flex items-center justify-center text-4xl">
              {producto.imagen.slice(6)}
            </div>
          ) : producto.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gray-100 flex items-center justify-center text-2xl text-gray-300">📦</div>
          )}
        </div>
        {/* Overlay gris cuando cerrada */}
        {cerrada && (
          <div className="absolute inset-0 bg-black/45 rounded-xl pointer-events-none" />
        )}
        {/* Badge "Cerrada · Abre HH:MM" sobre la foto */}
        {cerrada && (
          <div className="absolute left-1 right-1 bottom-1 bg-gray-700 text-white rounded-md py-0.5 px-1.5 flex items-center justify-center gap-1 pointer-events-none">
            <span className="text-[9px]">🕐</span>
            <span className="text-[10px] font-semibold tracking-wide">
              {proximaAperturaHora ? `Abre ${proximaAperturaHora}` : "Cerrada"}
            </span>
          </div>
        )}
        {!cerrada && onVerDetalle && (
          <span className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full bg-black/45 text-white text-[10px] flex items-center justify-center pointer-events-none">🔍</span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <h3 className="font-bold text-gray-900 text-base leading-tight break-words">{producto.nombre}</h3>
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <p className="text-xs text-gray-500 break-words flex-1 min-w-0">{precio.puesto_nombre}</p>
            <span className="font-black text-lg whitespace-nowrap text-brand-dark tabular-nums">${precio.precio}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          {promo && !cerrada && (
            <span className="text-[10px] font-bold uppercase bg-danger text-white px-1.5 py-0.5 rounded-full tracking-wide">Promo</span>
          )}
          {!cerrada && lead > 0 && (
            <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
              {lead === 1 ? "Mañana" : `${lead} días`}
            </span>
          )}
          {tieneExtras && !cerrada && (
            <span className="text-[11px] font-semibold text-brand-dark">+ opciones</span>
          )}
          {producto.precio_variable_peso && !cerrada && (
            <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full" title="El precio es referencia. Se ajusta al pesar la pieza real.">
              ⚖️ aprox
            </span>
          )}
          {tieneMayoreo && !cerrada && (
            <span className="text-[10px] text-accent-dark font-semibold">
              Mayoreo ${precio.precio_mayoreo}/{unidadFormato(producto.unidad, 1)}
            </span>
          )}
          <span className="text-[11px] text-gray-400 ml-auto">por {producto.unidad}</span>
        </div>
      </div>

      {/* Acción — stopPropagation para que el click no abra el modal de
          detalle del padre. */}
      <div className="flex items-center justify-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {enCarrito && enCarrito > 0 && onCambiarCantidad ? (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onCambiarCantidad(1); }}
              className="w-9 h-9 bg-accent-light hover:brightness-95 text-accent-dark rounded-full font-bold text-xl flex items-center justify-center active:scale-90 transition-soft"
              aria-label="Sumar"
            >+</button>
            <span className="font-bold text-sm tabular-nums">{enCarrito}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onCambiarCantidad(-1); }}
              className="w-9 h-9 bg-danger-light hover:brightness-95 text-danger-dark rounded-full font-bold text-xl flex items-center justify-center active:scale-90 transition-soft"
              aria-label="Restar"
            >−</button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onAgregar(); }}
            className={`w-12 h-12 rounded-full text-2xl flex items-center justify-center active:scale-90 hover:brightness-105 text-white shadow-[var(--shadow-card)] transition-soft ${cerrada ? "bg-warning-dark" : "bg-brand"}`}
            title={cerrada ? "Esta tienda está cerrada. Tu pedido se agendará para cuando abra." : undefined}
            aria-label={cerrada ? "Agendar pedido" : tieneExtras ? "Elegir opciones" : "Agregar al carrito"}
          >
            {cerrada ? "📅" : "+"}
          </button>
        )}
      </div>
    </Outer>
  );
}
