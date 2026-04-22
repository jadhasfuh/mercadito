import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "../src/contexts/CartContext";
import { useSession } from "../src/contexts/SessionContext";
import { ZONAS, type Zona } from "../src/api/zonas";
import { crearPedido } from "../src/api/pedidos";

const RECARGO_TARJETA = 0.0406;

export default function CheckoutScreen() {
  const { items, subtotal, servicioMercadito, vaciar } = useCart();
  const { usuario } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (items.length === 0) router.replace("/(tabs)/carrito");
  }, [items.length, router]);

  const [direccion, setDireccion] = useState("");
  const [numero, setNumero] = useState("");
  const [notas, setNotas] = useState("");
  const [zona, setZona] = useState<Zona | null>(null);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta">("efectivo");
  const [enviando, setEnviando] = useState(false);

  const costoEnvio = zona?.costo ?? 0;
  const baseConEnvio = subtotal + servicioMercadito + costoEnvio;
  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(baseConEnvio * RECARGO_TARJETA) : 0;
  const total = baseConEnvio + recargoTarjeta;

  async function confirmar() {
    if (!zona) { Alert.alert("Falta", "Elige una zona de entrega"); return; }
    if (!direccion.trim()) { Alert.alert("Falta", "Escribe tu dirección"); return; }
    if (!usuario) { Alert.alert("Sesión", "Vuelve a iniciar sesión"); return; }

    setEnviando(true);
    try {
      const { id } = await crearPedido({
        cliente_nombre: usuario.nombre,
        cliente_telefono: usuario.telefono,
        zona_id: zona.id,
        direccion_entrega: `${direccion.trim()}${numero.trim() ? ` #${numero.trim()}` : ""}`,
        notas: notas.trim() || undefined,
        metodo_pago: metodoPago,
        recargo_tarjeta: recargoTarjeta,
        items: items.map((i) => ({
          producto_id: i.producto_id,
          puesto_id: i.puesto_id,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          comision: i.comision,
        })),
      });
      vaciar();
      Alert.alert("Pedido enviado", `#${id.slice(0, 8).toUpperCase()}`, [
        { text: "Ver mis pedidos", onPress: () => router.replace("/(tabs)/pedidos") },
      ]);
    } catch (e) {
      const msg = (e as { error?: string })?.error ?? "Error al enviar";
      Alert.alert("No se pudo enviar", msg);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Confirmar pedido", headerStyle: { backgroundColor: "#FFF7EB" } }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          {/* Direccion */}
          <Section title="Dirección de entrega" icon="location-outline">
            <TextInput
              value={direccion}
              onChangeText={setDireccion}
              placeholder="Calle y colonia"
              style={styles.input}
              autoCapitalize="words"
            />
            <TextInput
              value={numero}
              onChangeText={setNumero}
              placeholder="Número / interior (opcional)"
              style={styles.input}
            />
            <TextInput
              value={notas}
              onChangeText={setNotas}
              placeholder="Referencias o notas (opcional)"
              style={[styles.input, { minHeight: 60 }]}
              multiline
            />
          </Section>

          {/* Zona */}
          <Section title="Zona de entrega" icon="map-outline">
            {ZONAS.map((z) => {
              const activa = zona?.id === z.id;
              return (
                <TouchableOpacity
                  key={z.id}
                  style={[styles.zonaRow, activa && styles.zonaRowActive]}
                  onPress={() => setZona(z)}
                >
                  <Ionicons
                    name={activa ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={activa ? "#FF7A2B" : "#8B7B69"}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.zonaNombre}>{z.nombre}</Text>
                    <Text style={styles.zonaTiempo}>{z.tiempo}</Text>
                  </View>
                  <Text style={styles.zonaCosto}>${z.costo}</Text>
                </TouchableOpacity>
              );
            })}
          </Section>

          {/* Metodo de pago */}
          <Section title="Método de pago" icon="card-outline">
            <View style={styles.pagoRow}>
              <TouchableOpacity
                style={[styles.pagoOption, metodoPago === "efectivo" && styles.pagoOptionActive]}
                onPress={() => setMetodoPago("efectivo")}
              >
                <Ionicons name="cash-outline" size={22} color={metodoPago === "efectivo" ? "#FF7A2B" : "#8B7B69"} />
                <Text style={[styles.pagoText, metodoPago === "efectivo" && styles.pagoTextActive]}>Efectivo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pagoOption, metodoPago === "tarjeta" && styles.pagoOptionActive]}
                onPress={() => setMetodoPago("tarjeta")}
              >
                <Ionicons name="card-outline" size={22} color={metodoPago === "tarjeta" ? "#FF7A2B" : "#8B7B69"} />
                <Text style={[styles.pagoText, metodoPago === "tarjeta" && styles.pagoTextActive]}>Tarjeta</Text>
              </TouchableOpacity>
            </View>
            {metodoPago === "tarjeta" && (
              <Text style={styles.pagoHint}>El repartidor lleva terminal. Se aplica recargo del 4% por comisión bancaria.</Text>
            )}
          </Section>

          {/* Resumen */}
          <Section title="Resumen" icon="receipt-outline">
            <Row label={`Productos (${items.length})`} value={subtotal} />
            {servicioMercadito > 0 && <Row label="Servicio Mercadito" value={servicioMercadito} />}
            <Row label="Envío" value={costoEnvio} placeholder={zona ? undefined : "Elige zona"} />
            {recargoTarjeta > 0 && <Row label="Recargo tarjeta" value={recargoTarjeta} />}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>
          </Section>

          <TouchableOpacity
            style={[styles.submitButton, (!zona || !direccion.trim() || enviando) && styles.submitDisabled]}
            onPress={confirmar}
            disabled={!zona || !direccion.trim() || enviando}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.submitText}>{enviando ? "Enviando…" : "Confirmar pedido"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function Section({ title, icon, children }: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={18} color="#1F2937" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Row({ label, value, placeholder }: { label: string; value: number; placeholder?: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{placeholder ?? `$${value.toFixed(2)}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  content: { padding: 16, paddingBottom: 48 },
  section: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 8 },
  zonaRow: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 6 },
  zonaRowActive: { borderColor: "#FF7A2B", backgroundColor: "#FFF2E5" },
  zonaNombre: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  zonaTiempo: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  zonaCosto: { fontSize: 15, fontWeight: "700", color: "#FF7A2B" },
  pagoRow: { flexDirection: "row", gap: 8 },
  pagoOption: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB" },
  pagoOptionActive: { borderColor: "#FF7A2B", backgroundColor: "#FFF2E5" },
  pagoText: { fontSize: 14, color: "#8B7B69", fontWeight: "500" },
  pagoTextActive: { color: "#FF7A2B", fontWeight: "700" },
  pagoHint: { marginTop: 8, fontSize: 11, color: "#8B7B69", textAlign: "center" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  summaryLabel: { color: "#4B5563" },
  summaryValue: { color: "#4B5563", fontWeight: "500" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  totalLabel: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  totalValue: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  submitButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FF7A2B", paddingVertical: 16, borderRadius: 999, marginTop: 8 },
  submitDisabled: { backgroundColor: "#D4D4D8" },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
