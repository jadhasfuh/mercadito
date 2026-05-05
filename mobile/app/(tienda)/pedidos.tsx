import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Linking, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../src/contexts/SessionContext";
import { listarPedidos } from "../../src/api/repartidor";
import type { Pedido, EstadoPedido } from "../../src/api/pedidos";
import ScreenHeader from "../../src/components/ScreenHeader";

const ESTADO_INFO: Record<EstadoPedido, { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  pendiente: { label: "Pendiente", color: "#92400E", bg: "#FEF3C7", icon: "hourglass-outline" },
  en_compra: { label: "Comprando", color: "#1E40AF", bg: "#DBEAFE", icon: "basket-outline" },
  en_camino: { label: "En camino", color: "#6B21A8", bg: "#EDE9FE", icon: "bicycle-outline" },
  entregado: { label: "Entregado", color: "#065F46", bg: "#D1FAE5", icon: "checkmark-circle-outline" },
  cancelado: { label: "Cancelado", color: "#991B1B", bg: "#FEE2E2", icon: "close-circle-outline" },
};

export default function TiendaPedidosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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

  // Pedidos activos: catálogo (items propios) + B2B (solicitados por
  // mi tienda). Sin el OR los pedidos B2B (sin items) no aparecían.
  const filtered = useMemo(() => {
    if (!usuario?.puesto_id) return [];
    return pedidos.filter((p) =>
      p.estado !== "entregado" &&
      p.estado !== "cancelado" &&
      (p.items.some((i) => i.puesto_id === usuario.puesto_id) ||
        p.solicitado_por_tienda_id === usuario.puesto_id)
    );
  }, [pedidos, usuario]);

  // Entregados recientes — todos (con o sin reseña), incluye B2B.
  // Tope 10 para no inundar la pantalla.
  const pedidosEntregados = useMemo(() => {
    if (!usuario?.puesto_id) return [];
    return pedidos
      .filter((p) =>
        p.estado === "entregado" &&
        (p.items.some((i) => i.puesto_id === usuario.puesto_id) ||
          p.solicitado_por_tienda_id === usuario.puesto_id)
      )
      .slice(0, 10);
  }, [pedidos, usuario]);

  // Cuenta semanal: total de envíos B2B absorbidos por la tienda en
  // últimos 7 días, ya entregados. Es lo que la tienda nos debe.
  const cuentaSemanal = useMemo(() => {
    if (!usuario?.puesto_id) return 0;
    const haceSiete = Date.now() - 7 * 24 * 3600 * 1000;
    return pedidos
      .filter((p) =>
        p.tipo === "envio" &&
        p.solicitado_por_tienda_id === usuario.puesto_id &&
        p.envio_pagado_por === "tienda" &&
        p.estado === "entregado" &&
        new Date(p.created_at).getTime() >= haceSiete
      )
      .reduce((s, p) => s + Number(p.costo_envio ?? 0), 0);
  }, [pedidos, usuario]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#FF7A2B" /></View>;
  }

  // Sections: activos primero, luego entregados recientes.
  type Seccion = { tipo: "header"; titulo: string; key: string } | { tipo: "pedido"; pedido: Pedido; key: string };
  const data: Seccion[] = [];
  if (filtered.length > 0) {
    data.push({ tipo: "header", titulo: "Activos", key: "h-activos" });
    for (const p of filtered) data.push({ tipo: "pedido", pedido: p, key: p.id });
  }
  if (pedidosEntregados.length > 0) {
    data.push({ tipo: "header", titulo: "Entregados recientes", key: "h-entregados" });
    for (const p of pedidosEntregados) data.push({ tipo: "pedido", pedido: p, key: `r-${p.id}` });
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#FFF7EB" }}>
    <ScreenHeader title="Pedidos" subtitle={`${filtered.length} activo${filtered.length !== 1 ? "s" : ""}`} />
    <FlatList
      style={{ flex: 1, backgroundColor: "#FFF7EB" }}
      data={data}
      keyExtractor={(d) => d.key}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <>
          <TouchableOpacity
            style={styles.solicitarBtn}
            onPress={() => router.push("/solicitar-repartidor")}
            activeOpacity={0.85}
          >
            <Text style={styles.solicitarEmoji}>🛵</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.solicitarTitle}>Solicitar repartidor</Text>
              <Text style={styles.solicitarSub}>¿Te llegó un pedido por tu cuenta? Lo entregamos por ti.</Text>
            </View>
            <Text style={styles.solicitarArrow}>→</Text>
          </TouchableOpacity>
          {cuentaSemanal > 0 && (
            <View style={styles.cuentaCard}>
              <Text style={styles.cuentaLabel}>TU CUENTA DE ENVÍOS</Text>
              <View style={styles.cuentaRow}>
                <Text style={styles.cuentaMonto}>${cuentaSemanal.toFixed(2)}</Text>
                <Text style={styles.cuentaPeriodo}>últimos 7 días</Text>
              </View>
              <Text style={styles.cuentaHint}>
                Envíos que absorbiste esta semana. Te lo cobramos al cierre por transferencia.
              </Text>
            </View>
          )}
          {filtered.length === 0 && pedidosEntregados.length === 0 && (
            <View style={styles.emptyInline}>
              <Ionicons name="receipt-outline" size={48} color="#D4C9B8" />
              <Text style={styles.emptyInlineText}>No tienes pedidos todavía</Text>
              <Text style={styles.emptyInlineHint}>Cuando subas tu catálogo o solicites un repartidor aparecerán aquí.</Text>
            </View>
          )}
        </>
      }
      renderItem={({ item }) => {
        if (item.tipo === "header") {
          return <Text style={styles.sectionHeader}>{item.titulo}</Text>;
        }
        const pedido = item.pedido;
        const info = ESTADO_INFO[pedido.estado];
        const esB2B = pedido.tipo === "envio" && pedido.solicitado_por_tienda_id === usuario?.puesto_id;
        const misItems = pedido.items.filter((i) => i.puesto_id === usuario!.puesto_id);
        // B2B: subtotal viene del campo del pedido; catálogo: suma items.
        const miTotal = esB2B
          ? Number(pedido.subtotal ?? 0)
          : misItems.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
        const envioTienda = esB2B && pedido.envio_pagado_por === "tienda" ? Number(pedido.costo_envio ?? 0) : 0;
        const tieneResena = pedido.repartidor_rating != null || !!pedido.repartidor_review;
        return (
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 }}>
                <View style={[styles.badge, { backgroundColor: info.bg }]}>
                  <Ionicons name={info.icon} size={14} color={info.color} />
                  <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
                </View>
                {esB2B && (
                  <View style={styles.b2bBadge}><Text style={styles.b2bBadgeTxt}>🛵 Solicitud</Text></View>
                )}
              </View>
              <Text style={styles.total}>${miTotal.toFixed(2)}</Text>
            </View>

            <Text style={styles.cliente}>{pedido.cliente_nombre}</Text>
            <Text style={styles.meta}>
              {new Date(pedido.created_at).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })} · #{pedido.id.slice(0, 8).toUpperCase()}
            </Text>

            {pedido.estado !== "entregado" && pedido.estado !== "cancelado" && (
              pedido.repartidor_nombre ? (
                <View style={styles.repartidorRow}>
                  <Ionicons name="bicycle" size={14} color="#065F46" />
                  <Text style={styles.repartidor}>{pedido.repartidor_nombre} {esB2B ? "va a recoger" : "va por el pedido"}</Text>
                </View>
              ) : (
                <View style={styles.esperandoRow}>
                  <Ionicons name="hourglass-outline" size={14} color="#92400E" />
                  <Text style={styles.esperando}>Esperando repartidor</Text>
                </View>
              )
            )}

            {esB2B ? (
              <View style={styles.items}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabel}>Cliente paga</Text>
                  <Text style={styles.itemValue}>${miTotal.toFixed(2)}</Text>
                </View>
                {envioTienda > 0 && (
                  <View style={styles.itemRow}>
                    <Text style={[styles.itemLabel, { color: "#92400E" }]}>Envío a tu cuenta</Text>
                    <Text style={[styles.itemValue, { color: "#92400E" }]}>${envioTienda.toFixed(2)}</Text>
                  </View>
                )}
                <Text style={[styles.itemLabel, { fontSize: 11, color: "#9CA3AF", marginTop: 4 }]}>📍 {pedido.direccion_entrega}</Text>
              </View>
            ) : (
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
            )}

            {pedido.notas ? (
              <View style={styles.notaBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#92400E" />
                <Text style={styles.notaText}>{pedido.notas}</Text>
              </View>
            ) : null}

            {tieneResena && (
              <View style={styles.resenaBox}>
                <Text style={styles.resenaTitulo}>Reseña del cliente</Text>
                {pedido.repartidor_rating != null && (
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Text key={n} style={[styles.star, n > (pedido.repartidor_rating ?? 0) && styles.starOff]}>⭐</Text>
                    ))}
                    <Text style={styles.ratingNum}>{pedido.repartidor_rating}/5</Text>
                  </View>
                )}
                {pedido.repartidor_review ? (
                  <Text style={styles.resenaTexto}>&ldquo;{pedido.repartidor_review}&rdquo;</Text>
                ) : null}
              </View>
            )}

            {pedido.estado !== "entregado" && pedido.estado !== "cancelado" && (
              <TouchableOpacity
                style={styles.whatsappButton}
                onPress={() => Linking.openURL(`https://wa.me/52${pedido.cliente_telefono.replace(/\D/g, "")}`)}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#059669" />
                <Text style={styles.whatsappText}>Contactar al cliente</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FFF7EB" },
  list: { padding: 12 },
  solicitarBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FF7A2B", borderRadius: 16, padding: 14, marginBottom: 12 },
  cuentaCard: { backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", borderRadius: 16, padding: 14, marginBottom: 12 },
  cuentaLabel: { fontSize: 10, fontWeight: "800", color: "#92400E", letterSpacing: 0.5 },
  cuentaRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 },
  cuentaMonto: { fontSize: 28, fontWeight: "900", color: "#78350F" },
  cuentaPeriodo: { fontSize: 11, color: "#92400E" },
  cuentaHint: { fontSize: 11, color: "#92400E", marginTop: 4, lineHeight: 15 },
  emptyInline: { alignItems: "center", paddingVertical: 30, paddingHorizontal: 20 },
  emptyInlineText: { fontSize: 15, fontWeight: "700", color: "#1F2937", marginTop: 10 },
  emptyInlineHint: { fontSize: 12, color: "#8B7B69", textAlign: "center", marginTop: 4, lineHeight: 16 },
  b2bBadge: { backgroundColor: "#FFE4D1", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  b2bBadgeTxt: { fontSize: 10, color: "#9A3412", fontWeight: "700" },
  solicitarEmoji: { fontSize: 28 },
  solicitarTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  solicitarSub: { color: "#FFE4D1", fontSize: 11, marginTop: 1 },
  solicitarArrow: { color: "#fff", fontSize: 22, fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 6 },
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
  sectionHeader: { fontSize: 12, fontWeight: "700", color: "#8B7B69", textTransform: "uppercase", marginTop: 6, marginBottom: 6, marginLeft: 2 },
  resenaBox: { backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#FCD34D" },
  resenaTitulo: { fontSize: 10, fontWeight: "700", color: "#92400E", textTransform: "uppercase", marginBottom: 4 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  star: { fontSize: 14 },
  starOff: { opacity: 0.25 },
  ratingNum: { fontSize: 12, fontWeight: "700", color: "#92400E", marginLeft: 4 },
  resenaTexto: { fontSize: 12, color: "#1F2937", fontStyle: "italic", marginTop: 4 },
});
