import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Alert, Linking, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../src/contexts/SessionContext";
import { listarPedidos, tomarPedido, cambiarEstado, parseDireccion } from "../../src/api/repartidor";
import type { Pedido, EstadoPedido } from "../../src/api/pedidos";

type Filtro = "todos" | "mios" | "sin_asignar" | "historial";

const ESTADO_INFO: Record<EstadoPedido, { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  pendiente: { label: "Pendiente", color: "#92400E", bg: "#FEF3C7", icon: "hourglass-outline" },
  en_compra: { label: "Comprando", color: "#1E40AF", bg: "#DBEAFE", icon: "basket-outline" },
  en_camino: { label: "En camino", color: "#6B21A8", bg: "#EDE9FE", icon: "bicycle-outline" },
  entregado: { label: "Entregado", color: "#065F46", bg: "#D1FAE5", icon: "checkmark-circle-outline" },
  cancelado: { label: "Cancelado", color: "#991B1B", bg: "#FEE2E2", icon: "close-circle-outline" },
};

export default function RepartidorPedidosScreen() {
  const { usuario } = useSession();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [actuando, setActuando] = useState<string | null>(null);
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
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const uid = usuario?.id;
    const esActivo = (estado: EstadoPedido) => estado !== "entregado" && estado !== "cancelado";
    let list = [...pedidos];
    if (filtro === "historial") {
      list = list.filter((p) => !esActivo(p.estado));
    } else if (filtro === "mios") {
      list = list.filter((p) => esActivo(p.estado) && ("repartidor_id" in p ? (p as unknown as { repartidor_id: string }).repartidor_id === uid : false));
    } else if (filtro === "sin_asignar") {
      list = list.filter((p) => p.estado === "pendiente" && !(p as unknown as { repartidor_id: string | null }).repartidor_id);
    } else {
      // "todos" = solo activos
      list = list.filter((p) => esActivo(p.estado));
    }
    // Historial: más recientes arriba. Activos: por prioridad de estado, dentro del grupo más recientes arriba.
    if (filtro === "historial") {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      const prioridad: Record<EstadoPedido, number> = {
        pendiente: 0, en_compra: 1, en_camino: 2, entregado: 3, cancelado: 4,
      };
      list.sort((a, b) => {
        const d = prioridad[a.estado] - prioridad[b.estado];
        if (d !== 0) return d;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return list;
  }, [pedidos, filtro, usuario]);

  async function accionTomar(pedido: Pedido) {
    if (!usuario) return;
    setActuando(pedido.id);
    try {
      await tomarPedido(pedido.id, usuario.id);
      await load();
    } catch (e) {
      Alert.alert("No se pudo tomar", (e as { error?: string })?.error ?? "Error");
    } finally {
      setActuando(null);
    }
  }

  async function accionEstado(pedido: Pedido, estado: EstadoPedido) {
    setActuando(pedido.id);
    try {
      await cambiarEstado(pedido.id, estado);
      await load();
    } catch (e) {
      Alert.alert("No se pudo actualizar", (e as { error?: string })?.error ?? "Error");
    } finally {
      setActuando(null);
    }
  }

  function abrirMapa(direccion: string) {
    const { texto, lat, lng } = parseDireccion(direccion);
    const url = lat && lng
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`;
    Linking.openURL(url);
  }

  function llamarCliente(telefono: string) {
    Linking.openURL(`tel:${telefono}`);
  }

  function whatsappCliente(telefono: string) {
    Linking.openURL(`https://wa.me/52${telefono.replace(/\D/g, "")}`);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#FF7A2B" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Filtro */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slider} contentContainerStyle={styles.filtros}>
        <FiltroChip label="Todos" active={filtro === "todos"} onPress={() => setFiltro("todos")} count={pedidos.filter(p => p.estado !== "entregado" && p.estado !== "cancelado").length} />
        <FiltroChip label="Míos" active={filtro === "mios"} onPress={() => setFiltro("mios")} />
        <FiltroChip label="Sin asignar" active={filtro === "sin_asignar"} onPress={() => setFiltro("sin_asignar")} />
        <FiltroChip label="Historial" active={filtro === "historial"} onPress={() => setFiltro("historial")} count={pedidos.filter(p => p.estado === "entregado" || p.estado === "cancelado").length} />
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="happy-outline" size={48} color="#D4C9B8" />
            <Text style={styles.emptyText}>No hay pedidos activos</Text>
          </View>
        }
        renderItem={({ item: pedido }) => {
          const info = ESTADO_INFO[pedido.estado];
          const miPedido = (pedido as unknown as { repartidor_id: string | null }).repartidor_id === usuario?.id;
          const sinAsignar = !(pedido as unknown as { repartidor_id: string | null }).repartidor_id;
          const { texto: direccionTexto } = parseDireccion(pedido.direccion_entrega);

          return (
            <View style={styles.card}>
              <View style={styles.header}>
                <View style={[styles.badge, { backgroundColor: info.bg }]}>
                  <Ionicons name={info.icon} size={14} color={info.color} />
                  <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
                </View>
                <Text style={styles.total}>${pedido.total.toFixed(2)}</Text>
              </View>

              <Text style={styles.cliente}>{pedido.cliente_nombre}</Text>
              <Text style={styles.meta}>
                {new Date(pedido.created_at).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })} · #{pedido.id.slice(0, 8).toUpperCase()}
              </Text>

              <View style={styles.contactRow}>
                <TouchableOpacity style={styles.contactButton} onPress={() => llamarCliente(pedido.cliente_telefono)}>
                  <Ionicons name="call-outline" size={16} color="#1F2937" />
                  <Text style={styles.contactText}>Llamar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.contactButton, styles.whatsappButton]} onPress={() => whatsappCliente(pedido.cliente_telefono)}>
                  <Ionicons name="logo-whatsapp" size={16} color="#059669" />
                  <Text style={[styles.contactText, { color: "#059669" }]}>WhatsApp</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.direccionRow} onPress={() => abrirMapa(pedido.direccion_entrega)}>
                <Ionicons name="location-outline" size={16} color="#1F2937" />
                <Text style={styles.direccionText} numberOfLines={2}>{direccionTexto}</Text>
                <Ionicons name="chevron-forward" size={14} color="#8B7B69" />
              </TouchableOpacity>

              <View style={styles.items}>
                <Text style={styles.itemsTitle}>Productos</Text>
                {pedido.items.map((it) => (
                  <View key={it.id} style={styles.itemRow}>
                    <Text style={styles.itemLabel} numberOfLines={1}>
                      {it.cantidad} {it.unidad ?? ""} {it.producto_nombre}
                    </Text>
                    <Text style={styles.itemTienda} numberOfLines={1}>{it.puesto_nombre}</Text>
                  </View>
                ))}
              </View>

              {pedido.notas ? (
                <View style={styles.notaBox}>
                  <Ionicons name="alert-circle-outline" size={14} color="#92400E" />
                  <Text style={styles.notaText}>{pedido.notas}</Text>
                </View>
              ) : null}

              {/* Acciones */}
              {pedido.estado === "pendiente" && sinAsignar && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionPrimary]}
                  onPress={() => accionTomar(pedido)}
                  disabled={actuando === pedido.id}
                >
                  <Ionicons name="hand-right-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>{actuando === pedido.id ? "Tomando…" : "Tomar pedido"}</Text>
                </TouchableOpacity>
              )}
              {pedido.estado === "en_compra" && miPedido && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionPrimary]}
                  onPress={() => accionEstado(pedido, "en_camino")}
                  disabled={actuando === pedido.id}
                >
                  <Ionicons name="bicycle-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>Salir a entregar</Text>
                </TouchableOpacity>
              )}
              {pedido.estado === "en_camino" && miPedido && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionSuccess]}
                  onPress={() => accionEstado(pedido, "entregado")}
                  disabled={actuando === pedido.id}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>Marcar entregado</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

