import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { theme } from "../src/lib/theme";
import ChatsView from "../src/components/ChatsView";

// Pantalla apilada de conversaciones (con botón atrás). El tab equivalente
// es (tabs)/mensajes.tsx, que reusa el mismo ChatsView.
export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.gray800} />
        </TouchableOpacity>
        <Text style={styles.titulo}>Mensajes</Text>
      </View>
      <ChatsView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  titulo: { ...theme.typography.h3, color: theme.colors.gray900 },
});
