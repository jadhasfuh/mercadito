import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useSession } from "../../src/contexts/SessionContext";
import { apiFetch, setSessionToken } from "../../src/api/client";
import PinManagerModal from "../../src/components/PinManagerModal";
import AppHeader from "../../src/components/AppHeader";

const SOPORTE = "5215659163241";
const APP_VERSION = Constants.expoConfig?.version ?? "?";

export default function PerfilScreen() {
  const { usuario, logout, refresh } = useSession();
  const insets = useSafeAreaInsets();
  const [pinModal, setPinModal] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  function handleLogout() {
    Alert.alert("Cerrar sesión", "¿Seguro que quieres salir?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: () => logout() },
    ]);
  }

  function abrirEnlace(path: string) {
    Linking.openURL(`https://mercadito.cx${path}`);
  }

  function eliminarCuenta() {
    Alert.alert(
      "Eliminar cuenta",
      "Esta acción es permanente. Tu nombre y teléfono se borran y se cierra tu sesión. Tus pedidos pasados se conservan de forma anónima por motivos contables.\n\n¿Continuar?",
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
              Alert.alert("Cuenta eliminada", "Tu cuenta fue eliminada. Gracias por habernos probado.");
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
      <AppHeader />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
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

      <TouchableOpacity style={styles.row} onPress={() => setPinModal(true)}>
        <Ionicons name="lock-closed-outline" size={20} color="#FF7A2B" />
        <Text style={styles.rowText}>Configurar PIN</Text>
        <Ionicons name="chevron-forward" size={18} color="#D4C9B8" style={{ marginLeft: "auto" }} />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Soporte</Text>
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          // Pre-llenamos versión + datos del cliente para que no los teclee.
          // Adrian ve directo de qué versión viene el problema.
          const msg = `Hola, tengo un problema con Mercadito\n` +
            `• App: ${Platform.OS === "ios" ? "iOS" : "Android"} v${APP_VERSION}\n` +
            (usuario ? `• Mi tel: ${usuario.telefono}\n` : "") +
            (usuario?.nombre ? `• Nombre: ${usuario.nombre}\n` : "") +
            `\nLo que pasó:\n`;
          Linking.openURL(`https://wa.me/${SOPORTE}?text=${encodeURIComponent(msg)}`);
        }}
      >
        <Ionicons name="bug-outline" size={20} color="#DC2626" />
        <Text style={styles.rowText}>Reportar un problema</Text>
        <Ionicons name="chevron-forward" size={18} color="#D4C9B8" style={{ marginLeft: "auto" }} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.row} onPress={() => Linking.openURL(`https://wa.me/${SOPORTE}?text=${encodeURIComponent("Hola Mercadito, necesito ayuda")}`)}>
        <Ionicons name="logo-whatsapp" size={20} color="#059669" />
        <Text style={styles.rowText}>Contactar soporte por WhatsApp</Text>
        <Ionicons name="chevron-forward" size={18} color="#D4C9B8" style={{ marginLeft: "auto" }} />
      </TouchableOpacity>
      <Text style={styles.versionLabel}>Versión {APP_VERSION}</Text>

      <Text style={styles.sectionTitle}>Legales</Text>
      <TouchableOpacity style={styles.row} onPress={() => abrirEnlace("/terminos")}>
        <Ionicons name="document-text-outline" size={20} color="#8B7B69" />
        <Text style={styles.rowText}>Términos y condiciones</Text>
        <Ionicons name="chevron-forward" size={18} color="#D4C9B8" style={{ marginLeft: "auto" }} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.row} onPress={() => abrirEnlace("/privacidad")}>
        <Ionicons name="shield-checkmark-outline" size={20} color="#8B7B69" />
        <Text style={styles.rowText}>Aviso de privacidad</Text>
        <Ionicons name="chevron-forward" size={18} color="#D4C9B8" style={{ marginLeft: "auto" }} />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Cuenta</Text>
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#DC2626" />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.dangerButton} onPress={eliminarCuenta} disabled={eliminando}>
        <Ionicons name="trash-outline" size={18} color="#991B1B" />
        <Text style={styles.dangerText}>{eliminando ? "Eliminando…" : "Eliminar mi cuenta"}</Text>
      </TouchableOpacity>
      <Text style={styles.dangerNote}>
        Tu cuenta se anonimiza. Los pedidos pasados se conservan de forma anónima por motivos contables.
      </Text>

      <PinManagerModal visible={pinModal} onClose={() => setPinModal(false)} />
      </ScrollView>
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
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  content: { padding: 20 },
  avatarBox: { alignItems: "center", marginTop: 8, marginBottom: 16 },
  avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: "#FFE4D1", alignItems: "center", justifyContent: "center" },
  nombre: { fontSize: 20, fontWeight: "700", color: "#1F2937", marginTop: 12 },
  meta: { color: "#8B7B69", marginTop: 2 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3EFE7" },
  infoLabel: { fontSize: 11, color: "#8B7B69" },
  infoValue: { fontSize: 15, color: "#1F2937", fontWeight: "500" },
  sectionTitle: { fontSize: 11, color: "#8B7B69", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 18, marginBottom: 6, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#fff", marginBottom: 6 },
  rowText: { color: "#1F2937", fontWeight: "600", fontSize: 14 },
  logoutButton: { flexDirection: "row", gap: 8, paddingVertical: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FECACA", marginTop: 6, backgroundColor: "#fff" },
  logoutText: { color: "#DC2626", fontWeight: "600" },
  dangerButton: { flexDirection: "row", gap: 8, paddingVertical: 12, alignItems: "center", justifyContent: "center", marginTop: 6 },
  dangerText: { color: "#991B1B", fontSize: 13, fontWeight: "700" },
  dangerNote: { fontSize: 11, color: "#8B7B69", textAlign: "center", marginTop: 6, paddingHorizontal: 12 },
  versionLabel: { fontSize: 10, color: "#A89784", textAlign: "center", marginTop: 4, marginBottom: 8 },
});
