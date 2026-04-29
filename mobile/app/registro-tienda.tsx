import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch } from "../src/api/client";

/**
 * Registro de tienda en mobile. Misma lógica que /tienda/registro de web.
 * Tras enviar, el admin debe aprobar antes de que la tienda pueda operar.
 */
export default function RegistroTiendaScreen() {
  const router = useRouter();
  const [nombreTienda, setNombreTienda] = useState("");
  const [nombreDueno, setNombreDueno] = useState("");
  const [telefono, setTelefono] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [direccion, setDireccion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar() {
    if (!nombreTienda.trim() || !nombreDueno.trim() || !telefono.trim() || !pin) {
      Alert.alert("Faltan datos", "Llena nombre de tienda, dueño, teléfono y PIN");
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      Alert.alert("PIN inválido", "Usa 4 a 6 dígitos");
      return;
    }
    if (pin !== pinConfirm) {
      Alert.alert("PIN no coincide", "Confírmalo igual");
      return;
    }
    setEnviando(true);
    try {
      await apiFetch("/api/tiendas", {
        method: "POST",
        body: JSON.stringify({
          nombre_tienda: nombreTienda.trim(),
          nombre_dueno: nombreDueno.trim(),
          telefono: telefono.trim(),
          pin,
          descripcion: descripcion.trim() || undefined,
          direccion: direccion.trim() || undefined,
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
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ title: "Registro enviado", headerStyle: { backgroundColor: "#FFF7EB" } }} />
        <View style={styles.successBox}>
          <Ionicons name="checkmark-circle" size={72} color="#059669" />
          <Text style={styles.successTitle}>¡Registro enviado!</Text>
          <Text style={styles.successText}>
            Te contactaremos por WhatsApp al <Text style={styles.bold}>{telefono}</Text> cuando tu tienda sea aprobada (normalmente menos de 24 horas).
          </Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace("/login")}>
            <Text style={styles.btnTxt}>Volver al login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ title: "Registrar tienda", headerStyle: { backgroundColor: "#FFF7EB" } }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>
            Cuéntanos de tu negocio. Una vez que el equipo lo apruebe, podrás cargar tus productos y empezar a vender.
          </Text>

          <Field label="Nombre de tu negocio*" value={nombreTienda} onChangeText={setNombreTienda} placeholder="Ej: Frutería don Beto" autoCapitalize="words" />
          <Field label="Tu nombre*" value={nombreDueno} onChangeText={setNombreDueno} placeholder="Quién maneja la tienda" autoCapitalize="words" />
          <Field label="WhatsApp / teléfono*" value={telefono} onChangeText={setTelefono} placeholder="10 dígitos" keyboardType="phone-pad" />
          <Field label="PIN nuevo (4-6 dígitos)*" value={pin} onChangeText={setPin} placeholder="••••" keyboardType="number-pad" secureTextEntry maxLength={6} />
          <Field label="Confirma tu PIN*" value={pinConfirm} onChangeText={setPinConfirm} placeholder="••••" keyboardType="number-pad" secureTextEntry maxLength={6} />
          <Field label="Descripción (opcional)" value={descripcion} onChangeText={setDescripcion} placeholder="Qué vendes, horario, etc." multiline />
          <Field label="Dirección (opcional)" value={direccion} onChangeText={setDireccion} placeholder="Calle y colonia" />

          <TouchableOpacity onPress={enviar} disabled={enviando} style={[styles.btn, enviando && { opacity: 0.6 }]}>
            <Ionicons name="paper-plane-outline" size={18} color="#fff" />
            <Text style={styles.btnTxt}>{enviando ? "Enviando…" : "Enviar registro"}</Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            * obligatorio. Tu registro queda pendiente hasta que el equipo de Mercadito lo apruebe.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  content: { padding: 20, paddingBottom: 60 },
  lead: { fontSize: 14, color: "#374151", marginBottom: 16 },
  field: { marginBottom: 12 },
  label: { fontSize: 12, color: "#8B7B69", fontWeight: "700", marginBottom: 4 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#1F2937" },
  btn: { flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center", backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 14, marginTop: 14 },
  btnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  note: { fontSize: 11, color: "#8B7B69", textAlign: "center", marginTop: 14 },
  successBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  successTitle: { fontSize: 22, fontWeight: "800", color: "#1F2937" },
  successText: { fontSize: 14, color: "#374151", textAlign: "center" },
  bold: { fontWeight: "700" },
});
