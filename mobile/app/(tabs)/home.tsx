import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listarProductos, type Producto } from "../../src/api/catalogo";
import { useCart } from "../../src/contexts/CartContext";
import { catInfo } from "../../src/lib/categorias";

export default function HomeScreen() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
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

  const categoriasDisponibles = useMemo(() => {
    return Array.from(new Set(productos.map((p) => p.categoria_id)));
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    const base = categoriaFiltro ? productos.filter((p) => p.categoria_id === categoriaFiltro) : productos;
    return base.filter((p) => p.precios.length > 0);
  }, [productos, categoriaFiltro]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF7A2B" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Category chips */}
      {categoriasDisponibles.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <CategoryChip
            label="Todo"
            icon="apps-outline"
            active={categoriaFiltro === null}
            onPress={() => setCategoriaFiltro(null)}
          />
          {categoriasDisponibles.map((cat) => {
            const info = catInfo(cat);
            return (
              <CategoryChip
                key={cat}
                label={info.nombre}
                icon={info.icon}
                active={categoriaFiltro === cat}
                onPress={() => setCategoriaFiltro(categoriaFiltro === cat ? null : cat)}
              />
            );
          })}
        </ScrollView>
      )}

      <FlatList
        data={productosFiltrados}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="basket-outline" size={48} color="#D4C9B8" />
            <Text style={styles.empty}>{error ?? "No hay productos en esta categoría"}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.nombre}>{item.nombre}</Text>
            {item.descripcion ? <Text style={styles.descripcion} numberOfLines={2}>{item.descripcion}</Text> : null}
            <View style={styles.preciosRow}>
              {item.precios.map((precio) => {
                const enCarrito = items.find((i) => i.producto_id === item.id && i.puesto_id === precio.puesto_id);
                return (
                  <View key={precio.puesto_id} style={styles.precioItem}>
                    <View style={styles.precioInfo}>
                      <Text style={styles.precio}>${precio.precio.toFixed(2)}</Text>
                      <Text style={styles.tiendaNombre} numberOfLines={1}>{precio.puesto_nombre}</Text>
                    </View>
                    {enCarrito ? (
                      <View style={styles.qtyRow}>
                        <TouchableOpacity
                          style={[styles.qtyButton, styles.qtyMinus]}
                          onPress={() => cambiarCantidad(item.id, precio.puesto_id, -1)}
                        >
                          <Ionicons name="remove" size={18} color="#DC2626" />
                        </TouchableOpacity>
                        <Text style={styles.qtyCount}>{enCarrito.cantidad}</Text>
                        <TouchableOpacity
                          style={[styles.qtyButton, styles.qtyPlus]}
                          onPress={() => cambiarCantidad(item.id, precio.puesto_id, 1)}
                        >
                          <Ionicons name="add" size={18} color="#059669" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.addButton} onPress={() => agregar(item, precio.puesto_id)}>
                        <Ionicons name="add" size={18} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      />
    </View>
  );
}

function CategoryChip({ label, icon, active, onPress }: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={16} color={active ? "#fff" : "#8B7B69"} />
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  chipRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  chipActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  chipText: { fontSize: 13, color: "#8B7B69", fontWeight: "500" },
  chipTextActive: { color: "#fff" },
  list: { padding: 12, paddingTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8 },
  nombre: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  descripcion: { fontSize: 12, color: "#8B7B69", marginTop: 2 },
  preciosRow: { marginTop: 10, gap: 6 },
  precioItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFF7EB", borderRadius: 10, padding: 10 },
  precioInfo: { flex: 1, paddingRight: 10 },
  precio: { fontSize: 16, fontWeight: "700", color: "#FF7A2B" },
  tiendaNombre: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  addButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FF7A2B", alignItems: "center", justifyContent: "center" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  qtyMinus: { backgroundColor: "#FEE2E2" },
  qtyPlus: { backgroundColor: "#DCFCE7" },
  qtyCount: { width: 22, textAlign: "center", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { color: "#8B7B69", textAlign: "center", marginTop: 10 },
});
