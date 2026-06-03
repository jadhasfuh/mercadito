import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator,
  TouchableOpacity, Alert, Image, Modal, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listarPagosPendientes, validarPago } from "../../src/api/admin";
import type { Pedido } from "../../src/api/pedidos";
import PedidoDesgloseRN from "../../src/components/PedidoDesglose";
import ScreenHeader from "../../src/components/ScreenHeader";
import Loader from "../../src/components/Loader";

export default function PagosPendientesScreen() {
  const insets = useSafeAreaInsets();
  const [pagos, setPagos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [comprobanteZoom, setComprobanteZoom] = useState<string | null>(null);
  const [validando, setValidando] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listarPagosPendientes();
      setPagos(data);
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudieron cargar los pagos");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [load]);

  function confirmarValidar(pedidoId: string) {
    Alert.alert(
      "¿Confirmar pago?",
      "Se avisará al cliente y al equipo que el pago quedó validado.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Validar pago",
          style: "default",
          onPress: async () => {
            setValidando(pedidoId);
            try {
              await validarPago(pedidoId);
              await load();
            } catch (e) {
              Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo validar");
            } finally {
              setValidando(null);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Pagos" />
        <Loader texto="Cargando pagos…" />
      </View>
    );
  }

  if (pagos.length === 0) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Pagos" subtitle="Sin pagos pendientes" />
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={64} color="#10B981" />
          <Text style={styles.emptyText}>Sin pagos pendientes</Text>
          <Text style={styles.emptyHint}>Los nuevos pagos por transferencia aparecerán aquí para validar.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Pagos" subtitle={`${pagos.length} pendiente${pagos.length !== 1 ? "s" : ""}`} />

      <FlatList
        data={pagos}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>{item.cliente_nombre}</Text>
                <Text style={styles.meta}>
                  {new Date(item.created_at).toLocaleString("es-MX")} · #{item.id.slice(0, 8).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.total}>${Number(item.total).toFixed(2)}</Text>
            </View>

            <View style={styles.contactRow}>
              <Text style={styles.tel}>📱 {item.cliente_telefono}</Text>
              <TouchableOpacity
                style={styles.waBtn}
                onPress={() => Linking.openURL(`https://wa.me/52${item.cliente_telefono.replace(/\D/g, "")}`)}
              >
                <Ionicons name="logo-whatsapp" size={14} color="#059669" />
                <Text style={styles.waBtnTxt}>WhatsApp</Text>
              </TouchableOpacity>
            </View>

            {/* Desglose de la compra para comparar con el comprobante */}
            <View style={{ marginBottom: 10 }}>
              <View style={styles.itemsList}>
                {item.items.map((it) => (
                  <View key={it.id} style={styles.itemRow}>
                    <Text style={styles.itemLabel} numberOfLines={1}>
                      {Number(it.cantidad)} {it.unidad ?? ""} {it.producto_nombre}
                    </Text>
                    <Text style={styles.itemSub}>${Number(it.subtotal).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
              <PedidoDesgloseRN pedido={item} />
            </View>

            {item.comprobante_pago ? (
              <TouchableOpacity onPress={() => setComprobanteZoom(item.comprobante_pago!)}>
                <Image source={{ uri: item.comprobante_pago }} style={styles.comprobante} resizeMode="contain" />
                <Text style={styles.zoomHint}>Toca la imagen para ampliar</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.noComprobante}>
                <Ionicons name="warning-outline" size={18} color="#DC2626" />
                <Text style={styles.noComprobanteTxt}>Sin comprobante — revisa manualmente</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.validarBtn, validando === item.id && styles.validarBtnLoading]}
              onPress={() => confirmarValidar(item.id)}
              disabled={validando === item.id}
            >
              {validando === item.id ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.validarBtnTxt}>Validar pago y liberar pedido</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={!!comprobanteZoom} transparent animationType="fade" onRequestClose={() => setComprobanteZoom(null)}>
        <TouchableOpacity style={styles.zoomOverlay} activeOpacity={1} onPress={() => setComprobanteZoom(null)}>
          {comprobanteZoom && (
            <Image source={{ uri: comprobanteZoom }} style={styles.zoomImg} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.zoomClose} onPress={() => setComprobanteZoom(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FCFBFA" },
  header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F3EFE7" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  headerHint: { fontSize: 12, color: "#8B7B69", marginTop: 2 },
  list: { padding: 12 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#F3F4F6", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
  nombre: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  meta: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  total: { fontSize: 18, fontWeight: "800", color: "#C2680E" },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  tel: { fontSize: 13, color: "#4B5563" },
  waBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#D1FAE5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  waBtnTxt: { color: "#065F46", fontSize: 11, fontWeight: "600" },
  comprobante: { width: "100%", height: 220, borderRadius: 10, backgroundColor: "#F3F4F6", marginBottom: 4 },
  zoomHint: { fontSize: 11, color: "#8B7B69", textAlign: "center", marginBottom: 10 },
  noComprobante: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF3C7", padding: 10, borderRadius: 10, marginBottom: 10 },
  noComprobanteTxt: { color: "#92400E", fontSize: 13, flex: 1 },
  validarBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#059669", paddingVertical: 14, borderRadius: 12 },
  validarBtnLoading: { opacity: 0.7 },
  validarBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
  itemsList: { backgroundColor: "#F9FAFB", borderRadius: 8, padding: 8, marginBottom: 6, maxHeight: 120 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  itemLabel: { flex: 1, fontSize: 12, color: "#374151", paddingRight: 6 },
  itemSub: { fontSize: 12, color: "#6B7280" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FCFBFA" },
  emptyText: { fontSize: 18, color: "#1F2937", fontWeight: "700", marginTop: 12 },
  emptyHint: { color: "#8B7B69", marginTop: 6, textAlign: "center" },
  zoomOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" },
  zoomImg: { width: "100%", height: "100%" },
  zoomClose: { position: "absolute", top: 40, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
});
