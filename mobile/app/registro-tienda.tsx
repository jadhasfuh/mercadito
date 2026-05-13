import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "../src/api/client";
import AppHeader from "../src/components/AppHeader";
import MapaUbicacion from "../src/components/MapaUbicacion";
import PinInput from "../src/components/PinInput";

/**
 * Registro de tienda en mobile. Paridad con /tienda/registro de web:
 * mapa interactivo + reverse-geocoding, número de local separado,
 * referencias, validaciones específicas y pantalla de éxito que muestra
 * teléfono + PIN para que el dueño los guarde antes de cerrar.
 *
 * Mantiene confirmación de PIN (no existe en web): la gente teclea con
 * fat-fingers en mobile y recuperar acceso es manual vía soporte.
 */
export default function RegistroTiendaScreen() {
  const router = useRouter();
  const [nombreTienda, setNombreTienda] = useState("");
  const [nombreDueno, setNombreDueno] = useState("");
  const [telefono, setTelefono] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [direccionDetectada, setDireccionDetectada] = useState("");
  const [numeroLocal, setNumeroLocal] = useState("");
  const [referencias, setReferencias] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar() {
    if (!nombreTienda.trim() || !nombreDueno.trim() || !telefono.trim() || !pin) {
      Alert.alert("Faltan datos", "Llena nombre de tienda, dueño, teléfono y PIN");
      return;
    }
    const tel = telefono.replace(/\D/g, "");
    if (!/^\d{10}$/.test(tel)) {
      Alert.alert("Teléfono inválido", "El teléfono debe ser de 10 dígitos");
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      Alert.alert("PIN inválido", "El PIN debe ser de 6 dígitos numéricos");
      return;
    }
    if (pin !== pinConfirm) {
      Alert.alert("PIN no coincide", "Confírmalo igual");
      return;
    }
    if (!ubicacion || !direccionDetectada) {
      Alert.alert("Falta ubicación", "Toca el mapa o usa 'Mi ubicación' para marcar dónde está tu tienda");
      return;
    }
    if (!numeroLocal.trim()) {
      Alert.alert("Falta número de local", "Escribe el número de local, puesto o nave");
      return;
    }
    setEnviando(true);
    try {
      const direccionCompleta = `${direccionDetectada} #${numeroLocal.trim()}`;
      await apiFetch("/api/tiendas", {
        method: "POST",
        body: JSON.stringify({
          nombre_tienda: nombreTienda.trim(),
          nombre_dueno: nombreDueno.trim(),
          telefono: tel,
          pin,
          descripcion: referencias.trim() || undefined,
          direccion: direccionCompleta,
          lat: ubicacion.lat,
          lng: ubicacion.lng,
        }),
      });
      setEnviado(true);
    } catch (e) {
      Alert.alert("No se pudo registrar", (e as { error?: string })?.error ?? "Intenta de nuevo");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <View style={styles.safe}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppHeader title="Registro enviado" />
        <ScrollView contentContainerStyle={styles.successBox}>
          <Ionicons name="checkmark-circle" size={72} color="#059669" />
          <Text style={styles.successTitle}>¡Registro enviado!</Text>
          <Text style={styles.successText}>
            Tu tienda <Text style={styles.bold}>{nombreTienda}</Text> está pendiente de aprobación.
          </Text>
          <Text style={styles.successText}>
            Te contactaremos por WhatsApp al <Text style={styles.bold}>{telefono}</Text> cuando esté lista (normalmente menos de 24 horas).
          </Text>

          <View style={styles.credBox}>
            <Text style={styles.credTitle}>Guarda tus datos de acceso:</Text>
            <Text style={styles.credLine}>Teléfono: <Text style={styles.bold}>{telefono}</Text></Text>
            <Text style={styles.credLine}>PIN: <Text style={styles.bold}>{pin}</Text></Text>
            <Text style={styles.credHint}>Cuando esté aprobada, entra desde la pantalla de inicio con estos datos.</Text>
          </View>

          <TouchableOpacity style={styles.btn} onPress={() => router.replace("/login")}>
            <Text style={styles.btnTxt}>Volver al login</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title="Registro de negocio" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>
            Cuéntanos de tu negocio. Una vez que el equipo lo apruebe, podrás cargar tus productos y empezar a vender en Sahuayo, Jiquilpan y V. Carranza.
          </Text>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Datos del negocio</Text>
            <Field label="Nombre de tu tienda*" value={nombreTienda} onChangeText={setNombreTienda} placeholder="Ej: Frutería don Beto" autoCapitalize="words" />
            <Field label="Tu nombre*" value={nombreDueno} onChangeText={setNombreDueno} placeholder="Quién maneja la tienda" autoCapitalize="words" />
            <Field label="WhatsApp / teléfono*" value={telefono} onChangeText={setTelefono} placeholder="10 dígitos" keyboardType="phone-pad" />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Acceso seguro</Text>
            <Text style={styles.help}>Crea un PIN de 6 dígitos. Lo usarás cada vez que entres a tu panel de tienda.</Text>
            <Text style={styles.pinLabel}>PIN nuevo*</Text>
            <PinInput value={pin} onChange={setPin} length={6} />
            <Text style={[styles.pinLabel, { marginTop: 8 }]}>Confirma tu PIN*</Text>
            <PinInput value={pinConfirm} onChange={setPinConfirm} length={6} error={pinConfirm.length === pin.length && pinConfirm !== pin} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>¿Dónde está tu tienda?*</Text>
            <Text style={styles.help}>Toca el mapa o usa &quot;Mi ubicación&quot; para marcar el punto exacto. La dirección se llena sola.</Text>
            <MapaUbicacion
              valor={ubicacion}
              onCambio={setUbicacion}
              onDireccionDetectada={setDireccionDetectada}
              altura={240}
            />

            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Dirección detectada</Text>
              {direccionDetectada ? (
                <Text style={styles.dirDetectada}>{direccionDetectada}</Text>
              ) : (
                <Text style={styles.dirPendiente}>Marca tu ubicación en el mapa para llenar este campo</Text>
              )}
            </View>

            <Field label="No. de calle, local o puesto*" value={numeroLocal} onChangeText={setNumeroLocal} placeholder="Ej. Local 15, Puesto 3" />
            <Field label="Referencias (opcional)" value={referencias} onChangeText={setReferencias} placeholder="Ej. frente a la entrada" multiline />
          </View>

          <TouchableOpacity onPress={enviar} disabled={enviando} style={[styles.btn, enviando && { opacity: 0.6 }]}>
            <Ionicons name="paper-plane-outline" size={18} color="#fff" />
            <Text style={styles.btnTxt}>{enviando ? "Enviando…" : "Enviar registro"}</Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            * obligatorio. Tu registro queda pendiente hasta que el equipo de Mercadito lo apruebe.
          </Text>

          <TouchableOpacity onPress={() => router.replace("/login")} style={styles.linkRow}>
            <Text style={styles.linkText}>¿Ya tienes cuenta? <Text style={styles.linkBold}>Entra aquí</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...rest} style={[styles.input, rest.multiline && { minHeight: 60, textAlignVertical: "top" }]} placeholderTextColor="#9CA3AF" />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFF7EB" },
  content: { padding: 16, paddingBottom: 60, gap: 12 },
  lead: { fontSize: 14, color: "#374151", marginBottom: 4 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 4 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: "#1F2937", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  help: { fontSize: 12, color: "#6B7280", marginBottom: 8 },
  field: { marginBottom: 10 },
  label: { fontSize: 12, color: "#8B7B69", fontWeight: "700", marginBottom: 4 },
  pinLabel: { fontSize: 12, color: "#8B7B69", fontWeight: "700", marginBottom: 4, textAlign: "center" },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#1F2937" },
  dirDetectada: { backgroundColor: "#F3F4F6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#1F2937", fontSize: 14, marginBottom: 10 },
  dirPendiente: { backgroundColor: "#FEF3C7", borderColor: "#FCD34D", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#92400E", fontSize: 13, marginBottom: 10 },
  btn: { flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center", backgroundColor: "#ED8E3C", borderRadius: 999, paddingVertical: 14, marginTop: 4 },
  btnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  note: { fontSize: 11, color: "#8B7B69", textAlign: "center", marginTop: 6 },
  linkRow: { paddingVertical: 12, alignItems: "center" },
  linkText: { color: "#6B7280", fontSize: 13 },
  linkBold: { color: "#C2680E", fontWeight: "700" },
  successBox: { padding: 24, gap: 12, alignItems: "center" },
  successTitle: { fontSize: 22, fontWeight: "800", color: "#1F2937" },
  successText: { fontSize: 14, color: "#374151", textAlign: "center" },
  bold: { fontWeight: "700" },
  credBox: { backgroundColor: "#FFF1E0", borderColor: "#F59E0B", borderWidth: 1, borderRadius: 14, padding: 14, alignSelf: "stretch", marginTop: 6 },
  credTitle: { fontSize: 13, fontWeight: "800", color: "#1F2937", marginBottom: 6 },
  credLine: { fontSize: 14, color: "#C2680E", marginBottom: 2 },
  credHint: { fontSize: 11, color: "#6B7280", marginTop: 6 },
});
