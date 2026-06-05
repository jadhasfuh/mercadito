import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator,
  TouchableOpacity, Alert, Linking, TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  listarTiendasAdmin,
  aprobarTienda as aprobarTiendaApi,
  rechazarTienda as rechazarTiendaApi,
  asignarPinUsuario,
  enviarMensajeATienda,
  actualizarCiudadTienda,
  type TiendaAdmin,
} from "../../src/api/admin";
import { CIUDADES } from "../../src/lib/ciudades";
import ScreenHeader from "../../src/components/ScreenHeader";
import Loader from "../../src/components/Loader";
import MapaTiendasRN from "../../src/components/MapaTiendasRN";

export default function TiendasAdminScreen() {
  const insets = useSafeAreaInsets();
  const [tiendas, setTiendas] = useState<TiendaAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actuando, setActuando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"pendientes" | "activas" | "todas">("pendientes");
  const [tiendaResaltada, setTiendaResaltada] = useState<string | null>(null);
  const [mensajePuesto, setMensajePuesto] = useState<string | null>(null);
  const [mensajeTexto, setMensajeTexto] = useState("");
  const [enviandoMsg, setEnviandoMsg] = useState(false);

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

  async function cambiarCiudad(t: TiendaAdmin, ciudad: string) {
    if ((t.ciudad ?? "sahuayo") === ciudad) return;
    try {
      await actualizarCiudadTienda(t.id, ciudad);
      await load();
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo actualizar");
    }
  }

  // Mismo flujo que el admin web: prompt → PIN de 6 dígitos → POST reset-pin.
  // En móvil Alert.prompt es iOS-only; usamos un mini-modal inline via Alert
  // con buttons en iOS y degradamos a Alert+TextInput en Android usando el
  // estado de mensaje (ya hay un componente prompt simple aquí).
  function cambiarPin(t: TiendaAdmin) {
    if (!t.usuario_id) {
      Alert.alert("Sin dueño", "Esta tienda no tiene cuenta de dueño registrada");
      return;
    }
    // Reuso del prompt nativo cross-platform via Alert con input. Si no
    // está disponible, mostramos instrucciones para usar la web.
    Alert.prompt?.(
      `Nuevo PIN para ${t.nombre_dueno || t.nombre}`,
      "6 dígitos numéricos",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Guardar",
          onPress: async (text?: string) => {
            const pin = (text ?? "").trim();
            if (!/^\d{6}$/.test(pin)) {
              Alert.alert("PIN inválido", "Debe ser de 6 dígitos numéricos");
              return;
            }
            try {
              await asignarPinUsuario(t.usuario_id!, pin);
              Alert.alert("Listo", `PIN de ${t.nombre_dueno || t.nombre} cambiado a: ${pin}`);
            } catch (e) {
              Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo cambiar el PIN");
            }
          },
        },
      ],
      "plain-text",
      "",
      "numeric",
    ) ?? Alert.alert(
      "Cambiar PIN",
      "Para cambiar el PIN, usa la pestaña 'Usuarios' o la versión web.",
    );
  }

  async function enviarMensaje(t: TiendaAdmin) {
    const texto = mensajeTexto.trim();
    if (!texto) return;
    setEnviandoMsg(true);
    try {
      await enviarMensajeATienda(t.id, texto);
      setMensajeTexto("");
      setMensajePuesto(null);
      Alert.alert("Mensaje enviado", `Lo verá ${t.nombre} en su app.`);
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo enviar");
    } finally {
      setEnviandoMsg(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Tiendas" />
        <Loader texto="Cargando tiendas…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Tiendas" subtitle={`${pendientes.length} pendiente${pendientes.length !== 1 ? "s" : ""} · ${activas.length} activa${activas.length !== 1 ? "s" : ""}`} />
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
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            filtradas.some((t) => t.lat != null && t.lng != null) ? (
              <View style={styles.mapaWrap}>
                <MapaTiendasRN
                  tiendas={filtradas
                    .filter((t) => t.lat != null && t.lng != null)
                    .map((t) => ({ id: t.id, nombre: t.nombre, lat: t.lat!, lng: t.lng!, abierto: t.activo }))}
                  selectedId={tiendaResaltada}
                  onTiendaPress={(id) => setTiendaResaltada(id === tiendaResaltada ? null : id)}
                  altura={200}
                />
              </View>
            ) : null
          }
          renderItem={({ item: t }) => (
            <View style={[styles.card, !t.aprobado && styles.cardPendiente, t.aprobado && !t.activo && styles.cardPausada, tiendaResaltada === t.id && styles.cardResaltada]}>
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
                <>
                  <View style={styles.actionsRow}>
                    {t.usuario_id && (
                      <TouchableOpacity
                        style={[styles.btn, styles.btnSecondary]}
                        onPress={() => cambiarPin(t)}
                      >
                        <Ionicons name="key-outline" size={14} color="#374151" />
                        <Text style={styles.btnSecondaryTxt}>PIN</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.btn, styles.btnSecondary]}
                      onPress={() => setMensajePuesto(mensajePuesto === t.id ? null : t.id)}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color="#374151" />
                      <Text style={styles.btnSecondaryTxt}>Mensaje</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, t.activo ? styles.btnPausar : styles.btnReanudar]}
                      onPress={() => togglePausa(t)}
                      disabled={actuando === t.id}
                    >
                      {actuando === t.id ? (
                        <ActivityIndicator color="#6B7280" size="small" />
                      ) : (
                        <Text style={t.activo ? styles.btnPausarTxt : styles.btnReanudarTxt}>
                          {t.activo ? "Pausar" : "Reanudar"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {/* Ciudad de la tienda — define impuesto/aporte foráneo */}
                  <View style={styles.ciudadRow}>
                    {CIUDADES.map((c) => {
                      const activo = (t.ciudad ?? "sahuayo") === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => cambiarCiudad(t, c.id)}
                          style={[styles.ciudadChip, activo && styles.ciudadChipActivo]}
                        >
                          <Text style={[styles.ciudadChipTxt, activo && styles.ciudadChipTxtActivo]}>
                            {c.id === "venustiano" ? "San Pedro" : c.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {mensajePuesto === t.id && (
                    <View style={styles.msgBox}>
                      <TextInput
                        value={mensajeTexto}
                        onChangeText={setMensajeTexto}
                        placeholder={`Escribe un mensaje para ${t.nombre}…`}
                        placeholderTextColor="#9C8B72"
                        multiline
                        style={styles.msgInput}
                      />
                      <View style={styles.msgActions}>
                        <TouchableOpacity
                          style={styles.msgCancel}
                          onPress={() => { setMensajePuesto(null); setMensajeTexto(""); }}
                        >
                          <Text style={styles.msgCancelTxt}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.msgSend, (!mensajeTexto.trim() || enviandoMsg) && { opacity: 0.5 }]}
                          onPress={() => enviarMensaje(t)}
                          disabled={!mensajeTexto.trim() || enviandoMsg}
                        >
                          <Text style={styles.msgSendTxt}>{enviandoMsg ? "Enviando…" : "Enviar"}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </>
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
  container: { flex: 1, backgroundColor: "#FCFBFA" },
  filtros: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F3EFE7" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#F3F4F6" },
  chipActive: { backgroundColor: "#ED8E3C" },
  chipTxt: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  chipTxtActive: { color: "#fff" },
  list: { padding: 12 },
  mapaWrap: { marginBottom: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#F3F4F6" },
  cardPendiente: { borderColor: "#FDE68A", borderWidth: 2 },
  cardPausada: { opacity: 0.6 },
  cardResaltada: { borderColor: "#ED8E3C", borderWidth: 2 },
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
  actionsRow: { flexDirection: "row", gap: 6 },
  ciudadRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  ciudadChip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff" },
  ciudadChipActivo: { borderColor: "#ED8E3C", backgroundColor: "#FEF5EA" },
  ciudadChipTxt: { fontSize: 11, fontWeight: "600", color: "#8B7B69" },
  ciudadChipTxtActivo: { color: "#D97F2E" },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: 10 },
  btnSecondary: { backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "#E5E7EB" },
  btnSecondaryTxt: { color: "#374151", fontWeight: "700", fontSize: 12 },
  msgBox: { marginTop: 8, backgroundColor: "#F9FAFB", borderRadius: 10, padding: 10, gap: 8 },
  msgInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, padding: 10, fontSize: 13, minHeight: 60, color: "#1F2937", backgroundColor: "#fff", textAlignVertical: "top" },
  msgActions: { flexDirection: "row", gap: 8 },
  msgCancel: { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: "#E5E7EB", alignItems: "center" },
  msgCancelTxt: { color: "#6B7280", fontWeight: "700", fontSize: 13 },
  msgSend: { flex: 2, paddingVertical: 9, borderRadius: 8, backgroundColor: "#ED8E3C", alignItems: "center" },
  msgSendTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
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
