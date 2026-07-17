"use client";

import type { PedidoConItems } from "@/lib/types";

/**
 * Desglose de precios de un pedido para cards de repartidor/admin/historial.
 * Calcula servicio (suma de comisiones) desde los items; el resto viene del
 * pedido. Mantener consistente con el desglose que ve el cliente al comprar.
 */
export default function PedidoDesglose({
  pedido,
  compact = false,
}: {
  pedido: PedidoConItems;
  compact?: boolean;
}) {
  // Para pedidos B2B (envío solicitado por una tienda) no hay items —
  // el subtotal se guarda directo en pedidos.subtotal y representa el
  // monto del pedido del restaurante. Para pedidos catálogo sumamos los
  // items como hasta hoy. Para mandados tampoco hay items: el desglose sale
  // de monto_mandado (compra que adelanta el repartidor) + destino_monto.
  const esB2B = pedido.tipo === "envio" && pedido.solicitado_por_tienda_id != null;
  const esMandado = pedido.es_mandado === true;
  const montoMandado = esMandado ? Number(pedido.monto_mandado) || 0 : 0;
  const destinoMonto = esMandado ? Number(pedido.destino_monto) || 0 : 0;
  const subtotal = esB2B ? Number(pedido.subtotal) : pedido.items.reduce((s, it) => s + Number(it.subtotal), 0);
  const servicio = pedido.items.reduce((s, it) => s + Number(it.cantidad) * (Number(it.comision) || 0), 0);
  const envio = Number(pedido.costo_envio);
  const recargo = Number(pedido.recargo_tarjeta) || 0;
  const total = Number(pedido.total);
  const envioPagaTienda = pedido.envio_pagado_por === "tienda";

  const textSize = compact ? "text-xs" : "text-sm";
  const labelColor = "text-gray-500";

  const metodoLabel =
    pedido.metodo_pago === "tarjeta" ? "💳 Tarjeta" :
    pedido.metodo_pago === "transferencia" ? "🏦 Transferencia" :
    "💵 Efectivo";

  return (
    <div className={`bg-gray-50 rounded-lg p-3 space-y-1 ${textSize}`}>
      {esMandado ? (
        <>
          {montoMandado > 0 && (
            <div className="flex justify-between">
              <span className={labelColor}>Compra adelantada (repone el cliente)</span>
              <span className="text-gray-700">${montoMandado.toFixed(2)}</span>
            </div>
          )}
          {destinoMonto > 0 && (
            <div className="flex justify-between">
              <span className={labelColor}>Monto en destino</span>
              <span className="text-gray-700">${destinoMonto.toFixed(2)}</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex justify-between">
          <span className={labelColor}>{esB2B ? "Pedido del restaurante" : "Productos"}</span>
          <span className="text-gray-700">${subtotal.toFixed(2)}</span>
        </div>
      )}
      {servicio > 0 && (
        <div className="flex justify-between">
          <span className={labelColor}>Servicio Mercadito</span>
          <span className="text-gray-700">${servicio.toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className={labelColor}>
          Envío{esB2B && envioPagaTienda ? " (absorbe la tienda)" : esB2B ? " (paga el cliente)" : ""}
        </span>
        <span className={esB2B && envioPagaTienda ? "text-gray-400" : "text-gray-700"}>
          ${envio.toFixed(2)}
        </span>
      </div>
      {recargo > 0 && (
        <div className="flex justify-between">
          <span className={labelColor}>Recargo tarjeta</span>
          <span className="text-gray-700">${recargo.toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
        <span className="font-bold text-gray-800">{esB2B ? "Cobrar al cliente" : "Total"}</span>
        <span className="font-bold text-navy">${total.toFixed(2)}</span>
      </div>
      {esMandado && pedido.metodo_pago === "transferencia" && (
        <p className="text-[10px] font-bold text-emerald-700 pt-0.5">
          ✅ Ya pagado por transferencia — no cobrar al entregar
        </p>
      )}
      {esB2B && envioPagaTienda && (
        <p className="text-[10px] text-gray-400 leading-tight pt-1">
          Tienda absorbe el envío (${envio.toFixed(2)}). Cliente paga sólo el pedido.
        </p>
      )}
      <div className="flex justify-between items-center pt-1">
        <span className="text-[10px] text-gray-400">Método</span>
        <span className="text-[11px] font-medium text-gray-600">{metodoLabel}</span>
      </div>
    </div>
  );
}
