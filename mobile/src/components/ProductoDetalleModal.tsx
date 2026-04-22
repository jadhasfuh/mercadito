import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, TextInput, TouchableOpacity, Image, Alert, KeyboardAvoidingView, Platform, Switch, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Producto, PuestoHorario } from "../api/catalogo";
import { actualizarPrecio, editarProducto, eliminarProducto, listarHorariosMenu, precioPropio } from "../api/tienda";
import { useSession } from "../contexts/SessionContext";
import { pickImageAsDataUrl } from "../lib/imagePicker";

interface Props {
  visible: boolean;
  producto: Producto | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ProductoDetalleModal({ visible, producto, onClose, onSaved }: Props) {
  const { usuario } = useSession();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [seccion, setSeccion] = useState("");
  const [subseccion, setSubseccion] = useState("");
  const [disponible, setDisponible] = useState(true);
  const [imagen, setImagen] = useState<string | null>(null);
  const [precio, setPrecio] = useState("");
  const [horarioIds, setHorarioIds] = useState<string[]>([]);
  const [horariosMenu, setHorariosMenu] = useState<PuestoHorario[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    if (!producto || !usuario?.puesto_id) return;
    setNombre(producto.nombre);
    setDescripcion(producto.descripcion ?? "");
    setSeccion(producto.seccion ?? "");
    setSubseccion(producto.subseccion ?? "");
    setDisponible(producto.disponible !== false);
    setImagen(producto.imagen ?? null);
    const pr = precioPropio(producto, usuario.puesto_id);
    setPrecio(pr != null ? String(pr) : "");
    setHorarioIds(producto.horarios?.map((h) => h.id) ?? []);
    listarHorariosMenu().then(setHorariosMenu).catch(() => {});
  }, [producto, usuario]);

  if (!producto) return null;

  async function elegirImagen(source: "camera" | "library") {
    const url = await pickImageAsDataUrl(source);
    if (url) setImagen(url);
  }

