import { View, Text, StyleSheet } from "react-native";
import { theme } from "../../src/lib/theme";
import AppHeader from "../../src/components/AppHeader";
import ChatsView from "../../src/components/ChatsView";

// Tab "Mensajes" del cliente (visible solo en modo Citas). Mismo AppHeader que
// el resto de la barra inferior.
export default function MensajesTab() {
  return (
    <View style={styles.container}>
      <AppHeader />
      <Text style={styles.titulo}>Mensajes</Text>
      <ChatsView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  titulo: { ...theme.typography.h2, color: theme.colors.gray900, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
});
