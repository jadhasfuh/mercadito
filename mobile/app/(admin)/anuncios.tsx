import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, TextInput, Alert, Switch, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { listarAnuncios, crearAnuncio, toggleAnuncio, borrarAnuncio, type Anuncio } from "../../src/api/admin";
import ScreenHeader from "../../src/components/ScreenHeader";

const TIPOS = [
  { id: "general", label: "Todos" },
  { id: "clientes", label: "Clientes" },
  { id: "tiendas", label: "Tiendas" },
  { id: "repartidores", label: "Repartidores" },
];

export default function AnunciosScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Anuncio[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [tipo, setTipo] = useState("general");
  const [creando, setCreando] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listarAnuncios();
      setItems(data);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleCrear() {
    if (!titulo.trim() || !mensaje.trim()) {
      Alert.alert("Falta", "Completa título y mensaje");
      return;
    }
    setCreando(true);
    try {
      await crearAnuncio(titulo.trim(), mensaje.trim(), tipo);
      setTitulo(""); setMensaje(""); setTipo("general");
      await load();
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo crear");
    } finally {
      setCreando(false);
    }
  }

  async function handleToggle(a: Anuncio) {
    try {
      await toggleAnuncio(a.id, !a.activo);
      await load();
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "Error");
    }
  }

  function handleBorrar(a: Anuncio) {
    Alert.alert("Borrar anuncio", `¿Eliminar "${a.titulo}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        try { await borrarAnuncio(a.id); await load(); }
        catch (e) { Alert.alert("Error", (e as { error?: string })?.error ?? "Error"); }
      }},
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Anuncios" subtitle="Banners para clientes / tiendas / repartidores" />
      <FlatList
      data={items}
      keyExtractor={(a) => a.id}
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Nuevo anuncio</Text>
          <TextInput value={titulo} onChangeText={setTitulo} placeholder="Título" style={styles.input} />
          <TextInput value={mensaje} onChangeText={setMensaje} placeholder="Mensaje" multiline style={[styles.input, { minHeight: 60 }]} />
          <Text style={styles.label}>Audiencia</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {TIPOS.map((t) => (
              <TouchableOpacity key={t.id} onPress={() => setTipo(t.id)} style={[styles.audChip, tipo === t.id && styles.audChipActive]}>
                <Text style={[styles.audChipTxt, tipo === t.id && styles.audChipTxtActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={handleCrear} disabled={creando} style={styles.crearBtn}>
            <Ionicons name="megaphone-outline" size={18} color="#fff" />
            <Text style={styles.crearTxt}>{creando ? "Publicando…" : "Publicar"}</Text>
          </TouchableOpacity>
        </View>
      }
      ListEmptyComponent={
        loading ? <Text style={styles.empty}>Cargando…</Text> : <Text style={styles.empty}>No hay anuncios</Text>
      }
      renderItem={({ item: a }) => (
        <View style={[styles.card, !a.activo && { opacity: 0.6 }]}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTitulo} numberOfLines={1}>{a.titulo}</Text>
            <Switch value={a.activo} onValueChange={() => handleToggle(a)} trackColor={{ false: "#E5E7EB", true: "#FF7A2B" }} thumbColor="#fff" />
          </View>
          <Text style={styles.cardTipo}>{TIPOS.find((t) => t.id === a.tipo)?.label ?? a.tipo}</Text>
          <Text style={styles.cardMsg}>{a.mensaje}</Text>
          <TouchableOpacity style={styles.borrarBtn} onPress={() => handleBorrar(a)}>
            <Ionicons name="trash-outline" size={14} color="#DC2626" />
            <Text style={styles.borrarTxt}>Borrar</Text>
          </TouchableOpacity>
        </View>
      )}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  content: { padding: 12 },
  formCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12 },
  formTitle: { fontSize: 14, fontWeight: "700", color: "#1F2937", marginBottom: 8 },
  label: { fontSize: 11, color: "#8B7B69", textTransform: "uppercase", fontWeight: "700", marginTop: 6, marginBottom: 4 },
  input: { backgroundColor: "#F9FAFB", borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 8, color: "#1F2937" },
  audChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#F3EFE7" },
  audChipActive: { backgroundColor: "#FF7A2B" },
  audChipTxt: { fontSize: 12, color: "#8B7B69", fontWeight: "600" },
  audChipTxtActive: { color: "#fff" },
  crearBtn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 10, marginTop: 10 },
  crearTxt: { color: "#fff", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitulo: { fontSize: 14, fontWeight: "700", color: "#1F2937", flex: 1, paddingRight: 8 },
  cardTipo: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  cardMsg: { fontSize: 13, color: "#374151", marginTop: 6 },
  borrarBtn: { flexDirection: "row", alignSelf: "flex-end", alignItems: "center", gap: 4, marginTop: 6 },
  borrarTxt: { color: "#DC2626", fontSize: 11, fontWeight: "600" },
  empty: { textAlign: "center", color: "#8B7B69", padding: 30 },
});
