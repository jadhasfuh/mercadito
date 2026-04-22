import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { useCart } from "../../src/contexts/CartContext";

export default function CarritoScreen() {
  const { items, cambiarCantidad, vaciar, subtotal, servicioMercadito, total } = useCart();

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🛒</Text>
        <Text style={styles.emptyText}>Tu carrito está vacío</Text>
        <Text style={styles.emptyHint}>Agrega productos desde la pestaña Inicio.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => `${i.producto_id}-${i.puesto_id}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.info}>
              <Text style={styles.nombre}>{item.producto_nombre}</Text>
              <Text style={styles.meta}>
                {item.puesto_nombre} · ${item.precio_unitario.toFixed(2)}/{item.unidad}
              </Text>
            </View>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={[styles.qtyButton, styles.qtyMinus]}
                onPress={() => cambiarCantidad(item.producto_id, item.puesto_id, -1)}
              >
                <Text style={styles.qtyButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyCount}>{item.cantidad}</Text>
              <TouchableOpacity
                style={[styles.qtyButton, styles.qtyPlus]}
                onPress={() => cambiarCantidad(item.producto_id, item.puesto_id, 1)}
              >
                <Text style={styles.qtyButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.lineTotal}>${(item.cantidad * item.precio_unitario).toFixed(2)}</Text>
          </View>
        )}
      />

      <View style={styles.totals}>
        <Row label={`Productos (${items.length})`} value={subtotal} />
        {servicioMercadito > 0 && <Row label="Servicio Mercadito" value={servicioMercadito} />}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        </View>

        <TouchableOpacity style={styles.checkoutButton} disabled>
          <Text style={styles.checkoutText}>Continuar (pendiente)</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={vaciar} style={styles.clearButton}>
          <Text style={styles.clearText}>Vaciar carrito</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>${value.toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  list: { padding: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center" },
  info: { flex: 1, paddingRight: 8 },
  nombre: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  meta: { fontSize: 12, color: "#8B7B69", marginTop: 2 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  qtyMinus: { backgroundColor: "#FEE2E2" },
  qtyPlus: { backgroundColor: "#DCFCE7" },
  qtyButtonText: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  qtyCount: { width: 22, textAlign: "center", fontWeight: "700" },
  lineTotal: { width: 70, textAlign: "right", fontWeight: "700", color: "#1F2937" },
  totals: { backgroundColor: "#fff", padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, elevation: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  rowLabel: { color: "#4B5563" },
  rowValue: { color: "#4B5563", fontWeight: "500" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  totalLabel: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  totalValue: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  checkoutButton: { backgroundColor: "#D4D4D8", paddingVertical: 14, borderRadius: 999, alignItems: "center", marginTop: 12 },
  checkoutText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  clearButton: { paddingVertical: 10, alignItems: "center" },
  clearText: { color: "#DC2626", fontWeight: "500" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FFF7EB" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, color: "#1F2937", fontWeight: "600" },
  emptyHint: { color: "#8B7B69", marginTop: 6, textAlign: "center" },
});
