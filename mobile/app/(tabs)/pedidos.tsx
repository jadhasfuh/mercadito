import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Linking, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { misPedidos, type Pedido, type EstadoPedido } from "../../src/api/pedidos";
import { listarProductosCliente } from "../../src/api/catalogo";
import { useCart } from "../../src/contexts/CartContext";
import TicketPedido from "../../src/components/TicketPedido";

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
  const [ticketId, setTicketId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { agregar } = useCart();
  const router = useRouter();

  async function volverAComprar(pedido: Pedido) {
    try {
      const productos = await listarProductosCliente();
      let agregados = 0;
      const omitidos: string[] = [];
      for (const item of pedido.items) {
        const prod = productos.find((p) => p.id === item.producto_id);
        if (!prod) {
          omitidos.push(item.producto_nombre || "producto");
          continue;
        }
        // Variantes/modificadores: si los teníamos, intentamos rehidratar.
        let varianteRehid = null;
        if (item.variante_id) {
          varianteRehid = (prod.variantes ?? []).find((v) => v.id === item.variante_id) ?? null;
          if (!varianteRehid) {
            omitidos.push(item.producto_nombre || "producto");
            continue;
          }
        }
        agregar(prod, item.puesto_id, {
          variante: varianteRehid,
          modificadores: item.modificadores ?? [],
          cantidadInicial: Number(item.cantidad) || 1,
        });
        agregados++;
      }
      router.push("/(tabs)/carrito");
      if (omitidos.length > 0) {
        const lista = Array.from(new Set(omitidos)).slice(0, 5).join(", ");
        Alert.alert("Repedido", `Se agregaron ${agregados} producto${agregados === 1 ? "" : "s"}. No pudimos agregar: ${lista}.`);
      }
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo repetir el pedido");
    }
  }

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

  const ticketPedido = pedidos.find((p) => p.id === ticketId) ?? null;

  return (
    <>
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
              <View style={styles.badgesRow}>
                <View style={[styles.badge, { backgroundColor: info.bg }]}>
                  <Ionicons name={info.icon} size={14} color={info.color} />
                  <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
                </View>
                {pedido.metodo_pago === "transferencia" && !pedido.pago_validado_at && pedido.estado !== "cancelado" && (
                  <View style={[styles.badge, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="time-outline" size={14} color="#92400E" />
                    <Text style={[styles.badgeText, { color: "#92400E" }]}>Validando pago</Text>
                  </View>
                )}
                {pedido.agendado_para && pedido.estado !== "cancelado" && (
                  <View style={[styles.badge, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="calendar-outline" size={14} color="#92400E" />
                    <Text style={[styles.badgeText, { color: "#92400E" }]}>
                      {new Date(pedido.agendado_para).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.total}>${pedido.total.toFixed(2)}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {new Date(pedido.created_at).toLocaleString("es-MX")} · #{pedido.id.slice(0, 8).toUpperCase()}
              </Text>
              <TouchableOpacity onPress={() => setTicketId(pedido.id)} style={styles.ticketBtn}>
                <Text style={styles.ticketBtnTxt}>🧾 Ver ticket</Text>
              </TouchableOpacity>
            </View>

            {/* Repartidor: el asignado si existe, si no el "de turno". */}
            {pedido.estado !== "cancelado" && (() => {
              const nombre = pedido.repartidor_nombre || pedido.repartidor_default?.nombre;
              const tel = pedido.repartidor_telefono || pedido.repartidor_default?.telefono;
              if (!nombre) return null;
              const sinAsignar = !pedido.repartidor_nombre;
              const telLimpio = (tel || "").replace(/\D/g, "");
              return (
                <View style={styles.repartidorBox}>
                  <View style={styles.repartidorRow}>
                    <Ionicons name="bicycle" size={14} color="#065F46" />
                    <Text style={styles.repartidor}>
                      {nombre}{sinAsignar ? " (de turno)" : ""}
                    </Text>
                  </View>
                  {tel && (
                    <View style={styles.repartidorActions}>
                      <Text style={styles.repartidorTel}>📱 {tel}</Text>
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`https://wa.me/52${telLimpio}`)}
                        style={[styles.repartidorBtn, { backgroundColor: "#D1FAE5" }]}
                      >
                        <Text style={[styles.repartidorBtnTxt, { color: "#065F46" }]}>WhatsApp</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${tel}`)}
                        style={[styles.repartidorBtn, { backgroundColor: "#DBEAFE" }]}
                      >
                        <Text style={[styles.repartidorBtnTxt, { color: "#1E40AF" }]}>Llamar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })()}

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

            {(pedido.estado === "entregado" || pedido.estado === "cancelado") && (
              <TouchableOpacity onPress={() => volverAComprar(pedido)} style={styles.repedirBtn}>
                <Ionicons name="repeat" size={16} color="#C2410C" />
                <Text style={styles.repedirBtnTxt}>Volver a comprar</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }}
    />
    <TicketPedido visible={!!ticketPedido} pedido={ticketPedido} onClose={() => setTicketId(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 },
  badgesRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flexShrink: 1 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  total: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  meta: { fontSize: 11, color: "#8B7B69", flex: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  ticketBtn: { backgroundColor: "#FFF2E5", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  ticketBtnTxt: { color: "#C2410C", fontSize: 11, fontWeight: "700" },
  repartidorBox: { backgroundColor: "#FFF4E6", padding: 8, borderRadius: 10, marginBottom: 8 },
  repartidorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  repartidor: { fontSize: 13, color: "#9A3412", fontWeight: "700" },
  repartidorActions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  repartidorTel: { fontSize: 11, color: "#6B7280" },
  repartidorBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  repartidorBtnTxt: { fontSize: 11, fontWeight: "700" },
  repedirBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, paddingVertical: 8, backgroundColor: "#FFF2E5", borderRadius: 10 },
  repedirBtnTxt: { color: "#C2410C", fontWeight: "700", fontSize: 13 },
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
