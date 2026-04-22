import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../src/contexts/SessionContext";
import {
  obtenerMiTienda,
  actualizarTienda,
  obtenerHorarioAtencion,
  guardarHorarioAtencion,
  type HorarioDia,
} from "../../src/api/tienda";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const ORDEN = [1, 2, 3, 4, 5, 6, 0]; // render Lun..Sáb, luego Dom

function atencionVacia(): HorarioDia[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia_semana: d, abre: null, cierra: null, descanso_desde: null, descanso_hasta: null }));
}

export default function MiTiendaScreen() {
  const { usuario } = useSession();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [guardandoInfo, setGuardandoInfo] = useState(false);
  const [guardandoHorario, setGuardandoHorario] = useState(false);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [referencias, setReferencias] = useState("");
  const [infoOriginal, setInfoOriginal] = useState({ nombre: "", telefono: "", direccion: "", referencias: "" });

  const [atencion, setAtencion] = useState<HorarioDia[]>(atencionVacia);
  const [atencionOriginal, setAtencionOriginal] = useState<HorarioDia[]>(atencionVacia);

  const load = useCallback(async () => {
    if (!usuario?.puesto_id) return;
    setLoading(true);
    try {
      const [tienda, dias] = await Promise.all([
        obtenerMiTienda(usuario.puesto_id),
        obtenerHorarioAtencion(),
      ]);
      if (tienda) {
        setNombre(tienda.nombre ?? "");
        setTelefono(tienda.telefono_contacto ?? "");
        setDireccion(tienda.ubicacion ?? "");
        setReferencias(tienda.descripcion ?? "");
        setInfoOriginal({
          nombre: tienda.nombre ?? "",
          telefono: tienda.telefono_contacto ?? "",
          direccion: tienda.ubicacion ?? "",
          referencias: tienda.descripcion ?? "",
        });
      }
      const base = atencionVacia();
      for (const d of dias) {
        const i = base.findIndex((x) => x.dia_semana === d.dia_semana);
        if (i >= 0) base[i] = { ...d };
      }
      setAtencion(base);
      setAtencionOriginal(JSON.parse(JSON.stringify(base)));
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
    referencias !== infoOriginal.referencias;
  const atencionModificada = JSON.stringify(atencion) !== JSON.stringify(atencionOriginal);

  async function guardarInfo() {
    setGuardandoInfo(true);
    try {
      await actualizarTienda({
        nombre: nombre.trim(),
        ubicacion: direccion.trim(),
        telefono_contacto: telefono.replace(/\D/g, ""),
        descripcion: referencias.trim() || "",
      });
      setInfoOriginal({ nombre, telefono, direccion, referencias });
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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#FF7A2B" /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 14, paddingBottom: 24 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
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
          <TouchableOpacity
            style={[styles.saveButton, (!infoModificada || guardandoInfo) && styles.saveButtonDisabled]}
            onPress={guardarInfo}
            disabled={!infoModificada || guardandoInfo}
          >
            <Text style={styles.saveText}>{guardandoInfo ? "Guardando…" : "Guardar datos"}</Text>
          </TouchableOpacity>
        </View>

        {/* Horario de atención */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time-outline" size={18} color="#1F2937" />
            <Text style={styles.sectionTitle}>Horario de atención</Text>
          </View>
          <Text style={styles.hint}>
            Fuera de este horario tu tienda aparece "Cerrada" al cliente. Deja el día cerrado si no abres.
          </Text>
          {ORDEN.map((dia) => {
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
                      <TimeInput
                        value={d.abre ?? ""}
                        onChangeText={(t) => patchDia(dia, { abre: t || null })}
                        placeholder="08:00"
                      />
                      <Text style={styles.timeSep}>a</Text>
                      <TimeInput
                        value={d.cierra ?? ""}
                        onChangeText={(t) => patchDia(dia, { cierra: t || null })}
                        placeholder="22:00"
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.siestaToggle, conSiesta && styles.siestaToggleOn]}
                      onPress={() =>
                        patchDia(dia, conSiesta
                          ? { descanso_desde: null, descanso_hasta: null }
                          : { descanso_desde: "14:00", descanso_hasta: "16:00" }
                        )
                      }
                    >
                      <Ionicons name={conSiesta ? "remove-circle-outline" : "add-circle-outline"} size={16} color={conSiesta ? "#92400E" : "#8B7B69"} />
                      <Text style={[styles.siestaText, conSiesta && styles.siestaTextOn]}>
                        {conSiesta ? "Quitar siesta" : "Agregar siesta"}
                      </Text>
                    </TouchableOpacity>

                    {conSiesta && (
                      <View style={styles.timeRow}>
                        <TimeInput
                          value={d.descanso_desde ?? ""}
                          onChangeText={(t) => patchDia(dia, { descanso_desde: t || null })}
                          placeholder="14:00"
                        />
                        <Text style={styles.timeSep}>a</Text>
                        <TimeInput
                          value={d.descanso_hasta ?? ""}
                          onChangeText={(t) => patchDia(dia, { descanso_hasta: t || null })}
                          placeholder="16:00"
                        />
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
  // Input HH:MM simple (sin native time picker para evitar otra dependencia)
  function onChange(t: string) {
    // Permitir solo dígitos y ":", max 5 caracteres, auto-insertar ":"
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
  fieldInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveButton: { backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 12, alignItems: "center", marginTop: 8 },
  saveButtonDisabled: { backgroundColor: "#D4D4D8" },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 14 },
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
});
