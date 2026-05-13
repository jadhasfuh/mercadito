import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

interface Props {
  abierto: boolean;
  onClose: () => void;
  titulo: string;
  footer?: React.ReactNode;
  /** Acción a la izquierda del botón cerrar (ej. "Limpiar"). */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Bottom sheet móvil — slide desde abajo, alto fijo (no full-screen).
 * Incluye handle visual arriba, header con título + cerrar, body
 * scrolleable, footer opcional pegado abajo.
 */
export default function BottomSheet({ abierto, onClose, titulo, footer, headerAction, children }: Props) {
  return (
    <Modal visible={abierto} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={onClose} />
        <SafeAreaView style={styles.sheet} edges={["bottom"]}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.titulo}>{titulo}</Text>
            <View style={styles.headerRight}>
              {headerAction}
              <TouchableOpacity onPress={onClose} style={styles.cerrar}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {children}
          </ScrollView>
          {footer && <View style={styles.footer}>{footer}</View>}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  backdropTap: { ...StyleSheet.absoluteFillObject },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%" },
  handleRow: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  handle: { width: 40, height: 4, backgroundColor: "#D1D5DB", borderRadius: 2 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  titulo: { fontSize: 16, fontWeight: "700", color: "#111827" },
  cerrar: { padding: 4 },
  body: { flexGrow: 0 },
  bodyContent: { padding: 16 },
  // Footer con shadow superior — capa flotante (Material).
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    padding: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -4 },
    elevation: 6,
  },
});
