"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { MenuPublico as MenuData, MenuProducto } from "@/lib/menu";

interface Props {
  menu: MenuData;
  /** Acción por producto (ej. botón "Agregar" en modo mesa). Vacío = solo ver. */
  accion?: (p: MenuProducto) => ReactNode;
  /** Contenido extra bajo el header (ej. etiqueta de mesa, cuenta viva). */
  encabezado?: ReactNode;
  /** Modo "pedir a domicilio": activa selección de productos (stepper) y una
   *  barra flotante que manda la lista precargada a Mercadito (/cliente). */
  domicilio?: { puestoId: string };
}

// Llave de handoff: el menú deja aquí la selección y /cliente la levanta al
// cargar el catálogo, la mete al carrito y la borra. Compartida con cliente.
const PREORDEN_KEY = "mercadito_preorden";

// Productos visibles por categoría antes de "Ver más" — preview corto para que
// el menú se perciba breve y fácil de explorar (menos carga cognitiva).
const PREVIEW = 3;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

interface Cat { id: string; nombre: string; productos: MenuProducto[] }

export default function MenuPublico({ menu, accion, encabezado, domicilio }: Props) {
  const { puesto } = menu;
  const color = puesto.color_marca || "#ED8E3C";
  const [q, setQ] = useState("");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  // Selección para "pedir a domicilio": producto_id → cantidad. Sólo activa en
  // modo domicilio (no en mesa, donde manda `accion`).
  const modoDom = !!domicilio && !accion;
  const [sel, setSel] = useState<Map<string, number>>(new Map());
  const addDom = (p: MenuProducto) =>
    setSel((prev) => new Map(prev).set(p.id, (prev.get(p.id) ?? 0) + 1));
  const subDom = (p: MenuProducto) =>
    setSel((prev) => {
      const n = new Map(prev);
      const q = (n.get(p.id) ?? 0) - 1;
      if (q <= 0) n.delete(p.id);
      else n.set(p.id, q);
      return n;
    });
  const totalSel = Array.from(sel.values()).reduce((a, b) => a + b, 0);
  const pedirDomicilio = () => {
    if (typeof window === "undefined") return;
    if (totalSel > 0 && domicilio) {
      const items = Array.from(sel.entries()).map(([producto_id, cantidad]) => ({ producto_id, cantidad }));
      localStorage.setItem(PREORDEN_KEY, JSON.stringify({ puesto_id: domicilio.puestoId, items }));
    }
    window.location.href = "/cliente";
  };

  // Atribución: registra una vista del menú (sólo en modo domicilio = menú
  // público). Beacon ligero, no bloquea nada si falla.
  useEffect(() => {
    if (!domicilio?.puestoId) return;
    fetch(`/api/menu/${domicilio.puestoId}/evento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "vista" }),
    }).catch(() => {});
  }, [domicilio?.puestoId]);

  // Categorías = subsecciones, con sus productos aplanados (estructura plana,
  // genérica para cualquier giro: cafetería, taquería, abarrotes, etc.).
  const categorias = useMemo<Cat[]>(
    () => menu.secciones.map((s) => ({ id: s.subseccion, nombre: s.subseccion, productos: s.grupos.flatMap((g) => g.productos) })),
    [menu.secciones]
  );

  const nq = norm(q.trim());
  const buscando = nq.length > 0;
  const filtradas = useMemo<Cat[]>(() => {
    if (!nq) return categorias;
    return categorias
      .map((c) => ({ ...c, productos: c.productos.filter((p) => norm(p.nombre).includes(nq) || (p.descripcion ? norm(p.descripcion).includes(nq) : false)) }))
      .filter((c) => c.productos.length > 0);
  }, [categorias, nq]);

  const toggle = (id: string) =>
    setExpandidas((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const irA = (id: string) => {
    const el = typeof document !== "undefined" ? document.getElementById(`cat-${id}`) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* 1. Portada + 2. info del negocio */}
      <header className="text-white" style={{ backgroundColor: color }}>
        {puesto.portada && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={puesto.portada} alt="" className="w-full max-h-44 object-cover" />
        )}
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          {puesto.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={puesto.logo} alt={puesto.nombre} className="h-14 w-14 rounded-2xl object-cover bg-white/20 flex-shrink-0" />
          ) : (
            <div className="h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center text-2xl font-bold flex-shrink-0">
              {puesto.nombre.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight truncate">{puesto.nombre}</h1>
            {puesto.descripcion && <p className="text-sm text-white/85 leading-snug line-clamp-2">{puesto.descripcion}</p>}
          </div>
        </div>
      </header>

      {encabezado}

      {/* 3. Buscador sticky + 4. chips de categoría */}
      {categorias.length > 0 && (
        <div className="sticky top-0 z-20 bg-cream/95 backdrop-blur-sm border-b border-gray-100">
          <div className="max-w-lg mx-auto px-4 pt-3 pb-2 space-y-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar productos…"
              aria-label="Buscar productos"
              className="w-full bg-white rounded-full border border-gray-200 px-4 py-2.5 text-sm shadow-sm outline-none focus:border-gray-300"
            />
            {!buscando && categorias.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
                {categorias.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => irA(c.id)}
                    className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-600 active:scale-95 transition-transform"
                  >
                    {c.nombre} <span className="text-gray-400">{c.productos.length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Productos por categoría */}
      <main className="max-w-lg mx-auto px-4 py-4 space-y-6">
        {categorias.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-2">🍽️</div>
            <p className="text-gray-400">Este menú aún no tiene productos.</p>
          </div>
        )}
        {buscando && filtradas.length === 0 && (
          <p className="text-center text-gray-400 py-12">Sin resultados para “{q}”.</p>
        )}

        {filtradas.map((c) => {
          const abierta = buscando || expandidas.has(c.id);
          const visibles = abierta ? c.productos : c.productos.slice(0, PREVIEW);
          const ocultos = c.productos.length - visibles.length;
          return (
            <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-32">
              <div className="flex items-baseline gap-2 mb-2.5">
                <h2 className="text-base font-bold text-gray-900">{c.nombre}</h2>
                <span className="text-sm font-medium text-gray-400">{c.productos.length}</span>
              </div>
              <div className="space-y-2">
                {visibles.map((p) => (
                  <ProductoCard
                    key={p.id}
                    p={p}
                    color={color}
                    accion={accion}
                    dom={modoDom ? { qty: sel.get(p.id) ?? 0, onAdd: () => addDom(p), onSub: () => subDom(p) } : undefined}
                  />
                ))}
              </div>
              {!buscando && c.productos.length > PREVIEW && (
                <button
                  onClick={() => toggle(c.id)}
                  className="mt-2 w-full text-sm font-semibold py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 active:scale-[0.99] transition-transform"
                >
                  {abierta ? "Ver menos ▲" : `Ver ${ocultos} más ▾`}
                </button>
              )}
            </section>
          );
        })}

        {/* Branding: el menú es gratis y canaliza los pedidos a Mercadito.
            Cuando el negocio comparte su menú, promociona Mercadito. */}
        <footer className="pt-4 pb-2 text-center">
          <p className="text-xs text-gray-400">
            Menú digital gratis · pedidos por{" "}
            <a href="https://mercadito.cx" className="font-semibold" style={{ color }}>Mercadito 🛵</a>
          </p>
        </footer>
      </main>

      {/* Barra fija: pedir a domicilio por Mercadito (con lista precargada). */}
      {modoDom && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t">
          <div className="max-w-lg mx-auto px-4 py-3">
            <button
              onClick={pedirDomicilio}
              className="w-full flex items-center justify-center gap-2 text-white font-bold py-3.5 rounded-xl shadow-sm active:opacity-90"
              style={{ backgroundColor: color }}
            >
              {totalSel > 0 ? (
                <>
                  <span className="bg-white/25 rounded-full px-2 py-0.5 text-sm">{totalSel}</span>
                  Pedir a domicilio 🛵
                </>
              ) : (
                <>Pedir a domicilio 🛵</>
              )}
            </button>
            {totalSel === 0 && (
              <p className="text-center text-[11px] text-gray-400 mt-1.5">Toca ➕ en los productos para llevarlos precargados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductoCard({ p, color, accion, dom }: { p: MenuProducto; color: string; accion?: (p: MenuProducto) => ReactNode; dom?: { qty: number; onAdd: () => void; onSub: () => void } }) {
  // Acepta URL absoluta (bucket/CDN) o ruta relativa (ej. /api/.../logo que
  // dejó la carga masiva como imagen por defecto). Antes solo http → caía a letra.
  const esUrl = !!p.imagen && (/^https?:/.test(p.imagen) || p.imagen.startsWith("/"));
  const esEmoji = !!p.imagen && p.imagen.startsWith("emoji:");
  return (
    <div className="flex gap-3 bg-white rounded-2xl border border-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-3">
      {/* Imagen o placeholder elegante (nunca espacios vacíos) */}
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center flex-shrink-0">
        {esUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imagen!} alt={p.nombre} loading="lazy" className="w-full h-full object-cover" />
        ) : esEmoji ? (
          <span className="text-2xl">{p.imagen!.slice(6)}</span>
        ) : (
          <span className="text-xl font-bold opacity-40" style={{ color }}>{p.nombre.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">{p.nombre}</h3>
          <span className="text-sm font-bold text-gray-900 flex-shrink-0">${p.precio.toFixed(0)}</span>
        </div>
        {p.descripcion && <p className="text-xs text-gray-500 leading-snug line-clamp-2 mt-0.5">{p.descripcion}</p>}
        {p.modificadores.length > 0 && <p className="text-[11px] text-gray-400 mt-1">Personalizable</p>}
        {accion && <div className="mt-2">{accion(p)}</div>}
        {dom && (
          <div className="mt-2 flex justify-end">
            {dom.qty === 0 ? (
              <button
                onClick={dom.onAdd}
                className="text-sm font-semibold px-3 py-1 rounded-full text-white active:scale-95 transition-transform"
                style={{ backgroundColor: color }}
              >
                ➕ Agregar
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={dom.onSub} aria-label="Quitar uno" className="w-8 h-8 rounded-full border border-gray-200 text-gray-700 font-bold active:scale-95">−</button>
                <span className="text-sm font-bold w-5 text-center">{dom.qty}</span>
                <button onClick={dom.onAdd} aria-label="Agregar uno" className="w-8 h-8 rounded-full text-white font-bold active:scale-95" style={{ backgroundColor: color }}>+</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
