import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../src/contexts/CartContext";
import { useSession } from "../src/contexts/SessionContext";
import { crearPedido } from "../src/api/pedidos";
import { calcularCostoEnvio, distanciaMultiParada, type LatLng } from "../src/lib/envio";
import MapaUbicacion from "../src/components/MapaUbicacion";

const RECARGO_TARJETA = 0.0406;

export default function CheckoutScreen() {
  const { items, subtotal, servicioMercadito, promocionMayoreo, vaciar } = useCart();
  const { usuario } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (items.length === 0) router.replace("/(tabs)/carrito");
  }, [items.length, router]);

  const [direccion, setDireccion] = useState("");
  const [numero, setNumero] = useState("");
  const [notas, setNotas] = useState("");
  const [ubicacion, setUbicacion] = useState<LatLng | null>(null);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta">("efectivo");
  const [enviando, setEnviando] = useState(false);

  // Orígenes: coordenadas únicas de tiendas con items en el carrito
  const origenes = useMemo((): LatLng[] => {
    const vistos = new Set<string>();
    const out: LatLng[] = [];
    for (const i of items) {
      if (i.puesto_lat == null || i.puesto_lng == null) continue;
      if (vistos.has(i.puesto_id)) continue;
      vistos.add(i.puesto_id);
      out.push({ lat: i.puesto_lat, lng: i.puesto_lng });
    }
    return out;
  }, [items]);

  const { distanciaKm, costo: costoEnvio, fueraDeCobertura } = useMemo(() => {
    if (!ubicacion) return { distanciaKm: 0, costo: 0, fueraDeCobertura: false };
    const d = distanciaMultiParada(origenes, ubicacion);
    return calcularCostoEnvio(d);
  }, [ubicacion, origenes]);

  const baseConEnvio = subtotal + servicioMercadito + costoEnvio;
  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(baseConEnvio * RECARGO_TARJETA) : 0;
  const total = baseConEnvio + recargoTarjeta;

  async function confirmar() {
    if (!ubicacion) { Alert.alert("Falta", "Marca tu ubicación en el mapa"); return; }
    if (fueraDeCobertura) { Alert.alert("Fuera de cobertura", "Esta dirección está a más de 20 km."); return; }
    if (costoEnvio <= 0) { Alert.alert("Falta", "No se pudo calcular el costo de envío"); return; }
    if (!direccion.trim()) { Alert.alert("Falta", "Escribe tu dirección"); return; }
    if (!usuario) { Alert.alert("Sesión", "Vuelve a iniciar sesión"); return; }

    setEnviando(true);
    try {
      const direccionEntrega = `${direccion.trim()}${numero.trim() ? ` #${numero.trim()}` : ""} [${ubicacion.lat.toFixed(6)}, ${ubicacion.lng.toFixed(6)}]`;
      const { id } = await crearPedido({
        cliente_nombre: usuario.nombre,
        cliente_telefono: usuario.telefono,
        zona_id: "mapa",
        direccion_entrega: direccionEntrega,
        notas: notas.trim() || undefined,
        metodo_pago: metodoPago,
        recargo_tarjeta: recargoTarjeta,
        costo_envio_override: costoEnvio,
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

  const puedeConfirmar = ubicacion != null && !fueraDeCobertura && costoEnvio > 0 && direccion.trim() !== "" && !enviando;

  return (
    <>
      <Stack.Screen options={{ title: "Confirmar pedido", headerStyle: { backgroundColor: "#FFF7EB" } }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Ubicación */}
          <Section title="¿A dónde llevamos tu pedido?" icon="location-outline">
            <Text style={styles.hint}>Toca el mapa para marcar dónde entregar, o usa &quot;Mi ubicación&quot;.</Text>
            <MapaUbicacion
              valor={ubicacion}
              onCambio={(p) => setUbicacion(p)}
              onDireccionDetectada={(d) => { if (!direccion.trim()) setDireccion(d); }}
            />
            {ubicacion && (
              <View style={[styles.envioBox, fueraDeCobertura && styles.envioBoxError]}>
                {fueraDeCobertura ? (
                  <>
                    <Ionicons name="warning-outline" size={16} color="#DC2626" />
                    <Text style={styles.envioError}>Fuera de cobertura (&gt; 20 km)</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="bicycle-outline" size={16} color="#FF7A2B" />
                    <Text style={styles.envioTexto}>
                      {distanciaKm.toFixed(1)} km · <Text style={styles.envioCosto}>${costoEnvio}</Text>
                    </Text>
                  </>
                )}
              </View>
            )}
          </Section>

          {/* Dirección */}
          <Section title="Dirección" icon="home-outline">
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

          {/* Método de pago */}
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
            {promocionMayoreo > 0 && (
              <View style={styles.promoRow}>
                <Text style={styles.promoLabel}>🎉 Promoción (mayoreo)</Text>
                <Text style={styles.promoValue}>-${promocionMayoreo.toFixed(2)}</Text>
              </View>
            )}
            {servicioMercadito > 0 && <Row label="Servicio Mercadito" value={servicioMercadito} />}
            <Row label="Envío" value={costoEnvio} placeholder={ubicacion ? undefined : "Marca ubicación"} />
            {recargoTarjeta > 0 && <Row label="Recargo tarjeta" value={recargoTarjeta} />}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>
          </Section>

          <TouchableOpacity
            style={[styles.submitButton, !puedeConfirmar && styles.submitDisabled]}
            onPress={confirmar}
            disabled={!puedeConfirmar}
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
  content: { padding: 16 },
  section: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  hint: { fontSize: 12, color: "#8B7B69", marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 8 },
  envioBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF7EB", borderRadius: 10, padding: 10, marginTop: 10 },
  envioBoxError: { backgroundColor: "#FEE2E2" },
  envioTexto: { fontSize: 14, color: "#1F2937", fontWeight: "500" },
  envioCosto: { color: "#FF7A2B", fontWeight: "700" },
  envioError: { fontSize: 13, color: "#DC2626", fontWeight: "600" },
  pagoRow: { flexDirection: "row", gap: 8 },
  pagoOption: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB" },
  pagoOptionActive: { borderColor: "#FF7A2B", backgroundColor: "#FFF2E5" },
  pagoText: { fontSize: 14, color: "#8B7B69", fontWeight: "500" },
  pagoTextActive: { color: "#FF7A2B", fontWeight: "700" },
  pagoHint: { marginTop: 8, fontSize: 11, color: "#8B7B69", textAlign: "center" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  summaryLabel: { color: "#4B5563" },
  summaryValue: { color: "#4B5563", fontWeight: "500" },
  promoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  promoLabel: { color: "#059669", fontWeight: "600" },
  promoValue: { color: "#059669", fontWeight: "700" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  totalLabel: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  totalValue: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  submitButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FF7A2B", paddingVertical: 16, borderRadius: 999, marginTop: 8 },
  submitDisabled: { backgroundColor: "#D4D4D8" },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
