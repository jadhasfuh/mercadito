"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

interface Negocio {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  logo: string | null;
  telefono_contacto: string | null;
  tipo: string;
}
interface Servicio {
  id: string;
  nombre: string;
  descripcion: string | null;
  duracion_min: number;
  precio: string | number | null;
  activo: boolean;
}

export default function NegocioPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch("/api/negocios").then((r) => r.json()),
      fetch(`/api/servicios?puesto_id=${id}`).then((r) => r.json()),
    ])
      .then(([negs, servs]) => {
        setNegocio(Array.isArray(negs) ? negs.find((n: Negocio) => n.id === id) ?? null : null);
        setServicios(Array.isArray(servs) ? servs.filter((s: Servicio) => s.activo) : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-serv text-white sticky top-0 z-20 shadow-[var(--shadow-card)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-2xl leading-none -ml-1" aria-label="Atrás">
            ‹
          </button>
          <h1 className="text-lg font-bold flex-1 truncate">{negocio?.nombre ?? "Negocio"}</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto w-full px-4 pb-24 pt-4">
        {loading ? (
          <div className="text-center text-gray-400 py-16">Cargando…</div>
        ) : (
          <>
            {/* Info */}
            <div className="flex gap-3 bg-white rounded-2xl p-4 shadow-[var(--shadow-card)] mb-5">
              <div className="w-16 h-16 rounded-2xl bg-serv-light flex items-center justify-center overflow-hidden shrink-0 text-3xl">
                {negocio?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={negocio.logo} alt={negocio.nombre} className="w-16 h-16 object-cover" />
                ) : (
                  "💈"
                )}
              </div>
              <div className="flex-1 min-w-0">
                {negocio?.ubicacion && <div className="text-sm text-gray-500">📍 {negocio.ubicacion}</div>}
                {negocio?.descripcion && <div className="text-sm text-gray-600 mt-1">{negocio.descripcion}</div>}
              </div>
            </div>

            {/* Un solo botón: el flujo deja elegir cuántas personas y el servicio de cada una */}
            {servicios.length > 0 && (
              <Link
                href={`/agendar/${id}`}
                className="flex items-center justify-center gap-2 bg-serv text-white font-semibold rounded-2xl py-3.5 mb-5"
              >
                📅 Agendar reserva
              </Link>
            )}

            <h2 className="text-lg font-bold text-gray-800 mb-3">Servicios</h2>
            {servicios.length === 0 ? (
              <div className="text-gray-500 py-6">Este negocio aún no publicó servicios.</div>
            ) : (
              <div className="space-y-3">
                {servicios.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-[var(--shadow-card)]">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900">{s.nombre}</div>
                      {s.descripcion && <div className="text-xs text-gray-500 mt-0.5">{s.descripcion}</div>}
                      <div className="text-xs text-gray-500 mt-1.5 flex items-center gap-2">
                        <span>⏱ {s.duracion_min} min</span>
                        {s.precio != null ? (
                          <span className="text-serv font-bold text-sm">${Number(s.precio)}</span>
                        ) : (
                          <span>· a consultar</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
