"use client";

import { useEffect, useRef, useState } from "react";

interface TiendaMarker {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  ubicacion: string | null;
  telefono: string | null;
  productos: number;
}

interface Props {
  tiendas: TiendaMarker[];
  onTiendaClick?: (tiendaId: string) => void;
  selectedId?: string | null;
}

export default function MapaTiendasAdmin({ tiendas, onTiendaClick, selectedId }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const [L, setL] = useState<typeof import("leaflet") | null>(null);

  useEffect(() => {
    import("leaflet").then((leaflet) => setL(leaflet.default));
  }, []);

  useEffect(() => {
    if (!L || !mapRef.current || tiendas.length === 0) return;

    // Clean up previous map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      markersRef.current = {};
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([tiendas[0].lat, tiendas[0].lng], 14);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    const bounds = L.latLngBounds([]);
    for (const tienda of tiendas) {
      const isSelected = tienda.id === selectedId;
      const icon = L.divIcon({
        html: `<div style="font-size:${isSelected ? 32 : 24}px;text-align:center;line-height:1;filter:${isSelected ? 'drop-shadow(0 0 6px #4f46e5)' : 'none'};">🏪</div>`,
        iconSize: [isSelected ? 36 : 28, isSelected ? 36 : 28],
        iconAnchor: [isSelected ? 18 : 14, isSelected ? 36 : 28],
        className: "",
      });

      const marker = L.marker([tienda.lat, tienda.lng], { icon }).addTo(map);
      markersRef.current[tienda.id] = marker;
      bounds.extend([tienda.lat, tienda.lng]);

      marker.on("click", () => {
        onTiendaClick?.(tienda.id);
      });
    }

    if (tiendas.length > 1) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current = {};
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L, tiendas]);

  // Update marker styles when selection changes (without recreating the map)
  useEffect(() => {
    if (!L) return;
    for (const tienda of tiendas) {
      const marker = markersRef.current[tienda.id];
      if (!marker) continue;
      const isSelected = tienda.id === selectedId;
      const icon = L.divIcon({
        html: `<div style="font-size:${isSelected ? 32 : 24}px;text-align:center;line-height:1;filter:${isSelected ? 'drop-shadow(0 0 6px #4f46e5)' : 'none'};">🏪</div>`,
        iconSize: [isSelected ? 36 : 28, isSelected ? 36 : 28],
        iconAnchor: [isSelected ? 18 : 14, isSelected ? 36 : 28],
        className: "",
      });
      marker.setIcon(icon);
    }
  }, [L, selectedId, tiendas]);

  return (
    <div className="relative z-0">
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
      />
      <div ref={mapRef} className="w-full h-52 rounded-xl overflow-hidden shadow-sm" style={{ zIndex: 0 }} />
    </div>
  );
}
