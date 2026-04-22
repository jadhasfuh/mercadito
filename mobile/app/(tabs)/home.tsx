import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { listarProductos, type Producto } from "../../src/api/catalogo";

export default function HomeScreen() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const precio = item.precios[0]?.precio;
        const tienda = item.precios[0]?.puesto_nombre;
        return (
          <View style={styles.card}>
            <Text style={styles.nombre}>{item.nombre}</Text>
            {tienda ? <Text style={styles.meta}>{tienda}</Text> : null}
            {precio ? <Text style={styles.precio}>${precio.toFixed(2)} / {item.unidad}</Text> : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8 },
  nombre: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  meta: { fontSize: 12, color: "#8B7B69", marginTop: 2 },
  precio: { fontSize: 16, fontWeight: "700", color: "#FF7A2B", marginTop: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { color: "#8B7B69", textAlign: "center" },
});
