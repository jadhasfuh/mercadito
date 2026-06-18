"use client";
import { useEffect } from "react";
import type { Pedido } from "@/lib/types";
import { fechaHoraMX } from "@/lib/fecha";

interface Props {
  pedido: Pedido & {
    repartidor_nombre?: string;
    repartidor_telefono?: string;
    repartidor_default?: { nombre: string; telefono: string } | null;
    metodo_pago?: string;
    recargo_tarjeta?: number;
    pago_validado_at?: string | null;
    motivo_cancelacion?: string | null;
    items: {
      id: string;
      producto_nombre?: string;
      puesto_nombre?: string;
      unidad?: string;
      cantidad: number;
      precio_unitario: number;
      subtotal: number;
      comision?: number;
      manual?: boolean;
      variante_nombre?: string | null;
      modificadores?: { modificador_nombre: string; opcion_nombre: string }[] | null;
    }[];
  };
  onClose: () => void;
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_compra: "En compra",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia / DiMo",
};

/**
 * Ticket estilo recibo: tipografía mono, líneas punteadas como un comprobante
 * de impresora térmica. Pensado para que el cliente pueda imprimir o tomar
 * captura y compartir con quien lo necesite (familia que paga, etc.).
 */
export default function TicketPedido({ pedido, onClose }: Props) {
  // Bloquear scroll del body mientras está abierto el modal.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const fecha = fechaHoraMX(pedido.created_at, {
    dateStyle: "long",
    timeStyle: "short",
  });
  const idCorto = `#${pedido.id.slice(0, 8).toUpperCase()}`;
  const servicio = pedido.items.reduce(
    (s, it) => s + it.cantidad * (Number(it.comision) || 0), 0
  );
  const recargo = Number(pedido.recargo_tarjeta) || 0;

  function imprimir() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0 print:block">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl print:max-h-none print:shadow-none print:rounded-none print:max-w-full">
        {/* Header con logo + close */}
        <div className="flex items-center justify-between p-4 border-b border-dashed border-gray-300 print:border-solid">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Mercadito" className="h-10 w-10 rounded-lg" />
            <div>
              <p className="font-black text-brand-dark">Mercadito</p>
              <p className="text-[10px] text-gray-400 leading-tight">Sahuayo · Jiquilpan · V. Carranza</p>
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={imprimir}
              className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full font-medium hover:bg-gray-200"
            >
              🖨️ Imprimir
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>

        {/* Cuerpo del ticket */}
        <div className="p-5 font-mono text-sm text-gray-800 space-y-4">
          <div className="text-center">
            <p className="text-xs text-gray-500">TICKET DE PEDIDO</p>
            <p className="text-2xl font-black tracking-wider mt-1">{idCorto}</p>
            <p className="text-xs text-gray-500 mt-1">{fecha}</p>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              <span className="inline-block bg-gray-100 px-2 py-0.5 rounded text-[11px] font-bold uppercase">
                {ESTADO_LABEL[pedido.estado] ?? pedido.estado}
              </span>
              {pedido.agendado_para && pedido.estado !== "cancelado" && (
                <span className="inline-block bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[11px] font-bold">
                  📅 {fechaHoraMX(pedido.agendado_para, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </p>
          </div>

          <div className="border-t border-dashed border-gray-300" />

          {/* Cliente / entrega */}
          <div className="space-y-1 text-xs">
            <Linea k="Cliente" v={pedido.cliente_nombre} />
            <Linea k="Tel" v={pedido.cliente_telefono} />
            <Linea k="Entrega en" v={pedido.direccion_entrega} truncate />
          </div>

          {/* Repartidor: el asignado al pedido si existe; si no, el "de turno"
              del sistema, para que el cliente sepa con quién comunicarse desde
              el momento de la compra. */}
          {(() => {
            const nombre = pedido.repartidor_nombre || pedido.repartidor_default?.nombre;
            const tel = pedido.repartidor_telefono || pedido.repartidor_default?.telefono;
            if (!nombre) return null;
            const telLimpio = (tel || "").replace(/\D/g, "");
            const sinAsignar = !pedido.repartidor_nombre;
            return (
              <>
                <div className="border-t border-dashed border-gray-300" />
                <div className="bg-amber-50 rounded-lg p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">
                    🛵 Tu repartidor{sinAsignar ? " (de turno)" : ""}
                  </p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{nombre}</p>
                  {tel && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-600">📱 {tel}</span>
                      <a
                        href={`https://wa.me/52${telLimpio}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium"
                      >
                        WhatsApp
                      </a>
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          <div className="border-t border-dashed border-gray-300" />

          {/* Items */}
          <div className="space-y-2">
            {pedido.items.map((it) => {
              const extras = [
                it.variante_nombre,
                ...(it.modificadores ?? []).map((m) => `${m.modificador_nombre}: ${m.opcion_nombre}`),
              ].filter(Boolean).join(" · ");
              return (
                <div key={it.id} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate">
                        {it.producto_nombre ?? "Producto"}
                        {it.manual && <span className="ml-1 text-[9px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded-full font-medium">✏️ Sustitución</span>}
                      </p>
                      {extras && <p className="text-[10px] text-brand-dark">{extras}</p>}
                      <p className="text-[10px] text-gray-500">
                        {it.cantidad} {it.unidad ?? ""} × ${Number(it.precio_unitario).toFixed(2)}{it.puesto_nombre ? ` · ${it.puesto_nombre}` : ""}
                      </p>
                    </div>
                    <p className="font-bold tabular-nums whitespace-nowrap">
                      ${Number(it.subtotal).toFixed(2)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-dashed border-gray-300" />

          {/* Totales */}
          <div className="space-y-1 text-xs">
            <Linea k="Subtotal productos" v={`$${Number(pedido.subtotal).toFixed(2)}`} />
            {servicio > 0 && <Linea k="Servicio Mercadito" v={`$${servicio.toFixed(2)}`} />}
            <Linea k="Envío" v={`$${Number(pedido.costo_envio).toFixed(2)}`} />
            {recargo > 0 && <Linea k="Recargo tarjeta" v={`$${recargo.toFixed(2)}`} />}
          </div>

          <div className="border-t border-dashed border-gray-400" />

          <div className="flex justify-between items-baseline">
            <span className="text-base font-bold">TOTAL</span>
            <span className="text-2xl font-black text-brand-dark tabular-nums">
              ${Number(pedido.total).toFixed(2)}
            </span>
          </div>

          {pedido.metodo_pago && (
            <div className="text-xs">
              <Linea k="Pago" v={METODO_LABEL[pedido.metodo_pago] ?? pedido.metodo_pago} />
              {pedido.metodo_pago === "transferencia" && (
                <Linea
                  k="Estado pago"
                  v={pedido.pago_validado_at ? "✓ Validado" : "⏳ En validación"}
                />
              )}
            </div>
          )}

          {pedido.notas && (
            <>
              <div className="border-t border-dashed border-gray-300" />
              <div className="text-xs">
                <p className="text-gray-500 mb-1">Notas:</p>
                <p className="text-gray-800">{pedido.notas}</p>
              </div>
            </>
          )}

          {pedido.estado === "cancelado" && pedido.motivo_cancelacion && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
              <p className="font-bold mb-0.5">Pedido cancelado</p>
              <p>{pedido.motivo_cancelacion}</p>
            </div>
          )}

          {/* Pie */}
          <div className="border-t border-dashed border-gray-300 pt-3 text-center text-[10px] text-gray-400 leading-snug">
            <p>Gracias por usar Mercadito 🛵</p>
            <p>mercadito.cx · Pedidos a domicilio en tu pueblo</p>
            <p className="mt-1">Conserva este ticket — referencia {idCorto}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Linea({ k, v, truncate }: { k: string; v: string; truncate?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500 shrink-0">{k}</span>
      <span className={`text-right ${truncate ? "truncate" : ""}`}>{v}</span>
    </div>
  );
}
