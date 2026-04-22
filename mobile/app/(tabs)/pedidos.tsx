import { View, Text, StyleSheet } from "react-native";

export default function PedidosScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis pedidos</Text>
      <Text style={styles.hint}>Por implementar — tira de /api/mis-pedidos.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#FFF7EB" },
  title: { fontSize: 20, fontWeight: "700", color: "#1F2937" },
  hint: { color: "#8B7B69", marginTop: 8 },
});
