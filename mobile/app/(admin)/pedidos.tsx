import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, ScrollView, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "../../src/api/client";
import type { Pedido } from "../../src/api/pedidos";

type Filtro = "todos" | "activos" | "entregado" | "cancelado";

import { labelEstado, type EstadoPedido, type TipoPedido } from "../../src/lib/estadoPedido";
import ScreenHeader from "../../src/components/ScreenHeader";
import MapaTrackingClienteRN from "../../src/components/MapaTrackingCliente";

const ESTADO_COLORES: Record<string, { color: string; bg: string }> = {
  pendiente: { color: "#92400E", bg: "#FEF3C7" },
  en_compra: { color: "#1E40AF", bg: "#DBEAFE" },
  en_camino: { color: "#6B21A8", bg: "#EDE9FE" },
  entregado: { color: "#065F46", bg: "#D1FAE5" },
  cancelado: { color: "#991B1B", bg: "#FEE2E2" },
};

function infoBadge(estado: string, tipo?: TipoPedido | null) {
  const c = ESTADO_COLORES[estado] ?? ESTADO_COLORES.pendiente;
  return { label: labelEstado(estado as EstadoPedido, tipo), color: c.color, bg: c.bg };
}

function mensajeFeedback(estado: string, nombre: string): string {
  const primer = (nombre || "").split(" ")[0] || "hola";
  if (estado === "cancelado") {
    return `Hola ${primer}, te escribo del equipo de Mercadito 🛵. Vimos que tu pedido se canceló y nos importa mucho saber qué pasó. ¿Hubo algo que no te gustó o que pudiéramos haber hecho mejor? Tu respuesta nos ayuda a mejorar el servicio. ¡Gracias!`;
  }
  if (estado === "entregado") {
    return `Hola ${primer}, soy del equipo de Mercadito 🛍️. ¡Ojalá hayas disfrutado tu pedido! ¿Nos podrías regalar 1 minuto para calificarnos del 1 al 5 y contarnos qué te gustó o qué mejoraríamos? Tu opinión nos ayuda mucho a crecer 🙌`;
  }
  return `Hola ${primer}, te escribo del equipo de Mercadito sobre tu pedido reciente. ¿Tienes un minuto?`;
}

function waLink(tel: string, msg: string): string {
  const limpio = (tel || "").replace(/\D/g, "");
  return `https://wa.me/52${limpio}?text=${encodeURIComponent(msg)}`;
}

