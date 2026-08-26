"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Clases para el contenedor (ej. `flex-1`, `mb-3`) — el input es interno. */
  className?: string;
}

/**
 * Input de búsqueda cuadrado (rounded-lg) con tachita de borrado rápido.
 *
 * Existe aparte de <SearchBar/> porque ese es la píldora del catálogo, con su
 * lupa y su sombra; estos buscadores viven dentro de paneles (chats, citas,
 * usuarios) donde la píldora desentona. Lo que comparten —y era lo que
 * faltaba— es la ×: sin ella hay que borrar letra por letra.
 */
export default function InputBuscar({ value, onChange, placeholder, className = "" }: Props) {
  return (
    <div className={`flex items-center gap-1 bg-white rounded-lg border border-gray-200 pl-3 pr-1.5 focus-within:border-brand ${className}`}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-gray-400"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="w-7 h-7 shrink-0 rounded-full bg-gray-100 text-gray-500 text-base leading-none flex items-center justify-center hover:bg-gray-200 active:scale-90 transition-transform"
        >
          ×
        </button>
      )}
    </div>
  );
}
