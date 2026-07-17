"use client";

import Link from "next/link";
import Header from "@/components/Header";
import { MERCADITO_TEL } from "@/lib/contacto";
import ContactoFAB from "@/components/ContactoFAB";

// Número de WhatsApp de soporte/pedidos manuales. Si el cliente no entiende
// la app, le damos una salida humana inmediata.
const WA_SOPORTE = MERCADITO_TEL;

// App pública en Google Play (Android) y App Store (iPhone).
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=mx.mercadito.cx";
const APP_STORE_URL = "https://apps.apple.com/mx/app/marcadito/id6771926373";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="max-w-lg mx-auto px-4 pb-24">
        {/* ─── HERO — CTA gigante ──────────────────────────────────
            Un solo botón enorme. El logo y el mensaje refuerzan confianza
            pero NO son tappeables para no confundir. */}
        <section className="bg-gradient-to-br from-brand-dark to-brand text-white rounded-3xl p-6 mt-4 text-center shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Mercadito" className="h-20 w-20 mx-auto mb-3 rounded-2xl" />
          <h1 className="text-3xl font-black mb-1">Mercadito</h1>
          <p className="text-lg text-orange-50 mb-6 leading-snug">
            Pide al mercado sin moverte de casa
          </p>

          <Link
            href="/cliente"
            className="flex items-center justify-center gap-3 bg-white text-brand-dark font-black px-6 py-5 rounded-2xl text-2xl shadow-xl active:scale-95 transition-transform"
          >
            <span className="text-3xl">🛒</span>
            <span>Pedir ahora</span>
          </Link>

          {/* Reaseguros de confianza */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-5 text-sm text-orange-50">
            <span>✓ Entregamos hoy</span>
            <span>✓ Paga al recibir</span>
          </div>
          <p className="text-xs text-orange-100/90 mt-2">
            Sahuayo &bull; Jiquilpan &bull; Venustiano Carranza
          </p>
        </section>

        {/* ─── CÓMO FUNCIONA — 3 pasos grandes, vertical, NO son botones ───
            Numeración visible y estilo "lista" (no "tarjeta") para que no
            se confunda con algo tappeable. */}
        <section className="mt-7">
          <h2 className="text-center text-xl font-bold text-gray-800 mb-1">Así de fácil</h2>
          <p className="text-center text-sm text-gray-500 mb-5">3 pasos y tu mandado llega a casa</p>

          <ol className="space-y-4">
            {PASOS.map((p, i) => (
              <li key={i} className="flex items-start gap-4 bg-white/60 rounded-xl p-4">
                <div className="shrink-0 w-14 h-14 rounded-full bg-brand-light border-2 border-brand flex items-center justify-center">
                  <span className="text-2xl">{p.icon}</span>
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-[11px] font-bold text-brand-dark tracking-wide uppercase">Paso {i + 1}</p>
                  <p className="text-lg font-bold text-gray-800 leading-tight">{p.titulo}</p>
                  <p className="text-sm text-gray-500 leading-snug mt-0.5">{p.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ─── MENÚS — directorio de menús digitales (jul 2026) ──────────
            Descubrir tiendas sin QR: lista → /m/[tienda] → pedir a domicilio. */}
        <Link
          href="/menus"
          className="mt-6 flex items-center gap-3 bg-gradient-to-br from-rose-500 to-red-500 text-white rounded-2xl p-4 shadow-md active:scale-95 transition-transform"
        >
          <span className="text-4xl">🍽️</span>
          <div className="flex-1 text-left">
            <p className="font-black text-base leading-tight">Explora los menús</p>
            <p className="text-xs text-rose-50 leading-tight">Mira el menú de cada negocio y pide a domicilio</p>
          </div>
          <span className="text-xl">→</span>
        </Link>

        {/* ─── ENVÍOS — feature nueva (mayo 2026) ──────────────
            CTA secundario al lado de Cómo funciona. Te lleva a /cliente
            donde ya hay banner "Mandar paquete" con el flujo completo. */}
        <Link
          href="/cliente"
          className="mt-6 flex items-center gap-3 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-2xl p-4 shadow-md active:scale-95 transition-transform"
        >
          <span className="text-4xl">📦</span>
          <div className="flex-1 text-left">
            <p className="font-black text-base leading-tight">¿Necesitas mandar un paquete?</p>
            <p className="text-xs text-orange-50 leading-tight">Recogemos y entregamos entre Sahuayo, Jiquilpan y V. Carranza · máx 10 kg</p>
          </div>
          <span className="text-xl">→</span>
        </Link>

        {/* ─── WHATSAPP — salida humana ───────────────────────────
            Para gente mayor o con dudas. Botón verde familiar. */}
        <a
          href={`https://wa.me/${WA_SOPORTE}?text=${encodeURIComponent("Hola, necesito ayuda para hacer un pedido en Mercadito")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center justify-center gap-3 bg-green-500 text-white font-bold py-4 rounded-2xl text-lg shadow-md active:scale-95 transition-transform"
        >
          <span className="text-2xl">💬</span>
          <span>¿Dudas? Escríbenos por WhatsApp</span>
        </a>

        {/* ─── REGISTRO DE TIENDA — secundario, no compite con el CTA ─── */}
        <section className="mt-8 bg-white border-2 border-brand/30 rounded-2xl p-5 text-center">
          <span className="text-3xl block mb-2">🏪</span>
          <h3 className="text-lg font-bold text-gray-800 mb-1">¿Tienes un negocio?</h3>
          <p className="text-sm text-gray-500 mb-4 leading-snug">
            Registra tu tienda gratis y llega a más clientes.
          </p>
          <Link
            href="/tienda/registro"
            className="inline-block bg-brand text-white font-bold px-6 py-3 rounded-full active:scale-95 transition-transform"
          >
            Registra tu tienda
          </Link>
          <p className="text-xs text-gray-400 mt-3">
            ¿Ya te registraste? <Link href="/tienda/login" className="text-brand-dark font-medium underline">Entra aquí</Link>
          </p>
        </section>

        {/* ─── DESCARGA LA APP — Google Play + App Store ─────────────
            App pública en Play Store (Android) y App Store (iPhone).
            Botones con los logos oficiales (SVG inline, sin dependencias). */}
        <section className="mt-7 bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-3xl p-6 text-center shadow-lg">
          <span className="text-5xl block mb-2">📱</span>
          <h2 className="text-2xl font-black mb-1">Descarga la app</h2>
          <p className="text-gray-300 mb-5 leading-snug text-sm">
            Más rápida y con notificaciones en cada paso de tu pedido.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-white text-gray-900 font-bold pl-5 pr-7 py-3.5 rounded-2xl shadow-xl active:scale-95 transition-transform"
            >
              <svg viewBox="0 0 512 512" className="w-8 h-8 shrink-0" aria-hidden="true">
                <path fill="#00d2ff" d="M48 59.49c-2.83 5.5-4.49 11.97-4.49 19.06v355.9c0 7.09 1.66 13.56 4.49 19.06l205.97-216.01z" />
                <path fill="#00f076" d="M48 59.49 254 275.5l72.13-75.65L75.7 60.4C66.3 55.05 56.27 53.85 48 59.49z" />
                <path fill="#ffce00" d="m326.13 199.85 75.42 41.65c20.6 11.4 20.6 41.6 0 53l-75.6 41.75L254 275.5z" />
                <path fill="#ff3a44" d="M48 453.51c8.27 5.64 18.3 4.45 27.7-.9l250.43-138.6L254 275.5z" />
              </svg>
              <span className="text-left leading-none">
                <span className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide">Disponible en</span>
                <span className="block text-xl font-black">Google Play</span>
              </span>
            </a>

            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-white text-gray-900 font-bold pl-5 pr-7 py-3.5 rounded-2xl shadow-xl active:scale-95 transition-transform"
            >
              <svg viewBox="0 0 384 512" className="w-7 h-7 shrink-0" aria-hidden="true">
                <path fill="#000" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
              </svg>
              <span className="text-left leading-none">
                <span className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide">Descarga en el</span>
                <span className="block text-xl font-black">App Store</span>
              </span>
            </a>
          </div>

          <p className="text-[11px] text-gray-400 mt-4 leading-snug">
            Gratis · Android e iPhone
          </p>
        </section>


        {/* ─── FALLBACK — acceso directo sin instalar (PWA) ── */}
        <section className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-bold text-gray-700 mb-2">📲 ¿Prefieres no instalar?</p>
          <div className="text-xs text-gray-500 space-y-1 leading-snug">
            <p><strong>iPhone:</strong> Toca compartir (cuadrito con flecha ↑) → &quot;Agregar a inicio&quot;</p>
            <p><strong>Android:</strong> Toca los 3 puntos (⋮) → &quot;Agregar a pantalla de inicio&quot;</p>
          </div>
        </section>

        {/* ─── ACCESOS — repartidor/tienda/admin (muy discretos) ── */}
        <div className="mt-8 flex justify-center gap-4">
          <Link href="/repartidor/login" className="text-xs text-gray-400 underline">Repartidor</Link>
          <span className="text-gray-300">|</span>
          <Link href="/tienda/login" className="text-xs text-gray-400 underline">Mi tienda</Link>
          <span className="text-gray-300">|</span>
          <Link href="/admin/login" className="text-xs text-gray-400 underline">Admin</Link>
        </div>

        {/* ─── LEGAL ──────────────────────────────────────────── */}
        <div className="mt-4 flex justify-center gap-3 mb-4">
          <Link href="/privacidad" className="text-[10px] text-gray-300 underline">Privacidad</Link>
          <Link href="/terminos" className="text-[10px] text-gray-300 underline">Términos</Link>
          <Link href="/eliminar-datos" className="text-[10px] text-gray-300 underline">Eliminar datos</Link>
        </div>
      </main>
      <ContactoFAB />
    </div>
  );
}

const PASOS = [
  {
    icon: "🛍️",
    titulo: "Elige lo que quieres",
    desc: "Frutas, tortillas, medicinas, pizzas... lo que sea del mercado o tiendas.",
  },
  {
    icon: "📍",
    titulo: "Marca tu casa en el mapa",
    desc: "Toca el mapa donde vives para que te lo llevemos correcto.",
  },
  {
    icon: "🛵",
    titulo: "Te lo llevamos",
    desc: "En 30-45 min tu pedido llega a tu puerta. Pagas al recibir.",
  },
];
