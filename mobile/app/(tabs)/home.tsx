import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native";
import { listarProductos, type Producto } from "../../src/api/catalogo";
import { useCart } from "../../src/contexts/CartContext";

export default function HomeScreen() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { agregar, items, cambiarCantidad } = useCart();

  async function load() {
    setError(null);
    try {
      const data = await listarProductos();
      setProductos(data);
    } catch (e) {
      setError((e as { error?: string })?.error ?? "Error al cargar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF7A2B" />
      </View>
    );
  }

  return (
    <FlatList
      data={productos}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.empty}>{error ?? "No hay productos disponibles ahora"}</Text>
        </View>
      }
      renderItem={({ item }) => {
        const primerPrecio = item.precios[0];
        if (!primerPrecio) return null;
        const enCarrito = items.find((i) => i.producto_id === item.id && i.puesto_id === primerPrecio.puesto_id);
        return (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.info}>
                <Text style={styles.nombre}>{item.nombre}</Text>
                <Text style={styles.meta}>{primerPrecio.puesto_nombre}</Text>
                <Text style={styles.precio}>${primerPrecio.precio.toFixed(2)} / {item.unidad}</Text>
              </View>
              {enCarrito ? (
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={[styles.qtyButton, styles.qtyMinus]}
                    onPress={() => cambiarCantidad(item.id, primerPrecio.puesto_id, -1)}
                  >
                    <Text style={styles.qtyButtonText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyCount}>{enCarrito.cantidad}</Text>
                  <TouchableOpacity
                    style={[styles.qtyButton, styles.qtyPlus]}
                    onPress={() => cambiarCantidad(item.id, primerPrecio.puesto_id, 1)}
                  >
                    <Text style={styles.qtyButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.addButton} onPress={() => agregar(item, primerPrecio.puesto_id)}>
                  <Text style={styles.addButtonText}>Agregar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  info: { flex: 1, paddingRight: 12 },
  nombre: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  meta: { fontSize: 12, color: "#8B7B69", marginTop: 2 },
  precio: { fontSize: 16, fontWeight: "700", color: "#FF7A2B", marginTop: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { color: "#8B7B69", textAlign: "center" },
  addButton: { backgroundColor: "#FF7A2B", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  addButtonText: { color: "#fff", fontWeight: "700" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  qtyMinus: { backgroundColor: "#FEE2E2" },
  qtyPlus: { backgroundColor: "#DCFCE7" },
  qtyButtonText: { fontSize: 20, fontWeight: "700", color: "#1F2937" },
  qtyCount: { width: 28, textAlign: "center", fontWeight: "700", fontSize: 16 },
});
