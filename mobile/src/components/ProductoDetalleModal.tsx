import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, TextInput, TouchableOpacity, Image, Alert, KeyboardAvoidingView, Platform, Switch, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Producto, PuestoHorario } from "../api/catalogo";
import { actualizarPrecio, editarProducto, eliminarProducto, listarHorariosMenu, precioPropio } from "../api/tienda";
import { useSession } from "../contexts/SessionContext";
import { pickImageAsDataUrl } from "../lib/imagePicker";
import { useKeyboardHeight } from "../lib/useKeyboard";
import { unidadFormato } from "../lib/unidades";

interface Props {
  visible: boolean;
  producto: Producto | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ProductoDetalleModal({ visible, producto, onClose, onSaved }: Props) {
  const { usuario } = useSession();
  const kbHeight = useKeyboardHeight();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [seccion, setSeccion] = useState("");
  const [subseccion, setSubseccion] = useState("");
  const [disponible, setDisponible] = useState(true);
  const [imagen, setImagen] = useState<string | null>(null);
  const [precio, setPrecio] = useState("");
  const [mayoreoActivo, setMayoreoActivo] = useState(false);
  const [precioMayoreo, setPrecioMayoreo] = useState("");
  const [mayoreoDesde, setMayoreoDesde] = useState("");
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
    const precioInfo = producto.precios.find((x) => x.puesto_id === usuario.puesto_id);
    setPrecio(precioInfo ? String(precioInfo.precio) : "");
    const hasMayoreo = precioInfo?.precio_mayoreo != null && precioInfo?.mayoreo_desde != null;
    setMayoreoActivo(!!hasMayoreo);
    setPrecioMayoreo(hasMayoreo ? String(precioInfo!.precio_mayoreo) : "");
    setMayoreoDesde(hasMayoreo ? String(precioInfo!.mayoreo_desde) : "");
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

    // Validar mayoreo
    let mayoreoPayload: { precio_mayoreo: number; mayoreo_desde: number } | null = null;
    if (mayoreoActivo) {
      const pm = parseFloat(precioMayoreo);
      const md = parseFloat(mayoreoDesde);
      if (isNaN(pm) || pm <= 0 || isNaN(md) || md <= 0) { Alert.alert("Mayoreo inválido", "Llena precio y cantidad mínima"); return; }
      if (pm >= precioNum) { Alert.alert("Mayoreo inválido", "El precio de mayoreo debe ser menor al normal"); return; }
      mayoreoPayload = { precio_mayoreo: pm, mayoreo_desde: md };
    }

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
      // Precio + mayoreo
      await actualizarPrecio(producto.id, usuario.puesto_id, precioNum, mayoreoPayload);
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

          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(kbHeight + 40, 40) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
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

              {/* Mayoreo toggle */}
              <View style={styles.mayoreoBox}>
                <View style={styles.mayoreoHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mayoreoTitle}>Precio de mayoreo</Text>
                    <Text style={styles.mayoreoSubtitle}>Precio más bajo cuando compran en cantidad</Text>
                  </View>
                  <Switch
                    value={mayoreoActivo}
                    onValueChange={setMayoreoActivo}
                    trackColor={{ false: "#E5E7EB", true: "#FF7A2B" }}
                    thumbColor="#fff"
                  />
                </View>
                {mayoreoActivo && (
                  <View style={{ marginTop: 8 }}>
                    <View style={styles.mayoreoRow}>
                      <Text style={styles.mayoreoLabel}>A partir de</Text>
                      <TextInput
                        value={mayoreoDesde}
                        onChangeText={setMayoreoDesde}
                        placeholder="10"
                        keyboardType="decimal-pad"
                        style={[styles.input, { flex: 1 }]}
                      />
                      <Text style={styles.mayoreoUnit}>{unidadFormato(producto?.unidad, parseFloat(mayoreoDesde) || 2)}</Text>
                    </View>
                    <View style={styles.mayoreoRow}>
                      <Text style={styles.mayoreoLabel}>Precio</Text>
                      <Text style={styles.currency}>$</Text>
                      <TextInput
                        value={precioMayoreo}
                        onChangeText={setPrecioMayoreo}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        style={[styles.input, { flex: 1 }]}
                      />
                      <Text style={styles.mayoreoUnit}>/ {unidadFormato(producto?.unidad, 1)}</Text>
                    </View>
                    <Text style={styles.mayoreoPreview}>
                      El cliente verá: &quot;Mayoreo {precioMayoreo ? `$${precioMayoreo}` : "—"}/{unidadFormato(producto?.unidad, 1)} desde {mayoreoDesde || "—"} {unidadFormato(producto?.unidad, parseFloat(mayoreoDesde) || 2)}&quot;
                    </Text>
                  </View>
                )}
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
  mayoreoBox: { marginTop: 12, backgroundColor: "#FFF7EB", borderRadius: 10, padding: 12 },
  mayoreoHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  mayoreoTitle: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  mayoreoSubtitle: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  mayoreoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  mayoreoLabel: { fontSize: 12, color: "#8B7B69", width: 80 },
  mayoreoUnit: { fontSize: 12, color: "#8B7B69" },
  mayoreoPreview: { fontSize: 10, color: "#92400E", marginTop: 6 },
});

