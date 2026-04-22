import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../src/contexts/SessionContext";

export default function LoginScreen() {
  const { loginCliente } = useSession();
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");
    if (!nombre.trim() || !telefono.trim()) {
      setError("Nombre y teléfono requeridos");
      return;
    }
    setLoading(true);
    const res = await loginCliente(nombre.trim(), telefono.replace(/\D/g, ""));
    setLoading(false);
    if (res.ok) router.replace("/(tabs)/home");
    else setError(res.error ?? "Error");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <View style={styles.logo}>
        <Ionicons name="storefront" size={56} color="#FF7A2B" />
        <Text style={styles.brand}>Mercadito</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Bienvenido</Text>
        <Text style={styles.subtitle}>Entra para hacer tu pedido</Text>

        <View style={styles.inputRow}>
          <Ionicons name="person-outline" size={18} color="#8B7B69" style={styles.inputIcon} />
          <TextInput
            value={nombre}
            onChangeText={setNombre}
            placeholder="Tu nombre"
            style={styles.input}
            autoCapitalize="words"
          />
        </View>
        <View style={styles.inputRow}>
          <Ionicons name="call-outline" size={18} color="#8B7B69" style={styles.inputIcon} />
          <TextInput
            value={telefono}
            onChangeText={setTelefono}
            placeholder="Teléfono"
            keyboardType="phone-pad"
            style={styles.input}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Ionicons name="log-in-outline" size={20} color="#fff" />
          <Text style={styles.buttonText}>{loading ? "Entrando…" : "Entrar"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#FFF7EB" },
  logo: { alignItems: "center", marginBottom: 24 },
  brand: { fontSize: 28, fontWeight: "700", color: "#1F2937", marginTop: 8 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 24, elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8 },
  title: { fontSize: 22, fontWeight: "700", color: "#1F2937", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#8B7B69", textAlign: "center", marginTop: 4, marginBottom: 18 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 },
  inputIcon: { marginRight: 6 },
  input: { flex: 1, paddingVertical: 12, fontSize: 16 },
  button: { flexDirection: "row", gap: 8, backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 8 },
  buttonDisabled: { backgroundColor: "#D4D4D8" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#DC2626", textAlign: "center", marginBottom: 8 },
});
