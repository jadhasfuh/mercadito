import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, Stack } from "expo-router";
import { theme } from "../src/lib/theme";
import { useSession } from "../src/contexts/SessionContext";
import {
  listarServicios,
  crearServicio,
  actualizarServicio,
  eliminarServicio,
  type Servicio,
} from "../src/api/citas";

interface FormState {
  id: string | null;
  nombre: string;
  descripcion: string;
  duracion_min: string;
  buffer_min: string;
  precio: string;
}

const FORM_VACIO: FormState = {
  id: null,
  nombre: "",
  descripcion: "",
  duracion_min: "30",
  buffer_min: "0",
  precio: "",
};

export default function TiendaServiciosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { usuario } = useSession();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!usuario?.puesto_id) return;
    listarServicios(usuario.puesto_id)
      .then(setServicios)
      .catch(() => setServicios([]))
      .finally(() => setLoading(false));
  }, [usuario?.puesto_id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function abrirNuevo() {
    setForm({ ...FORM_VACIO });
  }
  function abrirEditar(s: Servicio) {
    setForm({
      id: s.id,
      nombre: s.nombre,
      descripcion: s.descripcion ?? "",
      duracion_min: String(s.duracion_min),
      buffer_min: String(s.buffer_min),
      precio: s.precio != null ? String(Number(s.precio)) : "",
    });
  }

  async function guardar() {
    if (!form) return;
    const nombre = form.nombre.trim();
    const duracion = parseInt(form.duracion_min, 10);
    if (!nombre || !duracion || duracion <= 0) {
      Alert.alert("Faltan datos", "Nombre y duración (min) son obligatorios.");
      return;
    }
    setSaving(true);
    const payload = {
      nombre,
      descripcion: form.descripcion.trim() || null,
      duracion_min: duracion,
      buffer_min: parseInt(form.buffer_min, 10) || 0,
      precio: form.precio.trim() ? Number(form.precio) : null,
    };
    try {
      if (form.id) await actualizarServicio(form.id, payload);
      else await crearServicio(payload);
      setForm(null);
      load();
    } catch {
      Alert.alert("Ups", "No se pudo guardar el servicio.");
    } finally {
      setSaving(false);
    }
  }

  function borrar(s: Servicio) {
    Alert.alert("Eliminar servicio", `¿Eliminar "${s.nombre}"?`, [
      { text: "No", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await eliminarServicio(s.id);
            load();
          } catch {
            Alert.alert("Ups", "No se pudo eliminar.");
          }
        },
      },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ title: "Mis servicios" }} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.gray800} />
        </TouchableOpacity>
        <Text style={styles.titulo}>Mis servicios</Text>
        <TouchableOpacity style={styles.nuevoBtn} onPress={abrirNuevo}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.nuevoTxt}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.serv} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
          {servicios.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cut-outline" size={44} color={theme.colors.gray300} />
              <Text style={styles.emptyTxt}>Aún no tienes servicios. Crea el primero con “Nuevo”.</Text>
            </View>
          ) : (
            servicios.map((s) => (
              <View key={s.id} style={[styles.card, theme.shadow.sm, !s.activo && { opacity: 0.55 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.servNombre}>{s.nombre}</Text>
                  {!!s.descripcion && <Text style={styles.servDesc} numberOfLines={2}>{s.descripcion}</Text>}
                  <Text style={styles.servMeta}>
                    {s.duracion_min} min{s.buffer_min ? ` (+${s.buffer_min} descanso)` : ""}
                    {s.precio != null ? ` · $${Number(s.precio)}` : " · a consultar"}
                    {!s.activo ? " · inactivo" : ""}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => abrirEditar(s)} style={styles.editBtn}>
                    <Ionicons name="create-outline" size={20} color={theme.colors.serv} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => borrar(s)} style={styles.editBtn}>
                    <Ionicons name="trash-outline" size={19} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Modal de formulario */}
      <Modal visible={!!form} animationType="slide" transparent onRequestClose={() => setForm(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrap}
        >
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{form?.id ? "Editar servicio" : "Nuevo servicio"}</Text>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Campo label="Nombre">
                <TextInput
                  style={styles.input}
                  value={form?.nombre}
                  onChangeText={(v) => setForm((f) => (f ? { ...f, nombre: v } : f))}
                  placeholder="Ej. Corte de dama"
                  placeholderTextColor={theme.colors.gray400}
                />
              </Campo>
              <Campo label="Descripción (opcional)">
                <TextInput
                  style={styles.input}
                  value={form?.descripcion}
                  onChangeText={(v) => setForm((f) => (f ? { ...f, descripcion: v } : f))}
                  placeholder="Detalles del servicio"
                  placeholderTextColor={theme.colors.gray400}
                />
              </Campo>
              <View style={styles.row}>
                <Campo label="Duración (min)" style={{ flex: 1 }}>
                  <TextInput
                    style={styles.input}
                    value={form?.duracion_min}
                    onChangeText={(v) => setForm((f) => (f ? { ...f, duracion_min: v.replace(/\D/g, "") } : f))}
                    keyboardType="number-pad"
                  />
                </Campo>
                <Campo label="Descanso (min)" style={{ flex: 1 }}>
                  <TextInput
                    style={styles.input}
                    value={form?.buffer_min}
                    onChangeText={(v) => setForm((f) => (f ? { ...f, buffer_min: v.replace(/\D/g, "") } : f))}
                    keyboardType="number-pad"
                  />
                </Campo>
              </View>
              <Campo label="Precio (opcional)">
                <TextInput
                  style={styles.input}
                  value={form?.precio}
                  onChangeText={(v) => setForm((f) => (f ? { ...f, precio: v.replace(/[^0-9.]/g, "") } : f))}
                  keyboardType="decimal-pad"
                  placeholder="A consultar si lo dejas vacío"
                  placeholderTextColor={theme.colors.gray400}
                />
              </Campo>
            </ScrollView>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelar} onPress={() => setForm(null)}>
                <Text style={styles.cancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.guardar, saving && { opacity: 0.6 }]} onPress={guardar} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.guardarTxt}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Campo({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      <Text style={styles.campoLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  titulo: { ...theme.typography.h3, color: theme.colors.gray900, flex: 1 },
  nuevoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.serv,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
  },
  nuevoTxt: { ...theme.typography.buttonSmall, color: "#fff" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 32 },
  emptyTxt: { ...theme.typography.body, color: theme.colors.gray500, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 14, marginBottom: 10 },
  servNombre: { ...theme.typography.title, color: theme.colors.gray900 },
  servDesc: { ...theme.typography.bodySmall, color: theme.colors.gray500, marginTop: 2 },
  servMeta: { ...theme.typography.bodySmall, color: theme.colors.serv, marginTop: 4 },
  cardActions: { flexDirection: "row", gap: 4 },
  editBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalCard: {
    backgroundColor: theme.colors.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "88%",
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.gray300, alignSelf: "center", marginBottom: 14 },
  modalTitle: { ...theme.typography.h3, color: theme.colors.gray900, marginBottom: 16 },
  campoLabel: { ...theme.typography.bodySmall, color: theme.colors.gray600, marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...theme.typography.body,
    color: theme.colors.gray900,
    borderWidth: 1,
    borderColor: theme.colors.gray200,
  },
  row: { flexDirection: "row", gap: 12 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelar: { flex: 1, paddingVertical: 14, borderRadius: theme.radius.md, alignItems: "center", backgroundColor: theme.colors.gray100 },
  cancelarTxt: { ...theme.typography.button, color: theme.colors.gray600 },
  guardar: { flex: 2, paddingVertical: 14, borderRadius: theme.radius.md, alignItems: "center", backgroundColor: theme.colors.serv },
  guardarTxt: { ...theme.typography.button, color: "#fff" },
});
