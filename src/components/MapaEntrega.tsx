"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MERCADO_LAT, MERCADO_LNG, MERCADO_NOMBRE, calcularRuta, buscarPorCP } from "@/lib/geo";
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
  }) => void;
  ubicacionInicial?: { lat: number; lng: number } | null;
  origen?: OrigenInfo;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

export default function MapaEntrega({ onUbicacionSeleccionada, ubicacionInicial, origen }: MapaEntregaProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const [ruta, setRuta] = useState<RutaResult | null>(null);
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [calculandoRuta, setCalculandoRuta] = useState(false);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<SearchResult[]>([]);
  const [buscando, setBuscando] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const origenLat = origen?.lat ?? MERCADO_LAT;
  const origenLng = origen?.lng ?? MERCADO_LNG;
  const origenNombre = origen?.nombre ?? MERCADO_NOMBRE;

  useEffect(() => {
    import("leaflet").then((leaflet) => setL(leaflet.default));
  }, []);

  const actualizarRuta = useCallback(
    async (lat: number, lng: number, map: L.Map, leaflet: typeof import("leaflet")) => {
      if (routeLineRef.current) routeLineRef.current.remove();

      setCalculandoRuta(true);
      const resultado = await calcularRuta(lat, lng, origen);
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
      });
    },
    [onUbicacionSeleccionada, origen]
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

    const map = L.map(mapRef.current).setView([origenLat, origenLng], 14);
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

    L.marker([origenLat, origenLng], { icon: mercadoIcon })
      .addTo(map)
      .bindPopup(`<b>${origenNombre}</b><br/>Origen de tu pedido`)
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

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalizacion");
      return;
    }

    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      alert("La ubicacion automatica requiere conexion segura (HTTPS). Usa el buscador o toca el mapa.");
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
        alert("No pudimos obtener tu ubicacion. Usa el buscador o toca el mapa.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function buscarDireccion(texto: string) {
    setBusqueda(texto);
    setResultados([]);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (texto.length < 3) return;

    searchTimeout.current = setTimeout(async () => {
      setBuscando(true);
      try {
        // Try address search first
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            texto + " Sahuayo Michoacan Mexico"
          )}&limit=5&bounded=1&viewbox=-102.85,20.15,-102.60,19.90`
        );
        let data: SearchResult[] = await res.json();

        // If no results and looks like a postal code, try CP search
        if (data.length === 0 && /^\d{4,5}$/.test(texto.trim())) {
          const cp = await buscarPorCP(texto.trim());
          if (cp) {
            data = [{ lat: String(cp.lat), lon: String(cp.lng), display_name: `CP ${texto} — ${cp.nombre}` }];
          }
        }

        // If still no results, try without the Sahuayo bias
        if (data.length === 0) {
          const res2 = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              texto + " Michoacan Mexico"
            )}&limit=5`
          );
          data = await res2.json();
        }

        setResultados(data);
      } catch {
        setResultados([]);
      }
      setBuscando(false);
    }, 400);
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
        <div className="relative">
          <span className="absolute left-3 top-3 text-gray-400">🔍</span>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => buscarDireccion(e.target.value)}
            placeholder="Busca calle, colonia o codigo postal..."
            className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-3 text-base focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>
        {buscando && (
          <p className="text-xs text-gray-400 mt-1 ml-1">Buscando...</p>
        )}
        {resultados.length > 0 && (
          <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
            {resultados.map((r, i) => (
              <button
                key={i}
                onClick={() => seleccionarResultado(r)}
                className="w-full text-left px-4 py-3 text-sm border-b border-gray-50 active:bg-emerald-50 transition-colors"
              >
                <span className="text-emerald-500 mr-2">📍</span>
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
          {buscandoUbicacion ? "Buscando..." : <>📍 Mi ubicacion</>}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Busca tu direccion, codigo postal, o toca el mapa
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
                  <p className="text-xs text-gray-500">Tiempo aprox.</p>
                  <p className="font-bold text-lg text-gray-700">~{ruta.duracionMin} min</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-emerald-700">Envio: ${ruta.costoEnvio} MXN</p>
              <p className="text-xs text-gray-400 mt-1">Ruta calculada por calles reales</p>
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
