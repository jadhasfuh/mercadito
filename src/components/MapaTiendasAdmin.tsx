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
}

export default function MapaTiendasAdmin({ tiendas }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
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

    const icon = L.divIcon({
      html: '<div style="font-size:24px;text-align:center;line-height:1;">🏪</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      className: "",
    });

    const bounds = L.latLngBounds([]);
    for (const tienda of tiendas) {
      const marker = L.marker([tienda.lat, tienda.lng], { icon }).addTo(map);
      bounds.extend([tienda.lat, tienda.lng]);

      const tel = tienda.telefono?.replace(/\D/g, "") || "";
      const waLink = tel ? `<a href="https://wa.me/52${tel}" target="_blank" style="color:#059669;font-weight:bold;">WhatsApp</a>` : "";
      const callLink = tel ? `<a href="tel:${tel}" style="color:#2563eb;font-weight:bold;margin-left:8px;">Llamar</a>` : "";

      marker.bindPopup(
        `<div style="min-width:150px;">
          <strong>${tienda.nombre}</strong><br/>
          <span style="font-size:12px;color:#666;">${tienda.ubicacion || ""}</span><br/>
          <span style="font-size:12px;color:#059669;">${tienda.productos} productos</span><br/>
          ${waLink}${callLink}
        </div>`
      );
    }

    if (tiendas.length > 1) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [L, tiendas]);

  return (
    <div>
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
      />
      <div ref={mapRef} className="w-full h-64 rounded-xl overflow-hidden shadow-sm" />
    </div>
  );
}
