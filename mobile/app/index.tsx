import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
      <Ionicons name="storefront" size={64} color="#FF7A2B" />
      <Text style={styles.brand}>Mercadito</Text>
      <ActivityIndicator size="small" color="#FF7A2B" style={{ marginTop: 16 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF7EB" },
  brand: { fontSize: 24, fontWeight: "700", color: "#1F2937", marginTop: 10 },
});
