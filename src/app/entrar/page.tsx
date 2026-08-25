"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Header from "@/components/Header";
import ClienteLogin from "@/components/ClienteLogin";

// Acceso del cliente. Antes ClienteLogin solo vivía dentro de /cliente, y al
// apagarse el delivery esa ruta empezó a redirigir: agendar mandaba a
// /cliente, /cliente rebotaba a /menus y el cliente nunca podía entrar — o
// sea, no se podía reservar en web. Esta página lo saca a una ruta propia.
//
// `redirect` permite volver a donde estaba (la pantalla de agendar, sus
// citas, el chat) en vez de dejarlo tirado en el home.
function EntrarInner() {
  const router = useRouter();
  const params = useSearchParams();
  const volverA = params.get("redirect") || "/mis-citas";

  return (
    <div className="min-h-screen bg-cream">
      <Header title="Entrar" />
      <main className="max-w-lg mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h1 className="text-lg font-bold text-gray-800">Entra a tu cuenta</h1>
          <p className="text-sm text-gray-500 mt-1 mb-4 leading-snug">
            Solo la necesitas para agendar citas y ver tus reservas. Para pedir
            de un menú no hace falta cuenta.
          </p>
          <ClienteLogin onLoggedIn={() => router.replace(volverA)} />
        </div>
      </main>
    </div>
  );
}

export default function EntrarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <EntrarInner />
    </Suspense>
  );
}
