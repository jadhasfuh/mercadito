"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

// ── Paleta derivada del color del restaurante ──────────────────────────────
// A partir del color principal generamos tonos (claro, fondo, hover) y un color
// de texto legible encima (blanco/oscuro según luminancia). Así el acento luce
// premium sin saturar y funciona igual con un naranja, un verde o un amarillo.
function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}
/** Mezcla `hex` hacia `target` en `amt` (0..1). */
function mix(hex: string, target: string, amt: number) {
  const a = hexToRgb(hex), b = hexToRgb(target);
  return toHex(a.r + (b.r - a.r) * amt, a.g + (b.g - a.g) * amt, a.b + (b.b - a.b) * amt);
}
/** Texto legible (oscuro o blanco) sobre un fondo dado. */
function readableOn(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.62 ? "#1f2937" : "#ffffff";
}

interface Cat { id: string; nombre: string; productos: MenuProducto[] }
interface Paleta { base: string; dark: string; soft: string; softBorder: string; on: string }

export default function MenuPublico({ menu, accion, encabezado, domicilio }: Props) {
  const { puesto } = menu;
  const base = puesto.color_marca || "#ED8E3C";
  // Tonos derivados (memo: solo dependen del color base).
  const pal = useMemo<Paleta>(() => ({
    base,
    dark: mix(base, "#000000", 0.16),     // hover / degradado / sombra dura
    soft: mix(base, "#ffffff", 0.9),      // fondo muy claro (acentos)
    softBorder: mix(base, "#ffffff", 0.7),
    on: readableOn(base),                 // texto legible sobre el color
  }), [base]);

  const [q, setQ] = useState("");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [activeCat, setActiveCat] = useState<string | null>(null);
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

  // Scroll-spy: resalta el chip de la categoría que el usuario está viendo.
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (buscando || filtradas.length < 2 || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActiveCat(vis[0].target.id.replace("cat-", ""));
      },
      { rootMargin: "-42% 0px -50% 0px", threshold: 0 }
    );
    filtradas.forEach((c) => {
      const el = document.getElementById(`cat-${c.id}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [filtradas, buscando]);

  // Mantén el chip activo a la vista dentro de la barra horizontal.
  useEffect(() => {
    if (!activeCat || !chipsRef.current) return;
    const chip = chipsRef.current.querySelector<HTMLElement>(`[data-chip="${activeCat}"]`);
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeCat]);

  const toggle = (id: string) =>
    setExpandidas((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const irA = (id: string) => {
    setActiveCat(id);
    const el = typeof document !== "undefined" ? document.getElementById(`cat-${id}`) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#fbfaf8] pb-28">
      {/* 1. Portada + 2. info del negocio (header premium con degradado) */}
      <header style={{ background: `linear-gradient(135deg, ${pal.base}, ${pal.dark})`, color: pal.on }}>
        {puesto.portada && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={puesto.portada} alt="" className="w-full max-h-52 object-cover" />
        )}
        <div className="max-w-lg mx-auto px-5 py-6 flex items-center gap-4">
          {puesto.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={puesto.logo} alt={puesto.nombre} className="h-[68px] w-[68px] rounded-[18px] object-cover bg-white/20 flex-shrink-0 shadow-sm ring-1 ring-white/25" />
          ) : (
            <div className="h-[68px] w-[68px] rounded-[18px] bg-white/20 flex items-center justify-center text-3xl font-extrabold flex-shrink-0 ring-1 ring-white/25">
              {puesto.nombre.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-[1.1] tracking-tight truncate">{puesto.nombre}</h1>
            {puesto.descripcion && <p className="text-sm leading-snug line-clamp-2 mt-1 opacity-80">{puesto.descripcion}</p>}
          </div>
        </div>
      </header>

      {encabezado}

      {/* 3. Buscador sticky + 4. chips de categoría */}
      {categorias.length > 0 && (
        <div className="sticky top-0 z-20 bg-[#fbfaf8]/95 backdrop-blur-sm border-b border-black/5">
          <div className="max-w-lg mx-auto px-4 pt-3 pb-2.5 space-y-2.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar productos…"
              aria-label="Buscar productos"
              className="w-full bg-white rounded-full border border-black/10 px-5 py-3 text-sm shadow-[0_1px_3px_rgba(0,0,0,0.04)] outline-none focus:border-black/20 transition-colors"
            />
            {!buscando && categorias.length > 1 && (
              <div ref={chipsRef} className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
                {categorias.map((c) => {
                  const on = activeCat === c.id;
                  return (
                    <button
                      key={c.id}
                      data-chip={c.id}
                      onClick={() => irA(c.id)}
                      className="flex-shrink-0 text-xs font-semibold px-4 py-2 rounded-full border active:scale-95 transition-all duration-150"
                      style={
                        on
                          ? { backgroundColor: pal.base, color: pal.on, borderColor: pal.base }
                          : { backgroundColor: "#ffffff", color: "#4b5563", borderColor: "rgba(0,0,0,0.08)" }
                      }
                    >
                      {c.nombre}{" "}
                      <span style={{ opacity: 0.5 }}>{c.productos.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Productos por categoría */}
      <main className="max-w-lg mx-auto px-4 py-5 space-y-9">
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
            <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-36">
              {/* Título de sección con acento del color principal */}
              <div className="mb-4">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">{c.nombre}</h2>
                  <span className="text-sm font-semibold text-gray-300">{c.productos.length}</span>
                </div>
                <div className="mt-2 h-[3px] w-9 rounded-full" style={{ backgroundColor: pal.base }} />
              </div>
              <div className="space-y-3">
                {visibles.map((p) => (
                  <ProductoCard
                    key={p.id}
                    p={p}
                    pal={pal}
                    accion={accion}
                    dom={modoDom ? { qty: sel.get(p.id) ?? 0, onAdd: () => addDom(p), onSub: () => subDom(p) } : undefined}
                  />
                ))}
              </div>
              {!buscando && c.productos.length > PREVIEW && (
                <button
                  onClick={() => toggle(c.id)}
                  className="mt-3 w-full text-sm font-semibold py-3 rounded-full border border-black/8 bg-white text-gray-600 active:scale-[0.99] hover:border-black/15 transition-all"
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
            <a href="https://mercadito.cx" className="font-semibold" style={{ color: pal.base }}>Mercadito 🛵</a>
          </p>
        </footer>
      </main>

      {/* Barra fija: pedir a domicilio por Mercadito (con lista precargada). */}
      {modoDom && (
        <div className="fixed bottom-0 inset-x-0 z-40">
          <div className="max-w-lg mx-auto px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2">
            <button
              onClick={pedirDomicilio}
              className="w-full flex items-center justify-center gap-2.5 font-extrabold text-base py-4 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.16)] active:scale-[0.99] transition-transform"
              style={{ backgroundColor: pal.base, color: pal.on }}
            >
              {totalSel > 0 && (
                <span
                  className="rounded-full min-w-7 h-7 px-2 grid place-items-center text-sm font-bold text-white"
                  style={{ backgroundColor: "rgba(0,0,0,0.32)" }}
                >
                  {totalSel}
                </span>
              )}
              Pedir a domicilio 🛵
            </button>
            {totalSel === 0 && (
              <p className="text-center text-[11px] text-gray-400 mt-2">Toca + en los productos para llevarlos precargados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductoCard({ p, pal, accion, dom }: { p: MenuProducto; pal: Paleta; accion?: (p: MenuProducto) => ReactNode; dom?: { qty: number; onAdd: () => void; onSub: () => void } }) {
  // Acepta URL absoluta (bucket/CDN) o ruta relativa (ej. /api/.../logo que
  // dejó la carga masiva como imagen por defecto). Antes solo http → caía a letra.
  const esUrl = !!p.imagen && (/^https?:/.test(p.imagen) || p.imagen.startsWith("/"));
  const esEmoji = !!p.imagen && p.imagen.startsWith("emoji:");
  return (
    <div className="flex gap-4 bg-white rounded-[22px] border border-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_18px_rgba(0,0,0,0.06)] transition-shadow p-3.5">
      {/* Imagen protagonista o placeholder elegante (nunca espacios vacíos) */}
      <div className="w-[84px] h-[84px] rounded-[18px] overflow-hidden bg-gray-50 flex items-center justify-center flex-shrink-0" style={!esUrl && !esEmoji ? { backgroundColor: pal.soft } : undefined}>
        {esUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imagen!} alt={p.nombre} loading="lazy" className="w-full h-full object-cover" />
        ) : esEmoji ? (
          <span className="text-3xl">{p.imagen!.slice(6)}</span>
        ) : (
          <span className="text-2xl font-extrabold" style={{ color: pal.base, opacity: 0.55 }}>{p.nombre.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-bold text-gray-900 leading-snug">{p.nombre}</h3>
          <span className="text-base font-extrabold text-gray-900 flex-shrink-0 tabular-nums">${p.precio.toFixed(0)}</span>
        </div>
        {p.descripcion && <p className="text-[13px] text-gray-500 leading-snug line-clamp-2 mt-1.5">{p.descripcion}</p>}
        {p.modificadores.length > 0 && (
          <span className="inline-flex w-fit items-center text-[11px] font-medium mt-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: pal.soft, color: pal.dark }}>Personalizable</span>
        )}
        {accion && <div className="mt-2.5">{accion(p)}</div>}
        {dom && (
          <div className="mt-2.5 flex justify-end">
            {dom.qty === 0 ? (
              <button
                onClick={dom.onAdd}
                aria-label={`Agregar ${p.nombre}`}
                className="w-9 h-9 rounded-full grid place-items-center text-2xl font-bold leading-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                style={{ backgroundColor: pal.base, color: pal.on, boxShadow: `2px 2px 0 ${pal.dark}` }}
              >
                +
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={dom.onSub} aria-label="Quitar uno" className="w-9 h-9 rounded-full border border-black/10 text-gray-700 font-bold text-lg active:scale-95 transition-transform">−</button>
                <span className="text-base font-extrabold w-5 text-center tabular-nums">{dom.qty}</span>
                <button onClick={dom.onAdd} aria-label="Agregar uno" className="w-9 h-9 rounded-full font-bold text-xl leading-none active:scale-95 transition-transform" style={{ backgroundColor: pal.base, color: pal.on }}>+</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
