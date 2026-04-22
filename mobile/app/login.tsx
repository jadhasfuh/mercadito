import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../src/contexts/SessionContext";

type Rol = "cliente" | "repartidor" | "tienda";

const ROL_CONFIG: Record<Rol, {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  destino: string;
}> = {
  cliente: {
    label: "Cliente",
    icon: "person-outline",
    title: "Bienvenido",
    subtitle: "Entra para hacer tu pedido",
    destino: "/(tabs)/home",
  },
  repartidor: {
    label: "Repartidor",
    icon: "bicycle-outline",
    title: "Panel Repartidor",
    subtitle: "Ingresa con tu teléfono y PIN",
    destino: "/(repartidor)/pedidos",
  },
  tienda: {
    label: "Tienda",
    icon: "storefront-outline",
    title: "Mi Tienda",
    subtitle: "Ingresa con el teléfono y PIN",
    destino: "/(tienda)/pedidos",
  },
};

export default function LoginScreen() {
  const { loginCliente, loginConPin } = useSession();
  const router = useRouter();
  const [rol, setRol] = useState<Rol>("cliente");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const cfg = ROL_CONFIG[rol];

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      if (rol === "cliente") {
        if (!nombre.trim() || !telefono.trim()) { setError("Nombre y teléfono requeridos"); return; }
        const res = await loginCliente(nombre.trim(), telefono.replace(/\D/g, ""));
        if (!res.ok) setError(res.error ?? "Error");
        else router.replace(cfg.destino);
      } else {
        if (!telefono.trim() || !pin.trim()) { setError("Teléfono y PIN requeridos"); return; }
        const res = await loginConPin(rol, telefono.replace(/\D/g, ""), pin);
        if (!res.ok) setError(res.error ?? "Error");
        else router.replace(cfg.destino);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logo}>
            <Ionicons name="storefront" size={56} color="#FF7A2B" />
            <Text style={styles.brand}>Mercadito</Text>
          </View>

          <View style={styles.rolRow}>
            {(Object.keys(ROL_CONFIG) as Rol[]).map((r) => (
              <RolButton
                key={r}
                icon={ROL_CONFIG[r].icon}
                label={ROL_CONFIG[r].label}
                active={rol === r}
                onPress={() => { setRol(r); setError(""); }}
              />
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>{cfg.title}</Text>
            <Text style={styles.subtitle}>{cfg.subtitle}</Text>

            {rol === "cliente" && (
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
            )}

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

            {rol !== "cliente" && (
              <View style={styles.inputRow}>
                <Ionicons name="keypad-outline" size={18} color="#8B7B69" style={styles.inputIcon} />
                <TextInput
                  value={pin}
                  onChangeText={setPin}
                  placeholder="PIN"
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={6}
                  style={[styles.input, { letterSpacing: 6, textAlign: "center" }]}
                />
              </View>
            )}

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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RolButton({ icon, label, active, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.rolButton, active && styles.rolButtonActive]}>
      <Ionicons name={icon} size={22} color={active ? "#FF7A2B" : "#8B7B69"} />
      <Text style={[styles.rolText, active && styles.rolTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFF7EB" },
  container: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 40 },
  logo: { alignItems: "center", marginBottom: 18 },
  brand: { fontSize: 28, fontWeight: "700", color: "#1F2937", marginTop: 8 },
  rolRow: { flexDirection: "row", gap: 6, marginBottom: 14 },
  rolButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 14, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  rolButtonActive: { borderColor: "#FF7A2B", backgroundColor: "#FFF2E5" },
  rolText: { color: "#8B7B69", fontWeight: "500", fontSize: 12 },
  rolTextActive: { color: "#FF7A2B", fontWeight: "700" },
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
