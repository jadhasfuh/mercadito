import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../src/contexts/SessionContext";

export default function PerfilTiendaScreen() {
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
          <Ionicons name="storefront" size={44} color="#FF7A2B" />
        </View>
        <Text style={styles.nombre}>{usuario?.nombre ?? "Tienda"}</Text>
        <Text style={styles.meta}>{usuario?.telefono}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#065F46" />
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.infoLabel}>Cuenta</Text>
            <Text style={styles.infoValue}>Tienda</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="laptop-outline" size={18} color="#8B7B69" />
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.infoLabel}>Administración</Text>
            <Text style={styles.infoValue}>Edita catálogo y precios en mercadito.cx</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#DC2626" />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
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
  infoValue: { fontSize: 14, color: "#1F2937", fontWeight: "500" },
  logoutButton: { flexDirection: "row", gap: 8, paddingVertical: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FECACA", marginTop: 20, backgroundColor: "#fff" },
  logoutText: { color: "#DC2626", fontWeight: "600" },
});
