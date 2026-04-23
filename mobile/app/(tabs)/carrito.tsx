import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "../../src/contexts/CartContext";
import { unidadFormato } from "../../src/lib/unidades";

export default function CarritoScreen() {
  const { items, cambiarCantidad, vaciar, subtotal, servicioMercadito, promocionMayoreo, total } = useCart();
  const router = useRouter();

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="cart-outline" size={64} color="#D4C9B8" />
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
        renderItem={({ item }) => {
          const mayoreoAplicado = item.precio_mayoreo != null && item.mayoreo_desde != null && item.cantidad >= item.mayoreo_desde;
          const mayoreoCerca = item.precio_mayoreo != null && item.mayoreo_desde != null && item.cantidad < item.mayoreo_desde;
          return (
          <View style={styles.card}>
            <View style={styles.info}>
              <Text style={styles.nombre}>{item.producto_nombre}</Text>
              <Text style={styles.meta}>
                {item.puesto_nombre} · ${item.precio_unitario.toFixed(2)}/{unidadFormato(item.unidad, 1)}
              </Text>
              {mayoreoAplicado && (
                <Text style={styles.mayoreoBadge}>✓ Mayoreo aplicado</Text>
              )}
              {mayoreoCerca && item.mayoreo_desde != null && item.precio_mayoreo != null && (
                <Text style={styles.mayoreoHint}>
                  Agrega {item.mayoreo_desde - item.cantidad} {unidadFormato(item.unidad, item.mayoreo_desde - item.cantidad)} para mayoreo (${item.precio_mayoreo.toFixed(2)}/{unidadFormato(item.unidad, 1)})
                </Text>
              )}
            </View>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={[styles.qtyButton, styles.qtyMinus]}
                onPress={() => cambiarCantidad(item.producto_id, item.puesto_id, -1)}
              >
                <Ionicons name="remove" size={18} color="#DC2626" />
              </TouchableOpacity>
              <Text style={styles.qtyCount}>{item.cantidad}</Text>
              <TouchableOpacity
                style={[styles.qtyButton, styles.qtyPlus]}
                onPress={() => cambiarCantidad(item.producto_id, item.puesto_id, 1)}
              >
                <Ionicons name="add" size={18} color="#059669" />
              </TouchableOpacity>
            </View>
            <Text style={styles.lineTotal}>${(item.cantidad * item.precio_unitario).toFixed(2)}</Text>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => cambiarCantidad(item.producto_id, item.puesto_id, -item.cantidad)}
            >
              <Ionicons name="close" size={16} color="#DC2626" />
            </TouchableOpacity>
          </View>
          );
        }}
      />

      <View style={styles.totals}>
        <Row label={`Productos (${items.length})`} value={subtotal} />
        {promocionMayoreo > 0 && (
          <View style={styles.promoRow}>
            <Text style={styles.promoLabel}>🎉 Promoción (mayoreo)</Text>
            <Text style={styles.promoValue}>-${promocionMayoreo.toFixed(2)}</Text>
          </View>
        )}
        {servicioMercadito > 0 && <Row label="Servicio Mercadito" value={servicioMercadito} />}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        </View>
        <Text style={styles.hint}>El envío se calcula en el siguiente paso.</Text>

        <TouchableOpacity style={styles.checkoutButton} onPress={() => router.push("/checkout")}>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
          <Text style={styles.checkoutText}>Continuar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={vaciar} style={styles.clearButton}>
          <Ionicons name="trash-outline" size={16} color="#DC2626" />
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
  mayoreoBadge: { fontSize: 10, color: "#92400E", backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 4, alignSelf: "flex-start", fontWeight: "600" },
  mayoreoHint: { fontSize: 10, color: "#92400E", marginTop: 4 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  qtyMinus: { backgroundColor: "#FEE2E2" },
  qtyPlus: { backgroundColor: "#DCFCE7" },
  qtyCount: { width: 22, textAlign: "center", fontWeight: "700" },
  lineTotal: { width: 60, textAlign: "right", fontWeight: "700", color: "#1F2937" },
  removeButton: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginLeft: 6 },
  totals: { backgroundColor: "#fff", padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, elevation: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  rowLabel: { color: "#4B5563" },
  rowValue: { color: "#4B5563", fontWeight: "500" },
  promoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  promoLabel: { color: "#059669", fontWeight: "600" },
  promoValue: { color: "#059669", fontWeight: "700" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  totalLabel: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  totalValue: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  hint: { fontSize: 11, color: "#8B7B69", textAlign: "center", marginTop: 6 },
  checkoutButton: { flexDirection: "row", gap: 6, backgroundColor: "#FF7A2B", paddingVertical: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", marginTop: 12 },
  checkoutText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  clearButton: { flexDirection: "row", gap: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  clearText: { color: "#DC2626", fontWeight: "500" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FFF7EB" },
  emptyText: { fontSize: 18, color: "#1F2937", fontWeight: "600", marginTop: 12 },
  emptyHint: { color: "#8B7B69", marginTop: 6, textAlign: "center" },
});
