import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../lib/theme";
import { useModo } from "../contexts/ModoContext";

// Switch segmentado Mercado ↔ Servicios. En "Servicios" el segmento activo se
// pinta de índigo; en "Mercado" de naranja. Es la pieza que el cliente toca
// para cambiar de comprar productos a agendar citas.
export default function ModoSwitch() {
  const { modo, setModo } = useModo();
  const serv = modo === "servicios";
  return (
    <View style={styles.wrap}>
      <Seg
        active={!serv}
        onPress={() => setModo("mercado")}
        icon="basket"
        label="Mercadito"
        color={theme.colors.brand}
      />
      <Seg
        active={serv}
        onPress={() => setModo("servicios")}
        icon="calendar"
        label="Citas"
        color={theme.colors.serv}
      />
    </View>
  );
}

function Seg({
  active,
  onPress,
  icon,
  label,
  color,
}: {
  active: boolean;
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.seg, active && { backgroundColor: color }, active && theme.shadow.sm]}
    >
      <Ionicons name={icon} size={17} color={active ? "#fff" : theme.colors.gray500} />
      <Text style={[styles.segTxt, { color: active ? "#fff" : theme.colors.gray600 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: theme.colors.gray100,
    borderRadius: theme.radius.pill,
    padding: 4,
    gap: 4,
    marginBottom: theme.spacing.md,
  },
  seg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
  },
  segTxt: {
    ...theme.typography.buttonSmall,
  },
});
