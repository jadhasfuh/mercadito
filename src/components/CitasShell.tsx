"use client";

import Link from "next/link";
import type { ReactNode } from "react";

// Estructura compartida de la sección "Citas" en web, espejo de la distribución
// de Mercadito (Header sticky + barra de pestañas sticky debajo). Así, al cambiar
// el switch, se siente como un cambio de color y no de pantalla.
//
// Pestañas: Inicio (negocios) · Citas (mis citas) · Mensajes (chats), en índigo.
const TABS = [
  { id: "inicio", label: "Inicio", icon: "🏠", href: "/cliente/servicios" },
  { id: "citas", label: "Citas", icon: "📅", href: "/mis-citas" },
  { id: "mensajes", label: "Mensajes", icon: "💬", href: "/chats" },
] as const;

export default function CitasShell({
  active,
  children,
}: {
  active: "inicio" | "citas" | "mensajes";
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header (mismo alto h-14 que Mercadito para que la barra sticky calce) */}
      <header className="bg-serv text-white sticky top-0 z-40 h-14 flex items-center shadow-[var(--shadow-card)]">
        <div className="max-w-lg mx-auto px-4 w-full">
          <span className="font-bold text-lg">Mercadito</span>
        </div>
      </header>

      {/* Barra de pestañas (mismo estilo y posición que las de Mercadito) */}
      <div className="bg-white border-b sticky top-14 z-30">
        <div className="max-w-lg mx-auto flex">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className={`flex-1 py-3 text-center font-bold text-sm border-b-[3px] transition-colors ${
                active === t.id ? "border-serv text-serv-dark" : "border-transparent text-gray-400"
              }`}
            >
              <span className="text-lg">{t.icon}</span>
              <span className="block text-xs mt-0.5">{t.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {children}
    </div>
  );
}
