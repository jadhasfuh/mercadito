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
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-lg mx-auto px-4 pb-24">
        {/* Hero */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-2xl p-6 mt-4 text-center">
          <span className="text-5xl block mb-3">🛒</span>
          <h2 className="text-2xl font-bold mb-2">Tu mercado local a domicilio</h2>
          <p className="text-emerald-100 mb-4">
            Sahuayo &bull; Jiquilpan &bull; Venustiano Carranza
          </p>
          <Link
            href="/cliente"
            className="inline-block bg-white text-emerald-700 font-bold px-8 py-3 rounded-full text-lg shadow-lg active:scale-95 transition-transform"
          >
            Hacer mi lista de compras
          </Link>
        </div>

        {/* Features */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          {features.map((f) => (
            <div key={f.title} className="bg-white rounded-xl p-4 shadow-sm text-center">
              <span className="text-3xl block mb-2">{f.icon}</span>
              <h3 className="font-bold text-gray-800 text-sm">{f.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-sm text-amber-800">
            <strong>Minimo de compra:</strong> $150 MXN<br />
            Envio desde $25 MXN segun tu zona
          </p>
        </div>

        {/* Tienda registration */}
        <div className="mt-4 bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-sm text-gray-600 mb-2">
            <strong>¿Tienes un puesto en el mercado?</strong>
          </p>
          <Link
            href="/tienda/registro"
            className="inline-block bg-amber-500 text-white font-bold px-6 py-2 rounded-full text-sm active:scale-95 transition-transform"
          >
            Registra tu tienda
          </Link>
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
      </main>
    </div>
  );
}
