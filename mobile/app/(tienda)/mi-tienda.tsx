import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../src/contexts/SessionContext";
import {
  obtenerMiTienda,
  actualizarTienda,
  obtenerHorarioAtencion,
  guardarHorarioAtencion,
  listarHorariosMenu,
  crearHorarioMenu,
  eliminarHorarioMenu,
  type HorarioDia,
} from "../../src/api/tienda";
import type { PuestoHorario } from "../../src/api/catalogo";
import { pickImageAsDataUrl } from "../../src/lib/imagePicker";
import { resolverImagen } from "../../src/lib/imgUrl";
import { useKeyboardHeight } from "../../src/lib/useKeyboard";
import MapaUbicacion from "../../src/components/MapaUbicacion";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

function atencionVacia(): HorarioDia[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia_semana: d, abre: null, cierra: null, descanso_desde: null, descanso_hasta: null }));
}

export default function MiTiendaScreen() {
  const { usuario } = useSession();
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();

  const [loading, setLoading] = useState(true);
  const [guardandoInfo, setGuardandoInfo] = useState(false);
  const [guardandoHorario, setGuardandoHorario] = useState(false);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [referencias, setReferencias] = useState("");
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [infoOriginal, setInfoOriginal] = useState({ nombre: "", telefono: "", direccion: "", referencias: "", ubicacion: null as { lat: number; lng: number } | null, logo: null as string | null });

  const [atencion, setAtencion] = useState<HorarioDia[]>(atencionVacia);
  const [atencionOriginal, setAtencionOriginal] = useState<HorarioDia[]>(atencionVacia);

  const [horariosMenu, setHorariosMenu] = useState<PuestoHorario[]>([]);
  const [nuevoHorarioNombre, setNuevoHorarioNombre] = useState("");
  const [nuevoHorarioDesde, setNuevoHorarioDesde] = useState("");
  const [nuevoHorarioHasta, setNuevoHorarioHasta] = useState("");
  const [guardandoMenuHorario, setGuardandoMenuHorario] = useState(false);

  const load = useCallback(async () => {
    if (!usuario?.puesto_id) return;
    setLoading(true);
    try {
      const [tienda, dias, menus] = await Promise.all([
        obtenerMiTienda(usuario.puesto_id),
        obtenerHorarioAtencion(),
        listarHorariosMenu(),
      ]);
      if (tienda) {
        const ubic = tienda.lat != null && tienda.lng != null ? { lat: tienda.lat, lng: tienda.lng } : null;
        setNombre(tienda.nombre ?? "");
        setTelefono(tienda.telefono_contacto ?? "");
        setDireccion(tienda.ubicacion ?? "");
        setReferencias(tienda.descripcion ?? "");
        setUbicacion(ubic);
        setLogo(tienda.logo ?? null);
        setInfoOriginal({
          nombre: tienda.nombre ?? "",
          telefono: tienda.telefono_contacto ?? "",
          direccion: tienda.ubicacion ?? "",
          referencias: tienda.descripcion ?? "",
          ubicacion: ubic,
          logo: tienda.logo ?? null,
        });
      }
      const base = atencionVacia();
      for (const d of dias) {
        const i = base.findIndex((x) => x.dia_semana === d.dia_semana);
        if (i >= 0) base[i] = { ...d };
      }
      setAtencion(base);
      setAtencionOriginal(JSON.parse(JSON.stringify(base)));
      setHorariosMenu(menus);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [usuario]);

  useEffect(() => { load(); }, [load]);

  const infoModificada =
    nombre !== infoOriginal.nombre ||
    telefono !== infoOriginal.telefono ||
    direccion !== infoOriginal.direccion ||
    referencias !== infoOriginal.referencias ||
    JSON.stringify(ubicacion) !== JSON.stringify(infoOriginal.ubicacion) ||
    logo !== infoOriginal.logo;
  const atencionModificada = JSON.stringify(atencion) !== JSON.stringify(atencionOriginal);

  async function elegirLogo(source: "camera" | "library") {
    const url = await pickImageAsDataUrl(source);
    if (url) setLogo(url);
  }

  async function guardarInfo() {
    setGuardandoInfo(true);
    try {
      await actualizarTienda({
        nombre: nombre.trim(),
        ubicacion: direccion.trim(),
        telefono_contacto: telefono.replace(/\D/g, ""),
        descripcion: referencias.trim() || "",
        ...(ubicacion ? { lat: ubicacion.lat, lng: ubicacion.lng } : {}),
        ...(logo !== infoOriginal.logo ? { logo } : {}),
      });
      setInfoOriginal({ nombre, telefono, direccion, referencias, ubicacion, logo });
      Alert.alert("Listo", "Datos actualizados");
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo guardar");
    } finally {
      setGuardandoInfo(false);
    }
  }

  async function guardarAtencion() {
    setGuardandoHorario(true);
    try {
      await guardarHorarioAtencion(atencion);
      setAtencionOriginal(JSON.parse(JSON.stringify(atencion)));
      Alert.alert("Listo", "Horario actualizado");
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo guardar");
    } finally {
      setGuardandoHorario(false);
    }
  }

  function patchDia(dia: number, patch: Partial<HorarioDia>) {
    setAtencion((prev) => prev.map((d) => d.dia_semana === dia ? { ...d, ...patch } : d));
  }

  async function agregarHorarioMenu() {
    if (!nuevoHorarioNombre.trim() || !nuevoHorarioDesde || !nuevoHorarioHasta) {
      Alert.alert("Faltan datos", "Nombre, desde y hasta son requeridos");
      return;
    }
    setGuardandoMenuHorario(true);
    try {
      await crearHorarioMenu(nuevoHorarioNombre.trim(), nuevoHorarioDesde, nuevoHorarioHasta);
      const lista = await listarHorariosMenu();
      setHorariosMenu(lista);
      setNuevoHorarioNombre("");
      setNuevoHorarioDesde("");
      setNuevoHorarioHasta("");
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo crear");
    } finally {
      setGuardandoMenuHorario(false);
    }
  }

  async function borrarHorarioMenu(h: PuestoHorario) {
    Alert.alert(
      "Eliminar horario",
      `¿Eliminar "${h.nombre}"? Los productos que lo usen quedarán sin ese horario.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar", style: "destructive", onPress: async () => {
            try {
              await eliminarHorarioMenu(h.id);
              setHorariosMenu((prev) => prev.filter((x) => x.id !== h.id));
            } catch (e) {
              Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo eliminar");
            }
          }
        },
      ]
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#FF7A2B" /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 14, paddingBottom: Math.max(kbHeight + 40, 24 + insets.bottom) }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Logo */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="image-outline" size={18} color="#1F2937" />
            <Text style={styles.sectionTitle}>Logo</Text>
          </View>
          <View style={styles.logoRow}>
            {logo ? (
              <View style={styles.logoBox}>
                <Image source={{ uri: resolverImagen(logo) ?? logo }} style={styles.logo} />
                <TouchableOpacity style={styles.logoRemove} onPress={() => setLogo(null)}>
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder]}>
                <Ionicons name="storefront-outline" size={28} color="#D4C9B8" />
              </View>
            )}
            <View style={styles.logoActions}>
              <TouchableOpacity style={styles.imagenBtn} onPress={() => elegirLogo("camera")}>
                <Ionicons name="camera-outline" size={16} color="#1F2937" />
                <Text style={styles.imagenBtnText}>Cámara</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imagenBtn} onPress={() => elegirLogo("library")}>
                <Ionicons name="images-outline" size={16} color="#1F2937" />
                <Text style={styles.imagenBtnText}>Galería</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Mapa - primero, para que quien no sepa dónde empezar, lo ponga */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location-outline" size={18} color="#1F2937" />
            <Text style={styles.sectionTitle}>Ubicación</Text>
          </View>
          <Text style={styles.hint}>Busca tu dirección, toca el mapa o usa &quot;Mi ubicación&quot;. Se autocompleta el campo Dirección abajo.</Text>
          <MapaUbicacion
            valor={ubicacion}
            onCambio={(p) => setUbicacion(p)}
            onDireccionDetectada={(d) => setDireccion(d)}
          />
          {ubicacion && (
            <Text style={styles.coords}>📍 {ubicacion.lat.toFixed(5)}, {ubicacion.lng.toFixed(5)}</Text>
          )}
        </View>

        {/* Datos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="storefront-outline" size={18} color="#1F2937" />
            <Text style={styles.sectionTitle}>Datos de tu tienda</Text>
          </View>
          <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Nombre de la tienda" />
          <Field label="WhatsApp / Teléfono" value={telefono} onChangeText={setTelefono} placeholder="353 000 0000" keyboardType="phone-pad" />
          <Field label="Dirección" value={direccion} onChangeText={setDireccion} placeholder="Calle, colonia, número" />
          <Field label="Referencias" value={referencias} onChangeText={setReferencias} placeholder="Ej: frente a la entrada principal" multiline />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, (!infoModificada || guardandoInfo) && styles.saveButtonDisabled]}
          onPress={guardarInfo}
          disabled={!infoModificada || guardandoInfo}
        >
          <Text style={styles.saveText}>{guardandoInfo ? "Guardando…" : "Guardar datos"}</Text>
        </TouchableOpacity>

        {/* Horario de atención */}
        <View style={styles.section}>
          {(() => {
            const es24h = atencion.every((d) => !d.abre && !d.cierra);
            const toggle24h = () => {
              if (es24h) {
                setAtencion(atencion.map((d) => ({ ...d, abre: "08:00", cierra: "22:00", descanso_desde: null, descanso_hasta: null })));
              } else {
                setAtencion(atencion.map((d) => ({ ...d, abre: null, cierra: null, descanso_desde: null, descanso_hasta: null })));
              }
            };
            return (
              <>
                <View style={[styles.sectionHeader, { justifyContent: "space-between" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <Ionicons name="time-outline" size={18} color="#1F2937" />
                    <Text style={styles.sectionTitle}>Horario de atención</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Switch
                      value={es24h}
                      onValueChange={toggle24h}
                      trackColor={{ false: "#E5E7EB", true: "#FF7A2B" }}
                      thumbColor="#fff"
                    />
                    <Text style={{ fontSize: 10, color: "#8B7B69", fontWeight: "600", marginTop: 2 }}>24 horas</Text>
                  </View>
                </View>
                <Text style={styles.hint}>
                  {es24h
                    ? "Tu tienda aparece siempre abierta al cliente."
                    : "Fuera de este horario tu tienda aparece \"Cerrada\" al cliente."}
                </Text>
                {!es24h && ORDEN.map((dia) => {
            const d = atencion.find((x) => x.dia_semana === dia)!;
            const cerrado = !d.abre && !d.cierra;
            const conSiesta = Boolean(d.descanso_desde || d.descanso_hasta);
            return (
              <View key={dia} style={styles.diaCard}>
                <View style={styles.diaHeader}>
                  <Text style={styles.diaNombre}>{DIAS[dia]}</Text>
                  <TouchableOpacity
                    style={[styles.estadoPill, cerrado ? styles.estadoCerrado : styles.estadoAbierto]}
                    onPress={() =>
                      patchDia(dia, cerrado
                        ? { abre: "08:00", cierra: "22:00" }
                        : { abre: null, cierra: null, descanso_desde: null, descanso_hasta: null }
                      )
                    }
                  >
                    <Text style={[styles.estadoText, cerrado ? styles.estadoTextCerrado : styles.estadoTextAbierto]}>
                      {cerrado ? "Cerrado" : "Abierto"}
                    </Text>
                  </TouchableOpacity>
                </View>
                {!cerrado && (
                  <>
                    <View style={styles.timeRow}>
                      <TimeInput value={d.abre ?? ""} onChangeText={(t) => patchDia(dia, { abre: t || null })} placeholder="08:00" />
                      <Text style={styles.timeSep}>a</Text>
                      <TimeInput value={d.cierra ?? ""} onChangeText={(t) => patchDia(dia, { cierra: t || null })} placeholder="22:00" />
                    </View>
                    <TouchableOpacity
                      style={[styles.siestaToggle, conSiesta && styles.siestaToggleOn]}
                      onPress={() => patchDia(dia, conSiesta ? { descanso_desde: null, descanso_hasta: null } : { descanso_desde: "14:00", descanso_hasta: "16:00" })}
                    >
                      <Ionicons name={conSiesta ? "remove-circle-outline" : "add-circle-outline"} size={16} color={conSiesta ? "#92400E" : "#8B7B69"} />
                      <Text style={[styles.siestaText, conSiesta && styles.siestaTextOn]}>
                        {conSiesta ? "Quitar siesta" : "Agregar siesta"}
                      </Text>
                    </TouchableOpacity>
                    {conSiesta && (
                      <View style={styles.timeRow}>
                        <TimeInput value={d.descanso_desde ?? ""} onChangeText={(t) => patchDia(dia, { descanso_desde: t || null })} placeholder="14:00" />
                        <Text style={styles.timeSep}>a</Text>
                        <TimeInput value={d.descanso_hasta ?? ""} onChangeText={(t) => patchDia(dia, { descanso_hasta: t || null })} placeholder="16:00" />
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}
                <TouchableOpacity
                  style={[styles.saveButton, (!atencionModificada || guardandoHorario) && styles.saveButtonDisabled]}
                  onPress={guardarAtencion}
                  disabled={!atencionModificada || guardandoHorario}
                >
                  <Text style={styles.saveText}>{guardandoHorario ? "Guardando…" : "Guardar horario"}</Text>
                </TouchableOpacity>
              </>
            );
          })()}
        </View>

        {/* Horarios del menú */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="restaurant-outline" size={18} color="#1F2937" />
            <Text style={styles.sectionTitle}>Horarios del menú</Text>
          </View>
          <Text style={styles.hint}>
            Rangos como "Desayuno" o "Tarde" para asignar a productos. Fuera del rango no aparecen al cliente.
          </Text>

          {horariosMenu.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              {horariosMenu.map((h) => (
                <View key={h.id} style={styles.menuRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuNombre}>{h.nombre}</Text>
                    <Text style={styles.menuRango}>{h.desde} – {h.hasta}</Text>
                  </View>
                  <TouchableOpacity onPress={() => borrarHorarioMenu(h)} style={styles.menuDelete}>
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.menuForm}>
            <Text style={styles.menuFormTitle}>AGREGAR</Text>
            <TextInput
              value={nuevoHorarioNombre}
              onChangeText={setNuevoHorarioNombre}
              placeholder="Nombre (ej: Desayuno, Comida, Tarde)"
              style={styles.fieldInput}
            />
            <View style={styles.timeRow}>
              <TimeInput value={nuevoHorarioDesde} onChangeText={setNuevoHorarioDesde} placeholder="07:00" />
              <Text style={styles.timeSep}>a</Text>
              <TimeInput value={nuevoHorarioHasta} onChangeText={setNuevoHorarioHasta} placeholder="11:00" />
            </View>
            <TouchableOpacity
              style={[styles.menuAddButton, (guardandoMenuHorario || !nuevoHorarioNombre.trim() || !nuevoHorarioDesde || !nuevoHorarioHasta) && styles.saveButtonDisabled]}
              onPress={agregarHorarioMenu}
              disabled={guardandoMenuHorario || !nuevoHorarioNombre.trim() || !nuevoHorarioDesde || !nuevoHorarioHasta}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.saveText}>{guardandoMenuHorario ? "Guardando…" : "Agregar horario"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "number-pad" | "decimal-pad";
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.fieldInput, multiline && { minHeight: 56 }]}
      />
    </View>
  );
}

function TimeInput({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder?: string }) {
  function onChange(t: string) {
    let clean = t.replace(/[^0-9:]/g, "").slice(0, 5);
    if (clean.length === 2 && !clean.includes(":")) clean = `${clean}:`;
    onChangeText(clean);
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      keyboardType="number-pad"
      maxLength={5}
      style={styles.timeInput}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  section: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  hint: { fontSize: 12, color: "#8B7B69", marginBottom: 10 },
  fieldLabel: { fontSize: 12, color: "#8B7B69", fontWeight: "600", marginBottom: 4 },
  fieldInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  saveButton: { backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 12, alignItems: "center", marginTop: 8 },
  saveButtonDisabled: { backgroundColor: "#D4D4D8" },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoBox: { position: "relative" },
  logo: { width: 70, height: 70, borderRadius: 12 },
  logoPlaceholder: { backgroundColor: "#F3EFE7", alignItems: "center", justifyContent: "center" },
  logoRemove: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center" },
  logoActions: { flex: 1, gap: 6 },
  imagenBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB", borderStyle: "dashed" },
  imagenBtnText: { fontSize: 12, color: "#1F2937", fontWeight: "500" },
  coords: { fontSize: 11, color: "#8B7B69", marginTop: 6, textAlign: "center" },
  diaCard: { backgroundColor: "#FFF7EB", borderRadius: 10, padding: 10, marginBottom: 6 },
  diaHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  diaNombre: { fontSize: 14, fontWeight: "700", color: "#1F2937", width: 42 },
  estadoPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  estadoAbierto: { backgroundColor: "#DCFCE7" },
  estadoCerrado: { backgroundColor: "#F3F4F6" },
  estadoText: { fontSize: 11, fontWeight: "700" },
  estadoTextAbierto: { color: "#059669" },
  estadoTextCerrado: { color: "#8B7B69" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  timeInput: { flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, fontSize: 14, backgroundColor: "#fff", textAlign: "center" },
  timeSep: { color: "#8B7B69", fontSize: 12 },
  siestaToggle: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#F3F4F6", marginTop: 8 },
  siestaToggleOn: { backgroundColor: "#FEF3C7" },
  siestaText: { fontSize: 11, color: "#8B7B69", fontWeight: "600" },
  siestaTextOn: { color: "#92400E" },
  menuRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF7EB", borderRadius: 10, padding: 10, marginBottom: 6 },
  menuNombre: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  menuRango: { fontSize: 12, color: "#8B7B69", marginTop: 2 },
  menuDelete: { padding: 8 },
  menuForm: { borderTopWidth: 1, borderTopColor: "#F3EFE7", paddingTop: 10 },
  menuFormTitle: { fontSize: 11, color: "#8B7B69", fontWeight: "700", marginBottom: 6 },
  menuAddButton: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 10, marginTop: 4 },
});
