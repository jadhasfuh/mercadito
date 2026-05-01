"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  abierto: boolean;
  onClose: () => void;
  titulo: string;
  /** Footer sticky opcional (botón de aplicar / limpiar). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Bottom sheet básico — slide up desde abajo en móvil, modal centrado en
 * desktop. Pensado para filtros y ordenar. Cierra al tap fuera o al botón
 * de cerrar. Bloquea scroll del fondo mientras está abierto.
 */
export default function BottomSheet({ abierto, onClose, titulo, footer, children }: Props) {
  useEffect(() => {
    if (!abierto) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [abierto]);

  if (!abierto) return null;
  if (typeof document === "undefined") return null;

  const sheet = (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center md:justify-center md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle visual */}
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{titulo}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 text-2xl leading-none px-2"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {footer && (
          <div className="border-t border-gray-100 p-3 bg-white">{footer}</div>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
