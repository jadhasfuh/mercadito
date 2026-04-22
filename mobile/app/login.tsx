import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
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
      setError("Nombre y telefono requeridos");
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
      <View style={styles.card}>
        <Text style={styles.title}>Bienvenido</Text>
        <Text style={styles.subtitle}>Entra para hacer tu pedido</Text>

        <TextInput
          value={nombre}
          onChangeText={setNombre}
          placeholder="Tu nombre"
          style={styles.input}
          autoCapitalize="words"
        />
        <TextInput
          value={telefono}
          onChangeText={setTelefono}
          placeholder="Telefono"
          keyboardType="phone-pad"
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Entrando…" : "Entrar"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#FFF7EB" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 24, elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8 },
  title: { fontSize: 24, fontWeight: "700", color: "#1F2937", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#8B7B69", textAlign: "center", marginTop: 4, marginBottom: 20 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { backgroundColor: "#D4D4D8" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#DC2626", textAlign: "center", marginBottom: 8 },
});
