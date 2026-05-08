"use client";

import { useEffect, useState, useRef } from "react";
import { MERCADO_LAT, MERCADO_LNG } from "@/lib/geo";

interface Props {
  ubicacionInicial?: { lat: number; lng: number } | null;
  onUbicacionSeleccionada: (lat: number, lng: number) => void;
  onDireccionDetectada?: (direccion: string) => void;
}

export default function MapaUbicacionTienda({ ubicacionInicial, onUbicacionSeleccionada, onDireccionDetectada }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const [buscandoGPS, setBuscandoGPS] = useState(false);
  const [tieneUbicacion, setTieneUbicacion] = useState(!!ubicacionInicial);
  const autoGpsTriggered = useRef(false);
  // setView resetea zoom/pan cada vez. Solo la primera colocación auto-encuadra.
  // El botón "Mi ubicación" lo resetea para re-centrar al usar GPS.
  const hasCenteredRef = useRef(false);

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
      .bindPopup("Ubicacion de tu tienda — arrastralo para ajustar");

    markerRef.current.on("dragend", () => {
      const pos = markerRef.current!.getLatLng();
      onUbicacionSeleccionada(pos.lat, pos.lng);
      reverseGeocode(pos.lat, pos.lng);
    });

    if (!hasCenteredRef.current) {
      map.setView([lat, lng], 16);
      markerRef.current.openPopup();
      hasCenteredRef.current = true;
    }
    setTieneUbicacion(true);
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
      autoGpsTriggered.current = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (mapInstanceRef.current && L) {
            colocarMarcador(pos.coords.latitude, pos.coords.longitude, mapInstanceRef.current, L);
          }
        },
        () => { /* User denied — they can tap the map */ },
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
          // Acción explícita del usuario: permitir re-centrar.
          hasCenteredRef.current = false;
          colocarMarcador(pos.coords.latitude, pos.coords.longitude, mapInstanceRef.current, L);
        }
      },
      () => { setBuscandoGPS(false); alert("No pudimos obtener tu ubicacion. Toca el mapa donde esta tu tienda."); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="space-y-2">
      {!tieneUbicacion && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
          <p className="text-sm text-yellow-700">
            Toca el mapa o usa &quot;Mi ubicación&quot; para marcar el punto
          </p>
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className="w-full h-48 rounded-xl overflow-hidden border-2 border-gray-200 z-0" />

      {/* GPS button */}
      <button
        onClick={usarMiUbicacion}
        disabled={buscandoGPS}
        className="w-full bg-blue-500 text-white py-2.5 rounded-xl font-medium text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
      >
        {buscandoGPS ? "Buscando..." : <>📍 Mi ubicacion</>}
      </button>

    </div>
  );
}
