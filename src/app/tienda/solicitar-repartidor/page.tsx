"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/components/SessionProvider";
import MapaUbicacionTienda from "@/components/MapaUbicacionTienda";

interface RespuestaOk {
  ok: true;
  pedido_id: string;
  costo_envio: number;
  total_a_cobrar: number;
  distancia_km: number;
  tiempo_estimado: string;
  envio_pagado_por: "tienda" | "cliente";
}

/**
 * /tienda/solicitar-repartidor
 *
 * Form B2B donde el restaurante pide un repartidor para entregar un pedido
 * que tomó por su cuenta (teléfono / mostrador / WhatsApp). Reusa la infra
 * de envíos. Default: la tienda absorbe el envío y se le factura por
 * acumulado semanal — incentiva al restaurante a probar sin meter al
 * cliente final en la mecánica de pago de envío.
 */
export default function SolicitarRepartidorPage() {
  const { usuario, loading: sessionLoading } = useSession();
  const router = useRouter();

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");
  const [pagaEnvio, setPagaEnvio] = useState<"tienda" | "cliente">("tienda");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<RespuestaOk | null>(null);

  // Sin sesión tienda → al login. Permitimos admin también para que tú
  // puedas probar sin estar logueado como Mercadito tienda.
  useEffect(() => {
    if (sessionLoading) return;
    if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "admin")) {
      router.replace("/tienda/login");
    }
  }, [usuario, sessionLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!ubicacion) {
      setError("Marca la ubicación del cliente en el mapa");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/tienda/solicitar-repartidor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_nombre: nombre,
          cliente_telefono: telefono,
          direccion_entrega: direccion,
          cliente_lat: ubicacion.lat,
          cliente_lng: ubicacion.lng,
          monto_pedido: Number(monto),
          notas,
          envio_pagado_por: pagaEnvio,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "No se pudo crear la solicitud");
      } else {
        setResultado(json as RespuestaOk);
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  // Pantalla de éxito.
  if (resultado) {
    return (
      <div className="min-h-screen bg-cream">
        <header className="bg-brand text-white sticky top-0 z-40 shadow-md">
          <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-14">
            <Link href="/tienda" className="text-2xl">←</Link>
            <h1 className="text-lg font-bold">Solicitud enviada</h1>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="text-5xl mb-2">🛵</div>
            <h2 className="text-xl font-black text-gray-800">Pedido en cola</h2>
            <p className="text-sm text-gray-500 mt-1">Le va a llegar a Fernando en segundos</p>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Pedido</span>
              <span className="font-mono font-bold">#{resultado.pedido_id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Distancia</span>
              <span className="font-bold">{resultado.distancia_km} km</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tiempo estimado</span>
              <span className="font-bold">{resultado.tiempo_estimado}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-500">Envío</span>
              <span className="font-bold text-brand-dark">${resultado.costo_envio.toFixed(2)}</span>
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              {resultado.envio_pagado_por === "tienda"
                ? "Vas absorbiendo el envío. Se acumula en tu cuenta y te lo cobramos por semana."
                : `Fernando le cobra al cliente $${resultado.total_a_cobrar.toFixed(2)} (pedido + envío).`}
            </div>
          </div>

          <button
            onClick={() => {
              setResultado(null);
              setNombre("");
              setTelefono("");
              setDireccion("");
              setUbicacion(null);
              setMonto("");
              setNotas("");
            }}
            className="w-full bg-brand text-white py-3 rounded-full font-bold text-base active:scale-95 transition-transform"
          >
            Solicitar otro pedido
          </button>
          <Link
            href="/tienda"
            className="block w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-full font-bold text-base text-center active:scale-95 transition-transform"
          >
            Volver al panel
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-12">
      <header className="bg-brand text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-14">
          <Link href="/tienda" className="text-2xl">←</Link>
          <h1 className="text-lg font-bold">Solicitar repartidor</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <div className="bg-white rounded-xl p-3 text-xs text-gray-500 leading-snug">
          Mandamos a Fernando a recoger el pedido a tu local y se lo entrega al cliente final.
          Tarifa de envío según la distancia.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cliente */}
          <section className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="font-bold text-gray-800 text-base">Datos del cliente</h2>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre del cliente"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Teléfono (10 dígitos)</label>
              <input
                type="tel"
                inputMode="numeric"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="3531234567"
                maxLength={10}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Dirección de entrega</label>
              <input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Calle, número, colonia, referencias"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Marca el punto en el mapa</label>
              <div className="rounded-lg overflow-hidden border border-gray-200">
                <MapaUbicacionTienda
                  ubicacionInicial={ubicacion}
                  onUbicacionSeleccionada={(lat, lng) => setUbicacion({ lat, lng })}
                  onDireccionDetectada={(d) => { if (!direccion) setDireccion(d); }}
                />
              </div>
              {ubicacion && (
                <p className="text-[11px] text-green-700 mt-1">✓ Punto fijado</p>
              )}
            </div>
          </section>

          {/* Pedido */}
          <section className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="font-bold text-gray-800 text-base">Datos del pedido</h2>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Monto del pedido</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="1"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-base focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                  required
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Lo que el cliente paga por la comida (sin contar envío).</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notas para el repartidor (opcional)</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej. Hawaiana grande, refresco, sin chile"
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              />
            </div>
          </section>

          {/* Quién paga el envío */}
          <section className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="font-bold text-gray-800 text-base">¿Quién paga el envío?</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPagaEnvio("tienda")}
                className={`rounded-xl p-3 text-center border-2 transition-colors ${
                  pagaEnvio === "tienda"
                    ? "border-brand bg-brand-light"
                    : "border-gray-200 bg-white"
                }`}
              >
                <span className="text-2xl block">🏪</span>
                <span className="text-xs font-bold text-gray-700">Yo absorbo</span>
                <span className="block text-[10px] text-gray-400">Te lo cobramos por semana</span>
              </button>
              <button
                type="button"
                onClick={() => setPagaEnvio("cliente")}
                className={`rounded-xl p-3 text-center border-2 transition-colors ${
                  pagaEnvio === "cliente"
                    ? "border-brand bg-brand-light"
                    : "border-gray-200 bg-white"
                }`}
              >
                <span className="text-2xl block">💵</span>
                <span className="text-xs font-bold text-gray-700">Cliente paga</span>
                <span className="block text-[10px] text-gray-400">Lo cobra Fernando</span>
              </button>
            </div>
          </section>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-brand text-white py-4 rounded-full font-black text-lg disabled:bg-gray-300 active:scale-95 transition-transform"
          >
            {enviando ? "Enviando…" : "🛵 Solicitar repartidor"}
          </button>
        </form>
      </main>
    </div>
  );
}
