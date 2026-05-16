import { View, Text, StyleSheet, ScrollView } from "react-native";
import BottomSheet from "./BottomSheet";
import type { Mensaje } from "../api/admin";

interface Props {
  abierto: boolean;
  onClose: () => void;
  mensajes: Mensaje[];
}

// Bandeja de mensajes del admin para la tienda. Mismo flujo que el panel
// del header web (src/app/tienda/page.tsx) — al abrirla se marcan todos
// como leídos desde el layout.
export default function MensajesTiendaModal({ abierto, onClose, mensajes }: Props) {
  return (
    <BottomSheet abierto={abierto} onClose={onClose} titulo="Mensajes de Mercadito">
      {mensajes.length === 0 ? (
        <Text style={styles.empty}>No hay mensajes todavía.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 420 }}>
          {mensajes.map((m) => (
            <View key={m.id} style={[styles.card, !m.leido && styles.cardNuevo]}>
              <Text style={styles.msg}>{m.mensaje}</Text>
              <View style={styles.meta}>
                <Text style={styles.metaTxt}>{m.de_nombre || "Admin"}</Text>
                <Text style={styles.metaTxt}>
                  {new Date(m.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: "center", color: "#8B7B69", paddingVertical: 30, fontSize: 13 },
  card: { backgroundColor: "#F9FAFB", borderRadius: 10, padding: 12, marginBottom: 8 },
  cardNuevo: { backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE" },
  msg: { fontSize: 13, color: "#1F2937", lineHeight: 19 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  metaTxt: { fontSize: 11, color: "#9CA3AF" },
});
