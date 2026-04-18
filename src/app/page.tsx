"use client";

import Link from "next/link";
import Header from "@/components/Header";

const features = [
  { icon: "📋", title: "Arma tu lista", desc: "Elige frutas, verduras, lacteos y mas" },
  { icon: "💰", title: "Precios del mercado", desc: "Actualizados diario por los puestos" },
  { icon: "🛵", title: "Te lo llevamos", desc: "Entrega a domicilio en tu zona" },
  { icon: "📱", title: "Sigue tu pedido", desc: "Ve el estado en tiempo real" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="max-w-lg mx-auto px-4 pb-24">
        {/* Tienda registration — FIRST, prominent */}
        <div className="mt-4 bg-brand-light border-2 border-brand rounded-2xl p-6 text-center">
          <span className="text-4xl block mb-3">🏪</span>
          <h3 className="text-xl font-bold text-navy mb-2">¿Tienes un negocio?</h3>
          <p className="text-sm text-gray-500 mb-4">
            Registra tu tienda gratis y llega a mas clientes.<br/>
            Mercado, tiendita, farmacia, restaurante... todos son bienvenidos.
          </p>
          <Link
            href="/tienda/registro"
            className="inline-block bg-brand text-white font-bold px-8 py-3 rounded-full text-lg shadow-lg active:scale-95 transition-transform"
          >
            Registra tu tienda
          </Link>
          <p className="text-xs text-gray-400 mt-3">
            ¿Ya te registraste? <Link href="/tienda" className="text-brand-dark font-medium underline">Entra aqui</Link>
          </p>
        </div>

        {/* Hero */}
        <div className="bg-gradient-to-br from-navy to-navy-light text-white rounded-2xl p-6 mt-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Mercadito" className="h-16 w-16 mx-auto mb-3 rounded-xl" />
          <h2 className="text-2xl font-bold mb-2">Tu mercado local a domicilio</h2>
          <p className="text-blue-200 mb-4">
            Sahuayo &bull; Jiquilpan &bull; Venustiano Carranza
          </p>
          <div className="bg-white/15 rounded-xl p-4">
            <p className="text-blue-100 text-sm font-medium">
              Estamos en fase de pruebas. Pronto podras hacer tus pedidos aqui.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          {features.map((f) => (
            <div key={f.title} className="bg-white rounded-xl p-4 shadow-sm text-center">
              <span className="text-3xl block mb-2">{f.icon}</span>
              <h3 className="font-bold text-navy text-sm">{f.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Install as app */}
        <div className="mt-4 bg-navy-50 border border-navy/20 rounded-xl p-4">
          <p className="text-sm font-bold text-navy mb-1">Guardala como app en tu telefono:</p>
          <div className="text-xs text-navy-light space-y-1">
            <p><strong>iPhone:</strong> Toca el boton de compartir (cuadrito con flecha) → &quot;Agregar a inicio&quot;</p>
            <p><strong>Android:</strong> Toca los 3 puntos (⋮) → &quot;Agregar a pantalla de inicio&quot;</p>
          </div>
        </div>

        {/* Access links */}
        <div className="mt-6 flex justify-center gap-4">
          <Link href="/repartidor" className="text-xs text-gray-400 underline">
            Repartidor
          </Link>
          <span className="text-gray-300">|</span>
          <Link href="/tienda" className="text-xs text-gray-400 underline">
            Mi Puesto
          </Link>
          <span className="text-gray-300">|</span>
          <Link href="/admin" className="text-xs text-gray-400 underline">
            Admin
          </Link>
        </div>

        {/* Legal */}
        <div className="mt-4 flex justify-center gap-3 mb-4">
          <Link href="/privacidad" className="text-[10px] text-gray-300 underline">
            Privacidad
          </Link>
          <Link href="/terminos" className="text-[10px] text-gray-300 underline">
            Terminos
          </Link>
          <Link href="/eliminar-datos" className="text-[10px] text-gray-300 underline">
            Eliminar datos
          </Link>
        </div>
      </main>
    </div>
  );
}
