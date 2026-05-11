"use client";

import { useState } from "react";
import { MERCADITO_TEL, MERCADITO_TEL_DISPLAY, waUrl, telUrl } from "@/lib/contacto";

/**
 * Botón flotante de ayuda — pensado para clientes mayores que prefieren
 * llamar/WhatsApp en vez de navegar la app. Expone WhatsApp y Llamada
 * directa con un solo tap.
 *
 * Posición: bottom-right, fixed. Z-index alto para que esté por encima
 * de modales pero NO de modales de pago (z-50/z-60 son los de modales).
 *
 * El default es contraído (un solo botón). Tap expande a dos botones
 * (WhatsApp + Llamar) durante 6s y se vuelve a contraer.
 */
export default function ContactoFAB() {
  const [abierto, setAbierto] = useState(false);

  const msg = "Hola Mercadito, necesito ayuda";

  function toggle() {
    setAbierto((a) => !a);
    if (!abierto) {
      // Auto-contraer si el cliente no decide en 6s — el botón queda
      // visible siempre pero no estorba.
      setTimeout(() => setAbierto(false), 6000);
    }
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 pointer-events-none">
      {/* Botones de acción — sólo aparecen abiertos */}
      {abierto && (
        <>
          <a
            href={waUrl(msg)}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto flex items-center gap-2 bg-green-500 text-white px-4 py-3 rounded-full shadow-lg font-bold text-sm active:scale-95 transition-transform animate-fade-in"
          >
            <span className="text-lg">💬</span>
            <span>WhatsApp</span>
          </a>
          <a
            href={telUrl()}
            className="pointer-events-auto flex items-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-full shadow-lg font-bold text-sm active:scale-95 transition-transform animate-fade-in"
          >
            <span className="text-lg">📞</span>
            <span>Llamar {MERCADITO_TEL_DISPLAY}</span>
          </a>
        </>
      )}

      {/* FAB principal */}
      <button
        onClick={toggle}
        aria-label={abierto ? "Cerrar ayuda" : "Necesito ayuda"}
        className="pointer-events-auto bg-brand text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        {abierto ? (
          <span className="text-2xl leading-none">×</span>
        ) : (
          <span className="text-2xl leading-none">💬</span>
        )}
      </button>
    </div>
  );
}
