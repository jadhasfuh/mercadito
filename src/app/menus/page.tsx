"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { CIUDADES, labelCiudad } from "@/lib/ciudades";

interface PuestoDir {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  logo: string | null;
  ciudad?: string | null;
  aprobado?: boolean;
  menu_publico?: boolean | null;
  menu_slug?: string | null;
  abierto_ahora?: boolean;
  // Derivadas de los productos con precio activo; vacío = tienda sin productos.
  categorias?: string[];
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * /menus — directorio de menús digitales. Lista todas las tiendas con menú
 * público y manda a /m/[tienda] (la página de menú con "pedir a domicilio").
 * Es la entrada sin QR: descubrir tiendas → ver menú → precargar carrito.
 */
export default function MenusPage() {
  const [puestos, setPuestos] = useState<PuestoDir[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [ciudad, setCiudad] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/puestos")
      .then((r) => r.json())
      .then((data: PuestoDir[]) => {
        if (!Array.isArray(data)) return;
        // Sin categorías = sin ningún producto activo → no hay menú que mostrar.
        setPuestos(data.filter((p) =>
          p.aprobado !== false && p.menu_publico !== false && (p.categorias?.length ?? 0) > 0
        ));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visibles = useMemo(() => {
    let lista = puestos;
    if (ciudad) lista = lista.filter((p) => (p.ciudad || "sahuayo") === ciudad);
    if (busqueda.trim()) {
      const q = norm(busqueda);
      lista = lista.filter((p) => norm(`${p.nombre} ${p.descripcion ?? ""}`).includes(q));
    }
    // Abiertas primero, luego alfabético.
    return [...lista].sort((a, b) =>
      Number(b.abierto_ahora ?? false) - Number(a.abierto_ahora ?? false) || a.nombre.localeCompare(b.nombre)
    );
  }, [puestos, ciudad, busqueda]);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Header title="Menús" />
      <main className="flex-1 max-w-lg w-full mx-auto p-3 space-y-3 pb-16">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Busca un negocio…"
          className="w-full bg-white border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
        />

        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setCiudad(null)}
            className={`px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-colors ${
              ciudad === null ? "bg-orange-50 border-brand text-orange-900" : "bg-white border-gray-200 text-gray-500"
            }`}
          >
            Todas
          </button>
          {CIUDADES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCiudad((prev) => (prev === c.id ? null : c.id))}
              className={`px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-colors ${
                ciudad === c.id ? "bg-orange-50 border-brand text-orange-900" : "bg-white border-gray-200 text-gray-500"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-16">Cargando menús…</div>
        ) : visibles.length === 0 ? (
          <div className="text-center text-gray-400 py-16">No encontramos negocios con ese nombre.</div>
        ) : (
          <div className="space-y-2.5">
            {visibles.map((p) => (
              <Link
                key={p.id}
                href={`/m/${p.menu_slug || p.id}`}
                className="flex items-center gap-3 bg-white rounded-2xl p-3.5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-lg)] ring-1 ring-gray-100 transition-soft"
              >
                <div className="w-14 h-14 rounded-xl bg-brand-light flex items-center justify-center overflow-hidden shrink-0 text-2xl">
                  {p.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.logo} alt={p.nombre} className="w-14 h-14 object-cover" />
                  ) : (
                    "🍽️"
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{p.nombre}</p>
                  {p.descripcion && <p className="text-xs text-gray-500 truncate">{p.descripcion}</p>}
                  <p className="text-[11px] text-gray-400 mt-0.5">📍 {labelCiudad(p.ciudad)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {p.abierto_ahora === false ? (
                    <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Cerrada</span>
                  ) : (
                    <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Abierta</span>
                  )}
                  <span className="text-gray-300 text-lg leading-none">›</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
