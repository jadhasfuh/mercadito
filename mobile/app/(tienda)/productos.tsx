import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TextInput, TouchableOpacity, Alert, RefreshControl, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../src/contexts/SessionContext";
import { listarProductos, type Producto } from "../../src/api/catalogo";
import { actualizarPrecio, editarProducto, filtrarProductosDePuesto, precioPropio } from "../../src/api/tienda";

export default function TiendaProductosScreen() {
  const { usuario } = useSession();
  const insets = useSafeAreaInsets();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [editandoPrecio, setEditandoPrecio] = useState<{ producto: Producto; valor: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listarProductos();
      setProductos(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mis = useMemo(() => {
    if (!usuario?.puesto_id) return [];
    const base = filtrarProductosDePuesto(productos, usuario.puesto_id);
    const q = busqueda.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) => p.nombre.toLowerCase().includes(q));
  }, [productos, usuario, busqueda]);

  async function toggleDisponible(p: Producto) {
    const nuevo = !(p.disponible ?? true);
    try {
      await editarProducto(p.id, { disponible: nuevo });
      setProductos((prev) => prev.map((x) => x.id === p.id ? { ...x, disponible: nuevo } : x));
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo actualizar");
    }
  }

  async function guardarPrecio() {
    if (!editandoPrecio || !usuario?.puesto_id) return;
    const nuevo = parseFloat(editandoPrecio.valor);
    if (isNaN(nuevo) || nuevo < 0) { Alert.alert("Precio inválido"); return; }
    setGuardando(true);
    try {
      await actualizarPrecio(editandoPrecio.producto.id, usuario.puesto_id, nuevo);
      await load();
      setEditandoPrecio(null);
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#FF7A2B" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color="#8B7B69" />
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar producto…"
          style={styles.searchInput}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda("")}>
            <Ionicons name="close-circle" size={18} color="#8B7B69" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={mis}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 12 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="pricetags-outline" size={48} color="#D4C9B8" />
            <Text style={styles.empty}>{busqueda ? "Sin resultados" : "Aún no tienes productos con precio en tu tienda"}</Text>
            <Text style={styles.emptyHint}>Para agregar productos nuevos con foto, usa la versión web en mercadito.cx</Text>
          </View>
        }
        renderItem={({ item }) => {
          const precio = usuario?.puesto_id ? precioPropio(item, usuario.puesto_id) : null;
          const disponible = item.disponible !== false;
          return (
            <View style={[styles.card, !disponible && styles.cardPausado]}>
              <View style={styles.row}>
                <View style={styles.info}>
                  <Text style={styles.nombre} numberOfLines={2}>{item.nombre}</Text>
                  {item.seccion || item.subseccion ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      {[item.seccion, item.subseccion].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.precioBox}>
                  <Text style={styles.precio}>${precio?.toFixed(2) ?? "—"}</Text>
                  <Text style={styles.unidad}>/ {item.unidad}</Text>
                </View>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.pill, disponible ? styles.pillOn : styles.pillOff]}
                  onPress={() => toggleDisponible(item)}
                >
                  <Ionicons name={disponible ? "eye-outline" : "eye-off-outline"} size={14} color={disponible ? "#059669" : "#8B7B69"} />
                  <Text style={[styles.pillText, disponible ? styles.pillTextOn : styles.pillTextOff]}>
                    {disponible ? "Visible" : "Pausado"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pillEdit}
                  onPress={() => setEditandoPrecio({ producto: item, valor: precio != null ? String(precio) : "" })}
                >
                  <Ionicons name="pencil-outline" size={14} color="#1F2937" />
                  <Text style={styles.pillEditText}>Editar precio</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {/* Modal: editar precio */}
      <Modal
        visible={!!editandoPrecio}
        transparent
        animationType="fade"
        onRequestClose={() => setEditandoPrecio(null)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar precio</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>{editandoPrecio?.producto.nombre}</Text>
            <View style={styles.modalInputRow}>
              <Text style={styles.currencySign}>$</Text>
              <TextInput
                value={editandoPrecio?.valor ?? ""}
                onChangeText={(t) => setEditandoPrecio((prev) => prev ? { ...prev, valor: t } : prev)}
                keyboardType="decimal-pad"
                style={styles.modalInput}
                autoFocus
                placeholder="0.00"
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonGhost]}
                onPress={() => setEditandoPrecio(null)}
              >
                <Text style={styles.modalButtonGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, guardando && styles.modalButtonDisabled]}
                onPress={guardarPrecio}
                disabled={guardando}
              >
                <Text style={styles.modalButtonText}>{guardando ? "Guardando…" : "Guardar"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 6, margin: 12, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff", borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 },
  cardPausado: { opacity: 0.6 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  info: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  meta: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  precioBox: { alignItems: "flex-end" },
  precio: { fontSize: 18, fontWeight: "700", color: "#FF7A2B" },
  unidad: { fontSize: 11, color: "#8B7B69", marginTop: -2 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  pillOn: { backgroundColor: "#DCFCE7" },
  pillOff: { backgroundColor: "#F3F4F6" },
  pillText: { fontSize: 12, fontWeight: "600" },
  pillTextOn: { color: "#059669" },
  pillTextOff: { color: "#8B7B69" },
  pillEdit: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#FFF2E5" },
  pillEditText: { fontSize: 12, fontWeight: "600", color: "#1F2937" },
  empty: { color: "#8B7B69", textAlign: "center", marginTop: 10, fontSize: 15 },
  emptyHint: { color: "#8B7B69", textAlign: "center", marginTop: 6, fontSize: 12, opacity: 0.7 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  modalSubtitle: { fontSize: 13, color: "#8B7B69", marginTop: 4, marginBottom: 14 },
  modalInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12 },
  currencySign: { fontSize: 18, color: "#8B7B69", marginRight: 4 },
  modalInput: { flex: 1, fontSize: 20, fontWeight: "700", paddingVertical: 12 },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 999, alignItems: "center" },
  modalButtonPrimary: { backgroundColor: "#FF7A2B" },
  modalButtonDisabled: { backgroundColor: "#D4D4D8" },
  modalButtonText: { color: "#fff", fontWeight: "700" },
  modalButtonGhost: { backgroundColor: "#F3F4F6" },
  modalButtonGhostText: { color: "#1F2937", fontWeight: "600" },
});
