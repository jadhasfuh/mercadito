import { View, Text, StyleSheet, Platform, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  /** Texto principal del header. */
  title: string;
  /** Texto secundario chico debajo del título (opcional). */
  subtitle?: string;
  /** Si se pasa, muestra flecha "back" a la izquierda y la dispara al tocar. */
  onBack?: () => void;
  /** Slot opcional a la derecha (ícono botón, etc.). */
  right?: React.ReactNode;
}

/**
 * Header naranja brand para pantallas que NO usan AppHeader (admin /
 * tienda / repartidor / pantallas auxiliares sin búsqueda).
 *
 * Sin esto el contenido arrancaba flush al notch y la cámara frontal
 * tapaba la primera fila — por eso aplicamos paddingTop = insets.top + 8
 * para respetar la safe area en cualquier dispositivo (Samsung punch hole,
 * iPhone notch, Pixel curved corners, etc).
 */
export default function ScreenHeader({ title, subtitle, onBack, right }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 10 }]}>
      <StatusBar style="light" />
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: "#ED8E3C",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 3 },
    }),
  },
  backBtn: { padding: 4, marginLeft: -4 },
  title: { color: "#fff", fontSize: 18, fontWeight: "700", letterSpacing: -0.2 },
  subtitle: { color: "#FFE4D1", fontSize: 12, marginTop: 1 },
});
