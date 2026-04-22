import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSession } from "../../src/contexts/SessionContext";

export default function PerfilScreen() {
  const { usuario, logout } = useSession();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{usuario?.nombre ?? "Perfil"}</Text>
      <Text style={styles.meta}>{usuario?.telefono}</Text>
      <TouchableOpacity style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>Cerrar sesion</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#FFF7EB" },
  title: { fontSize: 22, fontWeight: "700", color: "#1F2937" },
  meta: { color: "#8B7B69", marginTop: 4 },
  button: { marginTop: 24, backgroundColor: "#fff", borderRadius: 999, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB" },
  buttonText: { color: "#DC2626", fontWeight: "600" },
});
