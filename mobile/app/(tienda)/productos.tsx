import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TextInput, TouchableOpacity, Alert, RefreshControl, Image, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSession } from "../../src/contexts/SessionContext";
import { listarProductos, type Producto } from "../../src/api/catalogo";
import { filtrarProductosDePuesto, precioPropio } from "../../src/api/tienda";
import ProductoDetalleModal from "../../src/components/ProductoDetalleModal";

export default function TiendaProductosScreen() {
  const { usuario } = useSession();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [seccionFiltro, setSeccionFiltro] = useState<string | null>(null);
  const [subseccionFiltro, setSubseccionFiltro] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<Producto | null>(null);

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
    return filtrarProductosDePuesto(productos, usuario.puesto_id);
  }, [productos, usuario]);

  const secciones = useMemo(() => {
    return Array.from(new Set(mis.map((p) => p.seccion).filter(Boolean))) as string[];
  }, [mis]);

  const subsecciones = useMemo(() => {
    const base = seccionFiltro ? mis.filter((p) => p.seccion === seccionFiltro) : mis;
    return Array.from(new Set(base.map((p) => p.subseccion).filter(Boolean))) as string[];
  }, [mis, seccionFiltro]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return mis.filter((p) => {
      if (seccionFiltro && p.seccion !== seccionFiltro) return false;
      if (subseccionFiltro && p.subseccion !== subseccionFiltro) return false;
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [mis, seccionFiltro, subseccionFiltro, busqueda]);

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

      {/* Filtros por sección */}
      {secciones.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <Chip label="Todo" active={!seccionFiltro} onPress={() => { setSeccionFiltro(null); setSubseccionFiltro(null); }} />
          {secciones.map((s) => (
            <Chip key={s} label={s} active={seccionFiltro === s} onPress={() => { setSeccionFiltro(s === seccionFiltro ? null : s); setSubseccionFiltro(null); }} />
          ))}
        </ScrollView>
      )}

      {/* Subsección */}
      {subsecciones.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRowSmall}>
          <ChipSmall label="Todo" active={!subseccionFiltro} onPress={() => setSubseccionFiltro(null)} />
          {subsecciones.map((s) => (
            <ChipSmall key={s} label={s} active={subseccionFiltro === s} onPress={() => setSubseccionFiltro(s === subseccionFiltro ? null : s)} />
          ))}
        </ScrollView>
      )}

      <FlatList
        data={filtrados}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 12, paddingTop: 4, paddingBottom: 80 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="pricetags-outline" size={48} color="#D4C9B8" />
            <Text style={styles.empty}>{busqueda || seccionFiltro ? "Sin resultados" : "Aún no tienes productos"}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const precio = usuario?.puesto_id ? precioPropio(item, usuario.puesto_id) : null;
          const disponible = item.disponible !== false;
          return (
            <TouchableOpacity style={[styles.card, !disponible && styles.cardPausado]} onPress={() => setSeleccionado(item)}>
              {item.imagen ? (
                <Image source={{ uri: item.imagen }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Ionicons name="image-outline" size={24} color="#D4C9B8" />
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.nombre} numberOfLines={2}>{item.nombre}</Text>
                {item.seccion || item.subseccion ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    {[item.seccion, item.subseccion].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
                {item.horarios && item.horarios.length > 0 && (
                  <Text style={styles.horarios} numberOfLines={1}>
                    <Ionicons name="time-outline" size={10} /> {item.horarios.map((h) => h.nombre).join(", ")}
                  </Text>
                )}
                {!disponible && (
                  <View style={styles.pausadoTag}>
                    <Ionicons name="eye-off-outline" size={11} color="#8B7B69" />
                    <Text style={styles.pausadoText}>Pausado</Text>
                  </View>
                )}
              </View>
              <View style={styles.precioBox}>
                <Text style={styles.precio}>${precio?.toFixed(2) ?? "—"}</Text>
                <Text style={styles.unidad}>/ {item.unidad}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* FAB Agregar producto */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 20 + insets.bottom }]}
        onPress={() => router.push("/(tienda)/agregar-producto")}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <ProductoDetalleModal
        visible={!!seleccionado}
        producto={seleccionado}
        onClose={() => setSeleccionado(null)}
        onSaved={() => { setSeleccionado(null); load(); }}
      />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ChipSmall({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chipSmall, active && styles.chipSmallActive]} onPress={onPress}>
      <Text style={[styles.chipSmallText, active && styles.chipSmallTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 6, margin: 12, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff", borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  chipsRow: { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  chipActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  chipText: { fontSize: 13, color: "#8B7B69", fontWeight: "500" },
  chipTextActive: { color: "#fff" },
  chipsRowSmall: { paddingHorizontal: 12, paddingVertical: 4, gap: 4 },
  chipSmall: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "#F3EFE7" },
  chipSmallActive: { backgroundColor: "#1F2937" },
  chipSmallText: { fontSize: 11, color: "#8B7B69", fontWeight: "500" },
  chipSmallTextActive: { color: "#fff" },
  card: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 12, padding: 10, marginBottom: 8, alignItems: "center", gap: 10 },
  cardPausado: { opacity: 0.65 },
  thumb: { width: 54, height: 54, borderRadius: 8 },
  thumbPlaceholder: { backgroundColor: "#F3EFE7", alignItems: "center", justifyContent: "center" },
  info: { flex: 1 },
  nombre: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  meta: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  horarios: { fontSize: 10, color: "#FF7A2B", marginTop: 2 },
  pausadoTag: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: "#F3F4F6" },
  pausadoText: { fontSize: 10, color: "#8B7B69", fontWeight: "600" },
  precioBox: { alignItems: "flex-end" },
  precio: { fontSize: 16, fontWeight: "700", color: "#FF7A2B" },
  unidad: { fontSize: 10, color: "#8B7B69", marginTop: -2 },
  empty: { color: "#8B7B69", textAlign: "center", marginTop: 10, fontSize: 15 },
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: "#FF7A2B", alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6 },
});
