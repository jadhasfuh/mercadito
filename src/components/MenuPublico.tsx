"use client";

import { useState, type ReactNode } from "react";
import type { MenuPublico as MenuData, MenuProducto } from "@/lib/menu";

interface Props {
  menu: MenuData;
  /** Acción por producto (ej. botón "Agregar" en modo mesa). Vacío = solo ver. */
  accion?: (p: MenuProducto) => ReactNode;
  /** Contenido extra bajo el header (ej. etiqueta de mesa, cuenta viva). */
  encabezado?: ReactNode;
}

export default function MenuPublico({ menu, accion, encabezado }: Props) {
  const { puesto, secciones } = menu;
  const color = puesto.color_marca || "#ED8E3C";
  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const toggle = (k: string) =>
    setColapsadas((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  // Búsqueda de productos: filtra por nombre/descripción (sin acentos). Al
  // buscar, las secciones se muestran expandidas para ver los resultados.
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const nq = norm(q.trim());
  const seccionesVis = !nq
    ? secciones
    : secciones
        .map((sec) => ({
          ...sec,
          grupos: sec.grupos
            .map((g) => ({ ...g, productos: g.productos.filter((p) => norm(p.nombre).includes(nq) || (p.descripcion ? norm(p.descripcion).includes(nq) : false)) }))
            .filter((g) => g.productos.length > 0),
        }))
        .filter((sec) => sec.grupos.length > 0);

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header con marca */}
      <header className="text-white shadow-md" style={{ backgroundColor: color }}>
        {puesto.portada && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={puesto.portada} alt="" className="w-full max-h-44 object-cover" />
        )}
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          {puesto.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={puesto.logo} alt={puesto.nombre} className="h-14 w-14 rounded-xl object-cover bg-white/20" />
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight truncate">{puesto.nombre}</h1>
            {puesto.descripcion && <p className="text-sm text-white/85 leading-snug line-clamp-2">{puesto.descripcion}</p>}
          </div>
        </div>
      </header>

      {encabezado}

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Buscador de productos */}
        {secciones.length > 0 && (
          <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-cream">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar en el menú…"
              className="w-full bg-white rounded-full border border-gray-200 px-4 py-2.5 text-sm shadow-sm outline-none"
            />
          </div>
        )}
        {secciones.length === 0 ? (
          <p className="text-center text-gray-400 py-12">Este menú aún no tiene productos.</p>
        ) : seccionesVis.length === 0 ? (
          <p className="text-center text-gray-400 py-12">Sin resultados para “{q}”.</p>
        ) : null}
        {seccionesVis.map((sec) => {
          const cerrada = nq ? false : colapsadas.has(sec.subseccion);
          return (
            <section key={sec.subseccion} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => toggle(sec.subseccion)}
                className="w-full flex items-center justify-between px-4 py-3 font-bold text-gray-800"
              >
                <span>{sec.subseccion}</span>
                <span className="text-gray-400">{cerrada ? "▸" : "▾"}</span>
              </button>
              {!cerrada && (
                <div className="px-4 pb-3">
                  {sec.grupos.map((g) => (
                    <div key={g.seccion} className="mb-3 last:mb-0">
                      {g.seccion !== sec.subseccion && g.seccion !== "General" && (
                        <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color }}>{g.seccion}</p>
                      )}
                      <div className="space-y-2">
                        {g.productos.map((p) => (
                          <div key={p.id} className="flex items-start gap-3 border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                            {p.imagen && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/productos/${p.id}/imagen`} alt="" className="h-14 w-14 rounded-lg object-cover flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800">{p.nombre}</p>
                              {p.descripcion && <p className="text-xs text-gray-500 leading-snug line-clamp-2">{p.descripcion}</p>}
                              {p.modificadores.length > 0 && (
                                <p className="text-[11px] text-gray-400 mt-0.5">Personalizable</p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-gray-800">${p.precio.toFixed(0)}</p>
                              {accion && <div className="mt-1">{accion(p)}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
