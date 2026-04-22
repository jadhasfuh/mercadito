import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { misPedidos, type Pedido, type EstadoPedido } from "../../src/api/pedidos";

const ESTADO_INFO: Record<EstadoPedido, { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  pendiente: { label: "Pendiente", color: "#92400E", bg: "#FEF3C7", icon: "hourglass-outline" },
  en_compra: { label: "Comprando", color: "#1E40AF", bg: "#DBEAFE", icon: "basket-outline" },
  en_camino: { label: "En camino", color: "#6B21A8", bg: "#EDE9FE", icon: "bicycle-outline" },
  entregado: { label: "Entregado", color: "#065F46", bg: "#D1FAE5", icon: "checkmark-circle-outline" },
  cancelado: { label: "Cancelado", color: "#991B1B", bg: "#FEE2E2", icon: "close-circle-outline" },
};

export default function PedidosScreen() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await misPedidos();
      setPedidos(data);
      setError(null);
    } catch (e) {
      setError((e as { error?: string })?.error ?? "Error al cargar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    pollingRef.current = setInterval(load, 15000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF7A2B" />
      </View>
    );
  }

  if (pedidos.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="receipt-outline" size={64} color="#D4C9B8" />
        <Text style={styles.emptyText}>Aún no tienes pedidos</Text>
        <Text style={styles.emptyHint}>{error ?? "Haz tu primer pedido desde la pestaña Inicio."}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={pedidos}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      renderItem={({ item: pedido }) => {
        const info = ESTADO_INFO[pedido.estado] ?? ESTADO_INFO.pendiente;
        const servicio = pedido.items.reduce((s, it) => s + it.cantidad * (Number(it.comision) || 0), 0);
        return (
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={[styles.badge, { backgroundColor: info.bg }]}>
                <Ionicons name={info.icon} size={14} color={info.color} />
                <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
              </View>
              <Text style={styles.total}>${pedido.total.toFixed(2)}</Text>
            </View>

            <Text style={styles.meta}>
              {new Date(pedido.created_at).toLocaleString("es-MX")} · #{pedido.id.slice(0, 8).toUpperCase()}
            </Text>

            {pedido.repartidor_nombre && (
              <View style={styles.repartidorRow}>
                <Ionicons name="bicycle" size={14} color="#065F46" />
                <Text style={styles.repartidor}>{pedido.repartidor_nombre} lleva tu pedido</Text>
              </View>
            )}

            <View style={styles.itemsBox}>
              {pedido.items.map((it) => (
                <View key={it.id} style={styles.itemRow}>
                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {it.cantidad} {it.unidad ?? ""} {it.producto_nombre}
                  </Text>
                  <Text style={styles.itemValue}>${Number(it.subtotal).toFixed(2)}</Text>
                </View>
              ))}
              {servicio > 0 && (
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabelFaint}>Servicio Mercadito</Text>
                  <Text style={styles.itemValueFaint}>${servicio.toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.itemRow}>
                <Text style={styles.itemLabelFaint}>Envío</Text>
                <Text style={styles.itemValueFaint}>${Number(pedido.costo_envio).toFixed(2)}</Text>
              </View>
              {pedido.recargo_tarjeta > 0 && (
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabelFaint}>Recargo tarjeta</Text>
                  <Text style={styles.itemValueFaint}>${Number(pedido.recargo_tarjeta).toFixed(2)}</Text>
                </View>
              )}
            </View>

            <Text style={styles.direccion} numberOfLines={2}>
              <Ionicons name="location-outline" size={12} /> {pedido.direccion_entrega}
            </Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  total: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  meta: { fontSize: 11, color: "#8B7B69", marginBottom: 8 },
  repartidorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  repartidor: { fontSize: 12, color: "#065F46", fontWeight: "500" },
  itemsBox: { backgroundColor: "#F9FAFB", borderRadius: 8, padding: 10, marginTop: 4 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  itemLabel: { flex: 1, color: "#4B5563", fontSize: 13, paddingRight: 8 },
  itemValue: { color: "#4B5563", fontSize: 13, fontWeight: "500" },
  itemLabelFaint: { flex: 1, color: "#8B7B69", fontSize: 12, paddingRight: 8 },
  itemValueFaint: { color: "#8B7B69", fontSize: 12 },
  direccion: { fontSize: 11, color: "#8B7B69", marginTop: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FFF7EB" },
  emptyText: { fontSize: 18, color: "#1F2937", fontWeight: "600", marginTop: 12 },
  emptyHint: { color: "#8B7B69", marginTop: 6, textAlign: "center" },
});