  function toggleHorario(id: string) {
    setHorarioIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function guardar() {
    if (!producto || !usuario?.puesto_id) return;
    if (!nombre.trim()) { Alert.alert("El nombre es obligatorio"); return; }
    const precioNum = parseFloat(precio);
    if (isNaN(precioNum) || precioNum < 0) { Alert.alert("Precio inválido"); return; }

    setGuardando(true);
    try {
      // Campos del producto
      await editarProducto(producto.id, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        seccion: seccion.trim(),
        subseccion: subseccion.trim(),
        disponible,
        imagen,
        horario_ids: horarioIds,
      });
      // Precio
      const precioActual = precioPropio(producto, usuario.puesto_id);
      if (precioActual !== precioNum) {
        await actualizarPrecio(producto.id, usuario.puesto_id, precioNum);
      }
      onSaved();
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminar() {
    if (!producto) return;
    Alert.alert(
      "Eliminar producto",
      `¿Seguro que quieres eliminar "${producto.nombre}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            setEliminando(true);
            try {
              await eliminarProducto(producto.id);
              onSaved();
            } catch (e) {
              Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo eliminar");
            } finally {
              setEliminando(false);
            }
          },
        },
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Editar producto</Text>
            <TouchableOpacity onPress={guardar} disabled={guardando} style={styles.headerBtn}>
              {guardando ? <ActivityIndicator color="#FF7A2B" /> : <Ionicons name="checkmark" size={24} color="#FF7A2B" />}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {/* Imagen */}
            <View style={styles.section}>
              <Text style={styles.label}>Foto</Text>
              <View style={styles.imagenRow}>
                {imagen ? (
                  <View style={styles.imagenBox}>
                    <Image source={{ uri: imagen }} style={styles.imagen} />
                    <TouchableOpacity style={styles.imagenRemove} onPress={() => setImagen(null)}>
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[styles.imagen, styles.imagenPlaceholder]}>
                    <Ionicons name="image-outline" size={28} color="#D4C9B8" />
                  </View>
                )}
                <View style={styles.imagenActions}>
                  <TouchableOpacity style={styles.imagenBtn} onPress={() => elegirImagen("camera")}>
                    <Ionicons name="camera-outline" size={16} color="#1F2937" />
                    <Text style={styles.imagenBtnText}>Cámara</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.imagenBtn} onPress={() => elegirImagen("library")}>
                    <Ionicons name="images-outline" size={16} color="#1F2937" />
                    <Text style={styles.imagenBtnText}>Galería</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Nombre */}
            <View style={styles.section}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput value={nombre} onChangeText={setNombre} style={styles.input} />
            </View>

            {/* Descripcion */}
            <View style={styles.section}>
              <Text style={styles.label}>Descripción <Text style={styles.labelFaint}>(opcional)</Text></Text>
              <TextInput value={descripcion} onChangeText={setDescripcion} style={[styles.input, { minHeight: 60 }]} multiline />
            </View>

            {/* Precio */}
            <View style={styles.section}>
              <Text style={styles.label}>Precio</Text>
              <View style={styles.inputRow}>
                <Text style={styles.currency}>$</Text>
                <TextInput value={precio} onChangeText={setPrecio} keyboardType="decimal-pad" style={styles.input} placeholder="0.00" />
              </View>
            </View>

            {/* Sección */}
            <View style={styles.section}>
              <Text style={styles.label}>Sección <Text style={styles.labelFaint}>(opcional)</Text></Text>
              <TextInput value={seccion} onChangeText={setSeccion} style={styles.input} placeholder="Ej: Little Caesars, Coca Cola…" />
            </View>
            <View style={styles.section}>
              <Text style={styles.label}>Subsección <Text style={styles.labelFaint}>(opcional)</Text></Text>
              <TextInput value={subseccion} onChangeText={setSubseccion} style={styles.input} placeholder="Ej: Pizzas, Bebidas…" />
            </View>

            {/* Horarios del menú */}
            {horariosMenu.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.label}>Disponible en <Text style={styles.labelFaint}>(vacío = todo el día)</Text></Text>
                <View style={styles.horariosRow}>
                  {horariosMenu.map((h) => {
                    const sel = horarioIds.includes(h.id);
                    return (
                      <TouchableOpacity
                        key={h.id}
                        style={[styles.horarioChip, sel && styles.horarioChipActive]}
                        onPress={() => toggleHorario(h.id)}
                      >
                        <Text style={[styles.horarioChipText, sel && styles.horarioChipTextActive]}>
                          {h.nombre} {h.desde}-{h.hasta}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Disponible toggle */}
            <View style={[styles.section, styles.sectionRow]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Visible al cliente</Text>
                <Text style={styles.labelFaint}>Si lo apagas, el producto aparece pausado.</Text>
              </View>
              <Switch
                value={disponible}
                onValueChange={setDisponible}
                trackColor={{ false: "#E5E7EB", true: "#FF7A2B" }}
                thumbColor="#fff"
              />
            </View>

            {/* Delete */}
            <TouchableOpacity style={styles.deleteButton} onPress={confirmarEliminar} disabled={eliminando}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={styles.deleteText}>{eliminando ? "Eliminando…" : "Eliminar producto"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFF7EB" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 10, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F3EFE7" },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  content: { padding: 14, paddingBottom: 40 },
  section: { backgroundColor: "#fff", borderRadius: 10, padding: 12, marginBottom: 8 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { fontSize: 12, color: "#1F2937", fontWeight: "700", marginBottom: 6 },
  labelFaint: { fontSize: 11, color: "#8B7B69", fontWeight: "400" },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, flex: 1 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  currency: { fontSize: 16, color: "#8B7B69", fontWeight: "600" },
  imagenRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  imagenBox: { position: "relative" },
  imagen: { width: 70, height: 70, borderRadius: 10 },
  imagenPlaceholder: { backgroundColor: "#F3EFE7", alignItems: "center", justifyContent: "center" },
  imagenRemove: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center" },
  imagenActions: { flex: 1, gap: 6 },
  imagenBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB", borderStyle: "dashed" },
  imagenBtnText: { fontSize: 12, color: "#1F2937", fontWeight: "500" },
  horariosRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  horarioChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#F3EFE7" },
  horarioChipActive: { backgroundColor: "#FF7A2B" },
  horarioChipText: { fontSize: 11, color: "#8B7B69", fontWeight: "600" },
  horarioChipTextActive: { color: "#fff" },
  deleteButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#FECACA", marginTop: 16 },
  deleteText: { color: "#DC2626", fontWeight: "600" },
});
