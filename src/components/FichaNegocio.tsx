"use client";

import { useMemo } from "react";
import type { MenuPuesto } from "@/lib/menu";
import type { PaletaMarca } from "@/lib/paletaMarca";
import { filasHorario, diaSemanaMX, linkMapa, LABEL_PAGO, LABEL_SERVICIO } from "@/lib/fichaNegocio";
import { telefonoWhatsApp, linkLlamada } from "@/lib/pedidoWhatsApp";
import { labelCiudad } from "@/lib/ciudades";

/**
 * Hoja "Información del negocio" del menú digital.
 *
 * Responde de una las cuatro preguntas que hoy llegan por WhatsApp antes de
 * cualquier pedido: a qué hora abren, dónde están, cómo se paga y si hay para
 * llevar. Todo el dato ya vivía en la base; sólo no se decía en ninguna parte.
 */
export default function FichaNegocio({ puesto, pal, onClose }: {
  puesto: MenuPuesto;
  pal: PaletaMarca;
  onClose: () => void;
}) {
  const hoy = useMemo(() => diaSemanaMX(), []);
  const filas = useMemo(() => filasHorario(puesto.horario, hoy), [puesto.horario, hoy]);
  const mapa = linkMapa(puesto.lat, puesto.lng, puesto.ubicacion);
  const wa = telefonoWhatsApp(puesto.telefono_contacto);
  const tel = linkLlamada(puesto.telefono_contacto);
  const direccion = puesto.ubicacion?.trim() || labelCiudad(puesto.ciudad);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Información de ${puesto.nombre}`}
    >
      <div
        className="bg-white rounded-t-[26px] sm:rounded-[26px] w-full sm:max-w-md max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-black/5 px-5 py-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-extrabold text-lg text-gray-900 truncate">{puesto.nombre}</h3>
            <p className="text-xs text-gray-400">Información del negocio</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 text-2xl leading-none -mt-0.5">×</button>
        </div>

        <div className="p-5 space-y-6">
          {/* Estado ahora — lo primero que se pregunta. */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-[13px] font-bold px-3 py-1.5 rounded-full ${puesto.abierto ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${puesto.abierto ? "bg-green-500" : "bg-red-500"}`} />
              {puesto.abierto ? "Abierto ahora" : "Cerrado ahora"}
            </span>
          </div>

          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Horario</h4>
            {filas.length === 0 ? (
              <p className="text-sm text-gray-500">
                Este negocio no publicó un horario. Si tienes duda, pregúntale antes de ir.
              </p>
            ) : (
              <div className="space-y-1">
                {filas.map((f) => (
                  <div
                    key={f.dias}
                    className={`flex items-baseline justify-between gap-3 text-sm ${f.hoy ? "font-bold text-gray-900" : "text-gray-600"}`}
                  >
                    <span>{f.dias}{f.hoy && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: pal.soft, color: pal.accentDark }}>HOY</span>}</span>
                    <span className="tabular-nums whitespace-nowrap">{f.horas}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {puesto.servicios_pedido && puesto.servicios_pedido.length > 0 && (
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Cómo puedes pedir</h4>
              <div className="flex flex-wrap gap-2">
                {puesto.servicios_pedido.map((s) => (
                  <span key={s} className="text-[13px] font-semibold px-3 py-1.5 rounded-full" style={{ backgroundColor: pal.soft, color: pal.accentDark }}>
                    {LABEL_SERVICIO[s] ?? s}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Formas de pago</h4>
            <div className="flex flex-wrap gap-2">
              {puesto.metodos_pago.map((m) => (
                <span key={m} className="text-[13px] font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-700">
                  {LABEL_PAGO[m] ?? m}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Dónde está</h4>
            <p className="text-sm text-gray-700 leading-snug">📍 {direccion}</p>
            {mapa && (
              <a
                href={mapa}
                target="_blank"
                rel="noreferrer"
                className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-full active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                style={{ backgroundColor: pal.accent, color: pal.on, boxShadow: `2px 2px 0 ${pal.shadow}` }}
              >
                Cómo llegar →
              </a>
            )}
          </section>

          {(wa || tel) && (
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Contacto</h4>
              <div className="flex flex-wrap gap-2">
                {wa && (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-bold px-4 py-2.5 rounded-full bg-[#25D366] text-white active:scale-95 transition-transform"
                  >
                    💬 WhatsApp
                  </a>
                )}
                {tel && (
                  <a href={tel} className="text-sm font-bold px-4 py-2.5 rounded-full bg-gray-100 text-gray-700 active:scale-95 transition-transform">
                    📞 Llamar
                  </a>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
