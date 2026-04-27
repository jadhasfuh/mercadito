"use client";

import { useEffect, useRef, useState } from "react";

export interface Parada {
  lat: number;
  lng: number;
  nombre: string;
}

interface Props {
  /** Punto de entrega final (cliente). */
  lat: number;
  lng: number;
  direccion: string;
  /** Tiendas a visitar antes de la entrega. Si se pasa `origen`, se
   *  reordenan por vecino más cercano. Sin `origen`, se respeta el
   *  orden recibido. */
  paradas?: Parada[];
  /** Ubicación del repartidor. Si se pasa, la ruta arranca aquí y las
   *  paradas se reordenan por cercanía al punto anterior (NN). */
  origen?: { lat: number; lng: number } | null;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Vecino más cercano: heurística simple para 2-6 paradas. No óptimo pero
 *  consistente y rápido. Suficiente para Sahuayo. */
function ordenarPorCercania(origen: { lat: number; lng: number }, paradas: Parada[]): Parada[] {
  const restantes = [...paradas];
  const out: Parada[] = [];
  let actual = { lat: origen.lat, lng: origen.lng };
  while (restantes.length > 0) {
    let minI = 0;
    let minD = haversineKm(actual, restantes[0]);
    for (let i = 1; i < restantes.length; i++) {
      const d = haversineKm(actual, restantes[i]);
      if (d < minD) { minD = d; minI = i; }
    }
    const p = restantes.splice(minI, 1)[0];
    out.push(p);
    actual = { lat: p.lat, lng: p.lng };
  }
  return out;
}

/**
 * Mapa del pedido. Muestra el destino del cliente y, si vienen `paradas`,
 * también las tiendas que el repartidor debe visitar y una polilínea simple
 * que une todo en el orden dado. El mapa está deshabilitado a la
 * interacción para que el card del repartidor sea scrolleable sin
 * "atrapar" el dedo. El botón "Abrir en Google Maps" arma una ruta con
 * todas las paradas como waypoints.
 */
export default function MapaPedido({ lat, lng, direccion, paradas, origen }: Props) {
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
    });
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    const tiendasRaw = (paradas ?? []).filter((p) => p.lat != null && p.lng != null);
    // Si hay ubicación del repartidor, ordenamos por vecino más cercano —
    // así el primer marcador es el más cerca del repartidor, el segundo el
    // más cerca de ese, etc. Sin origen, respetamos el orden de aparición.
    const tiendas = origen
      ? ordenarPorCercania(origen, tiendasRaw)
      : tiendasRaw;

    // Marcador del repartidor (origen).
    if (origen) {
      const repIcon = L.divIcon({
        html: '<div style="font-size:24px;text-align:center;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4));">🛵</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        className: "",
      });
      L.marker([origen.lat, origen.lng], { icon: repIcon }).addTo(map).bindPopup("Tu ubicación");
    }

    // Marcadores de tiendas (numerados) — orden: primer tienda → última.
    tiendas.forEach((p, i) => {
      const icon = L.divIcon({
        html: `<div style="background:#FF7A2B;color:#fff;font-weight:700;font-size:13px;width:26px;height:26px;border-radius:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.3);border:2px solid #fff;">${i + 1}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        className: "",
      });
      L.marker([p.lat, p.lng], { icon }).addTo(map).bindPopup(`🏪 ${p.nombre}`);
    });

    // Marcador de destino (cliente).
    const destinoIcon = L.divIcon({
      html: '<div style="font-size:28px;text-align:center;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4));">📍</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      className: "",
    });
    L.marker([lat, lng], { icon: destinoIcon }).addTo(map).bindPopup(direccion);

    // Polilínea: origen → tiendas → destino. Estilo punteado simple.
    const puntos: [number, number][] = [
      ...(origen ? [[origen.lat, origen.lng] as [number, number]] : []),
      ...tiendas.map((p) => [p.lat, p.lng] as [number, number]),
      [lat, lng] as [number, number],
    ];
    if (puntos.length >= 2) {
      L.polyline(puntos, { color: "#FF7A2B", weight: 3, opacity: 0.7, dashArray: "6, 8" }).addTo(map);
    }

    // Encuadrar todos los puntos.
    if (puntos.length > 1) {
      const bounds = L.latLngBounds(puntos);
      map.fitBounds(bounds, { padding: [22, 22] });
    } else {
      map.setView([lat, lng], 16);
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [L, lat, lng, direccion, paradas]);

  // URL para Google Maps. Si hay paradas, las pasamos como waypoints en orden
  // (reordenadas por NN si hay origen). Si hay origen, lo incluimos como
  // origin= así Google empieza la ruta desde donde está el repartidor.
  const mapsUrl = (() => {
    const tiendasRaw = (paradas ?? []).filter((p) => p.lat != null && p.lng != null);
    const tiendas = origen ? ordenarPorCercania(origen, tiendasRaw) : tiendasRaw;
    const params = [`api=1`, `destination=${lat},${lng}`, `travelmode=driving`];
    if (origen) params.push(`origin=${origen.lat},${origen.lng}`);
    if (tiendas.length > 0) {
      const waypoints = tiendas.map((p) => `${p.lat},${p.lng}`).join("|");
      params.push(`waypoints=${encodeURIComponent(waypoints)}`);
    }
    return `https://www.google.com/maps/dir/?${params.join("&")}`;
  })();

  return (
    <div className="mt-2 mb-2">
      <div ref={mapRef} className="w-full h-40 rounded-lg overflow-hidden border border-gray-200 relative z-0" />
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center text-xs text-blue-600 mt-1 font-medium"
      >
        🧭 Abrir ruta completa en Google Maps
      </a>
    </div>
  );
}
