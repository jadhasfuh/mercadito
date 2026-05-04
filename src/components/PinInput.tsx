"use client";

import { useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Cantidad de slots. PIN ahora son 6 dígitos numéricos siempre. */
  length?: number;
  autoFocus?: boolean;
  /** Pinta los slots en rojo (típicamente cuando la confirmación no
   *  coincide con el PIN). */
  error?: boolean;
}

/**
 * Input visual de PIN con slots tipo dot-grid. Equivalente al
 * mobile/src/components/PinInput.tsx — los dígitos no se ven, solo se
 * pintan puntos llenos. Internamente hay un input numérico oculto que
 * captura el teclado del sistema.
 */
export default function PinInput({ value, onChange, length = 6, autoFocus, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  function handleChange(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, length);
    onChange(digits);
  }

  return (
    <div
      className="relative flex justify-center gap-2 py-2 cursor-text select-none"
      onClick={() => inputRef.current?.focus()}
    >
      {Array.from({ length }).map((_, i) => {
        const filled = i < value.length;
        const cursorAqui = focused && i === value.length;
        const baseBorder = error
          ? "border-red-400"
          : filled
            ? "border-brand"
            : cursorAqui
              ? "border-brand"
              : "border-gray-200";
        const baseBg = filled ? "bg-brand-light" : "bg-white";
        const cursorRing = cursorAqui ? "ring-2 ring-brand/40" : "";
        return (
          <div
            key={i}
            className={`w-10 h-12 rounded-xl border-[1.5px] ${baseBorder} ${baseBg} ${cursorRing} flex items-center justify-center transition-colors`}
          >
            {filled ? <span className="block w-3 h-3 rounded-full bg-brand" /> : null}
          </div>
        );
      })}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={length}
        autoFocus={autoFocus}
        // Input visualmente invisible pero accesible al focus/teclado.
        className="absolute inset-0 w-full h-full opacity-0 cursor-text"
        aria-label="PIN de 6 dígitos"
      />
    </div>
  );
}
