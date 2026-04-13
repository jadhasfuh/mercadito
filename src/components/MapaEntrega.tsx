"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MERCADO_LAT, MERCADO_LNG, MERCADO_NOMBRE, calcularRuta } from "@/lib/geo";
import type { RutaResult } from "@/lib/geo";

interface MapaEntregaProps {
  onUbicacionSeleccionada: (data: {
    lat: number;
    lng: number;
    distanciaKm: number;
    duracionMin: number;
    costoEnvio: number;
    zona: string;
    tiempo: string;
  }) => void;
  ubicacionInicial?: { lat: number; lng: number } | null;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

export default function MapaEntrega({ onUbicacionSeleccionada, ubicacionInicial }: MapaEntregaProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const [ruta, setRuta] = useState<RutaResult | null>(null);
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [calculandoRuta, setCalculandoRuta] = useState(false);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);

  // Address search
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<SearchResult[]>([]);
  const [buscando, setBuscando] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    import("leaflet").then((leaflet) => setL(leaflet.default));
  }, []);

  const actualizarRuta = useCallback(
    async (lat: number, lng: number, map: L.Map, leaflet: typeof import("leaflet")) => {
      if (routeLineRef.current) routeLineRef.current.remove();

      setCalculandoRuta(true);
      const resultado = await calcularRuta(lat, lng);
      setRuta(resultado);
      setCalculandoRuta(false);

      if (resultado.geometria.length > 2) {
        routeLineRef.current = leaflet
          .polyline(resultado.geometria, { color: "#16a34a", weight: 4, opacity: 0.8 })
          .addTo(map);
      } else {
        routeLineRef.current = leaflet
          .polyline(resultado.geometria, { color: "#16a34a", weight: 3, dashArray: "10, 10", opacity: 0.6 })
          .addTo(map);
      }

      map.fitBounds(routeLineRef.current.getBounds(), { padding: [40, 40] });

      onUbicacionSeleccionada({
        lat,
        lng,
        distanciaKm: resultado.distanciaKm,
        duracionMin: resultado.duracionMin,
        costoEnvio: resultado.costoEnvio,
        zona: resultado.zona,
        tiempo: resultado.tiempo,
      });
    },
    [onUbicacionSeleccionada]
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
        .bindPopup("Tu punto de entrega — arrástralo para ajustar");

      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLatLng();
        actualizarRuta(pos.lat, pos.lng, map, leaflet);
      });

      actualizarRuta(lat, lng, map, leaflet);
    },
    [actualizarRuta]
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

    const map = L.map(mapRef.current).setView([MERCADO_LAT, MERCADO_LNG], 14);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    const mercadoIcon = L.divIcon({
      html: '<div style="font-size:30px;text-align:center;line-height:1;">🏪</div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      className: "",
    });

    L.marker([MERCADO_LAT, MERCADO_LNG], { icon: mercadoIcon })
      .addTo(map)
      .bindPopup(`<b>${MERCADO_NOMBRE}</b><br/>Aquí compramos tu mandado`)
      .openPopup();

    map.on("click", (e: L.LeafletMouseEvent) => {
      colocarMarcador(e.latlng.lat, e.latlng.lng, map, L);
    });

    if (ubicacionInicial) {
      colocarMarcador(ubicacionInicial.lat, ubicacionInicial.lng, map, L);
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);

  // Geolocation (only works on HTTPS)
  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización");
      return;
    }

    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      alert("La ubicación automática requiere conexión segura (HTTPS). Usa el buscador de direcciones o toca el mapa.");
      return;
    }

    setBuscandoUbicacion(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscandoUbicacion(false);
        if (mapInstanceRef.current && L) {
          colocarMarcador(pos.coords.latitude, pos.coords.longitude, mapInstanceRef.current, L);
        }
      },
      () => {
        setBuscandoUbicacion(false);
        alert("No pudimos obtener tu ubicación. Usa el buscador o toca el mapa.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Address search using Nominatim (OpenStreetMap)
  function buscarDireccion(texto: string) {
    setBusqueda(texto);
    setResultados([]);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (texto.length < 3) return;

    searchTimeout.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            texto + " Sahuayo Michoacán México"
          )}&limit=5&bounded=1&viewbox=-102.80,20.10,-102.65,19.98`
        );
        const data: SearchResult[] = await res.json();
        setResultados(data);
      } catch {
        setResultados([]);
      }
      setBuscando(false);
    }, 500);
  }

  function seleccionarResultado(result: SearchResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setResultados([]);
    setBusqueda(result.display_name.split(",").slice(0, 3).join(", "));

    if (mapInstanceRef.current && L) {
      colocarMarcador(lat, lng, mapInstanceRef.current, L);
    }
  }

  return (
    <div className="space-y-3">
      {/* Address search */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-3 text-gray-400">🔍</span>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => buscarDireccion(e.target.value)}
              placeholder="Busca tu calle o colonia..."
              className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-3 text-base focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
            />
          </div>
        </div>
        {buscando && (
          <p className="text-xs text-gray-400 mt-1 ml-1">Buscando...</p>
        )}
        {resultados.length > 0 && (
          <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-48 overflow-y-auto">
            {resultados.map((r, i) => (
              <button
                key={i}
                onClick={() => seleccionarResultado(r)}
                className="w-full text-left px-4 py-3 text-sm border-b border-gray-50 hover:bg-green-50 active:bg-green-100 transition-colors"
              >
                <span className="text-gray-400 mr-2">📍</span>
                {r.display_name.split(",").slice(0, 4).join(", ")}
              </button>
            ))}
          </div>
        )}
      </div>

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
          {buscandoUbicacion ? "Buscando..." : <>📍 Mi ubicación</>}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Busca tu dirección, usa tu ubicación, o toca el mapa directamente
      </p>

      {calculandoRuta && (
        <div className="text-center py-2 text-sm text-gray-400">Calculando ruta...</div>
      )}

      {ruta && !calculandoRuta && (
        <div
          className={`rounded-xl p-4 text-center ${
            ruta.costoEnvio > 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
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
                  <p className="text-xs text-gray-500">Tiempo aprox.</p>
                  <p className="font-bold text-lg text-gray-700">~{ruta.duracionMin} min</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-green-700">Envío: ${ruta.costoEnvio} MXN</p>
              <p className="text-xs text-gray-400 mt-1">Ruta calculada por calles reales</p>
            </>
          ) : (
            <p className="text-red-600 font-medium">
              Fuera de zona de cobertura ({ruta.distanciaKm} km). Solo entregamos hasta 20 km del mercado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
