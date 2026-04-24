import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator,
  TouchableOpacity, Alert, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  listarTiendasAdmin,
  aprobarTienda as aprobarTiendaApi,
  rechazarTienda as rechazarTiendaApi,
  type TiendaAdmin,
} from "../../src/api/admin";

export default function TiendasAdminScreen() {
  const [tiendas, setTiendas] = useState<TiendaAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actuando, setActuando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"pendientes" | "activas" | "todas">("pendientes");

  const load = useCallback(async () => {
    try {
      const data = await listarTiendasAdmin();
      setTiendas(data);
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudieron cargar las tiendas");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 20000);
    return () => clearInterval(i);
  }, [load]);

  const pendientes = tiendas.filter((t) => !t.aprobado);
  const activas = tiendas.filter((t) => t.aprobado);
  const filtradas = filtro === "pendientes" ? pendientes : filtro === "activas" ? activas : tiendas;

  async function aprobar(t: TiendaAdmin) {
    setActuando(t.id);
    try {
      await aprobarTiendaApi(t.id, true);
      await load();
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo aprobar");
    } finally {
      setActuando(null);
    }
  }

  async function rechazar(t: TiendaAdmin) {
    Alert.alert(
      `¿Rechazar "${t.nombre}"?`,
      `Esto borra la tienda, sus productos y la cuenta del dueño. No se puede deshacer. El dueño puede registrarse de nuevo.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Rechazar",
          style: "destructive",
          onPress: async () => {
            setActuando(t.id);
            try {
              await rechazarTiendaApi(t.id);
              await load();
            } catch (e) {
              Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo rechazar");
            } finally {
              setActuando(null);
            }
          },
        },
      ]
    );
  }

  async function togglePausa(t: TiendaAdmin) {
    setActuando(t.id);
    try {
      await aprobarTiendaApi(t.id, !t.activo);
      await load();
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo actualizar");
    } finally {
      setActuando(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF7A2B" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filtros}>
        <FiltroChip label="Pendientes" active={filtro === "pendientes"} onPress={() => setFiltro("pendientes")} count={pendientes.length} />
        <FiltroChip label="Activas" active={filtro === "activas"} onPress={() => setFiltro("activas")} count={activas.length} />
        <FiltroChip label="Todas" active={filtro === "todas"} onPress={() => setFiltro("todas")} count={tiendas.length} />
      </View>

      {filtradas.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="storefront-outline" size={56} color="#D4C9B8" />
          <Text style={styles.emptyText}>
            {filtro === "pendientes" ? "Sin tiendas pendientes" : "Sin tiendas"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtradas}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item: t }) => (
            <View style={[styles.card, !t.aprobado && styles.cardPendiente, t.aprobado && !t.activo && styles.cardPausada]}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{t.nombre}</Text>
                  {t.descripcion && <Text style={styles.descripcion} numberOfLines={2}>{t.descripcion}</Text>}
                </View>
                {!t.aprobado && (
                  <View style={styles.pendienteBadge}>
                    <Text style={styles.pendienteBadgeTxt}>Pendiente</Text>
                  </View>
                )}
                {t.aprobado && !t.activo && (
                  <View style={styles.pausadaBadge}>
                    <Text style={styles.pausadaBadgeTxt}>Pausada</Text>
                  </View>
                )}
              </View>

              {t.nombre_dueno && (
                <View style={styles.contactRow}>
                  <Text style={styles.dueno}>👤 {t.nombre_dueno}</Text>
                  {t.telefono_dueno && (
                    <TouchableOpacity
                      style={styles.waBtn}
                      onPress={() => Linking.openURL(`https://wa.me/52${t.telefono_dueno!.replace(/\D/g, "")}`)}
                    >
                      <Ionicons name="logo-whatsapp" size={14} color="#059669" />
                      <Text style={styles.waBtnTxt}>{t.telefono_dueno}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {!t.aprobado ? (
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnRechazar]}
                    onPress={() => rechazar(t)}
                    disabled={actuando === t.id}
                  >
                    <Text style={styles.btnRechazarTxt}>Rechazar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnAprobar]}
                    onPress={() => aprobar(t)}
                    disabled={actuando === t.id}
                  >
                    {actuando === t.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={16} color="#fff" />
                        <Text style={styles.btnAprobarTxt}>Aprobar</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.btn, t.activo ? styles.btnPausar : styles.btnReanudar]}
                  onPress={() => togglePausa(t)}
                  disabled={actuando === t.id}
                >
                  {actuando === t.id ? (
                    <ActivityIndicator color="#6B7280" />
                  ) : (
                    <Text style={t.activo ? styles.btnPausarTxt : styles.btnReanudarTxt}>
                      {t.activo ? "Pausar tienda" : "Reanudar tienda"}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

function FiltroChip({ label, active, onPress, count }: { label: string; active: boolean; onPress: () => void; count?: number }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
        {label}{count != null ? ` (${count})` : ""}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  filtros: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F3EFE7" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#F3F4F6" },
  chipActive: { backgroundColor: "#FF7A2B" },
  chipTxt: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  chipTxtActive: { color: "#fff" },
  list: { padding: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#F3F4F6" },
  cardPendiente: { borderColor: "#FDE68A", borderWidth: 2 },
  cardPausada: { opacity: 0.6 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  nombre: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  descripcion: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  pendienteBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pendienteBadgeTxt: { color: "#92400E", fontSize: 10, fontWeight: "700" },
  pausadaBadge: { backgroundColor: "#E5E7EB", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pausadaBadgeTxt: { color: "#4B5563", fontSize: 10, fontWeight: "700" },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  dueno: { fontSize: 12, color: "#4B5563" },
  waBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#D1FAE5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  waBtnTxt: { color: "#065F46", fontSize: 11, fontWeight: "600" },
  actionsRow: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10 },
  btnAprobar: { backgroundColor: "#059669" },
  btnAprobarTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnRechazar: { backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FCA5A5" },
  btnRechazarTxt: { color: "#DC2626", fontWeight: "700", fontSize: 14 },
  btnPausar: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A" },
  btnPausarTxt: { color: "#92400E", fontWeight: "700", fontSize: 14 },
  btnReanudar: { backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: "#86EFAC" },
  btnReanudarTxt: { color: "#065F46", fontWeight: "700", fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { color: "#8B7B69", marginTop: 10, fontSize: 14 },
});
