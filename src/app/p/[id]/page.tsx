"use client";

import { useEffect, useState, use } from "react";
import dynamic from "next/dynamic";
import Loader from "@/components/Loader";

const MapaPedido = dynamic(() => import("@/components/MapaPedido"), { ssr: false });

interface TrackingData {
  estado: "pendiente" | "en_compra" | "en_camino" | "entregado" | "cancelado";
  creado_at: string;
  cliente_primer_nombre: string;
  recogida_nombre: string | null;
  repartidor_nombre: string | null;
  repartidor_lat: number | null;
  repartidor_lng: number | null;
  repartidor_ubicacion_at: string | null;
  destino_lat: number | null;
  destino_lng: number | null;
  foto_entrega: string | null;
}

const ESTADO_INFO: Record<TrackingData["estado"], { txt: string; color: string; emoji: string }> = {
  pendiente: { txt: "Tu pedido está en camino al repartidor", color: "bg-amber-100 text-amber-800", emoji: "⏳" },
  en_compra: { txt: "El repartidor está recogiendo tu pedido", color: "bg-blue-100 text-blue-800", emoji: "🛒" },
  en_camino: { txt: "Tu pedido va en camino", color: "bg-purple-100 text-purple-800", emoji: "🛵" },
  entregado: { txt: "¡Tu pedido fue entregado!", color: "bg-green-100 text-green-800", emoji: "✅" },
  cancelado: { txt: "Pedido cancelado", color: "bg-red-100 text-red-800", emoji: "❌" },
};

/**
 * Página pública de tracking sin login.
 *
 * La tienda B2B genera un link y se lo comparte a su cliente final por
 * WhatsApp. El cliente abre la página y ve dónde va su pedido sin
 * necesidad de descargar la app ni crear cuenta.
 *
 * Refresca cada 30 segundos para actualizar la posición del repartidor
 * + el estado del pedido. Cuando se entrega, deja de refrescar y muestra
 * la foto de entrega como prueba.
 */
export default function TrackingPublicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function fetchData() {
      try {
        const res = await fetch(`/api/tracking/${id}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancel) setError("No encontramos este pedido. Verifica el link con quien te lo compartió.");
          return;
        }
        const json: TrackingData = await res.json();
        if (cancel) return;
        setData(json);
        // Si ya está entregado o cancelado, no refrescar más.
        if ((json.estado === "entregado" || json.estado === "cancelado") && interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch {
        if (!cancel) setError("Sin conexión. Intenta abrir el link de nuevo en un momento.");
      }
    }
    fetchData();
    interval = setInterval(fetchData, 30 * 1000);
    return () => {
      cancel = true;
      if (interval) clearInterval(interval);
    };
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-sm text-center">
          <p className="text-2xl mb-2">😕</p>
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return <Loader fullScreen texto="Cargando tu pedido…" />;
  }

  const info = ESTADO_INFO[data.estado];
  const tieneTracking = data.repartidor_lat != null && data.repartidor_lng != null && data.destino_lat != null && data.destino_lng != null;

  // ETA aproximado: haversine repartidor → destino × 1.4 (factor calle vs
  // recta) a 25 km/h ciudad. Se vuelve a calcular cada poll.
  let etaTxt: string | null = null;
  if (tieneTracking) {
    const R = 6371;
    const toRad = (n: number) => (n * Math.PI) / 180;
    const dLat = toRad(data.destino_lat! - data.repartidor_lat!);
    const dLng = toRad(data.destino_lng! - data.repartidor_lng!);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(data.repartidor_lat!)) * Math.cos(toRad(data.destino_lat!)) * Math.sin(dLng / 2) ** 2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const etaMin = Math.max(2, Math.round((distKm * 1.4) * (60 / 25)));
    etaTxt = `${distKm.toFixed(1)} km · llega en ~${etaMin} min`;
  }

  return (
    <div className="min-h-screen bg-cream pb-12">
      <header className="bg-brand text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Mercadito" className="h-8 w-8 rounded-lg" />
          <h1 className="text-lg font-bold">Tu pedido</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          {data.cliente_primer_nombre && (
            <p className="text-sm text-gray-600">Hola {data.cliente_primer_nombre} 👋</p>
          )}
          <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-bold text-sm ${info.color}`}>
            <span>{info.emoji}</span>
            <span>{info.txt}</span>
          </div>
          {data.recogida_nombre && (
            <p className="text-xs text-gray-500 mt-2">Pedido a {data.recogida_nombre}</p>
          )}
        </div>

        {data.estado === "entregado" && data.foto_entrega && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">📸 Foto al entregar</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.foto_entrega}
              alt="Entregado"
              className="w-full max-h-80 object-cover rounded-lg border border-gray-200"
            />
          </div>
        )}

        {tieneTracking && (data.estado === "en_compra" || data.estado === "en_camino") && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 flex items-center gap-3">
              <span className="text-2xl">🛵</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-blue-900">
                  {data.repartidor_nombre || "Tu repartidor"} a {etaTxt}
                </p>
                {data.repartidor_ubicacion_at && (
                  <p className="text-[10px] text-blue-600">
                    Última ubicación: hace {Math.max(0, Math.round((Date.now() - new Date(data.repartidor_ubicacion_at).getTime()) / 60000))} min
                  </p>
                )}
              </div>
            </div>
            <MapaPedido
              lat={data.destino_lat!}
              lng={data.destino_lng!}
              direccion="Tu domicilio"
              paradas={[]}
              origen={{ lat: data.repartidor_lat!, lng: data.repartidor_lng! }}
            />
            <p className="text-[11px] text-gray-400 text-center mt-2">
              Esta página se actualiza sola cada 30 segundos.
            </p>
          </div>
        )}

        {!tieneTracking && (data.estado === "en_compra" || data.estado === "en_camino") && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 leading-snug">
            Tu repartidor está en camino. La ubicación en vivo se activa apenas comparta su GPS — actualizamos esta página automáticamente.
          </div>
        )}

        <div className="text-center pt-4">
          <p className="text-[11px] text-gray-400">
            Powered by <a href="https://mercadito.cx" className="underline">Mercadito</a> — delivery local en Sahuayo, Jiquilpan y V. Carranza
          </p>
        </div>
      </main>
    </div>
  );
}
