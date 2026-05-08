"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import PinInput from "@/components/PinInput";
import { esTelefonoValido, esPinValido, TELEFONO_MENSAJE, PIN_MENSAJE } from "@/lib/validators";

interface Props {
  onLoggedIn: () => void;
  /** Encabezado grande arriba del form. */
  titulo?: string;
  /** Frase corta debajo del título cuando aún no hay lookup. */
  subtitulo?: string;
  /** Texto del botón de submit cuando no está cargando. */
  textoBoton?: string;
}

/**
 * Form de teléfono + PIN para cliente. Si el teléfono no existe, lo crea
 * con el nombre que ingrese. Reusable: lo monta /cliente para entrar al
 * tab "pedidos" y /cliente/mandado como gate antes de pedir un mandado.
 */
export default function ClienteLogin({
  onLoggedIn,
  titulo = "Ver mis pedidos",
  subtitulo = "Ingresa tu teléfono para entrar o crear cuenta",
  textoBoton = "Ver mis pedidos",
}: Props) {
  const { login } = useSession();
  const [loginNombre, setLoginNombre] = useState("");
  const [loginCodigoReferido, setLoginCodigoReferido] = useState("");
  const [loginTelefono, setLoginTelefono] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginPin2, setLoginPin2] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [lookup, setLookup] = useState<{ existe: boolean; tiene_pin: boolean; nombre?: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    const tel = loginTelefono.replace(/\D/g, "");
    if (tel.length < 10) {
      setLookup(null);
      return;
    }
    let cancel = false;
    setLookupLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/cliente-existe?telefono=${tel}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancel) setLookup(data);
      } catch {
        // Silencioso: si falla, el form sigue funcionando con el flujo viejo.
      } finally {
        if (!cancel) setLookupLoading(false);
      }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [loginTelefono]);

  const esClienteNuevo = lookup?.existe === false;
  const esClienteConPin = lookup?.existe === true && lookup.tiene_pin === true;
  const esClienteSinPin = lookup?.existe === true && lookup.tiene_pin === false;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const tel = loginTelefono.replace(/\D/g, "");
    if (!esTelefonoValido(tel)) {
      setLoginError(TELEFONO_MENSAJE);
      return;
    }
    if (esClienteNuevo && !loginNombre.trim()) {
      setLoginError("Necesitamos tu nombre para crear tu cuenta");
      return;
    }
    if (!esPinValido(loginPin)) {
      setLoginError(PIN_MENSAJE);
      return;
    }
    if (!esClienteConPin && loginPin !== loginPin2) {
      setLoginError("Los PINs no coinciden");
      return;
    }
    setLoginError("");
    setLoginLoading(true);
    const result = await login("cliente", {
      nombre: esClienteNuevo ? loginNombre : (lookup?.nombre ?? loginNombre),
      telefono: loginTelefono,
      pin: loginPin,
      codigo_referido_amigo: esClienteNuevo ? loginCodigoReferido.trim().toUpperCase() : "",
    });
    if (result.ok) {
      onLoggedIn();
    } else {
      setLoginError(result.error || "Error al entrar");
    }
    setLoginLoading(false);
  }

  return (
    <div className="py-6">
      <div className="text-center mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Mercadito" className="h-16 w-16 mx-auto mb-2 rounded-xl" />
        <h2 className="text-xl font-bold text-gray-800">{titulo}</h2>
        <p className="text-sm text-gray-400 mt-1">
          {esClienteConPin && lookup?.nombre
            ? `Hola ${lookup.nombre.split(" ")[0]}, escribe tu PIN`
            : esClienteSinPin && lookup?.nombre
              ? `Bienvenido de vuelta, ${lookup.nombre.split(" ")[0]}`
              : esClienteNuevo
                ? "Es tu primera vez. Cuéntanos tu nombre"
                : subtitulo}
        </p>
      </div>
      <form onSubmit={handleLogin} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Tu teléfono</label>
          <div className="relative">
            <input
              type="tel"
              inputMode="numeric"
              value={loginTelefono}
              onChange={(e) => setLoginTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Tu número a 10 dígitos"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              required
              autoFocus
            />
            {lookupLoading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
            )}
          </div>
        </div>

        {esClienteNuevo && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Tu nombre</label>
              <input
                type="text"
                value={loginNombre}
                onChange={(e) => setLoginNombre(e.target.value)}
                placeholder="Cómo te llamas"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">🎁 Código de invitación (opcional)</label>
              <input
                type="text"
                value={loginCodigoReferido}
                onChange={(e) => setLoginCodigoReferido(e.target.value.toUpperCase())}
                placeholder="MERCA-XXXXX"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none uppercase tracking-wider"
              />
              {loginCodigoReferido.trim().length > 0 && (
                <p className="text-xs text-green-700 mt-1">Si tu amigo te invitó, ambos ganan $30 al hacer tu primer pedido.</p>
              )}
            </div>
          </>
        )}

        {(esClienteConPin || esClienteSinPin || esClienteNuevo) && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1 text-center">
                🔒 {esClienteConPin ? "Tu PIN de 6 dígitos" : "Crea tu PIN de 6 dígitos"}
              </label>
              <PinInput value={loginPin} onChange={setLoginPin} length={6} />
            </div>
            {!esClienteConPin && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1 text-center">Confirma tu PIN</label>
                  <PinInput
                    value={loginPin2}
                    onChange={setLoginPin2}
                    length={6}
                    error={loginPin2.length === loginPin.length && loginPin2 !== loginPin}
                  />
                </div>
                <p className="text-[11px] text-gray-400 text-center">
                  El PIN protege tus pedidos. Guárdalo bien — si lo olvidas, contacta soporte por WhatsApp.
                </p>
              </>
            )}
          </div>
        )}

        {loginError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 text-center">
            {loginError}
          </div>
        )}
        <button
          type="submit"
          disabled={loginLoading || !lookup}
          className="w-full bg-brand text-white py-3 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform"
        >
          {loginLoading ? "Entrando..." : textoBoton}
        </button>
        {esClienteConPin && (
          <a
            href={`https://wa.me/5215659163241?text=${encodeURIComponent(`Hola, olvidé mi PIN de Mercadito. Mi teléfono es ${loginTelefono || "[escribe tu teléfono]"}. ¿Pueden resetearlo?`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm text-brand-dark font-medium underline mt-1"
          >
            ¿Olvidaste tu PIN? Escríbenos por WhatsApp
          </a>
        )}
        <p className="text-xs text-gray-400 text-center">
          Usa el mismo teléfono con el que hiciste tu pedido
        </p>
      </form>
    </div>
  );
}
