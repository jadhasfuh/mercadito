import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, TextInput, TouchableOpacity, Image, Alert, KeyboardAvoidingView, Platform, Switch, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Producto, PuestoHorario } from "../api/catalogo";
import { actualizarPrecio, editarProducto, eliminarProducto, listarHorariosMenu, precioPropio } from "../api/tienda";
import { useSession } from "../contexts/SessionContext";
import { pickImageAsDataUrl } from "../lib/imagePicker";
import { resolverImagen } from "../lib/imgUrl";
import { useKeyboardHeight } from "../lib/useKeyboard";
import { unidadFormato, UNIDADES } from "../lib/unidades";
import { CATEGORIAS } from "../lib/categorias";
import {
  VariantesEditorRN,
  ModificadoresEditorRN,
  serializarOpciones,
  serializarModificadores,
  deserializarOpciones,
  deserializarModificadores,
  validarExtras,
  type OpcionEdit,
  type ModificadorEdit,
} from "./ExtrasEditor";

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
  // Categoría y unidad antes solo se podían fijar al crear; ahora editables.
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [unidad, setUnidad] = useState<string>("");
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [disponible, setDisponible] = useState(true);
  const [imagen, setImagen] = useState<string | null>(null);
  const [precio, setPrecio] = useState("");
  const [mayoreoActivo, setMayoreoActivo] = useState(false);
  const [precioMayoreo, setPrecioMayoreo] = useState("");
  const [mayoreoDesde, setMayoreoDesde] = useState("");
  const [horarioIds, setHorarioIds] = useState<string[]>([]);
  const [horariosMenu, setHorariosMenu] = useState<PuestoHorario[]>([]);
  const [opciones, setOpciones] = useState<OpcionEdit[]>([]);
  const [modificadores, setModificadores] = useState<ModificadorEdit[]>([]);
  // Lead time: "" o "0" = inmediato. ">=1" días de anticipación.
  const [leadTime, setLeadTime] = useState<string>("");
  // Cantidad libre: medios/fracciones y/o pago por monto en pesos.
  const [permiteFraccion, setPermiteFraccion] = useState(false);
  const [permitePorDinero, setPermitePorDinero] = useState(false);
  const [precioVariablePeso, setPrecioVariablePeso] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    if (!producto || !usuario?.puesto_id) return;
    setNombre(producto.nombre);
    setDescripcion(producto.descripcion ?? "");
    setSeccion(producto.seccion ?? "");
    setSubseccion(producto.subseccion ?? "");
    setCategoriaId(producto.categoria_id);
    setUnidad(producto.unidad);
    setDiasSemana(producto.dias_semana ?? []);
    setDisponible(producto.disponible !== false);
    setImagen(producto.imagen ?? null);
    const precioInfo = producto.precios.find((x) => x.puesto_id === usuario.puesto_id);
    setPrecio(precioInfo ? String(precioInfo.precio) : "");
    const hasMayoreo = precioInfo?.precio_mayoreo != null && precioInfo?.mayoreo_desde != null;
    setMayoreoActivo(!!hasMayoreo);
    setPrecioMayoreo(hasMayoreo ? String(precioInfo!.precio_mayoreo) : "");
    setMayoreoDesde(hasMayoreo ? String(precioInfo!.mayoreo_desde) : "");
    setHorarioIds(producto.horarios?.map((h) => h.id) ?? []);
    setOpciones(deserializarOpciones(producto.opciones));
    setModificadores(deserializarModificadores(producto.modificadores));
    setLeadTime(producto.lead_time_dias == null ? "" : String(producto.lead_time_dias));
    setPermiteFraccion(!!producto.permite_fraccion);
    setPermitePorDinero(!!producto.permite_por_dinero);
    setPrecioVariablePeso(!!producto.precio_variable_peso);
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

    const errExtra = validarExtras(opciones, modificadores);
    if (errExtra) { Alert.alert("Falta", errExtra); return; }
    if ((permiteFraccion || permitePorDinero) && opciones.length > 0) {
      Alert.alert("No aplica", "La cantidad libre no aplica a productos con variantes.");
      return;
    }

    setGuardando(true);
    try {
      // Campos del producto
      await editarProducto(producto.id, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        seccion: seccion.trim(),
        subseccion: subseccion.trim(),
        categoria_id: categoriaId || undefined,
        unidad: unidad || undefined,
        disponible,
        imagen,
        horario_ids: horarioIds,
        dias_semana: diasSemana,
        opciones: serializarOpciones(opciones),
        modificadores: serializarModificadores(modificadores),
        lead_time_dias: leadTime.trim() === "" ? null : Math.max(0, Math.floor(Number(leadTime))),
        permite_fraccion: permiteFraccion,
        permite_por_dinero: permitePorDinero,
        precio_variable_peso: precioVariablePeso,
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
            <View style={styles.headerBtn} />
          </View>

          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(kbHeight + 40, 40) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {/* Imagen */}
            <View style={styles.section}>
              <Text style={styles.label}>Foto</Text>
              <View style={styles.imagenRow}>
                {imagen ? (
                  <View style={styles.imagenBox}>
                    {/* La imagen puede venir como data:URL (recién elegida en
                        este modal con pickImageAsDataUrl) o como URL relativa
                        al backend (/api/productos/{id}/imagen tras el refresh
                        del payload). resolverImagen acepta ambas. */}
                    <Image source={{ uri: resolverImagen(imagen) ?? imagen }} style={styles.imagen} />
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
              <TextInput placeholderTextColor="#9C8B72" value={nombre} onChangeText={setNombre} style={styles.input} />
            </View>

            {/* Descripcion */}
            <View style={styles.section}>
              <Text style={styles.label}>Descripción <Text style={styles.labelFaint}>(opcional)</Text></Text>
              <TextInput placeholderTextColor="#9C8B72" value={descripcion} onChangeText={setDescripcion} style={[styles.input, { minHeight: 60 }]} multiline />
            </View>

            {/* Categoría */}
            <View style={styles.section}>
              <Text style={styles.label}>Categoría</Text>
              <View style={styles.chipsWrap}>
                {Object.entries(CATEGORIAS).map(([id, info]) => {
                  const active = categoriaId === id;
                  return (
                    <TouchableOpacity
                      key={id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setCategoriaId(id)}
                    >
                      <Ionicons name={info.icon} size={14} color={active ? "#fff" : "#8B7B69"} />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{info.nombre}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Unidad */}
            <View style={styles.section}>
              <Text style={styles.label}>Unidad</Text>
              <View style={styles.chipsWrap}>
                {UNIDADES.map((u) => {
                  const active = unidad === u.id;
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setUnidad(u.id)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{u.nombre}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Días de la semana */}
            <View style={styles.section}>
              <Text style={styles.label}>Días disponibles <Text style={styles.labelFaint}>(vacío = todos los días)</Text></Text>
              <View style={styles.chipsWrap}>
                {[
                  { d: 1, label: "Lun" },
                  { d: 2, label: "Mar" },
                  { d: 3, label: "Mié" },
                  { d: 4, label: "Jue" },
                  { d: 5, label: "Vie" },
                  { d: 6, label: "Sáb" },
                  { d: 0, label: "Dom" },
                ].map(({ d, label }) => {
                  const active = diasSemana.includes(d);
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setDiasSemana((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Precio */}
            <View style={styles.section}>
              <Text style={styles.label}>Precio</Text>
              <View style={styles.inputRow}>
                <Text style={styles.currency}>$</Text>
                <TextInput placeholderTextColor="#9C8B72" value={precio} onChangeText={setPrecio} keyboardType="decimal-pad" style={styles.input} placeholder="0.00" />
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
                    trackColor={{ false: "#E5E7EB", true: "#F2A65A" }}
                    thumbColor="#fff"
                  />
                </View>
                {mayoreoActivo && (
                  <View style={{ marginTop: 8 }}>
                    <View style={styles.mayoreoRow}>
                      <Text style={styles.mayoreoLabel}>A partir de</Text>
                      <TextInput
                        placeholderTextColor="#9C8B72"
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
                        placeholderTextColor="#9C8B72"
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

            {/* Sobre pedido */}
            <View style={styles.section}>
              <Text style={styles.label}>Sobre pedido <Text style={styles.labelFaint}>(opcional · vacío = entrega inmediata)</Text></Text>
              <View style={styles.inputRow}>
                <TextInput
                  placeholderTextColor="#9C8B72"
                  value={leadTime}
                  onChangeText={setLeadTime}
                  keyboardType="number-pad"
                  placeholder="0"
                  style={[styles.input, { width: 80, flex: 0 }]}
                />
                <Text style={styles.labelFaint}>
                  {leadTime.trim() === "" || Number(leadTime) === 0
                    ? "días (sin anticipación)"
                    : Number(leadTime) === 1
                      ? "día (al día siguiente)"
                      : `días (${Number(leadTime)} días después)`}
                </Text>
              </View>
              <Text style={[styles.labelFaint, { marginTop: 4 }]}>
                Para productos que se preparan con anticipación (pasteles, churros decorados, etc).
              </Text>
            </View>

            {/* Sección */}
            <View style={styles.section}>
              <Text style={styles.label}>Sección <Text style={styles.labelFaint}>(opcional)</Text></Text>
              <TextInput placeholderTextColor="#9C8B72" value={seccion} onChangeText={setSeccion} style={styles.input} placeholder="Ej. Little Caesars" />
            </View>
            <View style={styles.section}>
              <Text style={styles.label}>Subsección <Text style={styles.labelFaint}>(opcional)</Text></Text>
              <TextInput placeholderTextColor="#9C8B72" value={subseccion} onChangeText={setSubseccion} style={styles.input} placeholder="Ej: Pizzas, Bebidas…" />
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
                trackColor={{ false: "#E5E7EB", true: "#F2A65A" }}
                thumbColor="#fff"
              />
            </View>

            {/* Cantidad libre — fracción / por monto. Solo si no hay variantes. */}
            {opciones.length === 0 && (
              <View style={styles.section}>
                <Text style={styles.label}>Cantidad libre <Text style={styles.labelFaint}>(opcional)</Text></Text>
                <View style={[styles.sectionRow, { marginTop: 4 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { marginBottom: 0 }]}>Permitir medios y fracciones</Text>
                    <Text style={styles.labelFaint}>Ej: medio kilo, 200ml.</Text>
                  </View>
                  <Switch
                    value={permiteFraccion}
                    onValueChange={setPermiteFraccion}
                    trackColor={{ false: "#E5E7EB", true: "#F2A65A" }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={[styles.sectionRow, { marginTop: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { marginBottom: 0 }]}>Permitir pedir por monto ($)</Text>
                    <Text style={styles.labelFaint}>Ej: &quot;dame $20 de tortilla&quot;.</Text>
                  </View>
                  <Switch
                    value={permitePorDinero}
                    onValueChange={setPermitePorDinero}
                    trackColor={{ false: "#E5E7EB", true: "#F2A65A" }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={[styles.sectionRow, { marginTop: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { marginBottom: 0 }]}>Precio variable por peso</Text>
                    <Text style={styles.labelFaint}>Sandía, melón, repollo… cliente ve el precio como referencia y lo ajustas al pesar.</Text>
                  </View>
                  <Switch
                    value={precioVariablePeso}
                    onValueChange={setPrecioVariablePeso}
                    trackColor={{ false: "#E5E7EB", true: "#F2A65A" }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            )}

            {/* Variantes */}
            <VariantesEditorRN
              opciones={opciones}
              onOpcionesChange={setOpciones}
              productoNombre={nombre || producto.nombre}
              precioBase={parseFloat(precio) || 0}
            />

            {/* Modificadores */}
            <ModificadoresEditorRN
              value={modificadores}
              onChange={setModificadores}
              productoNombre={nombre || producto.nombre}
            />
          </ScrollView>

          {/* Botonera global Guardar / Cancelar / Eliminar */}
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={guardando}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, guardando && { opacity: 0.7 }]} onPress={guardar} disabled={guardando}>
                {guardando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.saveTxt}>Guardar cambios</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={confirmarEliminar} disabled={eliminando} style={styles.deleteInline}>
              <Ionicons name="trash-outline" size={14} color="#DC2626" />
              <Text style={styles.deleteInlineTxt}>{eliminando ? "Eliminando…" : "Eliminar producto"}</Text>
            </TouchableOpacity>
          </View>
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
  horarioChipActive: { backgroundColor: "#F2A65A" },
  horarioChipText: { fontSize: 11, color: "#8B7B69", fontWeight: "600" },
  horarioChipTextActive: { color: "#fff" },
  deleteButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#FECACA", marginTop: 16 },
  deleteText: { color: "#DC2626", fontWeight: "600" },
  footer: { padding: 12, paddingBottom: 24, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#F3EFE7" },
  footerRow: { flexDirection: "row", gap: 8 },
  cancelBtn: { flex: 1, backgroundColor: "#F3F4F6", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  cancelTxt: { color: "#4B5563", fontWeight: "600", fontSize: 14 },
  saveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#F2A65A", borderRadius: 12, paddingVertical: 12 },
  saveTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  deleteInline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, marginTop: 2 },
  deleteInlineTxt: { color: "#DC2626", fontSize: 12, fontWeight: "500" },
  mayoreoBox: { marginTop: 12, backgroundColor: "#FFF7EB", borderRadius: 10, padding: 12 },
  mayoreoHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  mayoreoTitle: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  mayoreoSubtitle: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  mayoreoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  mayoreoLabel: { fontSize: 12, color: "#8B7B69", width: 80 },
  mayoreoUnit: { fontSize: 12, color: "#8B7B69" },
  mayoreoPreview: { fontSize: 10, color: "#92400E", marginTop: 6 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "#F3EFE7" },
  chipActive: { backgroundColor: "#F2A65A" },
  chipText: { fontSize: 12, color: "#8B7B69", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
});

