"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MERCADO_LAT, MERCADO_LNG, MERCADO_NOMBRE, calcularRutaMultiParada } from "@/lib/geo";
import type { RutaResult, OrigenInfo } from "@/lib/geo";

interface MapaEntregaProps {
  onUbicacionSeleccionada: (data: {
    lat: number;
    lng: number;
    distanciaKm: number;
    duracionMin: number;
    costoEnvio: number;
    zona: string;
    tiempo: string;
    tiempoCompra: number;
    tiempoTotal: string;
  }) => void;
  onDireccionDetectada?: (direccion: string) => void;
  ubicacionInicial?: { lat: number; lng: number } | null;
  origenes?: OrigenInfo[];
}

export default function MapaEntrega({ onUbicacionSeleccionada, onDireccionDetectada, ubicacionInicial, origenes = [] }: MapaEntregaProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const tiendaMarkersRef = useRef<L.Marker[]>([]);
  const [ruta, setRuta] = useState<RutaResult | null>(null);
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [calculandoRuta, setCalculandoRuta] = useState(false);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);


  // Center map on first store or Sahuayo center if no stores yet
  const centroLat = origenes.length > 0 ? origenes[0].lat : MERCADO_LAT;
  const centroLng = origenes.length > 0 ? origenes[0].lng : MERCADO_LNG;

  // Reverse geocoding: coordinates → address text
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    if (!onDireccionDetectada) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      );
      const data = await res.json();
      if (data?.address) {
        const a = data.address;
        const parts = [a.road, a.house_number, a.neighbourhood || a.suburb, a.city || a.town || a.village].filter(Boolean);
        onDireccionDetectada(parts.join(", ") || data.display_name?.split(",").slice(0, 3).join(", ") || "");
      }
    } catch {
      // Silent fail — user can type address manually
    }
  }, [onDireccionDetectada]);

  useEffect(() => {
    import("leaflet").then((leaflet) => setL(leaflet.default));
  }, []);

  const actualizarRuta = useCallback(
    async (lat: number, lng: number, map: L.Map, leaflet: typeof import("leaflet")) => {
      if (routeLineRef.current) routeLineRef.current.remove();

      setCalculandoRuta(true);
      const resultado = await calcularRutaMultiParada(lat, lng, origenes);
      setRuta(resultado);
      setCalculandoRuta(false);

      const isReal = resultado.geometria.length > 2;
      routeLineRef.current = leaflet
        .polyline(resultado.geometria, {
          color: "#059669",
          weight: isReal ? 4 : 3,
          opacity: isReal ? 0.8 : 0.6,
          dashArray: isReal ? undefined : "10, 10",
        })
        .addTo(map);

      map.fitBounds(routeLineRef.current.getBounds(), { padding: [40, 40] });

      onUbicacionSeleccionada({
        lat,
        lng,
        distanciaKm: resultado.distanciaKm,
        duracionMin: resultado.duracionMin,
        costoEnvio: resultado.costoEnvio,
        zona: resultado.zona,
        tiempo: resultado.tiempo,
        tiempoCompra: resultado.tiempoCompra,
        tiempoTotal: resultado.tiempoTotal,
      });
    },
    [onUbicacionSeleccionada, origenes]
  );

  const colocarMarcador = useCallback(
    (lat: number, lng: number, map: L.Map, leaflet: typeof import("leaflet")) => {
      if (markerRef.current) markerRef.current.remove();

      const entregaIcon = leaflet.divIcon({
        html: '<div style="font-size:30px;text-align:center;line-height:1;">📍</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        className: "",
      });

      markerRef.current = leaflet
        .marker([lat, lng], { icon: entregaIcon, draggable: true })
        .addTo(map)
        .bindPopup("Tu punto de entrega — arrastralo para ajustar");

      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLatLng();
        actualizarRuta(pos.lat, pos.lng, map, leaflet);
        reverseGeocode(pos.lat, pos.lng);
      });

      actualizarRuta(lat, lng, map, leaflet);
    },
    [actualizarRuta, reverseGeocode]
  );

  useEffect(() => {
    if (!L || !mapRef.current || mapInstanceRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });

    const map = L.map(mapRef.current).setView([centroLat, centroLng], 14);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      colocarMarcador(e.latlng.lat, e.latlng.lng, map, L);
      reverseGeocode(e.latlng.lat, e.latlng.lng);
    });

    if (ubicacionInicial) {
      colocarMarcador(ubicacionInicial.lat, ubicacionInicial.lng, map, L);
      reverseGeocode(ubicacionInicial.lat, ubicacionInicial.lng);
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);

  // Update store markers when origenes changes (separate from map init)
  useEffect(() => {
    if (!L || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Remove old store markers
    tiendaMarkersRef.current.forEach((m) => m.remove());
    tiendaMarkersRef.current = [];

    // No stores in cart = no store markers
    if (origenes.length === 0) return;

    const tiendaIcon = L.divIcon({
      html: '<div style="font-size:30px;text-align:center;line-height:1;">🏪</div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      className: "",
    });

    origenes.forEach((t, i) => {
      const m = L.marker([t.lat, t.lng], { icon: tiendaIcon })
        .addTo(map)
        .bindPopup(`<b>${t.nombre}</b><br/>${origenes.length > 1 ? `Parada ${i + 1}` : "Origen de tu pedido"}`);
      tiendaMarkersRef.current.push(m);
    });

    // If delivery marker already placed, recalculate route with new origenes
    if (markerRef.current) {
      const pos = markerRef.current.getLatLng();
      actualizarRuta(pos.lat, pos.lng, map, L);
    } else if (origenes.length > 1) {
      const bounds = L.latLngBounds(origenes.map((t) => [t.lat, t.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView([origenes[0].lat, origenes[0].lng], 14);
    }
  }, [L, origenes, actualizarRuta]);

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalizacion");
      return;
    }

    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      alert("La ubicacion automatica requiere conexion segura (HTTPS). Toca el mapa donde vives.");
      return;
    }

    setBuscandoUbicacion(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscandoUbicacion(false);
        if (mapInstanceRef.current && L) {
          colocarMarcador(pos.coords.latitude, pos.coords.longitude, mapInstanceRef.current, L);
          reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        }
      },
      () => {
        setBuscandoUbicacion(false);
        alert("No pudimos obtener tu ubicacion. Toca el mapa donde vives.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="space-y-3">
      {/* Map */}
      <div
        ref={mapRef}
        className="w-full h-72 rounded-xl overflow-hidden border-2 border-gray-200 z-0"
      />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={usarMiUbicacion}
          disabled={buscandoUbicacion}
          className="flex-1 bg-blue-500 text-white py-3 rounded-xl font-medium active:scale-95 transition-transform flex items-center justify-center gap-2 text-sm"
        >
          {buscandoUbicacion ? "Buscando..." : <>📍 Mi ubicacion</>}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Toca el mapa donde vives o usa tu ubicacion
      </p>

      {calculandoRuta && (
        <div className="text-center py-2 text-sm text-gray-400">Calculando ruta...</div>
      )}

      {ruta && !calculandoRuta && (
        <div
          className={`rounded-xl p-4 text-center ${
            ruta.costoEnvio > 0 ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"
          }`}
        >
          {ruta.costoEnvio > 0 ? (
            <>
              <div className="flex justify-center gap-6 mb-2">
                <div>
                  <p className="text-xs text-gray-500">Distancia</p>
                  <p className="font-bold text-lg text-gray-700">{ruta.distanciaKm} km</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Tiempo total</p>
                  <p className="font-bold text-lg text-gray-700">{ruta.tiempoTotal}</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-emerald-700">Envio: ${ruta.costoEnvio} MXN</p>
              <p className="text-xs text-gray-400 mt-1">
                {ruta.tiempoCompra > 0 && `~${ruta.tiempoCompra} min comprando + `}
                ~{ruta.duracionMin} min en camino
                {origenes.length > 1 && ` (${origenes.length} tiendas)`}
              </p>
            </>
          ) : (
            <p className="text-red-600 font-medium">
              Fuera de zona de cobertura ({ruta.distanciaKm} km). Solo entregamos hasta 20 km.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