function FiltroChip({ label, active, onPress, count }: { label: string; active: boolean; onPress: () => void; count?: number }) {
  return (
    <TouchableOpacity style={[styles.filtroChip, active && styles.filtroChipActive]} onPress={onPress}>
      <Text style={[styles.filtroText, active && styles.filtroTextActive]}>
        {label}{count != null ? ` (${count})` : ""}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  slider: { flexGrow: 0, flexShrink: 0, maxHeight: 52 },
  filtros: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filtroChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  filtroChipActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  filtroText: { fontSize: 12, color: "#8B7B69", fontWeight: "600", lineHeight: 15, includeFontPadding: false },
  filtroTextActive: { color: "#fff" },
  list: { padding: 12, paddingTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  total: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  cliente: { fontSize: 16, fontWeight: "600", color: "#1F2937", marginTop: 6 },
  meta: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  contactRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  contactButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, backgroundColor: "#F3EFE7", borderRadius: 8 },
  whatsappButton: { backgroundColor: "#DCFCE7" },
  contactText: { fontSize: 13, color: "#1F2937", fontWeight: "500" },
  direccionRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFF7EB", borderRadius: 8, padding: 10, marginTop: 8 },
  direccionText: { flex: 1, fontSize: 13, color: "#1F2937" },
  items: { backgroundColor: "#F9FAFB", borderRadius: 8, padding: 10, marginTop: 10 },
  itemsTitle: { fontSize: 11, fontWeight: "700", color: "#8B7B69", marginBottom: 4 },
  itemRow: { paddingVertical: 3 },
  itemLabel: { fontSize: 13, color: "#1F2937" },
  itemTienda: { fontSize: 11, color: "#8B7B69" },
  notaBox: { flexDirection: "row", gap: 6, alignItems: "flex-start", backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginTop: 8 },
  notaText: { flex: 1, fontSize: 12, color: "#92400E" },
  actionButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 999, marginTop: 10 },
  actionPrimary: { backgroundColor: "#FF7A2B" },
  actionSuccess: { backgroundColor: "#059669" },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  empty: { alignItems: "center", marginTop: 40 },
  emptyText: { color: "#8B7B69", marginTop: 10 },
});
