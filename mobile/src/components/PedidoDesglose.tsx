import { View, Text, StyleSheet } from "react-native";
import type { Pedido } from "../api/pedidos";

/**
 * Desglose de precios del pedido (productos, servicio, envío, recargo, total,
 * método de pago). Equivalente al componente web `PedidoDesglose`.
 */
export default function PedidoDesgloseRN({ pedido }: { pedido: Pedido }) {
  const subtotal = pedido.items.reduce((s, it) => s + Number(it.subtotal), 0);
  const servicio = pedido.items.reduce((s, it) => s + Number(it.cantidad) * (Number(it.comision) || 0), 0);
  const envio = Number(pedido.costo_envio);
  const recargo = Number(pedido.recargo_tarjeta) || 0;
  const total = Number(pedido.total);

  const metodoLabel =
    pedido.metodo_pago === "tarjeta" ? "💳 Tarjeta" :
    pedido.metodo_pago === "transferencia" ? "🏦 Transferencia" :
    "💵 Efectivo";

  return (
    <View style={s.box}>
      <Row label="Productos" value={subtotal} />
      {servicio > 0 && <Row label="Servicio Mercadito" value={servicio} />}
      <Row label="Envío" value={envio} />
      {recargo > 0 && <Row label="Recargo tarjeta" value={recargo} />}
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>Total</Text>
        <Text style={s.totalValue}>${total.toFixed(2)}</Text>
      </View>
      <View style={s.metodoRow}>
        <Text style={s.metodoLabel}>Método</Text>
        <Text style={s.metodoValue}>{metodoLabel}</Text>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>${value.toFixed(2)}</Text>
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
});
