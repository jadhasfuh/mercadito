import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../src/contexts/SessionContext";

export default function PerfilScreen() {
  const { usuario, logout } = useSession();

  function handleLogout() {
    Alert.alert("Cerrar sesión", "¿Seguro que quieres salir?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: () => logout() },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.avatarBox}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={44} color="#FF7A2B" />
        </View>
        <Text style={styles.nombre}>{usuario?.nombre ?? "Cliente"}</Text>
        <Text style={styles.meta}>{usuario?.telefono}</Text>
      </View>

      <View style={styles.card}>
        <InfoRow icon="person-outline" label="Nombre" value={usuario?.nombre ?? "—"} />
        <InfoRow icon="call-outline" label="Teléfono" value={usuario?.telefono ?? "—"} />
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#DC2626" />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

function InfoRow({ icon, label, value }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color="#8B7B69" />
      <View style={{ marginLeft: 10 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#FFF7EB" },
  avatarBox: { alignItems: "center", marginTop: 20, marginBottom: 20 },
  avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: "#FFE4D1", alignItems: "center", justifyContent: "center" },
  nombre: { fontSize: 20, fontWeight: "700", color: "#1F2937", marginTop: 12 },
  meta: { color: "#8B7B69", marginTop: 2 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3EFE7" },
  infoLabel: { fontSize: 11, color: "#8B7B69" },
  infoValue: { fontSize: 15, color: "#1F2937", fontWeight: "500" },
  logoutButton: { flexDirection: "row", gap: 8, paddingVertical: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FECACA", marginTop: 20, backgroundColor: "#fff" },
  logoutText: { color: "#DC2626", fontWeight: "600" },
});
