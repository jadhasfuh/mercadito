"use client";

import { useEffect, useState } from "react";
import { fechaHoraMX } from "@/lib/fecha";

// Resumen del admin SIN delivery: en vez de ventas, comisiones y envíos, lo
// que importa es quién paga, quién está por vencer y cuánto entra al mes.
// El resumen de la época de delivery sigue en admin/page.tsx y vuelve solo
// si se prende DELIVERY_ACTIVO.

interface Panel {
  suscripciones: { pagando: number; prueba: number; vencidos: number; por_vencer: number };
  negocios: { total: number; con_menu: number; sin_whatsapp: number };
  usuarios: { clientes: number; tiendas: number; nuevos_semana: number };
  actividad: { vistas: number; pedidos: number };
  ingreso_mensual: number;
  ingreso_potencial: number;
  precio_mensual: number;
  por_vencer: { id: string; nombre: string; hasta: string; plan: string; dias: number }[];
  top_menus: { id: string; nombre: string; vistas: number; pedidos: number }[];
}

const money = (n: number) => `$${n.toLocaleString("es-MX")}`;

function Tarjeta({ valor, etiqueta, nota, tono }: {
  valor: string; etiqueta: string; nota?: string; tono?: "bien" | "alerta" | "neutro";
}) {
  const color = tono === "bien" ? "text-emerald-700" : tono === "alerta" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="bg-white rounded-2xl p-4 ring-1 ring-gray-100 shadow-[var(--shadow-card)]">
      <p className={`text-2xl font-black tabular-nums ${color}`}>{valor}</p>
      <p className="text-[11px] font-semibold text-gray-500 leading-tight mt-0.5">{etiqueta}</p>
      {nota && <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{nota}</p>}
    </div>
  );
}

export default function AdminResumenMenus() {
  const [d, setD] = useState<Panel | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/panel")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-center text-gray-400 py-10 text-sm">No se pudo cargar el resumen.</p>;
  if (!d) return <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>;

  return (
    <div className="mt-4 space-y-4">
      {/* Dinero primero: es la pregunta que se contesta al abrir el panel. */}
      <div className="grid grid-cols-2 gap-2.5">
        <Tarjeta
          valor={money(d.ingreso_mensual)}
          etiqueta="Al mes, hoy"
          nota={`${d.suscripciones.pagando} pagando × ${money(d.precio_mensual)}`}
          tono="bien"
        />
        <Tarjeta
          valor={money(d.ingreso_potencial)}
          etiqueta="Si convierten las pruebas"
          nota={`+${d.suscripciones.prueba} en prueba`}
        />
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Tarjeta valor={String(d.suscripciones.pagando)} etiqueta="Pagando" tono="bien" />
        <Tarjeta valor={String(d.suscripciones.prueba)} etiqueta="En prueba" />
        <Tarjeta
          valor={String(d.suscripciones.vencidos)}
          etiqueta="Vencidos"
          tono={d.suscripciones.vencidos > 0 ? "alerta" : "neutro"}
        />
      </div>

      {/* A quién cobrarle. Es la acción del panel, no un dato de adorno. */}
      {d.por_vencer.length > 0 && (
        <div className="bg-white rounded-2xl p-4 ring-1 ring-gray-100">
          <h3 className="font-bold text-gray-800 text-sm mb-2">
            Vencen pronto <span className="text-gray-400 font-normal">({d.por_vencer.length})</span>
          </h3>
          <div className="space-y-1.5">
            {d.por_vencer.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-700 truncate flex-1 min-w-0">{p.nombre}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  p.dias <= 3 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                }`}>
                  {p.dias === 0 ? "hoy" : p.dias === 1 ? "1 día" : `${p.dias} días`}
                </span>
                <span className="text-[10px] text-gray-400 w-14 text-right">
                  {p.plan === "pro" ? "Pro" : "prueba"}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Cobra antes de la fecha o pierden acceso a mesas y reservas.
          </p>
        </div>
      )}

      {/* Negocios y usuarios */}
      <div className="grid grid-cols-3 gap-2.5">
        <Tarjeta valor={String(d.negocios.con_menu)} etiqueta="Con menú publicado" nota={`de ${d.negocios.total}`} />
        <Tarjeta valor={String(d.usuarios.clientes)} etiqueta="Clientes" />
        <Tarjeta valor={String(d.usuarios.nuevos_semana)} etiqueta="Nuevos esta semana" />
      </div>

      {/* Sin WhatsApp = su menú se ve pero no puede recibir pedidos. Es el
          problema más caro que puede tener un negocio aquí, así que se avisa
          en vez de esconderlo en una consulta. */}
      {d.negocios.sin_whatsapp > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
          <p className="text-sm font-bold text-amber-900">
            {d.negocios.sin_whatsapp} {d.negocios.sin_whatsapp === 1 ? "negocio" : "negocios"} sin WhatsApp
          </p>
          <p className="text-[12px] text-amber-800 leading-snug mt-0.5">
            Su menú se ve, pero nadie les puede mandar un pedido. Pídeles un número con WhatsApp.
          </p>
        </div>
      )}

      {/* Actividad: reemplaza a las ventas del panel viejo. */}
      <div className="grid grid-cols-2 gap-2.5">
        <Tarjeta valor={d.actividad.vistas.toLocaleString("es-MX")} etiqueta="Vistas de menú" nota="acumulado" />
        <Tarjeta valor={d.actividad.pedidos.toLocaleString("es-MX")} etiqueta="Pedidos generados" nota="acumulado" />
      </div>

      {d.top_menus.length > 0 && (
        <div className="bg-white rounded-2xl p-4 ring-1 ring-gray-100">
          <h3 className="font-bold text-gray-800 text-sm mb-2">Menús más vistos</h3>
          <div className="space-y-1.5">
            {d.top_menus.map((m, i) => (
              <div key={m.id} className="flex items-center gap-2 text-sm">
                <span className="text-gray-300 font-bold w-4 tabular-nums">{i + 1}</span>
                <span className="text-gray-700 truncate flex-1 min-w-0">{m.nombre}</span>
                <span className="text-gray-500 tabular-nums text-[12px]">{m.vistas} vistas</span>
                {m.pedidos > 0 && (
                  <span className="text-emerald-700 font-semibold tabular-nums text-[12px]">{m.pedidos} ped.</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-center">
        Actualizado {fechaHoraMX(new Date().toISOString(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}
