"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  lat: number;
  lng: number;
  direccion: string;
}

export default function MapaPedido({ lat, lng, direccion }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);

  useEffect(() => {
    import("leaflet").then((leaflet) => setL(leaflet.default));
  }, []);

  useEffect(() => {
    if (!L || !mapRef.current || mapInstanceRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    }).setView([lat, lng], 16);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    const icon = L.divIcon({
      html: '<div style="font-size:24px;text-align:center;line-height:1;">📍</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      className: "",
    });

    L.marker([lat, lng], { icon })
      .addTo(map)
      .bindPopup(direccion);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [L, lat, lng, direccion]);

  return (
    <div className="mt-2 mb-2">
      <div ref={mapRef} className="w-full h-32 rounded-lg overflow-hidden border border-gray-200" />
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center text-xs text-blue-600 mt-1 font-medium"
      >
        Abrir en Google Maps
      </a>
    </div>
  );
}
