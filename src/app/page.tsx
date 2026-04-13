"use client";

import Link from "next/link";
import Header from "@/components/Header";

const features = [
  { icon: "📋", title: "Arma tu lista", desc: "Elige frutas, verduras, lácteos y más" },
  { icon: "💰", title: "Compara precios", desc: "Ve precios de diferentes puestos" },
  { icon: "🛵", title: "Te lo llevamos", desc: "Entrega a domicilio en tu zona" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-lg mx-auto px-4 pb-24">
        {/* Hero */}
        <div className="bg-green-600 text-white rounded-2xl p-6 mt-4 text-center">
          <span className="text-5xl block mb-3">🏪</span>
          <h2 className="text-2xl font-bold mb-2">Tu mercado local a domicilio</h2>
          <p className="text-green-100 mb-4">
            Sahuayo &bull; Jiquilpan &bull; Venustiano Carranza
          </p>
          <Link
            href="/cliente"
            className="inline-block bg-white text-green-700 font-bold px-8 py-3 rounded-full text-lg shadow-lg active:scale-95 transition-transform"
          >
            Hacer mi lista de compras
          </Link>
        </div>

        {/* Features */}
        <div className="mt-6 space-y-3">
          {features.map((f) => (
            <div key={f.title} className="bg-white rounded-xl p-4 flex items-center gap-4 shadow-sm">
              <span className="text-3xl">{f.icon}</span>
              <div>
                <h3 className="font-bold text-gray-800">{f.title}</h3>
                <p className="text-sm text-gray-500">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <p className="text-sm text-yellow-800">
            <strong>Mínimo de compra:</strong> $150 MXN<br />
            Envío desde $25 MXN según tu zona
          </p>
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
        </div>
      </main>
    </div>
  );
}
