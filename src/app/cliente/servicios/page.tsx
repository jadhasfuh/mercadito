"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import SearchBar from "@/components/SearchBar";
import CitasShell from "@/components/CitasShell";
import { DELIVERY_ACTIVO } from "@/lib/flags";

const MapaTiendas = dynamic(() => import("@/components/MapaTiendasAdmin"), { ssr: false });

interface Negocio {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  lat: number | null;
  lng: number | null;
  logo: string | null;
  telefono_contacto: string | null;
  tipo: string;
  categoria_servicio: string | null;
  abierto_ahora: boolean;
  n_servicios: string | number;
  desde_precio: string | number | null;
}

// Categorías de servicios (icono + nombre). Espejo de mobile CATEGORIAS_SERVICIOS.
const CATS: Record<string, { nombre: string; emoji: string }> = {
  peluqueria: { nombre: "Peluquería", emoji: "💇" },
  barberia: { nombre: "Barbería", emoji: "💈" },
  unas: { nombre: "Uñas y Estética", emoji: "💅" },
  spa: { nombre: "Spa y Masajes", emoji: "💆" },
  dentista: { nombre: "Dentista", emoji: "🦷" },
  doctor: { nombre: "Consultorio Médico", emoji: "🩺" },
  dermatologo: { nombre: "Dermatólogo", emoji: "🧴" },
  veterinaria: { nombre: "Veterinaria", emoji: "🐾" },
  restaurante: { nombre: "Reservar mesa", emoji: "🍽️" },
  cafe: { nombre: "Reservar mesa", emoji: "🍽️" },
  otros: { nombre: "Otros Servicios", emoji: "📅" },
};
function catInfo(id: string | null) {
  if (id && CATS[id]) return CATS[id];
  const nombre = (id ?? "otros").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { nombre, emoji: "📅" };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Cache de negocios a nivel de módulo (mismo patrón que el catálogo): al
// volver a Citas se reusa al instante y se revalida en segundo plano.
let _negociosCache: Negocio[] | null = null;

export default function ServiciosLandingPage() {
  const router = useRouter();
  const [negocios, setNegocios] = useState<Negocio[]>(_negociosCache ?? []);
  const [loading, setLoading] = useState(!_negociosCache);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [soloAbierto, setSoloAbierto] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    fetch("/api/negocios")
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d) ? d : [];
        setNegocios(arr);
        _negociosCache = arr;
      })
      .catch(() => setNegocios((prev) => prev))
      .finally(() => setLoading(false));
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, []);

  const q = busqueda.trim().toLowerCase();

  const categorias = useMemo(() => {
    const set = new Set<string>();
    negocios.forEach((n) => set.add(n.categoria_servicio || "otros"));
    return Array.from(set);
  }, [negocios]);

  const lista = useMemo(() => {
    let arr = negocios.slice();
    if (q) {
      arr = arr.filter(
        (n) => n.nombre.toLowerCase().includes(q) || catInfo(n.categoria_servicio).nombre.toLowerCase().includes(q)
      );
    } else if (categoria) {
      arr = arr.filter((n) => (n.categoria_servicio || "otros") === categoria);
    }
    if (soloAbierto) arr = arr.filter((n) => n.abierto_ahora);
    if (coords) {
      arr.sort((a, b) => {
        const da = a.lat != null && a.lng != null ? haversineKm(coords.lat, coords.lng, a.lat, a.lng) : Infinity;
        const db = b.lat != null && b.lng != null ? haversineKm(coords.lat, coords.lng, b.lat, b.lng) : Infinity;
        return da - db;
      });
    }
    return arr;
  }, [negocios, q, categoria, soloAbierto, coords]);

  const mostrarLista = !!q || !!categoria;

  return (
    <CitasShell active="inicio">
      <main className="max-w-lg mx-auto w-full px-4 pb-24 pt-4">
        {/* Búsqueda primero (misma posición que en Mercadito), luego el switch */}
        <div className="mb-4">
          <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Buscar negocio o servicio…" />
        </div>

        {/* Switch Menús ↔ Citas. Sin delivery el otro lado es el directorio
            de menús, no /cliente — esa está bloqueada (ver lib/flags). */}
        <div className="flex bg-gray-100 rounded-full p-1 gap-1 mb-4">
          <Link
            href={DELIVERY_ACTIVO ? "/cliente" : "/menus"}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-gray-600 text-sm font-semibold transition-soft"
          >
            {DELIVERY_ACTIVO ? "🛒 Mercadito" : "🍽️ Menús"}
          </Link>
          <span className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-serv text-white text-sm font-semibold shadow-sm">
            📅 Reservas
          </span>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-16">Cargando…</div>
        ) : negocios.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-3">📅</div>
            Aún no hay negocios de reservas en tu zona.
          </div>
        ) : !mostrarLista ? (
          /* ── Categorías ── */
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-3">¿Qué necesitas?</h2>
            <div className="grid grid-cols-3 gap-2.5">
              {categorias.map((id) => {
                const info = catInfo(id);
                return (
                  <button
                    key={id}
                    onClick={() => setCategoria(id)}
                    className="aspect-square bg-serv-bg rounded-2xl flex flex-col items-center justify-center gap-1.5 px-1.5 active:scale-[0.97] transition-soft"
                  >
                    <span className="text-3xl">{info.emoji}</span>
                    <span className="text-[11px] text-serv-dark text-center leading-tight">{info.nombre}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          /* ── Lista (categoría o búsqueda) ── */
          <>
            <div className="flex items-center gap-3 mb-3">
              {q ? (
                <h2 className="text-lg font-bold text-gray-900 flex-1 truncate">Resultados</h2>
              ) : (
                <button onClick={() => setCategoria(null)} className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="text-2xl leading-none text-gray-800">‹</span>
                  <span className="text-lg font-bold text-gray-900 truncate">{catInfo(categoria).nombre}</span>
                </button>
              )}
              <button
                onClick={() => setSoloAbierto((v) => !v)}
                className={`flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1.5 border-2 ${
                  soloAbierto ? "bg-serv border-serv text-white" : "border-serv text-serv"
                }`}
              >
                🕐 Abierto
              </button>
            </div>

            {/* Mapa de negocios */}
            {lista.some((n) => n.lat != null && n.lng != null) && (
              <div className="mb-3">
                <p className="text-xs text-gray-400 mb-1.5">Ubicación de los negocios:</p>
                <MapaTiendas
                  tiendas={lista
                    .filter((n) => n.lat != null && n.lng != null)
                    .map((n) => ({
                      id: n.id,
                      nombre: n.nombre,
                      lat: n.lat!,
                      lng: n.lng!,
                      ubicacion: n.ubicacion,
                      telefono: null,
                      productos: Number(n.n_servicios) || 0,
                    }))}
                  onTiendaClick={(id) => router.push(`/negocio/${id}`)}
                />
              </div>
            )}

            {lista.length === 0 ? (
              <div className="text-gray-500 py-6">No hay negocios que coincidan.</div>
            ) : (
              <div className="space-y-3">
                {lista.map((n) => {
                  const nServ = Number(n.n_servicios) || 0;
                  const desde = n.desde_precio != null ? Number(n.desde_precio) : null;
                  const km = coords && n.lat != null && n.lng != null ? haversineKm(coords.lat, coords.lng, n.lat, n.lng) : null;
                  return (
                    <Link
                      key={n.id}
                      href={`/negocio/${n.id}`}
                      className="flex items-center gap-3 bg-white rounded-2xl p-3 shadow-[var(--shadow-card)] active:scale-[0.99] transition-soft"
                    >
                      <div className="w-14 h-14 rounded-xl bg-serv-light flex items-center justify-center overflow-hidden shrink-0 text-2xl">
                        {n.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={n.logo} alt={n.nombre} className="w-14 h-14 object-cover" />
                        ) : (
                          "💈"
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-900 truncate">{n.nombre}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${n.abierto_ahora ? "bg-accent" : "bg-gray-400"}`} />
                          <span className={`text-[11px] ${n.abierto_ahora ? "text-accent-dark" : "text-gray-500"}`}>
                            {n.abierto_ahora ? "Abierto" : "Cerrado"}
                          </span>
                        </div>
                        {n.ubicacion && <div className="text-xs text-gray-500 truncate mt-0.5">📍 {n.ubicacion}</div>}
                        <div className="text-xs text-serv mt-1">
                          {nServ} {nServ === 1 ? "servicio" : "servicios"}
                          {desde != null && ` · desde $${desde}`}
                          {km != null && ` · ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}`}
                        </div>
                      </div>
                      <span className="text-gray-300 text-xl">›</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </CitasShell>
  );
}
