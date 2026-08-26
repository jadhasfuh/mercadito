"use client";

import { useEffect, useState } from "react";
import { FUNCIONES, type EstadoFunciones, type ClaveFuncion } from "@/lib/funciones";

/**
 * "Qué puedes hacer con Mercadito" — el centro de ayuda, dentro del panel.
 *
 * Es el equivalente honesto a las páginas de "ver más información" de la
 * competencia: en vez de vender lo que el producto hace, dice cuáles de esas
 * cosas TÚ ya estás usando y cuáles tienes ahí sin estrenar. Muchos negocios
 * pagan la suscripción sin saber que tienen mesas, comandas o meseros.
 */
export default function QuePuedesHacer({ onIr }: { onIr?: (clave: ClaveFuncion) => void }) {
  const [estado, setEstado] = useState<EstadoFunciones | null>(null);
  const [abierta, setAbierta] = useState<ClaveFuncion | null>(null);

  useEffect(() => {
    fetch("/api/tienda/funciones")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEstado(d ?? {}))
      .catch(() => setEstado({}));
  }, []);

  if (!estado) return <div className="text-center text-gray-400 py-10 text-sm">Cargando…</div>;

  // Las que no aplican al giro no se muestran: a un negocio de puras reservas
  // no le sirve leer sobre comandas de cocina.
  const visibles = FUNCIONES.filter((f) => estado[f.clave]?.aplica !== false);
  const sinUsar = visibles.filter((f) => !estado[f.clave]?.activado).length;

  return (
    <section className="bg-white rounded-2xl p-4 shadow-sm">
      <h3 className="font-bold text-gray-800">Qué puedes hacer con Mercadito</h3>
      <p className="text-[11px] text-gray-400 mt-0.5 mb-3">
        {sinUsar === 0
          ? "Estás usando todo lo que incluye tu plan."
          : `${sinUsar} ${sinUsar === 1 ? "función que tienes" : "funciones que tienes"} y no ${sinUsar === 1 ? "estás usando" : "estás usando"}.`}
      </p>

      <div className="space-y-2">
        {visibles.map((f) => {
          const activo = !!estado[f.clave]?.activado;
          const open = abierta === f.clave;
          return (
            <div key={f.clave} className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setAbierta(open ? null : f.clave)}
                aria-expanded={open}
                className="w-full flex items-center gap-3 px-3 py-3 text-left"
              >
                <span className="text-xl leading-none shrink-0">{f.icono}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-gray-800">{f.titulo}</span>
                  <span className="block text-[11.5px] text-gray-500 leading-snug">{f.para}</span>
                </span>
                <span
                  className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${
                    activo ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {activo ? "Activado" : "Sin usar"}
                </span>
              </button>

              {open && (
                <div className="px-3 pb-3 pt-1 bg-gray-50/60">
                  <ol className="space-y-1.5">
                    {f.pasos.map((paso, i) => (
                      <li key={paso} className="flex items-start gap-2.5 text-[12.5px] text-gray-700 leading-snug">
                        <span className="shrink-0 w-[18px] h-[18px] rounded-full bg-brand text-white grid place-items-center text-[10px] font-extrabold mt-px">
                          {i + 1}
                        </span>
                        <span>{paso}</span>
                      </li>
                    ))}
                  </ol>
                  {!activo && onIr && (
                    <button
                      onClick={() => onIr(f.clave)}
                      className="mt-3 w-full bg-brand text-white text-sm font-bold py-2.5 rounded-xl active:scale-[0.99] transition-transform"
                    >
                      {f.accion}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
