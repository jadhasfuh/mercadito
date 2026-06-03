import { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { getClientePinStatus, setClientePin } from "../api/auth";
import PinInput from "./PinInput";

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Modal para crear / cambiar / quitar el PIN de un cliente. Equivalente a
 * src/components/PinManager.tsx del web. Las llamadas al backend están en
 * src/api/auth.ts (getClientePinStatus, setClientePin).
 */
export default function PinManagerModal({ visible, onClose }: Props) {
  const [tienePin, setTienePin] = useState<boolean | null>(null);
  const [pinActual, setPinActual] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [pinNuevo2, setPinNuevo2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(""); setPinActual(""); setPinNuevo(""); setPinNuevo2("");
    getClientePinStatus()
      .then((s) => setTienePin(!!s.tienePin))
      .catch(() => setTienePin(false));
  }, [visible]);

  async function guardar(pin: string | null) {
    setError("");
    setLoading(true);
    try {
      const res = await setClientePin(pin, tienePin ? pinActual : undefined);
      setTienePin(res.tienePin);
      Alert.alert("Listo", pin === null ? "PIN eliminado" : "PIN guardado");
      onClose();
    } catch (e) {
      setError((e as { error?: string })?.error ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  function intentarGuardar() {
    if (!/^\d{6}$/.test(pinNuevo)) { setError("El PIN debe ser de 6 dígitos numéricos"); return; }
    if (pinNuevo !== pinNuevo2) { setError("Los PINs no coinciden"); return; }
    guardar(pinNuevo);
  }

  function quitar() {
    Alert.alert(
      "Quitar PIN",
      "¿Seguro? Sin PIN cualquiera con tu teléfono podrá ver tus pedidos.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Quitar", style: "destructive", onPress: () => guardar(null) },
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>🔒 Configurar PIN</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#6B7280" />
          </TouchableOpacity>
        </View>
        <View style={styles.body}>
          <Text style={styles.hint}>
            {tienePin === null
              ? "Cargando…"
              : tienePin
                ? "Cambia o quita tu PIN. Si lo cambias, los próximos inicios de sesión usarán el nuevo."
                : "Crea un PIN de 6 dígitos para que nadie más pueda ver tus pedidos con tu teléfono."}
          </Text>

          {tienePin && (
            <View style={styles.field}>
              <Text style={styles.label}>PIN actual</Text>
              <PinInput value={pinActual} onChange={setPinActual} length={6} />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>{tienePin ? "Nuevo PIN" : "PIN"}</Text>
            <PinInput value={pinNuevo} onChange={setPinNuevo} length={6} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confírmalo</Text>
            <PinInput value={pinNuevo2} onChange={setPinNuevo2} length={6} error={pinNuevo2.length === pinNuevo.length && pinNuevo2 !== pinNuevo} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            onPress={intentarGuardar}
            disabled={loading || tienePin === null}
            style={[styles.primary, (loading || tienePin === null) && styles.disabled]}
          >
            <Text style={styles.primaryTxt}>{loading ? "Guardando…" : tienePin ? "Cambiar PIN" : "Crear PIN"}</Text>
          </TouchableOpacity>

          {tienePin && (
            <TouchableOpacity onPress={quitar} disabled={loading} style={styles.secondary}>
              <Text style={styles.secondaryTxt}>Quitar PIN</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FCFBFA" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", backgroundColor: "#fff" },
  title: { fontSize: 17, fontWeight: "700", color: "#1F2937" },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  body: { padding: 20, gap: 12 },
  hint: { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  field: { gap: 4 },
  label: { fontSize: 12, color: "#6B7280", fontWeight: "500", textAlign: "center" },
  error: { color: "#DC2626", fontSize: 13, textAlign: "center" },
  primary: { backgroundColor: "#ED8E3C", borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  primaryTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  disabled: { backgroundColor: "#D4D4D8" },
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryTxt: { color: "#DC2626", fontWeight: "600" },
});
