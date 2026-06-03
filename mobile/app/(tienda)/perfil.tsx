import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../src/contexts/SessionContext";
import ScreenHeader from "../../src/components/ScreenHeader";
import { apiFetch, setSessionToken } from "../../src/api/client";

export default function PerfilTiendaScreen() {
  const { usuario, logout, refresh } = useSession();
  const [eliminando, setEliminando] = useState(false);

  function handleLogout() {
    Alert.alert("Cerrar sesión", "¿Seguro que quieres salir?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: () => logout() },
    ]);
  }

  function eliminarCuenta() {
    Alert.alert(
      "Eliminar cuenta",
      "Esta acción es permanente. Tu tienda queda desactivada y dejas de recibir pedidos. Tus datos se anonimizan; el historial de ventas se conserva por motivos contables.\n\n¿Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar mi cuenta",
          style: "destructive",
          onPress: async () => {
            setEliminando(true);
            try {
              await apiFetch("/api/cliente/eliminar-cuenta", { method: "POST" });
              await setSessionToken(null);
              await refresh();
              Alert.alert("Cuenta eliminada", "Tu cuenta y tienda fueron desactivadas.");
            } catch (e) {
              Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo eliminar");
            } finally {
              setEliminando(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Perfil" subtitle={usuario?.rol === "repartidor" ? "Repartidor" : "Tienda"} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.avatarBox}>
          <View style={styles.avatar}>
            <Ionicons name="storefront" size={44} color="#ED8E3C" />
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

        <Text style={styles.sectionTitle}>Legales</Text>
        <TouchableOpacity style={styles.row} onPress={() => Linking.openURL("https://mercadito.cx/terminos")}>
          <Ionicons name="document-text-outline" size={20} color="#8B7B69" />
          <Text style={styles.rowText}>Términos y condiciones</Text>
          <Ionicons name="chevron-forward" size={18} color="#D4C9B8" style={{ marginLeft: "auto" }} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => Linking.openURL("https://mercadito.cx/privacidad")}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#8B7B69" />
          <Text style={styles.rowText}>Aviso de privacidad</Text>
          <Ionicons name="chevron-forward" size={18} color="#D4C9B8" style={{ marginLeft: "auto" }} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerButton} onPress={eliminarCuenta} disabled={eliminando}>
          <Ionicons name="trash-outline" size={18} color="#991B1B" />
          <Text style={styles.dangerText}>{eliminando ? "Eliminando…" : "Eliminar mi cuenta"}</Text>
        </TouchableOpacity>
        <Text style={styles.dangerNote}>
          Tu cuenta y tienda se desactivan. El historial de ventas se conserva de forma anónima.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FCFBFA" },
  body: { padding: 20 },
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
  sectionTitle: { fontSize: 11, color: "#8B7B69", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 18, marginBottom: 6, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#fff", marginBottom: 6 },
  rowText: { color: "#1F2937", fontWeight: "600", fontSize: 14 },
  dangerButton: { flexDirection: "row", gap: 8, paddingVertical: 12, alignItems: "center", justifyContent: "center", marginTop: 6 },
  dangerText: { color: "#991B1B", fontSize: 13, fontWeight: "700" },
  dangerNote: { fontSize: 11, color: "#8B7B69", textAlign: "center", marginTop: 6, paddingHorizontal: 12 },
});
