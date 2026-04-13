"use client";

import { useEffect, useState, useRef } from "react";
import { MERCADO_LAT, MERCADO_LNG } from "@/lib/geo";

interface Props {
  ubicacionInicial?: { lat: number; lng: number } | null;
  onUbicacionSeleccionada: (lat: number, lng: number) => void;
  onDireccionDetectada?: (direccion: string) => void;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

export default function MapaUbicacionTienda({ ubicacionInicial, onUbicacionSeleccionada, onDireccionDetectada }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<SearchResult[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscandoGPS, setBuscandoGPS] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ubicacionActual, setUbicacionActual] = useState<{ lat: number; lng: number } | null>(ubicacionInicial || null);
  const autoGpsTriggered = useRef(false);

  useEffect(() => {
    import("leaflet").then((leaflet) => setL(leaflet.default));
  }, []);

  // Reverse geocode: coordinates → address text
  async function reverseGeocode(lat: number, lng: number) {
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
      // Silent fail
    }
  }

  function colocarMarcador(lat: number, lng: number, map: L.Map, leaflet: typeof import("leaflet")) {
    if (markerRef.current) markerRef.current.remove();

    const icon = leaflet.divIcon({
      html: '<div style="font-size:30px;text-align:center;line-height:1;">🏪</div>',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      className: "",
    });

    markerRef.current = leaflet
      .marker([lat, lng], { icon, draggable: true })
      .addTo(map)
      .bindPopup("Ubicacion de tu tienda — arrastralo para ajustar")
      .openPopup();

    markerRef.current.on("dragend", () => {
      const pos = markerRef.current!.getLatLng();
      setUbicacionActual({ lat: pos.lat, lng: pos.lng });
      onUbicacionSeleccionada(pos.lat, pos.lng);
      reverseGeocode(pos.lat, pos.lng);
    });

    map.setView([lat, lng], 16);
    setUbicacionActual({ lat, lng });
    onUbicacionSeleccionada(lat, lng);
    reverseGeocode(lat, lng);
  }

  useEffect(() => {
    if (!L || !mapRef.current || mapInstanceRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });

    const initLat = ubicacionInicial?.lat ?? MERCADO_LAT;
    const initLng = ubicacionInicial?.lng ?? MERCADO_LNG;

    const map = L.map(mapRef.current).setView([initLat, initLng], ubicacionInicial ? 16 : 14);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      colocarMarcador(e.latlng.lat, e.latlng.lng, map, L);
    });

    if (ubicacionInicial) {
      colocarMarcador(ubicacionInicial.lat, ubicacionInicial.lng, map, L);
    } else if (!autoGpsTriggered.current && navigator.geolocation) {
      // Auto-request GPS to pre-fill store location
      autoGpsTriggered.current = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (mapInstanceRef.current && L) {
            colocarMarcador(pos.coords.latitude, pos.coords.longitude, mapInstanceRef.current, L);
          }
        },
        () => { /* User denied — they can search or tap the map */ },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);

  function usarMiUbicacion() {
    if (!navigator.geolocation) { alert("Tu navegador no soporta geolocalizacion"); return; }
    setBuscandoGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscandoGPS(false);
        if (mapInstanceRef.current && L) {
          colocarMarcador(pos.coords.latitude, pos.coords.longitude, mapInstanceRef.current, L);
        }
      },
      () => { setBuscandoGPS(false); alert("No pudimos obtener tu ubicacion. Busca la direccion o toca el mapa."); },
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
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            texto + " Michoacan Mexico"
          )}&limit=5`
        );
        setResultados(await res.json());
      } catch { setResultados([]); }
      setBuscando(false);
    }, 400);
  }

  function seleccionarResultado(r: SearchResult) {
    setResultados([]);
    setBusqueda(r.display_name.split(",").slice(0, 3).join(", "));
    if (mapInstanceRef.current && L) {
      colocarMarcador(parseFloat(r.lat), parseFloat(r.lon), mapInstanceRef.current, L);
    }
  }

  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => buscarDireccion(e.target.value)}
          placeholder="Busca la direccion de tu tienda..."
          className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
        />
        {buscando && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
        {resultados.length > 0 && (
          <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-48 overflow-y-auto">
            {resultados.map((r, i) => (
              <button
                key={i}
                onClick={() => seleccionarResultado(r)}
                className="w-full text-left px-3 py-2.5 text-sm border-b border-gray-50 active:bg-amber-50"
              >
                📍 {r.display_name.split(",").slice(0, 4).join(", ")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div ref={mapRef} className="w-full h-48 rounded-xl overflow-hidden border-2 border-gray-200 z-0" />

      {/* Buttons */}
      <button
        onClick={usarMiUbicacion}
        disabled={buscandoGPS}
        className="w-full bg-blue-500 text-white py-2 rounded-lg font-medium text-sm active:scale-95 transition-transform"
      >
        {buscandoGPS ? "Buscando..." : "📍 Usar mi ubicacion actual"}
      </button>

      {ubicacionActual && (
        <p className="text-xs text-emerald-600 text-center">
          Ubicacion guardada: {ubicacionActual.lat.toFixed(5)}, {ubicacionActual.lng.toFixed(5)}
        </p>
      )}

      <p className="text-xs text-gray-400 text-center">
        Busca la direccion, usa tu GPS, o toca el mapa donde esta tu tienda
      </p>
    </div>
  );
}
