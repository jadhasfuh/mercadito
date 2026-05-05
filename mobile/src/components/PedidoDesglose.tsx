import { View, Text, StyleSheet } from "react-native";
import type { Pedido } from "../api/pedidos";

/**
 * Desglose de precios del pedido (productos, servicio, envío, recargo, total,
 * método de pago). Equivalente al componente web `PedidoDesglose`.
 */
export default function PedidoDesgloseRN({ pedido }: { pedido: Pedido }) {
  // B2B (envío solicitado por tienda): subtotal viene del campo del pedido
  // porque no hay items; texto se ajusta para que el repartidor entienda
  // que es un pedido del restaurante.
  const esB2B = pedido.tipo === "envio" && pedido.solicitado_por_tienda_id != null;
  const subtotal = esB2B ? Number(pedido.subtotal) : pedido.items.reduce((s, it) => s + Number(it.subtotal), 0);
  const servicio = pedido.items.reduce((s, it) => s + Number(it.cantidad) * (Number(it.comision) || 0), 0);
  const envio = Number(pedido.costo_envio);
  const recargo = Number(pedido.recargo_tarjeta) || 0;
  const total = Number(pedido.total);
  const envioPagaTienda = pedido.envio_pagado_por === "tienda";

  const metodoLabel =
    pedido.metodo_pago === "tarjeta" ? "💳 Tarjeta" :
    pedido.metodo_pago === "transferencia" ? "🏦 Transferencia" :
    "💵 Efectivo";

  return (
    <View style={s.box}>
      <Row label={esB2B ? "Pedido del restaurante" : "Productos"} value={subtotal} />
      {servicio > 0 && <Row label="Servicio Mercadito" value={servicio} />}
      <Row
        label={esB2B && envioPagaTienda ? "Envío (absorbe la tienda)" : esB2B ? "Envío (paga el cliente)" : "Envío"}
        value={envio}
        muted={esB2B && envioPagaTienda}
      />
      {recargo > 0 && <Row label="Recargo tarjeta" value={recargo} />}
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>{esB2B ? "Cobrar al cliente" : "Total"}</Text>
        <Text style={s.totalValue}>${total.toFixed(2)}</Text>
      </View>
      {esB2B && envioPagaTienda && (
        <Text style={s.b2bHint}>
          Tienda absorbe el envío (${envio.toFixed(2)}). Cliente paga sólo el pedido.
        </Text>
      )}
      <View style={s.metodoRow}>
        <Text style={s.metodoLabel}>Método</Text>
        <Text style={s.metodoValue}>{metodoLabel}</Text>
      </View>
    </View>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, muted && s.valueMuted]}>${value.toFixed(2)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: "#F9FAFB", borderRadius: 10, padding: 10, gap: 2 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: 12, color: "#6B7280" },
  value: { fontSize: 12, color: "#374151" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#E5E7EB", marginTop: 4, paddingTop: 6 },
  totalLabel: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  totalValue: { fontSize: 14, fontWeight: "800", color: "#C2410C" },
  metodoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  metodoLabel: { fontSize: 10, color: "#9CA3AF" },
  metodoValue: { fontSize: 11, fontWeight: "600", color: "#6B7280" },
  valueMuted: { color: "#9CA3AF" },
  b2bHint: { fontSize: 10, color: "#9CA3AF", marginTop: 4, lineHeight: 14 },
});
