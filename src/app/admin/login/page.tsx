"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

export default function AdminLoginPage() {
  const { usuario, loading: sessionLoading, login } = useSession();
  const router = useRouter();
  const [telefono, setTelefono] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (usuario?.rol === "admin") {
      router.replace("/admin");
    }
  }, [usuario, sessionLoading, router]);

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-6 shadow-lg w-full max-w-sm">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Mercadito" className="h-16 w-16 mx-auto mb-2 rounded-xl" />
          <h1 className="text-2xl font-bold text-gray-800">Admin</h1>
          <p className="text-sm text-gray-400 mt-1">Panel de administración</p>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setLoginLoading(true);
            const result = await login("admin", { telefono, pin });
            if (!result.ok) setError(result.error || "Error al ingresar");
            else router.replace("/admin");
            setLoginLoading(false);
          }}
          className="space-y-4"
        >
          <input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Tu teléfono"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
            required
          />
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-2xl text-center tracking-widest focus:border-brand focus:ring-1 focus:ring-brand outline-none"
            required
          />
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 text-center">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loginLoading}
            className="w-full bg-brand text-white py-3 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform"
          >
            {loginLoading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
