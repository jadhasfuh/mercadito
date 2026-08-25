"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MenuPublico as MenuData, MenuProducto, MenuModificador, MenuVariante } from "@/lib/menu";
import { validarSeleccion, type SeleccionModificador, type ProductoModificador } from "@/lib/variantes";
import { formatMXN } from "@/lib/dinero";
import { DELIVERY_ACTIVO } from "@/lib/flags";
import { linkPedidoWhatsApp, telefonoWhatsApp, linkLlamada } from "@/lib/pedidoWhatsApp";

interface Props {
  menu: MenuData;
  /** Acción por producto (ej. botón "Agregar" en modo mesa). Vacío = solo ver. */
  accion?: (p: MenuProducto) => ReactNode;
  /** Contenido extra bajo el header (ej. etiqueta de mesa, cuenta viva). */
  encabezado?: ReactNode;
  /** Modo "pedir a domicilio": activa selección de productos (con modificadores)
   *  y una barra flotante que manda la lista precargada a Mercadito (/cliente). */
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
// El acento SIEMPRE lleva texto blanco. Para que el blanco se lea con cualquier
// color (incluso amarillos claros), oscurecemos el acento lo justo si el color
// elegido es demasiado claro. Así no hay que alternar negro/blanco (que se
// perdería en fondos oscuros o claros): blanco + fondo garantizado oscuro.
function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}
function mix(hex: string, target: string, amt: number) {
  const a = hexToRgb(hex), b = hexToRgb(target);
  return toHex(a.r + (b.r - a.r) * amt, a.g + (b.g - a.g) * amt, a.b + (b.b - a.b) * amt);
}
function lum(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
/** Oscurece el color hasta que el texto blanco se lea bien encima. */
function paraTextoBlanco(hex: string) {
  let c = hex, guard = 0;
  while (lum(c) > 0.6 && guard < 14) { c = mix(c, "#000000", 0.1); guard++; }
  return c;
}

interface Cat { id: string; nombre: string; productos: MenuProducto[] }
interface Paleta { accent: string; accentDark: string; shadow: string; soft: string; on: string }

interface Linea {
  key: string; producto_id: string; nombre: string; cantidad: number;
  variante: MenuVariante | null; modificadores: SeleccionModificador[];
  // Datos de precio, NO el precio ya resuelto: con mayoreo el unitario
  // depende de la cantidad, así que se recalcula cada vez que cambia.
  precioBase: number; precioMayoreo: number | null; mayoreoDesde: number | null;
  extras: number;
}

/** Unitario de la línea a su cantidad actual: mayoreo si alcanza el mínimo,
 *  más los extras de modificadores. Misma fórmula que el carrito de /cliente
 *  (calcularPrecioEfectivo en lib/variantes). */
function unitDe(l: Linea): number {
  const aplicaMayoreo = l.precioMayoreo != null && l.mayoreoDesde != null && l.cantidad >= l.mayoreoDesde;
  return (aplicaMayoreo ? l.precioMayoreo! : l.precioBase) + l.extras;
}
const claveLinea = (pid: string, varianteId: string | null, mods: SeleccionModificador[]) =>
  pid + "|" + (varianteId ?? "") + "|" + mods.map((m) => m.opcion_id).sort().join(",");
const resumenLinea = (l: Linea) =>
  [l.variante?.nombre, ...l.modificadores.map((m) => m.opcion_nombre)].filter(Boolean).join(" · ");

export default function MenuPublico({ menu, accion, encabezado, domicilio }: Props) {
  const { puesto } = menu;
  const base = puesto.color_marca || "#ED8E3C";
  const pal = useMemo<Paleta>(() => {
    const accent = paraTextoBlanco(base);
    // Sombra dura del efecto "pepe": tiene que verse SIEMPRE. Si el acento ya
    // es muy oscuro (p.ej. negro), oscurecerlo no crearía contraste → la
    // aclaramos; si no, la oscurecemos bien para que el borde del botón marque.
    const oscuro = lum(accent) < 0.22;
    return {
      accent,
      accentDark: mix(accent, "#000000", 0.18), // fin del degradado del header
      shadow: oscuro ? mix(accent, "#ffffff", 0.4) : mix(accent, "#000000", 0.34),
      soft: mix(base, "#ffffff", 0.9),          // tinte claro para fondos
      on: "#ffffff",                            // texto en acentos: siempre blanco
    };
  }, [base]);

  const [q, setQ] = useState("");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [activeCat, setActiveCat] = useState<string | null>(null);
  // Sin WhatsApp registrado no hay a dónde mandar el pedido: el menú se queda
  // como carta de solo lectura (un botón que no lleva a nada es peor que nada).
  const puedePedir = DELIVERY_ACTIVO || !!telefonoWhatsApp(puesto.telefono_contacto);
  const telLlamada = DELIVERY_ACTIVO ? null : linkLlamada(puesto.telefono_contacto);
  const modoDom = !!domicilio && !accion && puedePedir;

  // Selección "pedir a domicilio": lista de líneas (cada combinación de
  // modificadores es su propia línea, como en el carrito).
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [modalProd, setModalProd] = useState<MenuProducto | null>(null);

  const lineasDe = (pid: string) => lineas.filter((l) => l.producto_id === pid);
  const qtyDe = (pid: string) => lineasDe(pid).reduce((a, l) => a + l.cantidad, 0);
  const totalSel = lineas.reduce((a, l) => a + l.cantidad, 0);
  const totalMonto = lineas.reduce((a, l) => a + unitDe(l) * l.cantidad, 0);

  // Microanimación al agregar: el producto recién tocado hace un rebote breve y
  // su botón muestra un ✓ por ~0.4 s. Sensación de "app premium" sin librerías.
  const [pulso, setPulso] = useState<string | null>(null);
  const flash = (pid: string) => {
    setPulso(pid);
    setTimeout(() => setPulso((cur) => (cur === pid ? null : cur)), 420);
  };

  const addLinea = (p: MenuProducto, variante: MenuVariante | null, mods: SeleccionModificador[], cant: number) =>
    setLineas((prev) => {
      const key = claveLinea(p.id, variante?.id ?? null, mods);
      const i = prev.findIndex((l) => l.key === key);
      if (i >= 0) {
        const n = [...prev];
        n[i] = { ...n[i], cantidad: n[i].cantidad + cant };
        return n;
      }
      return [...prev, {
        key, producto_id: p.id, nombre: p.nombre, cantidad: cant, variante, modificadores: mods,
        precioBase: variante?.precio ?? p.precio,
        // El mayoreo vive en el precio del producto, no en la variante: si el
        // cliente eligió una presentación con precio propio, ese manda y no
        // se le aplica descuento por volumen.
        precioMayoreo: variante ? null : p.precio_mayoreo,
        mayoreoDesde: variante ? null : p.mayoreo_desde,
        extras: mods.reduce((s, m) => s + (Number(m.precio_extra) || 0), 0),
      }];
    });
  const subPlano = (p: MenuProducto) =>
    setLineas((prev) => {
      const key = claveLinea(p.id, null, []);
      const i = prev.findIndex((l) => l.key === key);
      if (i < 0) return prev;
      const q = prev[i].cantidad - 1;
      if (q <= 0) return prev.filter((l) => l.key !== key);
      const n = [...prev];
      n[i] = { ...n[i], cantidad: q };
      return n;
    });
  const quitarLinea = (key: string) => setLineas((prev) => prev.filter((l) => l.key !== key));

  // ¿A dónde va el pedido? Con delivery encendido, al carrito de Mercadito.
  // Apagado, al WhatsApp del negocio (él confirma, cobra y entrega).
  const waPedido = DELIVERY_ACTIVO
    ? null
    : linkPedidoWhatsApp({
        telefono: puesto.telefono_contacto,
        negocio: puesto.nombre,
        lineas: lineas.map((l) => ({
          nombre: l.nombre, cantidad: l.cantidad, precioUnit: unitDe(l),
          detalle: resumenLinea(l) || undefined,
        })),
        total: totalMonto,
        urlMenu: typeof window !== "undefined" ? window.location.href.split("?")[0] : "mercadito.cx",
      });

  const pedir = () => {
    if (typeof window === "undefined") return;
    // Atribución: el negocio ve cuántos pedidos le generó su menú, aunque el
    // detalle viva en su WhatsApp.
    if (domicilio?.puestoId && totalSel > 0) {
      fetch(`/api/menu/${domicilio.puestoId}/evento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "pedido" }),
      }).catch(() => {});
    }
    if (!DELIVERY_ACTIVO) {
      if (waPedido) window.location.href = waPedido;
      return;
    }
    if (totalSel > 0 && domicilio) {
      const items = lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, variante_id: l.variante?.id ?? null, modificadores: l.modificadores }));
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
    <div className="min-h-screen bg-[#f7f7f8] pb-28">
      {/* 1. Header premium: portada como hero con degradado, o degradado de marca.
         Info del negocio (avatar grande + nombre + ubicación) sobrepuesta. */}
      <header className="relative overflow-hidden" style={{ color: pal.on }}>
        {puesto.portada ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={puesto.portada} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${pal.accentDark}f7 8%, ${pal.accentDark}66 45%, ${pal.accent}22 100%)` }} />
          </>
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${pal.accent}, ${pal.accentDark})` }} />
        )}
        <div className={`relative max-w-lg mx-auto px-5 flex items-end gap-4 ${puesto.portada ? "pt-24 pb-5" : "py-7"}`}>
          {puesto.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={puesto.logo} alt={puesto.nombre} className="h-[76px] w-[76px] rounded-[20px] object-cover bg-white/20 flex-shrink-0 shadow-lg ring-2 ring-white/30" />
          ) : (
            <div className="h-[76px] w-[76px] rounded-[20px] bg-white/25 flex items-center justify-center text-3xl font-extrabold flex-shrink-0 ring-2 ring-white/30 shadow-lg">
              {puesto.nombre.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 pb-0.5">
            <h1 className="text-[27px] font-extrabold leading-[1.05] tracking-tight line-clamp-2 drop-shadow-sm">{puesto.nombre}</h1>
            {puesto.ubicacion && (
              <p className="text-[13px] leading-snug mt-1.5 opacity-90 flex items-center gap-1 min-w-0">
                <span className="flex-shrink-0">📍</span><span className="truncate">{puesto.ubicacion}</span>
              </p>
            )}
            {puesto.descripcion && <p className="text-[13px] leading-snug line-clamp-1 mt-1 opacity-80">{puesto.descripcion}</p>}
          </div>
        </div>
      </header>

      {/* Info previa a comprar: estado + envío + aviso de cuenta. El cliente
          decide según "¿cuánto/está abierto?" — antes eso aparecía recién en
          el checkout, provocando abandono. */}
      <div className="max-w-lg mx-auto px-5 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className={`inline-flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-full ${puesto.abierto ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${puesto.abierto ? "bg-green-500" : "bg-red-500"}`} />
            {puesto.abierto ? "Abierto ahora" : "Cerrado ahora"}
          </span>
          {DELIVERY_ACTIVO && puesto.envio_desde != null && (
            <span className="inline-flex items-center gap-1 text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
              🛵 Envío desde ${puesto.envio_desde}
              <span className="text-gray-400 font-normal">· según tu dirección</span>
            </span>
          )}
          {!DELIVERY_ACTIVO && puedePedir && (
            <span className="inline-flex items-center gap-1 text-[#128C7E] bg-[#25D366]/10 px-2.5 py-1 rounded-full font-medium">
              💬 Pide por WhatsApp
            </span>
          )}
        </div>
        {/* Con WhatsApp no hay cuenta que crear: decir lo contrario espantaba
            gente que sí iba a pedir. */}
        <p className="text-[11.5px] text-gray-400 mt-2 leading-snug">
          {DELIVERY_ACTIVO
            ? "Para pedir necesitas una cuenta rápida (teléfono + PIN)."
            : puedePedir
              ? "Arma tu pedido y se lo mandas al negocio por WhatsApp. Sin registro."
              : "Este negocio aún no recibe pedidos por aquí — puedes ver su menú y precios."}
        </p>
      </div>

      {encabezado}

      {/* 3. Buscador sticky + 4. chips de categoría */}
      {categorias.length > 0 && (
        <div className="sticky top-0 z-20 bg-[#f7f7f8]/95 backdrop-blur-sm border-b border-black/5">
          <div className="max-w-lg mx-auto px-4 pt-2.5 pb-2 space-y-2.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="¿Qué se te antoja?"
              aria-label="Buscar productos"
              className="w-full bg-white rounded-full border border-black/10 px-5 py-2.5 text-sm shadow-[0_1px_3px_rgba(0,0,0,0.04)] outline-none focus:border-black/20 transition-colors"
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
                      className="flex-shrink-0 text-xs font-semibold px-4 py-2 rounded-full border active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150"
                      style={
                        on
                          ? { backgroundColor: pal.accent, color: pal.on, borderColor: pal.accent, boxShadow: `2px 2px 0 ${pal.shadow}` }
                          : { backgroundColor: "#ffffff", color: "#4b5563", borderColor: "rgba(0,0,0,0.08)" }
                      }
                    >
                      {c.nombre} <span style={{ opacity: 0.5 }}>{c.productos.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Productos por categoría */}
      <main className="max-w-lg mx-auto px-4 py-5 space-y-7">
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
              <div className="mb-3.5">
                <h2 className="text-[22px] font-extrabold text-[#1F2937] tracking-tight leading-tight">{c.nombre}</h2>
                <div className="mt-2 h-[5px] w-10 rounded-full" style={{ backgroundColor: pal.accent }} />
              </div>
              <div className="space-y-3.5">
                {visibles.map((p) => (
                  <ProductoCard
                    key={p.id}
                    p={p}
                    pal={pal}
                    accion={accion}
                    pulse={pulso === p.id}
                    dom={
                      modoDom
                        ? {
                            customizable: p.modificadores.length > 0 || p.variantes.length > 0,
                            totalQty: qtyDe(p.id),
                            plainQty: lineasDe(p.id).find((l) => !l.variante && l.modificadores.length === 0)?.cantidad ?? 0,
                            lineas: lineasDe(p.id),
                            onAddPlano: () => { addLinea(p, null, [], 1); flash(p.id); },
                            onSubPlano: () => subPlano(p),
                            onPersonalizar: () => setModalProd(p),
                            onQuitarLinea: quitarLinea,
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
              {!buscando && c.productos.length > PREVIEW && (
                <button
                  onClick={() => toggle(c.id)}
                  className="mt-3 w-full text-sm font-bold py-3 rounded-full active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                  style={{ backgroundColor: pal.accent, color: pal.on, boxShadow: `2px 2px 0 ${pal.shadow}` }}
                >
                  {abierta ? "Ver menos ▲" : `Ver ${ocultos} más ▾`}
                </button>
              )}
            </section>
          );
        })}

        {/* Branding: el menú es gratis y canaliza los pedidos a Mercadito. */}
        <footer className="pt-4 pb-2 text-center">
          <p className="text-xs text-gray-400">
            Menú digital gratis · pedidos por{" "}
            <a href="https://mercadito.cx" className="font-semibold" style={{ color: pal.accent }}>Mercadito 🛵</a>
          </p>
        </footer>
      </main>

      {/* Barra fija inteligente: muestra productos + total en vivo y lleva la
         lista precargada a Mercadito. Vacía = invita a empezar el pedido. */}
      {modoDom && (
        <div className="fixed bottom-0 inset-x-0 z-40">
          <div className="max-w-lg mx-auto px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2">
            {/* Salida por llamada. No hay forma confiable de saber si un
                número tiene WhatsApp (Meta no lo expone, y en México un fijo
                y un celular se ven igual), así que en vez de adivinar
                ofrecemos las dos vías: si el WhatsApp no existe, el cliente
                llama y el negocio no pierde el pedido. */}
            {totalSel > 0 ? (
              <button
                onClick={pedir}
                className="w-full flex items-center justify-between gap-3 pl-3.5 pr-5 py-3 rounded-full active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all"
                style={{ backgroundColor: pal.accent, color: pal.on, boxShadow: `3px 3px 0 ${pal.shadow}, 0 8px 24px rgba(0,0,0,0.16)` }}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="rounded-full min-w-8 h-8 px-2 grid place-items-center text-sm font-extrabold" style={{ backgroundColor: "rgba(0,0,0,0.28)" }}>
                    {totalSel}
                  </span>
                  <span className="flex flex-col items-start leading-tight text-left">
                    <span className="text-[11px] font-semibold opacity-85">{totalSel === 1 ? "1 producto" : `${totalSel} productos`}</span>
                    <span className="text-[17px] font-extrabold tabular-nums">{formatMXN(totalMonto)}</span>
                  </span>
                </span>
                <span className="text-[15px] font-extrabold flex items-center gap-1.5">
                  {DELIVERY_ACTIVO ? "Ver carrito" : "Pedir por WhatsApp"} <span className="text-lg leading-none">→</span>
                </span>
              </button>
            ) : null}
            {!DELIVERY_ACTIVO && totalSel > 0 && telLlamada && (
              <p className="text-center text-[11.5px] text-gray-500 mt-2">
                ¿No te abre WhatsApp?{" "}
                <a href={telLlamada} className="font-bold underline" style={{ color: pal.accentDark }}>
                  Llama al negocio
                </a>
              </p>
            )}
            {totalSel === 0 && (DELIVERY_ACTIVO ? (
              <>
                <button
                  onClick={pedir}
                  className="w-full flex items-center justify-center gap-2 font-extrabold text-base py-4 rounded-full active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all"
                  style={{ backgroundColor: pal.accent, color: pal.on, boxShadow: `3px 3px 0 ${pal.shadow}, 0 8px 24px rgba(0,0,0,0.16)` }}
                >
                  Empieza tu pedido 🛵
                </button>
                <p className="text-center text-[11px] text-gray-400 mt-2">Toca <span className="font-semibold">Agregar</span> en los productos que se te antojen</p>
              </>
            ) : (
              // Sin nada en el carrito no hay pedido que mandar: solo la pista.
              // Un botón de WhatsApp vacío haría que el negocio reciba mensajes
              // en blanco.
              <div className="rounded-full bg-white/95 border border-black/5 shadow-[0_4px_16px_rgba(0,0,0,0.10)] py-3 px-4">
                <p className="text-center text-[12px] text-gray-500">
                  Toca <span className="font-semibold">Agregar</span> y al final pides por WhatsApp
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de personalización (modificadores + cantidad) */}
      {modalProd && (
        <MenuProductoModal
          producto={modalProd}
          pal={pal}
          onClose={() => setModalProd(null)}
          onAgregar={(variante, mods, cant) => { addLinea(modalProd, variante, mods, cant); flash(modalProd.id); }}
        />
      )}
    </div>
  );
}

interface DomProps {
  customizable: boolean;
  totalQty: number;
  plainQty: number;
  lineas: Linea[];
  onAddPlano: () => void;
  onSubPlano: () => void;
  onPersonalizar: () => void;
  onQuitarLinea: (key: string) => void;
}

function ProductoCard({ p, pal, accion, dom, pulse }: { p: MenuProducto; pal: Paleta; accion?: (p: MenuProducto) => ReactNode; dom?: DomProps; pulse?: boolean }) {
  const esUrl = !!p.imagen && (/^https?:/.test(p.imagen) || p.imagen.startsWith("/"));
  const esEmoji = !!p.imagen && p.imagen.startsWith("emoji:");
  const lineasCustom = dom?.lineas.filter((l) => l.variante != null || l.modificadores.length > 0) ?? [];
  const variaPrecio = p.modificadores.length > 0 || p.variantes.length > 0; // el precio final varía con extras/presentación
  return (
    <div className={`bg-white rounded-[24px] border border-black/[0.04] shadow-[0_2px_10px_rgba(0,0,0,0.05)] p-3.5 transition-transform duration-200 ${pulse ? "scale-[1.02]" : "scale-100"}`}>
      <div className="flex gap-3.5">
        {/* Imagen protagonista o placeholder elegante */}
        <div className="w-24 h-24 rounded-[20px] overflow-hidden bg-gray-50 flex items-center justify-center flex-shrink-0" style={!esUrl && !esEmoji ? { backgroundColor: pal.soft } : undefined}>
          {esUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imagen!} alt={p.nombre} loading="lazy" className="w-full h-full object-cover" />
          ) : esEmoji ? (
            <span className="text-4xl">{p.imagen!.slice(6)}</span>
          ) : (
            <span className="text-3xl font-extrabold" style={{ color: pal.accent, opacity: 0.55 }}>{p.nombre.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[16px] font-bold text-[#1F2937] leading-snug">{p.nombre}</h3>
            <div className="flex-shrink-0 flex flex-col items-end leading-none">
              {variaPrecio && <span className="text-[10px] font-medium text-[#9CA3AF] mb-0.5">Desde</span>}
              <span className="text-[15px] font-bold text-[#1F2937] tabular-nums">{formatMXN(p.precio)}</span>
            </div>
          </div>
          {p.descripcion && <p className="text-[13px] text-[#6B7280] leading-snug line-clamp-2 mt-1.5">{p.descripcion}</p>}
          {p.modificadores.length > 0 && !dom && (
            <span className="inline-flex w-fit items-center text-[11px] font-medium mt-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: pal.soft, color: pal.accentDark }}>Personalizable</span>
          )}
          {/* Precio de mayoreo: el negocio lo configuró y hasta ahora no se
              veía en el menú ni se aplicaba al pedir. Va SIEMPRE (con y sin
              modo pedido) porque es información del producto, y en la carta
              de una frutería o carnicería es de lo más importante. */}
          {p.precio_mayoreo != null && p.mayoreo_desde != null && (
            <span className="inline-flex w-fit items-center gap-1 text-[11px] font-bold mt-2 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              🏷️ {p.mayoreo_desde} o más a {formatMXN(p.precio_mayoreo)} c/u
            </span>
          )}
          {/* Variantes en modo solo-ver: la lista de presentaciones con su
              precio ES el menú (sabores, tamaños, "10 piezas"). En modo
              domicilio viven en el modal de personalizar. */}
          {p.variantes.length > 0 && !dom && (
            <div className="mt-2 space-y-0.5">
              {p.variantes.map((v) => (
                <div key={v.id} className="flex items-baseline gap-2 text-[13px]">
                  <span className="text-gray-600">{v.nombre}</span>
                  <span className="flex-1 border-b border-dotted border-gray-200" />
                  <span className="font-semibold text-gray-700 tabular-nums">{formatMXN(v.precio)}</span>
                </div>
              ))}
            </div>
          )}
          {accion && <div className="mt-2.5">{accion(p)}</div>}

          {dom && !dom.customizable && (
            <div className="mt-2.5 flex justify-end">
              {dom.plainQty === 0 ? (
                <button
                  onClick={dom.onAddPlano}
                  aria-label={`Agregar ${p.nombre}`}
                  className="inline-flex items-center gap-1 text-sm font-bold pl-4 pr-3.5 py-2 rounded-full active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                  style={{ backgroundColor: pal.accent, color: pal.on, boxShadow: `2px 2px 0 ${pal.shadow}` }}
                >
                  Agregar <span className="text-lg leading-none -mr-0.5">+</span>
                </button>
              ) : (
                <div className="inline-flex items-center rounded-full" style={{ backgroundColor: pal.accent, color: pal.on, boxShadow: `2px 2px 0 ${pal.shadow}` }}>
                  <button onClick={dom.onSubPlano} aria-label="Quitar uno" className="w-9 h-9 grid place-items-center font-bold text-xl leading-none active:scale-90 transition-transform">−</button>
                  <span className="min-w-6 text-center text-sm font-extrabold tabular-nums">{dom.plainQty}</span>
                  <button onClick={dom.onAddPlano} aria-label="Agregar uno" className="w-9 h-9 grid place-items-center font-bold text-xl leading-none active:scale-90 transition-transform">+</button>
                </div>
              )}
            </div>
          )}

          {dom && dom.customizable && (
            <div className="mt-2.5 flex justify-end">
              <button
                onClick={dom.onPersonalizar}
                className="inline-flex items-center gap-1.5 text-sm font-bold pl-3.5 pr-2.5 py-1.5 rounded-full active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                style={{ backgroundColor: pal.accent, color: pal.on, boxShadow: `2px 2px 0 ${pal.shadow}` }}
              >
                {dom.totalQty > 0 ? `${dom.totalQty} · Agregar` : "Personalizar"}
                <span className="text-lg leading-none">+</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Líneas personalizadas elegidas (cada combinación con sus extras) */}
      {dom && lineasCustom.length > 0 && (
        <div className="mt-3 pt-3 border-t border-black/5 space-y-1.5">
          {lineasCustom.map((l) => (
            <div key={l.key} className="flex items-center gap-2 text-[13px]">
              <span className="font-bold tabular-nums" style={{ color: pal.accentDark }}>{l.cantidad}×</span>
              <span className="flex-1 min-w-0 text-gray-600 truncate">{resumenLinea(l) || "Sin extras"}</span>
              <button onClick={() => dom.onQuitarLinea(l.key)} aria-label="Quitar" className="text-gray-400 text-base leading-none px-1 active:scale-90">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Modal ligero del menú: elegir variante (presentación) + modificadores +
// cantidad. Reusa la validación de @/lib/variantes. Sin fracción/mayoreo
// (eso vive en /cliente).
function MenuProductoModal({ producto, pal, onClose, onAgregar }: {
  producto: MenuProducto;
  pal: Paleta;
  onClose: () => void;
  onAgregar: (variante: MenuVariante | null, mods: SeleccionModificador[], cantidad: number) => void;
}) {
  const mods = producto.modificadores;
  const variantes = producto.variantes;
  const [varianteSel, setVarianteSel] = useState<MenuVariante | null>(variantes.length === 1 ? variantes[0] : null);
  const [elegidos, setElegidos] = useState<SeleccionModificador[]>([]);
  const [cantidad, setCantidad] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const extra = elegidos.reduce((s, m) => s + (Number(m.precio_extra) || 0), 0);
  // Mismo criterio que addLinea: el mayoreo es del producto, no de la
  // variante — si eligió una presentación con precio propio, ese manda.
  const aplicaMayoreo = !varianteSel
    && producto.precio_mayoreo != null && producto.mayoreo_desde != null
    && cantidad >= producto.mayoreo_desde;
  const unit = (aplicaMayoreo ? producto.precio_mayoreo! : (varianteSel?.precio ?? producto.precio)) + extra;
  // Cuánto le falta para alcanzar el mayoreo: sin este empujón, el cliente
  // tendría que adivinar que subiendo la cantidad baja el precio.
  const faltanParaMayoreo = !varianteSel && producto.precio_mayoreo != null && producto.mayoreo_desde != null && cantidad < producto.mayoreo_desde
    ? producto.mayoreo_desde - cantidad
    : 0;

  function toggle(o: { id: string; nombre: string; precio_extra: number }, grupo: MenuModificador) {
    setError(null);
    setElegidos((prev) => {
      if (prev.find((p) => p.opcion_id === o.id)) return prev.filter((p) => p.opcion_id !== o.id);
      let baseSel = prev;
      if (!grupo.multiple) baseSel = prev.filter((p) => p.modificador_id !== grupo.id);
      if (grupo.multiple && grupo.maximo != null) {
        const enGrupo = baseSel.filter((p) => p.modificador_id === grupo.id).length;
        if (enGrupo >= grupo.maximo) return prev; // tope alcanzado
      }
      return [...baseSel, {
        modificador_id: grupo.id, modificador_nombre: grupo.nombre,
        opcion_id: o.id, opcion_nombre: o.nombre, precio_extra: Number(o.precio_extra) || 0,
      }];
    });
  }

  function confirmar() {
    if (variantes.length > 0 && !varianteSel) {
      setError(`Elige ${producto.opcion_nombre ? producto.opcion_nombre.toLowerCase() : "una opción"}`);
      return;
    }
    const err = validarSeleccion(mods as unknown as ProductoModificador[], elegidos);
    if (err) { setError(err); return; }
    onAgregar(varianteSel, elegidos, cantidad);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-[26px] sm:rounded-[26px] w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-black/5 px-5 py-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-extrabold text-lg text-gray-900 truncate">{producto.nombre}</h3>
            {producto.descripcion && <p className="text-xs text-gray-400 line-clamp-1">{producto.descripcion}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none -mt-0.5">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Variantes primero: presentación con precio propio (obligatoria) */}
          {variantes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-800">{producto.opcion_nombre || "Elige una opción"}<span className="text-red-500 text-xs ml-1">*</span></p>
                <span className="text-[11px] font-medium text-gray-400">Elige una</span>
              </div>
              <div className="space-y-1.5">
                {variantes.map((v) => {
                  const elegido = varianteSel?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => { setError(null); setVarianteSel(v); }}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl border-2 transition-all active:scale-[0.99]"
                      style={elegido ? { borderColor: pal.accent, backgroundColor: pal.soft } : { borderColor: "rgba(0,0,0,0.08)", backgroundColor: "#fff" }}
                    >
                      <span className={`text-sm ${elegido ? "font-bold" : "text-gray-700"}`} style={elegido ? { color: pal.accentDark } : undefined}>{v.nombre}</span>
                      <span className="text-xs font-semibold text-gray-600 tabular-nums">{formatMXN(v.precio)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {mods.map((m) => {
            const enGrupo = elegidos.filter((x) => x.modificador_id === m.id).length;
            const reglaTxt = (() => {
              if (m.multiple && m.minimo != null && m.maximo != null && m.minimo === m.maximo) return `Elige ${m.minimo}`;
              if (m.multiple && m.maximo != null) return `Máx ${m.maximo}`;
              if (m.multiple && m.minimo != null) return `Elige al menos ${m.minimo}`;
              if (!m.multiple && m.obligatorio) return "Elige una";
              return null;
            })();
            return (
              <div key={m.id}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-gray-800">{m.nombre}{m.obligatorio && <span className="text-red-500 text-xs ml-1">*</span>}</p>
                  {reglaTxt && <span className="text-[11px] font-medium text-gray-400">{reglaTxt}</span>}
                </div>
                <div className="space-y-1.5">
                  {m.opciones.map((o) => {
                    const elegido = elegidos.some((x) => x.opcion_id === o.id);
                    const bloqueado = !elegido && m.multiple && m.maximo != null && enGrupo >= m.maximo;
                    return (
                      <button
                        key={o.id}
                        disabled={bloqueado}
                        onClick={() => toggle(o, m)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl border-2 transition-all ${bloqueado ? "opacity-40" : "active:scale-[0.99]"}`}
                        style={elegido ? { borderColor: pal.accent, backgroundColor: pal.soft } : { borderColor: "rgba(0,0,0,0.08)", backgroundColor: "#fff" }}
                      >
                        <span className={`text-sm ${elegido ? "font-bold" : "text-gray-700"}`} style={elegido ? { color: pal.accentDark } : undefined}>{o.nombre}</span>
                        <span className="text-xs text-gray-500">{Number(o.precio_extra) > 0 ? `+${formatMXN(Number(o.precio_extra))}` : "Incluido"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Cantidad */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800">Cantidad</span>
            <div className="flex items-center gap-4">
              <button onClick={() => setCantidad((c) => Math.max(1, c - 1))} aria-label="Quitar uno" className="w-10 h-10 rounded-full border border-black/10 text-gray-700 font-bold text-xl active:scale-95 transition-transform">−</button>
              <span className="text-xl font-extrabold w-6 text-center tabular-nums">{cantidad}</span>
              <button onClick={() => setCantidad((c) => c + 1)} aria-label="Agregar uno" className="w-10 h-10 rounded-full font-bold text-xl active:scale-95 transition-transform" style={{ backgroundColor: pal.accent, color: pal.on }}>+</button>
            </div>
          </div>

          {aplicaMayoreo && (
            <p className="text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
              🏷️ Precio de mayoreo aplicado: {formatMXN(producto.precio_mayoreo!)} c/u
            </p>
          )}
          {faltanParaMayoreo > 0 && (
            <p className="text-[13px] text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
              Lleva {faltanParaMayoreo} más y cada uno te sale en {formatMXN(producto.precio_mayoreo!)}
            </p>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-black/5 px-5 py-4">
          <button
            onClick={confirmar}
            className="w-full font-extrabold text-base py-3.5 rounded-full active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: pal.accent, color: pal.on, boxShadow: `3px 3px 0 ${pal.shadow}` }}
          >
            Agregar · {formatMXN(unit * cantidad)}
          </button>
        </div>
      </div>
    </div>
  );
}
