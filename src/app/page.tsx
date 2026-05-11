"use client";

import Link from "next/link";
import Header from "@/components/Header";
import { MERCADITO_TEL } from "@/lib/contacto";
import ContactoFAB from "@/components/ContactoFAB";

// Número de WhatsApp de soporte/pedidos manuales. Si el cliente no entiende
// la app, le damos una salida humana inmediata.
const WA_SOPORTE = MERCADITO_TEL;

// Beta cerrada en Play Store: el cliente solicita acceso por WhatsApp
// mandando su Gmail; el admin lo agrega como tester en Play Console y
// recién entonces el link de Play Store abre la instalación.
const PLAY_STORE_TESTING_URL = "https://play.google.com/apps/testing/mx.mercadito.cx";

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

        {/* ─── BETA APP — solicitud de acceso por WhatsApp ──────────
            Flujo de dos pasos para Internal Testing de Play Store: el cliente
            primero manda su Gmail por WhatsApp, el admin lo agrega como
            tester en Play Console y después el link de Play Store ya
            funciona para instalar. Mantenemos el patrón visual del CTA
            principal (gradiente + botón blanco) pero en verde para que
            compita en atención sin pelearse con "Pedir ahora". */}
        <section className="mt-7 bg-gradient-to-br from-green-600 to-green-500 text-white rounded-3xl p-6 text-center shadow-lg">
          <span className="text-5xl block mb-2">📱</span>
          <h2 className="text-2xl font-black mb-1">Instala la app (beta)</h2>
          <p className="text-green-50 mb-5 leading-snug text-sm">
            Más rápida y con notificaciones en cada paso de tu pedido.
            Pídenos acceso mandando tu Gmail por WhatsApp y te activamos en minutos.
          </p>

          <a
            href={`https://wa.me/${WA_SOPORTE}?text=${encodeURIComponent("Hola, quiero acceso a la beta de Mercadito. Mi Gmail es: ")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 bg-white text-green-700 font-black px-6 py-5 rounded-2xl text-xl shadow-xl active:scale-95 transition-transform"
          >
            <span className="text-2xl">💬</span>
            <span>Solicitar acceso a la beta</span>
          </a>

          <a
            href={PLAY_STORE_TESTING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center justify-center gap-2 text-sm text-green-50 underline underline-offset-2"
          >
            ¿Ya te dimos acceso? Abrir Play Store →
          </a>
          <p className="text-[11px] text-green-100/90 mt-3 leading-snug">
            Versión beta · sin costo · solo Android por ahora.
          </p>
        </section>


        {/* ─── FALLBACK — acceso directo (iPhone o quien no quiera instalar) ── */}
        <section className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-bold text-gray-700 mb-2">📲 ¿iPhone o prefieres no instalar?</p>
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
