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
  const subtotal = pedido.items.reduce((s, it) => s + Number(it.subtotal), 0);
  const servicio = pedido.items.reduce((s, it) => s + Number(it.cantidad) * (Number(it.comision) || 0), 0);
  const envio = Number(pedido.costo_envio);
  const recargo = Number(pedido.recargo_tarjeta) || 0;
  const total = Number(pedido.total);

  const textSize = compact ? "text-xs" : "text-sm";
  const labelColor = "text-gray-500";

  const metodoLabel =
    pedido.metodo_pago === "tarjeta" ? "💳 Tarjeta" :
    pedido.metodo_pago === "transferencia" ? "🏦 Transferencia" :
    "💵 Efectivo";

  return (
    <div className={`bg-gray-50 rounded-lg p-3 space-y-1 ${textSize}`}>
      <div className="flex justify-between">
        <span className={labelColor}>Productos</span>
        <span className="text-gray-700">${subtotal.toFixed(2)}</span>
      </div>
      {servicio > 0 && (
        <div className="flex justify-between">
          <span className={labelColor}>Servicio Mercadito</span>
          <span className="text-gray-700">${servicio.toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className={labelColor}>Envío</span>
        <span className="text-gray-700">${envio.toFixed(2)}</span>
      </div>
      {recargo > 0 && (
        <div className="flex justify-between">
          <span className={labelColor}>Recargo tarjeta</span>
          <span className="text-gray-700">${recargo.toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
        <span className="font-bold text-gray-800">Total</span>
        <span className="font-bold text-navy">${total.toFixed(2)}</span>
      </div>
      <div className="flex justify-between items-center pt-1">
        <span className="text-[10px] text-gray-400">Método</span>
        <span className="text-[11px] font-medium text-gray-600">{metodoLabel}</span>
      </div>
    </div>
  );
}
