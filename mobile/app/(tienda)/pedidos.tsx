import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Linking, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../src/contexts/SessionContext";
import { listarPedidos } from "../../src/api/repartidor";
import type { Pedido, EstadoPedido } from "../../src/api/pedidos";

const ESTADO_INFO: Record<EstadoPedido, { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  pendiente: { label: "Pendiente", color: "#92400E", bg: "#FEF3C7", icon: "hourglass-outline" },
  en_compra: { label: "Comprando", color: "#1E40AF", bg: "#DBEAFE", icon: "basket-outline" },
  en_camino: { label: "En camino", color: "#6B21A8", bg: "#EDE9FE", icon: "bicycle-outline" },
  entregado: { label: "Entregado", color: "#065F46", bg: "#D1FAE5", icon: "checkmark-circle-outline" },
  cancelado: { label: "Cancelado", color: "#991B1B", bg: "#FEE2E2", icon: "close-circle-outline" },
};

export default function TiendaPedidosScreen() {
  const { usuario } = useSession();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listarPedidos();
      setPedidos(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    pollingRef.current = setInterval(load, 15000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [load]);

  // Solo pedidos con items de mi puesto, y solo activos.
  const filtered = useMemo(() => {
    if (!usuario?.puesto_id) return [];
    return pedidos.filter((p) =>
      p.estado !== "entregado" &&
      p.estado !== "cancelado" &&
      p.items.some((i) => i.puesto_id === usuario.puesto_id)
    );
  }, [pedidos, usuario]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#FF7A2B" /></View>;
  }

  if (filtered.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="receipt-outline" size={56} color="#D4C9B8" />
        <Text style={styles.emptyText}>No hay pedidos activos con tus productos</Text>
        <TouchableOpacity style={styles.refreshInline} onPress={() => { setRefreshing(true); load(); }}>
          <Ionicons name="refresh-outline" size={16} color="#FF7A2B" />
          <Text style={styles.refreshInlineText}>Actualizar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: "#FFF7EB" }}
      data={filtered}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      renderItem={({ item: pedido }) => {
        const info = ESTADO_INFO[pedido.estado];
        const misItems = pedido.items.filter((i) => i.puesto_id === usuario!.puesto_id);
        const miTotal = misItems.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
        return (
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={[styles.badge, { backgroundColor: info.bg }]}>
                <Ionicons name={info.icon} size={14} color={info.color} />
                <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
              </View>
              <Text style={styles.total}>${miTotal.toFixed(2)}</Text>
            </View>

            <Text style={styles.cliente}>{pedido.cliente_nombre}</Text>
            <Text style={styles.meta}>
              {new Date(pedido.created_at).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })} · #{pedido.id.slice(0, 8).toUpperCase()}
            </Text>

            {pedido.repartidor_nombre ? (
              <View style={styles.repartidorRow}>
                <Ionicons name="bicycle" size={14} color="#065F46" />
                <Text style={styles.repartidor}>{pedido.repartidor_nombre} va por el pedido</Text>
              </View>
            ) : (
              <View style={styles.esperandoRow}>
                <Ionicons name="hourglass-outline" size={14} color="#92400E" />
                <Text style={styles.esperando}>Esperando repartidor</Text>
              </View>
            )}

            <View style={styles.items}>
              <Text style={styles.itemsTitle}>Productos de tu tienda</Text>
              {misItems.map((it) => (
                <View key={it.id} style={styles.itemRow}>
                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {it.cantidad} {it.unidad ?? ""} {it.producto_nombre}
                  </Text>
                  <Text style={styles.itemValue}>${(it.cantidad * it.precio_unitario).toFixed(2)}</Text>
                </View>
              ))}
            </View>

            {pedido.notas ? (
              <View style={styles.notaBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#92400E" />
                <Text style={styles.notaText}>{pedido.notas}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.whatsappButton}
              onPress={() => Linking.openURL(`https://wa.me/52${pedido.cliente_telefono.replace(/\D/g, "")}`)}
            >
              <Ionicons name="logo-whatsapp" size={16} color="#059669" />
              <Text style={styles.whatsappText}>Contactar al cliente</Text>
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FFF7EB" },
  list: { padding: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  total: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  cliente: { fontSize: 16, fontWeight: "600", color: "#1F2937", marginTop: 6 },
  meta: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  repartidorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  repartidor: { fontSize: 12, color: "#065F46", fontWeight: "500" },
  esperandoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  esperando: { fontSize: 12, color: "#92400E", fontWeight: "500" },
  items: { backgroundColor: "#F9FAFB", borderRadius: 8, padding: 10, marginTop: 10 },
  itemsTitle: { fontSize: 11, fontWeight: "700", color: "#8B7B69", marginBottom: 4 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  itemLabel: { flex: 1, fontSize: 13, color: "#1F2937", paddingRight: 8 },
  itemValue: { fontSize: 13, color: "#1F2937", fontWeight: "500" },
  notaBox: { flexDirection: "row", gap: 6, alignItems: "flex-start", backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginTop: 8 },
  notaText: { flex: 1, fontSize: 12, color: "#92400E" },
  whatsappButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, backgroundColor: "#DCFCE7", borderRadius: 999, marginTop: 10 },
  whatsappText: { color: "#059669", fontWeight: "600" },
  emptyText: { color: "#8B7B69", marginTop: 10, textAlign: "center", fontSize: 15 },
  refreshInline: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 14, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#FFF2E5" },
  refreshInlineText: { color: "#FF7A2B", fontWeight: "600" },
});
