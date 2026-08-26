"use client";

import Link from "next/link";
import Header from "@/components/Header";
import { TRIAL_TXT, PRECIO_MENSUAL_TXT } from "@/lib/plan";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=mx.mercadito.cx";
const APP_STORE_URL = "https://apps.apple.com/mx/app/marcadito/id6771926373";

// Landing con delivery apagado: Mercadito es la plataforma de menús digitales
// y gestión del negocio. Dos públicos, en este orden:
//   1) el comensal que llegó por un QR o un link compartido → ver menús
//   2) el negocio que quiere el suyo → registro
// La landing de la época de delivery sigue en app/page.tsx y vuelve sola
// cuando DELIVERY_ACTIVO regrese a true.
const BENEFICIOS = [
  { icon: "📱", titulo: "Tu menú, siempre al día", desc: "Cambias un precio y tus clientes lo ven al instante. Sin reimprimir nada." },
  { icon: "🔗", titulo: "Un link y un QR", desc: "Compártelo en WhatsApp o pégalo en la mesa. Se abre sin instalar nada." },
  { icon: "💬", titulo: "Los pedidos llegan a tu WhatsApp", desc: "El cliente arma su pedido en el menú y te llega listo al celular." },
  { icon: "🍽️", titulo: "Mesas y reservas", desc: "Comandas a cocina, cuenta por mesa y agenda de citas, desde tu teléfono." },
];

export default function LandingMenus() {
  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="max-w-lg mx-auto px-4 pb-24">
        <section className="bg-gradient-to-br from-brand-dark to-brand text-white rounded-3xl p-6 mt-4 text-center shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Mercadito" className="h-20 w-20 mx-auto mb-3 rounded-2xl" />
          <h1 className="text-3xl font-black mb-1">Mercadito</h1>
          <p className="text-lg text-orange-50 mb-6 leading-snug">
            El menú digital de los negocios de tu ciudad
          </p>

          <Link
            href="/menus"
            className="flex items-center justify-center gap-3 bg-white text-brand-dark font-black px-6 py-5 rounded-2xl text-2xl shadow-xl active:scale-95 transition-transform"
          >
            <span className="text-3xl">🍽️</span>
            <span>Ver los menús</span>
          </Link>

          {/* Reservas: el otro flujo del producto. Sin esta entrada, agendar
              una cita solo era alcanzable escribiendo la URL. */}
          <Link
            href="/cliente/servicios"
            className="mt-3 flex items-center justify-center gap-2.5 bg-white/15 border border-white/30 text-white font-bold px-5 py-3.5 rounded-2xl text-base active:scale-95 transition-transform"
          >
            <span className="text-xl">📅</span>
            <span>Agendar una cita</span>
          </Link>

          {/* Sin la lista de tres ciudades: el directorio filtra por cercanía,
              así que el alcance ya no es una lista fija que haya que anunciar
              (y sería falsa para quien abra desde otra ciudad). */}
          <p className="text-xs text-orange-100/90 mt-4">
            Mira precios, arma tu pedido y mándalo por WhatsApp
          </p>
        </section>

        <section className="mt-8 bg-white border-2 border-brand/30 rounded-2xl p-5">
          <span className="text-3xl block text-center mb-2">🏪</span>
          <h2 className="text-lg font-bold text-gray-800 text-center mb-1">¿Tienes un negocio?</h2>
          <p className="text-sm text-gray-500 text-center mb-5 leading-snug">
            Arma tu menú digital y compártelo con tus clientes. Los pedidos te llegan a tu WhatsApp.
          </p>

          <ul className="space-y-3">
            {BENEFICIOS.map((b) => (
              <li key={b.titulo} className="flex items-start gap-3">
                <span className="shrink-0 w-10 h-10 rounded-full bg-brand-light border-2 border-brand grid place-items-center text-xl">
                  {b.icon}
                </span>
                <div className="flex-1 pt-0.5">
                  <p className="font-bold text-gray-800 leading-tight text-[15px]">{b.titulo}</p>
                  <p className="text-[13px] text-gray-500 leading-snug mt-0.5">{b.desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <Link
            href="/tienda/registro"
            className="mt-5 block text-center bg-brand text-white font-bold px-6 py-3.5 rounded-full active:scale-95 transition-transform"
          >
            Registra tu negocio
          </Link>
          <p className="text-xs text-gray-400 mt-3 text-center leading-snug">
            {TRIAL_TXT} gratis, luego {PRECIO_MENSUAL_TXT}/mes. Sin comisiones por venta.
          </p>
          <p className="text-xs text-gray-400 mt-2 text-center">
            ¿Ya te registraste? <Link href="/tienda/login" className="text-brand-dark font-medium underline">Entra aquí</Link>
          </p>
        </section>

        <section className="mt-7 bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-3xl p-6 text-center shadow-lg">
          <span className="text-4xl block mb-2">📱</span>
          <h2 className="text-xl font-black mb-1">La app del negocio</h2>
          <p className="text-gray-300 mb-5 leading-snug text-sm">
            Mesas, comandas y reservas desde tu celular.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-gray-900 font-bold px-5 py-3 rounded-2xl shadow-xl active:scale-95 transition-transform"
            >
              <span className="text-sm font-black">Google Play</span>
            </a>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-gray-900 font-bold px-5 py-3 rounded-2xl shadow-xl active:scale-95 transition-transform"
            >
              <span className="text-sm font-black">App Store</span>
            </a>
          </div>
        </section>

        <div className="mt-8 flex justify-center gap-4">
          <Link href="/tienda/login" className="text-xs text-gray-400 underline">Mi negocio</Link>
          <span className="text-gray-300">|</span>
          <Link href="/admin/login" className="text-xs text-gray-400 underline">Admin</Link>
        </div>
      </main>
    </div>
  );
}
