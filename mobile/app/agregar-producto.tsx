import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, Alert, KeyboardAvoidingView, Platform, Switch } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../src/contexts/SessionContext";
import { crearProducto, listarHorariosMenu } from "../src/api/tienda";
import { CATEGORIAS } from "../src/lib/categorias";
import { UNIDADES, unidadFormato } from "../src/lib/unidades";
import { pickImageAsDataUrl } from "../src/lib/imagePicker";
import { useKeyboardHeight } from "../src/lib/useKeyboard";
import type { PuestoHorario } from "../src/api/catalogo";
import {
  VariantesEditorRN,
  ModificadoresEditorRN,
  serializarOpciones,
  serializarModificadores,
  validarExtras,
  type OpcionEdit,
  type ModificadorEdit,
} from "../src/components/ExtrasEditor";

export default function AgregarProductoScreen() {
  const { usuario } = useSession();
  const router = useRouter();
  const kbHeight = useKeyboardHeight();
  const [nombre, setNombre] = useState("");
  // Categorías (M:N). La primera del arreglo es la PRINCIPAL. Un producto puede
  // estar en varias (ej. un café en "cafeteria" y "restaurante") sin duplicarse.
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);
  const toggleCategoria = (id: string) =>
    setCategoriaIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const [unidad, setUnidad] = useState<string>("");
  const [descripcion, setDescripcion] = useState("");
  const [seccion, setSeccion] = useState("");
  const [subseccion, setSubseccion] = useState("");
  const [imagen, setImagen] = useState<string | null>(null);
  const [precio, setPrecio] = useState("");
  const [mayoreoActivo, setMayoreoActivo] = useState(false);
  const [precioMayoreo, setPrecioMayoreo] = useState("");
  const [mayoreoDesde, setMayoreoDesde] = useState("");
  const [horarioIds, setHorarioIds] = useState<string[]>([]);
  const [horariosMenu, setHorariosMenu] = useState<PuestoHorario[]>([]);
  // Días de la semana en que el producto está disponible (0=domingo .. 6=sábado).
  // Vacío = disponible todos los días, igual que web.
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [opciones, setOpciones] = useState<OpcionEdit[]>([]);
  const [modificadores, setModificadores] = useState<ModificadorEdit[]>([]);
  // Lead time: "" o "0" = entrega inmediata. ">=1" = sobre pedido.
  const [leadTime, setLeadTime] = useState<string>("");
  // Cantidad libre: medios/fracciones y/o pedido por monto en pesos.
  const [permiteFraccion, setPermiteFraccion] = useState(false);
  const [permitePorDinero, setPermitePorDinero] = useState(false);
  // Precio referencial — la card muestra "⚖️ Precio aprox · varía por peso"
  // y el cobro real se ajusta al pesar (sandía, melón, repollo).
  const [precioVariablePeso, setPrecioVariablePeso] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Guard síncrono anti doble-tap: evita una fila duplicada antes de que el estado deshabilite el botón.
  const enviandoRef = useRef(false);

  useEffect(() => {
    listarHorariosMenu().then(setHorariosMenu).catch(() => {});
  }, []);

  async function elegirImagen(source: "camera" | "library") {
    const url = await pickImageAsDataUrl(source);
    if (url) setImagen(url);
  }

  function toggleHorario(id: string) {
    setHorarioIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function guardar() {
    if (!usuario?.puesto_id) return;
    const faltantes: string[] = [];
    if (!nombre.trim()) faltantes.push("nombre");
    if (categoriaIds.length === 0) faltantes.push("categoría");
    if (!unidad) faltantes.push("unidad");
    const precioNum = parseFloat(precio);
    if (isNaN(precioNum) || precioNum <= 0) faltantes.push("precio");
    if (faltantes.length > 0) {
      Alert.alert("Falta", faltantes.join(", "));
      return;
    }

    // Validar mayoreo
    let mayoreoPayload: { precio_mayoreo: number; mayoreo_desde: number } | null = null;
    if (mayoreoActivo) {
      const pm = parseFloat(precioMayoreo);
      const md = parseFloat(mayoreoDesde);
      if (isNaN(pm) || pm <= 0 || isNaN(md) || md <= 0) {
        Alert.alert("Mayoreo inválido", "Llena precio y cantidad mínima de mayoreo");
        return;
      }
      if (pm >= precioNum) {
        Alert.alert("Mayoreo inválido", "El precio de mayoreo debe ser menor al precio normal");
        return;
      }
      mayoreoPayload = { precio_mayoreo: pm, mayoreo_desde: md };
    }

    const errExtra = validarExtras(opciones, modificadores);
    if (errExtra) { Alert.alert("Falta", errExtra); return; }
    if ((permiteFraccion || permitePorDinero) && opciones.length > 0) {
      Alert.alert("No aplica", "La cantidad libre no aplica a productos con variantes (tamaños, sabores, etc.)");
      return;
    }

    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setGuardando(true);
    try {
      await crearProducto({
        nombre: nombre.trim(),
        categoria_id: categoriaIds[0],
        categorias: categoriaIds,
        unidad,
        descripcion: descripcion.trim() || undefined,
        seccion: seccion.trim() || undefined,
        subseccion: subseccion.trim() || undefined,
        imagen,
        precio: precioNum,
        puesto_id: usuario.puesto_id,
        horario_ids: horarioIds.length > 0 ? horarioIds : undefined,
        dias_semana: diasSemana.length > 0 ? diasSemana : undefined,
        ...(mayoreoPayload ? { precio_mayoreo: mayoreoPayload.precio_mayoreo, mayoreo_desde: mayoreoPayload.mayoreo_desde } : {}),
        opciones: serializarOpciones(opciones),
        modificadores: serializarModificadores(modificadores),
        lead_time_dias: leadTime.trim() === "" ? null : Math.max(0, Math.floor(Number(leadTime))),
        ...(permiteFraccion ? { permite_fraccion: true } : {}),
        ...(permitePorDinero ? { permite_por_dinero: true } : {}),
        ...(precioVariablePeso ? { precio_variable_peso: true } : {}),
      });
      router.back();
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo crear");
    } finally {
      enviandoRef.current = false;
      setGuardando(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Nuevo producto" }} />
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(kbHeight + 40, 40) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {/* Resumen de campos obligatorios — el form es largo y a primera vista
                no queda claro qué hay que llenar sí o sí. */}
            <View style={styles.requiredBanner}>
              <Ionicons name="information-circle-outline" size={16} color="#1F4E45" />
              <Text style={styles.requiredBannerTxt}>Solo <Text style={{ fontWeight: "700" }}>nombre, categoría, unidad y precio</Text> son obligatorios. Los demás son opcionales.</Text>
            </View>

            {/* Imagen */}
            <View style={styles.section}>
              <Text style={styles.label}>Foto <Text style={styles.labelFaint}>(opcional)</Text></Text>
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
              <Text style={styles.label}>Nombre <Text style={styles.required}>*</Text></Text>
              <TextInput placeholderTextColor="#9C8B72" value={nombre} onChangeText={setNombre} style={styles.input} placeholder="Ej: Pizza pepperoni grande" />
            </View>

            {/* Categoría — multi-selección. La primera elegida es la principal;
                puedes marcar varias para que el producto salga en más de una. */}
            <View style={styles.section}>
              <Text style={styles.label}>Categoría <Text style={styles.required}>*</Text></Text>
              <Text style={styles.labelFaint}>Puedes elegir varias (ej. un café en Cafetería y Restaurante). La primera es la principal.</Text>
              <View style={styles.chipsWrap}>
                {Object.entries(CATEGORIAS).map(([id, info]) => {
                  const active = categoriaIds.includes(id);
                  const esPrincipal = categoriaIds[0] === id;
                  return (
                    <TouchableOpacity
                      key={id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggleCategoria(id)}
                    >
                      <Ionicons name={esPrincipal ? "star" : info.icon} size={14} color={active ? "#fff" : "#8B7B69"} />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{info.nombre}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Unidad */}
            <View style={styles.section}>
              <Text style={styles.label}>Unidad <Text style={styles.required}>*</Text></Text>
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

            {/* Descripción */}
            <View style={styles.section}>
              <Text style={styles.label}>Descripción <Text style={styles.labelFaint}>(opcional)</Text></Text>
              <TextInput placeholderTextColor="#9C8B72" value={descripcion} onChangeText={setDescripcion} style={[styles.input, { minHeight: 60 }]} multiline placeholder="Detalles del producto" />
            </View>

            {/* Sección / Subsección */}
            <View style={styles.section}>
              <Text style={styles.label}>Sección <Text style={styles.labelFaint}>(opcional)</Text></Text>
              <TextInput placeholderTextColor="#9C8B72" value={seccion} onChangeText={setSeccion} style={styles.input} placeholder="Ej: Little Caesars" />
            </View>
            {seccion.trim() !== "" && (
              <View style={styles.section}>
                <Text style={styles.label}>Subsección <Text style={styles.labelFaint}>(opcional)</Text></Text>
                <TextInput placeholderTextColor="#9C8B72" value={subseccion} onChangeText={setSubseccion} style={styles.input} placeholder="Ej: Pizzas" />
              </View>
            )}

            {/* Precio */}
            <View style={styles.section}>
              <Text style={styles.label}>Precio <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputRow}>
                <Text style={styles.currency}>$</Text>
                <TextInput placeholderTextColor="#9C8B72" value={precio} onChangeText={setPrecio} keyboardType="decimal-pad" style={styles.input} placeholder="0.00" />
              </View>
              {opciones.length > 0 && (
                <Text style={styles.hint}>ℹ️ Como tu producto tiene variantes, este precio es la base — cada variante puede tener el suyo.</Text>
              )}
              {opciones.length === 0 && (
                <Text style={styles.hint}>Si vendes en varios tamaños/sabores con precio distinto, defínelos en Variantes ↓</Text>
              )}

              {/* Mayoreo */}
              <View style={styles.mayoreoBox}>
                <View style={styles.mayoreoHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mayoreoTitle}>Precio de mayoreo</Text>
                    <Text style={styles.mayoreoSubtitle}>Precio más bajo cuando compran en cantidad</Text>
                  </View>
                  <Switch
                    value={mayoreoActivo}
                    onValueChange={setMayoreoActivo}
                    trackColor={{ false: "#E5E7EB", true: "#ED8E3C" }}
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
                      <Text style={styles.mayoreoUnit}>{unidadFormato(unidad, parseFloat(mayoreoDesde) || 2)}</Text>
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
                      <Text style={styles.mayoreoUnit}>/ {unidadFormato(unidad, 1)}</Text>
                    </View>
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
                Para productos que tardan días en estar listos (pasteles, etc).
              </Text>
            </View>

            {/* Horarios del menú */}
            {horariosMenu.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.label}>Disponible en <Text style={styles.labelFaint}>(vacío = todo el día)</Text></Text>
                <View style={styles.chipsWrap}>
                  {horariosMenu.map((h) => {
                    const sel = horarioIds.includes(h.id);
                    return (
                      <TouchableOpacity
                        key={h.id}
                        style={[styles.chip, sel && styles.chipActive]}
                        onPress={() => toggleHorario(h.id)}
                      >
                        <Text style={[styles.chipText, sel && styles.chipTextActive]}>
                          {h.nombre} {h.desde}-{h.hasta}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Días de la semana (paridad con web /tienda) */}
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

            {/* Cantidad libre — fracción y/o por dinero. Bloqueado cuando hay variantes. */}
            {opciones.length === 0 && (
              <View style={styles.section}>
                <Text style={styles.label}>Cantidad libre <Text style={styles.labelFaint}>(opcional · cliente decide cuánto)</Text></Text>
                <View style={[styles.mayoreoHeader, { marginTop: 4 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mayoreoTitle}>Permitir medios y fracciones</Text>
                    <Text style={styles.mayoreoSubtitle}>Ej: medio kilo de naranjas, 200ml de crema.</Text>
                  </View>
                  <Switch
                    value={permiteFraccion}
                    onValueChange={setPermiteFraccion}
                    trackColor={{ false: "#E5E7EB", true: "#ED8E3C" }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={[styles.mayoreoHeader, { marginTop: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mayoreoTitle}>Permitir pedir por monto ($)</Text>
                    <Text style={styles.mayoreoSubtitle}>Ej: &quot;dame $20 de tortilla&quot;.</Text>
                  </View>
                  <Switch
                    value={permitePorDinero}
                    onValueChange={setPermitePorDinero}
                    trackColor={{ false: "#E5E7EB", true: "#ED8E3C" }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={[styles.mayoreoHeader, { marginTop: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mayoreoTitle}>Precio variable por peso</Text>
                    <Text style={styles.mayoreoSubtitle}>Sandía, melón, repollo… ajustas el precio al pesar.</Text>
                  </View>
                  <Switch
                    value={precioVariablePeso}
                    onValueChange={setPrecioVariablePeso}
                    trackColor={{ false: "#E5E7EB", true: "#ED8E3C" }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            )}

            {/* Variantes (ropa/calzado) */}
            <VariantesEditorRN
              opciones={opciones}
              onOpcionesChange={setOpciones}
              productoNombre={nombre}
              precioBase={parseFloat(precio) || 0}
            />

            {/* Modificadores (comida) */}
            <ModificadoresEditorRN
              value={modificadores}
              onChange={setModificadores}
              productoNombre={nombre}
            />

            <TouchableOpacity
              style={[styles.submit, guardando && styles.submitDisabled]}
              onPress={guardar}
              disabled={guardando}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.submitText}>{guardando ? "Guardando…" : "Agregar producto"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FCFBFA" },
  content: { padding: 14, paddingBottom: 40 },
  section: { backgroundColor: "#fff", borderRadius: 10, padding: 12, marginBottom: 8 },
  label: { fontSize: 12, color: "#1F2937", fontWeight: "700", marginBottom: 6 },
  labelFaint: { fontSize: 11, color: "#8B7B69", fontWeight: "400" },
  required: { color: "#DC2626", fontWeight: "700" },
  hint: { fontSize: 11, color: "#6B5B4A", marginTop: 6, lineHeight: 15 },
  requiredBanner: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10 },
  requiredBannerTxt: { flex: 1, fontSize: 12, color: "#1F4E45", lineHeight: 16 },
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
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#F3EFE7" },
  chipActive: { backgroundColor: "#ED8E3C" },
  chipText: { fontSize: 12, color: "#8B7B69", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  submit: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#ED8E3C", paddingVertical: 14, borderRadius: 999, marginTop: 10 },
  submitDisabled: { backgroundColor: "#D4D4D8" },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  mayoreoBox: { marginTop: 12, backgroundColor: "#FFF7EB", borderRadius: 10, padding: 12 },
  mayoreoHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  mayoreoTitle: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  mayoreoSubtitle: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  mayoreoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  mayoreoLabel: { fontSize: 12, color: "#8B7B69", width: 80 },
  mayoreoUnit: { fontSize: 12, color: "#8B7B69" },
});
