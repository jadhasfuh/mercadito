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
  // Pedido a/desde ciudad foránea: aplica impuesto de ciudad + piso foráneo.
  foranea?: boolean;
}

export default function MapaEntrega({ onUbicacionSeleccionada, onDireccionDetectada, ubicacionInicial, origenes = [], foranea = false }: MapaEntregaProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Array (no single ref) para que clicks rápidos no dejen polylines
  // huérfanas si una fetch antigua resuelve tarde. Cada nuevo intento
  // limpia TODAS las líneas previas (las que tengan reference o no).
  const routeLinesRef = useRef<L.Polyline[]>([]);
  const tiendaMarkersRef = useRef<L.Marker[]>([]);
  const [ruta, setRuta] = useState<RutaResult | null>(null);
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [calculandoRuta, setCalculandoRuta] = useState(false);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const [carga, setCarga] = useState<{ pedidos_activos: number; minutos_espera: number } | null>(null);
  // Incremental counter para ignorar respuestas de rutas viejas — si el usuario
  // arrastra el pin varias veces rápido, solo nos interesa la última.
  const rutaSeqRef = useRef(0);
  // fitBounds yankea la vista cada vez que cambia la ruta. Lo hacemos solo
  // la primera colocación; después el usuario puede hacer zoom/pan libre.
  // "Mi ubicación" lo resetea para re-encuadrar al usar GPS.
  const hasFittedRef = useRef(false);


  // Fetch current delivery workload
  useEffect(() => {
    fetch("/api/carga").then((r) => r.json()).then(setCarga).catch(() => {});
  }, []);

  // Center map on first store or Sahuayo center if no stores yet
  const centroLat = origenes.length > 0 ? origenes[0].lat : MERCADO_LAT;
  const centroLng = origenes.length > 0 ? origenes[0].lng : MERCADO_LNG;

  // Reverse geocoding: coordinates → address text. Timeout corto para no
  // colgar la UI si Nominatim responde tarde; es opcional (si falla el user
  // teclea la dirección manualmente).
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    if (!onDireccionDetectada) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { signal: ctrl.signal }
      );
      const data = await res.json();
      if (data?.address) {
        const a = data.address;
        const parts = [a.road, a.house_number, a.neighbourhood || a.suburb, a.city || a.town || a.village].filter(Boolean);
        onDireccionDetectada(parts.join(", ") || data.display_name?.split(",").slice(0, 3).join(", ") || "");
      }
    } catch {
      // Silent fail — user can type address manually
    } finally {
      clearTimeout(t);
    }
  }, [onDireccionDetectada]);

  useEffect(() => {
    import("leaflet").then((leaflet) => setL(leaflet.default));
  }, []);

  const actualizarRuta = useCallback(
    async (lat: number, lng: number, map: L.Map, leaflet: typeof import("leaflet")) => {
      const seq = ++rutaSeqRef.current;
      // Limpiamos TODAS las polylines existentes — no sólo la última.
      routeLinesRef.current.forEach((l) => l.remove());
      routeLinesRef.current = [];

      setCalculandoRuta(true);
      const resultado = await calcularRutaMultiParada(lat, lng, origenes, foranea);
      // Si llegó una respuesta más nueva mientras esperábamos, descartamos esta.
      if (seq !== rutaSeqRef.current) return;
      // Doble limpieza: por si otro fetch resolvió y dibujó entre nuestra
      // remove() inicial y este momento. Belt-and-suspenders.
      routeLinesRef.current.forEach((l) => l.remove());
      routeLinesRef.current = [];
      setRuta(resultado);
      setCalculandoRuta(false);

      const esAprox = resultado.esAproximada;
      const linea = leaflet
        .polyline(resultado.geometria, {
          color: esAprox ? "#F59E0B" : "#059669",
          weight: esAprox ? 3 : 4,
          opacity: esAprox ? 0.6 : 0.8,
          dashArray: esAprox ? "8, 6" : undefined,
        })
        .addTo(map);
      routeLinesRef.current.push(linea);

      if (!hasFittedRef.current) {
        map.fitBounds(linea.getBounds(), { padding: [40, 40] });
        hasFittedRef.current = true;
      }

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
    [onUbicacionSeleccionada, origenes, foranea]
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
          // Permitir re-encuadrar al usar GPS (acción explícita del usuario).
          hasFittedRef.current = false;
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
            ruta.costoEnvio > 0 ? "bg-brand-light border border-brand/30" : "bg-red-50 border border-red-200"
          }`}
        >
          {ruta.costoEnvio > 0 ? (() => {
            const espera = carga?.minutos_espera || 0;
            // Parse original time range "30-45 min" to add wait time
            const match = ruta.tiempoTotal.match(/(\d+)-(\d+)/);
            const tiempoMin = match ? parseInt(match[1]) + espera : 30 + espera;
            const tiempoMax = match ? parseInt(match[2]) + espera : 45 + espera;
            const tiempoAjustado = `${tiempoMin}-${tiempoMax} min`;

            return (
            <>
              <div className="flex justify-center gap-4 mb-2">
                <div>
                  <p className="text-xs text-gray-500">Distancia</p>
                  <p className="font-bold text-lg text-gray-700">{ruta.distanciaKm} km</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Tiempo estimado</p>
                  <p className="font-bold text-lg text-gray-700">{tiempoAjustado}</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-navy">Envio: ${ruta.costoEnvio} MXN</p>
              <p className="text-xs text-gray-400 mt-1">
                {ruta.tiempoCompra > 0 && `~${ruta.tiempoCompra} min comprando + `}
                ~{ruta.duracionMin} min en camino
                {origenes.length > 1 && ` (${origenes.length} tiendas)`}
                {espera > 0 && ` + ~${espera} min de espera`}
              </p>
              {ruta.esAproximada && (
                <p className="text-[10px] text-amber-600 mt-1">
                  Ruta aproximada (sin detalle por calles) — distancia y costo estimados.
                </p>
              )}
              {carga && carga.pedidos_activos > 0 && (
                <p className="text-[10px] text-gray-400 mt-1">
                  {carga.pedidos_activos === 1
                    ? "Hay 1 pedido antes del tuyo"
                    : `Hay ${carga.pedidos_activos} pedidos antes del tuyo`}
                </p>
              )}
            </>
            );
          })() : (
            <p className="text-red-600 font-medium">
              Fuera de zona de cobertura ({ruta.distanciaKm} km). Solo entregamos hasta 20 km.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
