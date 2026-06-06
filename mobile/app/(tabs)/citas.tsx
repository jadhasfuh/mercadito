import { View, Text, StyleSheet } from "react-native";
import { theme } from "../../src/lib/theme";
import AppHeader from "../../src/components/AppHeader";
import MisCitasView from "../../src/components/MisCitasView";

// Tab "Citas" del cliente (visible solo en modo Citas). Usa el mismo AppHeader
// que el resto de las pantallas de la barra inferior.
export default function CitasTab() {
  return (
    <View style={styles.container}>
      <AppHeader />
      <Text style={styles.titulo}>Mis reservas</Text>
      <MisCitasView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  titulo: { ...theme.typography.h2, color: theme.colors.gray900, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
});