export default function PedidosHistorialAdminScreen() {
  const insets = useSafeAreaInsets();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Pedido[]>("/api/pedidos");
      setPedidos(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtrados = useMemo(() => {
    return pedidos.filter((p) => {
      if (filtro === "todos") return true;
      if (filtro === "activos") return !["entregado", "cancelado"].includes(p.estado);
      return p.estado === filtro;
    });
  }, [pedidos, filtro]);

  if (loading && pedidos.length === 0) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#F2A65A" /></View>;
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Pedidos" subtitle="Historial completo" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterSlider} contentContainerStyle={styles.filters}>
        {(["todos", "activos", "entregado", "cancelado"] as const).map((f) => (
          <TouchableOpacity key={f} onPress={() => setFiltro(f)} style={[styles.chip, filtro === f && styles.chipActive]}>
            <Text style={[styles.chipText, filtro === f && styles.chipTextActive]}>
              {f === "todos" ? "Todos" : f === "activos" ? "Activos" : f === "entregado" ? "Entregados" : "Cancelados"}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtrados}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Text style={styles.empty}>No hay pedidos en este filtro</Text>}
        renderItem={({ item: p }) => {
          const b = infoBadge(p.estado, p.tipo);
          const fecha = new Date(p.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cliente} numberOfLines={1}>{p.cliente_nombre}</Text>
                  <Text style={styles.meta}>{fecha} · #{p.id.slice(0, 8).toUpperCase()}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={[styles.badge, { backgroundColor: b.bg }]}>
                    <Text style={[styles.badgeText, { color: b.color }]}>{b.label}</Text>
                  </View>
                  <Text style={styles.total}>${Number(p.total).toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.contactRow}>
                <Text style={styles.tel}>📱 {p.cliente_telefono}</Text>
                <TouchableOpacity onPress={() => Linking.openURL(`https://wa.me/52${p.cliente_telefono.replace(/\D/g, "")}`)} style={[styles.miniBtn, { backgroundColor: "#D1FAE5" }]}>
                  <Text style={[styles.miniBtnTxt, { color: "#065F46" }]}>WhatsApp</Text>
                </TouchableOpacity>
                {p.estado === "cancelado" && (
                  <TouchableOpacity onPress={() => Linking.openURL(waLink(p.cliente_telefono, mensajeFeedback("cancelado", p.cliente_nombre)))} style={[styles.miniBtn, { backgroundColor: "#FEE2E2" }]}>
                    <Text style={[styles.miniBtnTxt, { color: "#991B1B" }]}>💬 Feedback</Text>
                  </TouchableOpacity>
                )}
                {p.estado === "entregado" && (
                  <TouchableOpacity onPress={() => Linking.openURL(waLink(p.cliente_telefono, mensajeFeedback("entregado", p.cliente_nombre)))} style={[styles.miniBtn, { backgroundColor: "#FEF3C7" }]}>
                    <Text style={[styles.miniBtnTxt, { color: "#92400E" }]}>⭐ Calificación</Text>
                  </TouchableOpacity>
                )}
              </View>

              {p.tipo === "envio" ? (
                <View style={[styles.items, { backgroundColor: "#FEF3C7", borderColor: "#FCD34D", borderWidth: 1 }]}>
                  <Text style={[styles.itemTxt, { fontWeight: "700", color: "#92400E" }]}>📦 Envío {p.peso_kg != null ? `· ${Number(p.peso_kg).toFixed(1)} kg` : ""}</Text>
                  {p.descripcion_contenido ? <Text style={styles.itemTxtFaint}>{p.descripcion_contenido}</Text> : null}
                  {p.recogida_nombre ? <Text style={styles.itemTxtFaint}>{p.recogida_nombre} → {p.cliente_nombre}</Text> : null}
                </View>
              ) : p.items.length > 0 ? (
                <View style={styles.items}>
                  {p.items.slice(0, 4).map((it) => (
                    <Text key={it.id} style={styles.itemTxt} numberOfLines={1}>
                      {it.cantidad} {it.unidad ?? ""} {it.producto_nombre} · ${Number(it.subtotal).toFixed(2)}
                    </Text>
                  ))}
                  {p.items.length > 4 && <Text style={styles.itemTxtFaint}>+{p.items.length - 4} más</Text>}
                </View>
              ) : null}

              {p.repartidor_nombre ? (
                <Text style={styles.repTxt}>🛵 {p.repartidor_nombre}</Text>
              ) : null}

              {/* Mapa de seguimiento: solo en pedidos activos con GPS reciente
                  del repartidor (≤15 min) y coordenadas de entrega. Mismo
                  criterio que la vista del cliente; pocos pedidos en tránsito
                  a la vez, así que no satura de WebViews. */}
              {(p.estado === "en_compra" || p.estado === "en_camino") &&
                p.repartidor_lat != null && p.repartidor_lng != null &&
                p.repartidor_ubicacion_at &&
                (Date.now() - new Date(p.repartidor_ubicacion_at).getTime()) < 15 * 60 * 1000 &&
                (() => {
                  const m = p.direccion_entrega.match(/\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]/);
                  if (!m) return null;
                  return (
                    <View style={{ marginTop: 8 }}>
                      <MapaTrackingClienteRN
                        repartidor={{ lat: p.repartidor_lat!, lng: p.repartidor_lng! }}
                        cliente={{ lat: parseFloat(m[1]), lng: parseFloat(m[2]) }}
                        altura={150}
                      />
                    </View>
                  );
                })()}

              {p.repartidor_rating != null || p.repartidor_review ? (
                <View style={styles.calBox}>
                  <Text style={styles.calTitle}>Calificación del cliente</Text>
                  {p.repartidor_rating != null && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Text key={n} style={[styles.star, n > (p.repartidor_rating ?? 0) && styles.starOff]}>⭐</Text>
                      ))}
                      <Text style={styles.calNum}>{p.repartidor_rating}/5</Text>
                    </View>
                  )}
                  {p.repartidor_review ? (
                    <Text style={styles.calTxt}>&ldquo;{p.repartidor_review}&rdquo;</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterSlider: { flexGrow: 0, flexShrink: 0 },
  filters: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  chipActive: { backgroundColor: "#F2A65A", borderColor: "#F2A65A" },
  chipText: { fontSize: 12, color: "#8B7B69", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  list: { padding: 12, paddingTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cliente: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  meta: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  total: { fontSize: 15, fontWeight: "800", color: "#F2A65A", marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" },
  tel: { fontSize: 12, color: "#8B7B69" },
  miniBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  miniBtnTxt: { fontSize: 11, fontWeight: "700" },
  items: { backgroundColor: "#F9FAFB", borderRadius: 8, padding: 8, marginTop: 8 },
  itemTxt: { fontSize: 12, color: "#1F2937" },
  itemTxtFaint: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  repTxt: { fontSize: 11, color: "#6B7280", marginTop: 6 },
  calBox: { backgroundColor: "#FEF3C7", borderRadius: 10, padding: 8, marginTop: 8, borderWidth: 1, borderColor: "#FCD34D" },
  calTitle: { fontSize: 10, fontWeight: "700", color: "#92400E", textTransform: "uppercase", marginBottom: 4 },
  star: { fontSize: 14 },
  starOff: { opacity: 0.25 },
  calNum: { fontSize: 11, fontWeight: "700", color: "#92400E", marginLeft: 4 },
  calTxt: { fontSize: 12, color: "#1F2937", fontStyle: "italic", marginTop: 2 },
  empty: { textAlign: "center", color: "#8B7B69", padding: 30 },
});
