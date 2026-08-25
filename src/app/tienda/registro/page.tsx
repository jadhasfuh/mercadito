"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import PinInput from "@/components/PinInput";
import { esTelefonoValido, esPinValido, TELEFONO_MENSAJE, PIN_MENSAJE } from "@/lib/validators";
import { DELIVERY_ACTIVO } from "@/lib/flags";

const MapaUbicacionTienda = dynamic(() => import("@/components/MapaUbicacionTienda"), { ssr: false });

export default function RegistroTiendaPage() {
  const [nombreTienda, setNombreTienda] = useState("");
  const [nombreDueno, setNombreDueno] = useState("");
  const [telefono, setTelefono] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [direccionTienda, setDireccionTienda] = useState("");
  const [numeroLocal, setNumeroLocal] = useState("");
  const [ciudad, setCiudad] = useState("sahuayo");
  const [referencias, setReferencias] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrado, setRegistrado] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tel = telefono.replace(/\D/g, "");
    if (!esTelefonoValido(tel)) {
      setError(TELEFONO_MENSAJE);
      return;
    }
    if (!esPinValido(pin)) {
      setError(PIN_MENSAJE);
      return;
    }
    if (pin !== pinConfirm) {
      setError("Los PINs no coinciden");
      return;
    }
    if (!direccionTienda) {
      setError("Toca el mapa o usa tu ubicacion para marcar donde esta tu tienda");
      return;
    }
    if (!numeroLocal) {
      setError("Escribe el numero de local o puesto");
      return;
    }
    setError("");
    setLoading(true);

    const direccionCompleta = `${direccionTienda} #${numeroLocal}`;
    const res = await fetch("/api/tiendas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre_tienda: nombreTienda,
        nombre_dueno: nombreDueno,
        telefono: tel,
        pin,
        descripcion: referencias || null,
        direccion: direccionCompleta,
        lat: ubicacion?.lat,
        lng: ubicacion?.lng,
        ciudad,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      setRegistrado(true);
    } else {
      setError(data.error || "Error al registrar");
    }
    setLoading(false);
  }

  if (registrado) {
    return (
      <div className="min-h-screen bg-cream">
        <Header title="Mercadito" />
        <main className="max-w-lg mx-auto px-4 py-8 text-center">
          <span className="text-7xl block mb-4">🎉</span>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Registro enviado</h2>
          {DELIVERY_ACTIVO ? (
            <>
              <p className="text-gray-500 mb-4">
                Tu tienda <strong>{nombreTienda}</strong> está pendiente de aprobación.
              </p>
              <p className="text-gray-400 text-sm mb-6">
                Te contactaremos por WhatsApp al <strong>{telefono}</strong> cuando esté lista.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-500 mb-4">
                <strong>{nombreTienda}</strong> ya quedó registrada.
              </p>
              <p className="text-gray-400 text-sm mb-6">
                Entra con tus datos y carga tu primer producto: en ese momento tu menú
                se publica y ya lo puedes compartir.
              </p>
            </>
          )}
          <div className="bg-brand-light border border-brand/30 rounded-xl p-4 text-left">
            <p className="text-sm text-navy font-medium mb-2">Guarda tus datos de acceso:</p>
            <p className="text-sm text-brand-dark">Teléfono: <strong>{telefono}</strong></p>
            <p className="text-sm text-brand-dark">PIN: <strong>{pin}</strong></p>
            <p className="text-xs text-gray-500 mt-2">
              {DELIVERY_ACTIVO
                ? "Una vez aprobada, entra a /tienda con estos datos."
                : "Entra a /tienda con estos datos."}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header title="Mercadito" />
      <main className="max-w-lg mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="Mercadito" className="h-16 w-16 mx-auto mb-2 rounded-xl" />
          <h1 className="text-2xl font-bold text-gray-800">Registra tu tienda</h1>
          <p className="text-sm text-gray-400 mt-1">
            {DELIVERY_ACTIVO
              ? "Vende tus productos a clientes de Sahuayo, Jiquilpan y más"
              : "Arma tu menú digital y recibe pedidos en tu WhatsApp"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Nombre de tu tienda</label>
              <input
                type="text"
                value={nombreTienda}
                onChange={(e) => setNombreTienda(e.target.value)}
                placeholder="Ej: Frutas Don Luis"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Tu nombre</label>
              <input
                type="text"
                value={nombreDueno}
                onChange={(e) => setNombreDueno(e.target.value)}
                placeholder="Ej: Luis García"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Teléfono / WhatsApp</label>
              <input
                type="tel"
                inputMode="numeric"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="3531234567 (10 dígitos)"
                maxLength={10}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Crea un PIN de acceso (6 dígitos)</label>
              <PinInput value={pin} onChange={setPin} length={6} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Confirma tu PIN</label>
              <PinInput
                value={pinConfirm}
                onChange={setPinConfirm}
                length={6}
                error={pinConfirm.length === pin.length && pinConfirm !== pin}
              />
            </div>
          </div>

          {/* Store location */}
          <div>
            <h3 className="font-bold text-gray-700 mb-2">¿Dónde esta tu tienda?</h3>
            <MapaUbicacionTienda
              onUbicacionSeleccionada={(lat, lng) => setUbicacion({ lat, lng })}
              onDireccionDetectada={(dir) => setDireccionTienda(dir)}
            />
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Dirección</label>
              {direccionTienda ? (
                <p className="bg-gray-100 rounded-lg px-4 py-3 text-gray-700">{direccionTienda}</p>
              ) : (
                <p className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-700">
                  Toca el mapa o usa &quot;Mi ubicacion&quot; para obtener tu direccion
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">No. de calle, local o puesto</label>
              <input
                type="text"
                value={numeroLocal}
                onChange={(e) => setNumeroLocal(e.target.value)}
                placeholder="Ej. Local 15, Puesto 3"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Ciudad</label>
              <select
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg bg-white focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              >
                <option value="sahuayo">Sahuayo</option>
                <option value="jiquilpan">Jiquilpan</option>
                <option value="venustiano">San Pedro (Venustiano Carranza)</option>
              </select>
              {ciudad !== "sahuayo" && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                  Mientras no haya repartidores en tu ciudad, mandamos uno desde Sahuayo
                  y se te cobra <strong>$20 de envío por pedido</strong>. En cuanto haya
                  repartidores locales, dejas de pagarlo.
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Referencias <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <textarea
                value={referencias}
                onChange={(e) => setReferencias(e.target.value)}
                placeholder="Ej. frente a la entrada principal"
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-white py-3 rounded-full font-bold text-lg disabled:bg-gray-300 active:scale-95 transition-transform"
          >
            {loading ? "Registrando..." : "Registrar mi tienda"}
          </button>

          <p className="text-xs text-gray-400 text-center">
            ¿Ya tienes cuenta? <a href="/tienda" className="text-brand-dark font-medium">Entra aquí</a>
          </p>
        </form>
      </main>
    </div>
  );
}
