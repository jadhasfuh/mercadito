"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import PinInput from "@/components/PinInput";

interface UsuarioExisteResp {
  existe: boolean;
  tiene_pin?: boolean;
  nombre?: string;
}

export default function AdminLoginPage() {
  const { usuario, loading: sessionLoading, login } = useSession();
  const router = useRouter();
  const [telefono, setTelefono] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [lookup, setLookup] = useState<UsuarioExisteResp | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (usuario?.rol === "admin") {
      router.replace("/admin");
    }
  }, [usuario, sessionLoading, router]);

  // Lookup pre-login. Aunque admin es típicamente uno solo, mantener la
  // misma UX que tienda/repartidor para consistencia y para que un admin
  // legacy sin PIN pueda crearlo al primer intento.
  useEffect(() => {
    const tel = telefono.replace(/\D/g, "");
    if (tel.length < 10) { setLookup(null); return; }
    let cancel = false;
    setLookupLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/usuario-existe?telefono=${tel}&rol=admin`);
        const data = await res.json();
        if (!cancel) setLookup(data);
      } catch {
        if (!cancel) setLookup({ existe: false });
      } finally {
        if (!cancel) setLookupLoading(false);
      }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [telefono]);

  const sinPin = lookup?.existe === true && lookup.tiene_pin === false;
  const conPin = lookup?.existe === true && lookup.tiene_pin === true;

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-6 shadow-lg w-full max-w-sm">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Mercadito" className="h-16 w-16 mx-auto mb-2 rounded-xl" />
          <h1 className="text-2xl font-bold text-gray-800">Admin</h1>
          <p className="text-sm text-gray-400 mt-1">
            {conPin && lookup?.nombre
              ? `Hola ${lookup.nombre.split(" ")[0]}, escribe tu PIN`
              : sinPin && lookup?.nombre
                ? `Hola ${lookup.nombre.split(" ")[0]} — crea tu PIN`
                : "Panel de administración"}
          </p>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (sinPin && pin !== pinConfirm) {
              setError("Los PINs no coinciden");
              return;
            }
            setLoginLoading(true);
            const result = await login("admin", { telefono, pin });
            if (!result.ok) setError(result.error || "Error al ingresar");
            else router.replace("/admin");
            setLoginLoading(false);
          }}
          className="space-y-4"
        >
          <div className="relative">
            <input
              type="tel"
              inputMode="numeric"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Tu teléfono a 10 dígitos"
              maxLength={10}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              required
            />
            {lookupLoading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
            )}
          </div>

          {sinPin && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 leading-snug">
              Por seguridad reseteamos tu PIN. Crea uno nuevo de 6 dígitos
              ahora — quedará guardado para tus próximos accesos.
            </div>
          )}

          {(conPin || sinPin) && (
            <>
              <div>
                <p className="text-xs text-gray-500 text-center mb-1">
                  {conPin ? "PIN de 6 dígitos" : "Crea tu PIN de 6 dígitos"}
                </p>
                <PinInput value={pin} onChange={setPin} length={6} />
              </div>
              {sinPin && (
                <div>
                  <p className="text-xs text-gray-500 text-center mb-1">Confírmalo</p>
                  <PinInput
                    value={pinConfirm}
                    onChange={setPinConfirm}
                    length={6}
                    error={pinConfirm.length === pin.length && pinConfirm !== pin}
                  />
                </div>
              )}
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 text-center">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loginLoading || !lookup || lookup.existe === false}
            className="w-full bg-brand text-white py-3 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform"
          >
            {loginLoading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
