import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSession } from "../src/contexts/SessionContext";

export default function IndexScreen() {
  const { usuario, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (usuario) router.replace("/(tabs)/home");
    else router.replace("/login");
  }, [usuario, loading, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#FF7A2B" />
      <Text style={styles.text}>Cargando…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF7EB" },
  text: { marginTop: 12, color: "#8B7B69" },
});
