import { useCallback, useEffect, useState } from "react";
import { fechaHoraMX } from "../../src/lib/fecha";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert, RefreshControl, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  listarUsuariosAdmin,
  resetearPinUsuario,
  asignarPinUsuario,
  type UsuarioAdmin,
} from "../../src/api/admin";
import Loader from "../../src/components/Loader";
import ScreenHeader from "../../src/components/ScreenHeader";

const ROLES = ["", "cliente", "tienda", "repartidor", "admin"] as const;
const ROL_LABEL: Record<string, string> = {
  "": "Todos",
  cliente: "Clientes",
  tienda: "Tiendas",
  repartidor: "Repartidores",
  admin: "Admins",
};
const ROL_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  cliente: { label: "Cliente", bg: "#DBEAFE", color: "#1E40AF" },
  tienda: { label: "Tienda", bg: "#FEF3C7", color: "#92400E" },
  repartidor: { label: "Repartidor", bg: "#EDE9FE", color: "#6B21A8" },
  admin: { label: "Admin", bg: "#FEE2E2", color: "#991B1B" },
};

export default function UsuariosScreen() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [rolFiltro, setRolFiltro] = useState<string>("");
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Editor de PIN inline (antes usaba Alert.prompt, iOS-only → botón muerto en
  // Android). Mismo patrón que tiendas.tsx: TextInput inline en la card.
  const [pinEditando, setPinEditando] = useState<string | null>(null);
  const [pinTexto, setPinTexto] = useState("");
  const [guardandoPin, setGuardandoPin] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listarUsuariosAdmin(q.trim() || undefined, rolFiltro || undefined);
      setUsuarios(rows);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q, rolFiltro]);

  useEffect(() => { load(); }, [load]);

  function confirmarBorrar(u: UsuarioAdmin) {
    Alert.alert(
      "Resetear PIN",
      `Se generará un PIN nuevo para ${u.nombre} y te lo mostraremos para que se lo des.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Resetear",
          onPress: async () => {
            setBusy(u.id);
            try {
              const pin = await resetearPinUsuario(u.id);
              load();
              Alert.alert(
                "PIN reseteado",
                pin
                  ? `Nuevo PIN de ${u.nombre}: ${pin}\n\nDáselo para que entre; puede cambiarlo después.`
                  : "PIN actualizado."
              );
            } catch (e) {
              Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo");
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  }

  function asignarPin(u: UsuarioAdmin) {
    // Abre/cierra el editor inline para este usuario.
    setPinEditando(pinEditando === u.id ? null : u.id);
    setPinTexto("");
  }

  async function guardarPin(u: UsuarioAdmin) {
    const v = pinTexto.trim();
    if (!/^\d{6}$/.test(v)) { Alert.alert("PIN inválido", "Debe ser 6 dígitos numéricos"); return; }
    setGuardandoPin(true);
    try {
      await asignarPinUsuario(u.id, v);
      setPinEditando(null);
      setPinTexto("");
      Alert.alert("Listo", `PIN de ${u.nombre} cambiado a: ${v}`);
      load();
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo");
    } finally {
      setGuardandoPin(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Usuarios" />
        <Loader texto="Cargando usuarios…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Usuarios" subtitle="Gestión de cuentas y PINs" />
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#8B7B69" />
          <TextInput
            placeholderTextColor="#9C8B72"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={load}
            placeholder="Buscar por nombre o teléfono"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => { setQ(""); }}>
              <Ionicons name="close-circle" size={18} color="#8B7B69" />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rolRow}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r || "todos"}
              onPress={() => setRolFiltro(r)}
              style={[styles.rolChip, rolFiltro === r && styles.rolChipActive]}
            >
              <Text style={[styles.rolChipTxt, rolFiltro === r && styles.rolChipTxtActive]}>
                {ROL_LABEL[r]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={usuarios}
        keyExtractor={(u) => u.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Text style={styles.empty}>Sin resultados</Text>}
        renderItem={({ item: u }) => {
          const badge = ROL_BADGE[u.rol] ?? { label: u.rol, bg: "#F3F4F6", color: "#374151" };
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre} numberOfLines={1}>{u.nombre || "—"}</Text>
                  <View style={styles.tagsRow}>
                    <View style={[styles.tag, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.tagTxt, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                    {!u.activo && (
                      <View style={[styles.tag, { backgroundColor: "#F3F4F6" }]}>
                        <Text style={[styles.tagTxt, { color: "#6B7280" }]}>Inactivo</Text>
                      </View>
                    )}
                    {u.tiene_pin ? (
                      <View style={[styles.tag, { backgroundColor: "#D1FAE5" }]}>
                        <Text style={[styles.tagTxt, { color: "#065F46" }]}>🔒 PIN</Text>
                      </View>
                    ) : (
                      <View style={[styles.tag, { backgroundColor: "#F3F4F6" }]}>
                        <Text style={[styles.tagTxt, { color: "#6B7280" }]}>Sin PIN</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <Text style={styles.meta}>📱 {u.telefono}</Text>
              {u.puesto_nombre ? <Text style={styles.meta}>🏪 {u.puesto_nombre}</Text> : null}
              <Text style={styles.metaSub}>
                {Number(u.pedidos_count)} pedido{Number(u.pedidos_count) === 1 ? "" : "s"}
                {u.created_at ? ` · ${fechaHoraMX(u.created_at, { dateStyle: "short" })}` : ""}
              </Text>

              <View style={styles.actions}>
                {u.tiene_pin && (
                  <TouchableOpacity
                    style={styles.btnDanger}
                    onPress={() => confirmarBorrar(u)}
                    disabled={busy === u.id}
                  >
                    <Text style={styles.btnDangerTxt}>Resetear PIN</Text>
                  </TouchableOpacity>
                )}
                {u.rol !== "cliente" && (
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={() => asignarPin(u)}
                    disabled={busy === u.id}
                  >
                    <Text style={styles.btnPrimaryTxt}>{u.tiene_pin ? "Cambiar PIN" : "Asignar PIN"}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {pinEditando === u.id && (
                <View style={styles.pinBox}>
                  <TextInput
                    value={pinTexto}
                    onChangeText={(s) => setPinTexto(s.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Nuevo PIN (6 dígitos)"
                    placeholderTextColor="#9C8B72"
                    keyboardType="number-pad"
                    maxLength={6}
                    style={styles.pinInput}
                  />
                  <View style={styles.pinActions}>
                    <TouchableOpacity
                      style={styles.pinCancel}
                      onPress={() => { setPinEditando(null); setPinTexto(""); }}
                    >
                      <Text style={styles.pinCancelTxt}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pinSave, (pinTexto.length !== 6 || guardandoPin) && { opacity: 0.5 }]}
                      onPress={() => guardarPin(u)}
                      disabled={pinTexto.length !== 6 || guardandoPin}
                    >
                      <Text style={styles.pinSaveTxt}>{guardandoPin ? "Guardando…" : "Guardar PIN"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FCFBFA" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  searchWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 4, color: "#1F2937" },
  rolRow: { gap: 6, paddingVertical: 8 },
  rolChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  rolChipActive: { backgroundColor: "#ED8E3C", borderColor: "#ED8E3C" },
  rolChipTxt: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  rolChipTxtActive: { color: "#fff", fontWeight: "700" },
  list: { padding: 12 },
  empty: { textAlign: "center", color: "#8B7B69", marginTop: 40 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  nombre: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tagTxt: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  meta: { fontSize: 13, color: "#4B5563", marginTop: 2 },
  metaSub: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10, justifyContent: "flex-end" },
  btnDanger: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FCA5A5" },
  btnDangerTxt: { color: "#991B1B", fontSize: 12, fontWeight: "600" },
  btnPrimary: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#FEF5EA" },
  btnPrimaryTxt: { color: "#C2680E", fontSize: 12, fontWeight: "700" },
  pinBox: { marginTop: 10, gap: 8 },
  pinInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, padding: 10, fontSize: 14, minHeight: 44, color: "#1F2937", backgroundColor: "#fff" },
  pinActions: { flexDirection: "row", gap: 8 },
  pinCancel: { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: "#E5E7EB", alignItems: "center" },
  pinCancelTxt: { color: "#6B7280", fontWeight: "700", fontSize: 13 },
  pinSave: { flex: 2, paddingVertical: 9, borderRadius: 8, backgroundColor: "#ED8E3C", alignItems: "center" },
  pinSaveTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
