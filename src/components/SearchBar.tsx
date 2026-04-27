"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/**
 * Barra de búsqueda reusable. Mismo estilo en /cliente y /tienda para que
 * el dueño de tienda y el cliente vean exactamente la misma UI cuando
 * filtran productos por nombre.
 */
export default function SearchBar({ value, onChange, placeholder = "Buscar producto..." }: Props) {
  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full pl-4 pr-2 py-1.5 shadow-sm">
      <span className="text-gray-400 text-sm">🔍</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 outline-none text-sm bg-transparent placeholder:text-gray-400"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-sm flex items-center justify-center hover:bg-gray-200"
          aria-label="Limpiar búsqueda"
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * Helper de matching consistente entre web y mobile. Normaliza acentos
 * y mayúsculas para que "manzana" haga match con "Manzána".
 */
export function matchProducto(
  query: string,
  nombre: string,
  descripcion?: string | null,
  ...extras: (string | null | undefined)[]
): boolean {
  const q = normalizar(query);
  if (!q) return true;
  if (normalizar(nombre).includes(q)) return true;
  if (descripcion && normalizar(descripcion).includes(q)) return true;
  for (const x of extras) {
    if (x && normalizar(x).includes(q)) return true;
  }
  return false;
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
