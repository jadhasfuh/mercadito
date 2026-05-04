"use client";

import { useMemo } from "react";
import type { ProductoConPrecios } from "@/lib/types";

interface OfertaSugerida {
  producto: ProductoConPrecios;
  precio: ProductoConPrecios["precios"][number];
}

interface Props {
  /** Pool de ofertas candidatas. El banner escoge una al azar al montar. */
  ofertas: OfertaSugerida[];
  /** Callback al tocar "Agregar a tu lista". */
  onAgregar: (oferta: OfertaSugerida) => void;
}

/**
 * Banner promocional que se muestra en la home con un producto+tienda
 * elegido al azar. Sirve para que durante el arranque, mientras llegan
 * más tiendas, los clientes descubran lo que hay. La selección es
 * estable durante una sesión: se hace una vez al montar, no en cada
 * render.
 */
export default function BannerProductoDestacado({ ofertas, onAgregar }: Props) {
  const sel = useMemo(() => {
    // Filtrar ofertas mostrables: tienda abierta + precio normal +
    // sin variantes obligatorias (para que el botón "Agregar" funcione
    // de un toque). Las que tengan variantes igual se pueden mostrar,
    // pero al tocar el botón el modal de variantes se abre.
    const aptas = ofertas.filter((o) => !o.precio.cerrada);
    if (aptas.length === 0) return null;
    return aptas[Math.floor(Math.random() * aptas.length)];
  }, [ofertas]);

  if (!sel) return null;
  const { producto: prod, precio } = sel;

  return (
    <div className="bg-gradient-to-r from-brand-light to-orange-50 rounded-2xl p-3 mb-4 shadow-sm border border-orange-100">
      <p className="text-[11px] font-bold text-brand-dark uppercase tracking-wider mb-2">
        🌟 ¿Ya probaste esto?
      </p>
      <div className="flex gap-3 items-center">
        {prod.imagen?.startsWith("emoji:") ? (
          // Producto sin foto real: el campo `imagen` lleva un emoji con
          // prefijo "emoji:". Sin este branch el <img> intenta cargar
          // "emoji:🥃" como URL y muestra ícono de imagen rota.
          <div className="w-20 h-20 rounded-xl bg-white flex items-center justify-center text-5xl flex-shrink-0 shadow-sm">
            {prod.imagen.slice(6)}
          </div>
        ) : prod.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={prod.imagen}
            alt={prod.nombre}
            className="w-20 h-20 rounded-xl object-cover flex-shrink-0 shadow-sm"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-white flex items-center justify-center text-3xl flex-shrink-0 shadow-sm">
            🛍️
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-800 text-base leading-tight line-clamp-2">
            {prod.nombre}
          </p>
          <p className="text-xs text-gray-500 truncate">
            de <span className="font-semibold text-gray-700">{precio.puesto_nombre}</span>
          </p>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-2xl font-black text-brand-dark">${precio.precio}</span>
            <span className="text-[11px] text-gray-400">por {prod.unidad}</span>
          </div>
        </div>
      </div>
      <button
        onClick={() => onAgregar(sel)}
        className="w-full mt-3 py-2.5 bg-brand text-white rounded-full font-bold text-sm active:scale-95 transition-transform"
      >
        Agregar a mi lista 🛒
      </button>
    </div>
  );
}
