import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView,
  Platform, StyleSheet, Alert, ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import MapaUbicacion from "../src/components/MapaUbicacion";
import { solicitarRepartidor, cotizarEnvio, type SolicitarRepartidorRes, type CotizacionEnvio } from "../src/api/tienda";

/**
 * Solicitar repartidor — flow B2B de tienda. Reusa la infra de envíos
 * (tipo='envio') con el flag `solicitado_por_tienda_id` y `envio_pagado_por`.
 *
 * Sin stepper porque para el restaurante que ya tomó el pedido por su
 * lado, lo último que quiere es perder 30 segundos navegando pasos.
 * Una pantalla scrolleable con secciones marcadas y botón al fondo.
 */
export default function SolicitarRepartidorScreen() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");
  const [pagaEnvio, setPagaEnvio] = useState<"tienda" | "cliente">("tienda");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<SolicitarRepartidorRes | null>(null);

  // Cotización en vivo cuando el dueño mueve el pin. Debounce 250ms.
  const [cotizacion, setCotizacion] = useState<CotizacionEnvio | null>(null);
  useEffect(() => {
    if (!ubicacion) { setCotizacion(null); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      try {
        const data = await cotizarEnvio(ubicacion.lat, ubicacion.lng);
        if (!cancel) setCotizacion(data);
      } catch {
        if (!cancel) setCotizacion(null);
      }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [ubicacion]);

  async function handleSubmit() {
    if (!nombre.trim() || !telefono.trim() || !direccion.trim() || !monto.trim()) {
      Alert.alert("Faltan datos", "Llena nombre, teléfono, dirección y monto.");
      return;
    }
    const tel = telefono.replace(/\D/g, "");
    if (tel.length !== 10) {
      Alert.alert("Teléfono inválido", "El teléfono del cliente debe ser de 10 dígitos.");
      return;
    }
    const m = Number(monto);
    if (!isFinite(m) || m <= 0) {
      Alert.alert("Monto inválido", "Captura el monto del pedido.");
      return;
    }
    setEnviando(true);
    try {
      const res = await solicitarRepartidor({
        cliente_nombre: nombre.trim(),
        cliente_telefono: tel,
        direccion_entrega: direccion.trim(),
        // Pin opcional — backend usa centro Sahuayo como estimación si
        // no se marca, y recalcula con GPS del repartidor al entregar.
        cliente_lat: ubicacion?.lat ?? null,
        cliente_lng: ubicacion?.lng ?? null,
        monto_pedido: m,
        notas: notas.trim() || undefined,
        envio_pagado_por: pagaEnvio,
      });
      setResultado(res);
    } catch (e) {
      const err = e as { error?: string };
      Alert.alert("Error", err.error ?? "No se pudo crear la solicitud. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  // Pantalla de éxito.
  if (resultado) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ title: "Solicitud enviada" }} />
        <ScrollView contentContainerStyle={styles.successWrap}>
          <View style={styles.successCard}>
            <Text style={styles.successEmoji}>🛵</Text>
            <Text style={styles.successTitle}>Pedido en cola</Text>
            <Text style={styles.successSub}>Le va a llegar a Fernando en segundos</Text>
          </View>
          <View style={styles.statsCard}>
            <Row label="Pedido" value={`#${resultado.pedido_id.slice(0, 8).toUpperCase()}`} mono />
            <Row label="Distancia" value={`${resultado.distancia_km} km`} />
            <Row label="Tiempo estimado" value={resultado.tiempo_estimado} />
            <View style={styles.divider} />
            <Row label={resultado.costo_estimado ? "Envío estimado" : "Envío"} value={`$${resultado.costo_envio.toFixed(2)}`} highlight />
            {resultado.costo_estimado && (
              <View style={styles.warningBox}>
                <Text style={styles.warningTxt}>
                  ⚠️ Costo aproximado. Se calcula el final cuando el repartidor confirme la ubicación con su GPS.
                </Text>
              </View>
            )}
            <Text style={styles.statsHint}>
              {resultado.envio_pagado_por === "tienda"
                ? "Vas absorbiendo el envío. Se acumula en tu cuenta y te lo cobramos por semana."
                : `Fernando le cobra al cliente $${resultado.total_a_cobrar.toFixed(2)} (pedido + envío).`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.cta}
            onPress={() => {
              setResultado(null);
              setNombre(""); setTelefono(""); setDireccion(""); setUbicacion(null);
              setMonto(""); setNotas("");
            }}
          >
            <Text style={styles.ctaTxt}>Solicitar otro pedido</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctaSecundary} onPress={() => router.back()}>
            <Text style={styles.ctaSecundaryTxt}>Volver al panel</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: "Solicitar repartidor" }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.intro}>
            <Text style={styles.introTxt}>
              Mandamos a Fernando a recoger el pedido a tu local y se lo entrega al cliente.
              Tarifa de envío según la distancia.
            </Text>
          </View>

          {/* Cliente */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del cliente</Text>
            <Text style={styles.label}>Nombre</Text>
            <TextInput
              value={nombre}
              onChangeText={setNombre}
              placeholder="Nombre del cliente"
              style={styles.input}
              autoCapitalize="words"
            />
            <Text style={styles.label}>Teléfono (10 dígitos)</Text>
            <TextInput
              value={telefono}
              onChangeText={(v) => setTelefono(v.replace(/\D/g, "").slice(0, 10))}
              placeholder="3531234567"
              keyboardType="phone-pad"
              maxLength={10}
              style={styles.input}
            />
            <Text style={styles.label}>Dirección de entrega</Text>
            <TextInput
              value={direccion}
              onChangeText={setDireccion}
              placeholder="Calle, número, colonia, referencias"
              style={styles.input}
            />
            <Text style={styles.label}>Mapa para estimar el costo (opcional)</Text>
            <Text style={styles.hint}>
              Pica una zona aproximada y verás el costo. La dirección que el repartidor busca es la que escribiste arriba — el mapa no la cambia.
            </Text>
            {/* Sin onDireccionDetectada a propósito — el texto que
                escribió la tienda manda. El pin solo cotiza. */}
            <MapaUbicacion
              valor={ubicacion}
              onCambio={(pos) => setUbicacion(pos)}
              altura={240}
            />
            {ubicacion ? (
              <Text style={styles.ok}>✓ Punto fijado — costo se calcula con esta ubicación</Text>
            ) : (
              <Text style={styles.hint}>
                Si no sabes el área aproximada, déjalo así. El repartidor confirma con su GPS al entregar.
              </Text>
            )}
          </View>

          {/* Pedido */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del pedido</Text>
            <Text style={styles.label}>Monto del pedido</Text>
            <View style={styles.inputMontoRow}>
              <Text style={styles.signo}>$</Text>
              <TextInput
                value={monto}
                onChangeText={setMonto}
                placeholder="0.00"
                keyboardType="decimal-pad"
                style={styles.inputMonto}
              />
            </View>
            <Text style={styles.hint}>Lo que el cliente paga por la comida (sin contar envío).</Text>
            <Text style={styles.label}>Notas para el repartidor (opcional)</Text>
            <TextInput
              value={notas}
              onChangeText={setNotas}
              placeholder="Ej. Hawaiana grande, refresco, sin chile"
              multiline
              numberOfLines={2}
              style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
            />
          </View>

          {/* Quién paga el envío + cotización en vivo */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>¿Quién paga el envío?</Text>

            <View style={styles.cotizacionBox}>
              <Text style={styles.cotizacionEmoji}>🛵</Text>
              <View style={{ flex: 1 }}>
                {cotizacion ? (
                  <>
                    <Text style={styles.cotizacionTitle}>
                      Envío aproximado: <Text style={styles.cotizacionMonto}>${cotizacion.costo_envio.toFixed(2)}</Text>
                    </Text>
                    <Text style={styles.cotizacionMeta}>{cotizacion.distancia_km} km · {cotizacion.tiempo_estimado}</Text>
                  </>
                ) : ubicacion ? (
                  <Text style={styles.cotizacionMeta}>Calculando…</Text>
                ) : (
                  <Text style={styles.cotizacionMeta}>
                    Marca el punto en el mapa de arriba para ver el costo aproximado, o déjalo así y el repartidor lo confirma con su GPS al entregar.
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.pagoRow}>
              <TouchableOpacity
                style={[styles.pagoOption, pagaEnvio === "tienda" && styles.pagoOptionActive]}
                onPress={() => setPagaEnvio("tienda")}
              >
                <Ionicons name="storefront-outline" size={26} color={pagaEnvio === "tienda" ? "#FF7A2B" : "#8B7B69"} />
                <Text style={[styles.pagoLabel, pagaEnvio === "tienda" && styles.pagoLabelActive]}>Yo absorbo</Text>
                <Text style={styles.pagoDesc}>Te lo cobramos por semana</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pagoOption, pagaEnvio === "cliente" && styles.pagoOptionActive]}
                onPress={() => setPagaEnvio("cliente")}
              >
                <Ionicons name="cash-outline" size={26} color={pagaEnvio === "cliente" ? "#FF7A2B" : "#8B7B69"} />
                <Text style={[styles.pagoLabel, pagaEnvio === "cliente" && styles.pagoLabelActive]}>Cliente paga</Text>
                <Text style={styles.pagoDesc}>Lo cobra Fernando</Text>
              </TouchableOpacity>
            </View>

            {cotizacion && monto && Number(monto) > 0 && (
              <Text style={styles.cotizacionResumen}>
                {pagaEnvio === "tienda"
                  ? `Cliente paga $${Number(monto).toFixed(2)} (sólo el pedido). Tú absorbes $${cotizacion.costo_envio.toFixed(2)} de envío.`
                  : `Cliente paga $${(Number(monto) + cotizacion.costo_envio).toFixed(2)} (pedido + envío) directo a Fernando.`}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.cta, enviando && styles.ctaDisabled]}
            onPress={handleSubmit}
            disabled={enviando}
          >
            {enviando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="bicycle-outline" size={20} color="#fff" />
                <Text style={styles.ctaTxt}>Solicitar repartidor</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <View style={styles.statsRow}>
      <Text style={styles.statsLabel}>{label}</Text>
      <Text
        style={[
          styles.statsValue,
          mono && { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
          highlight && { color: "#9A3412", fontSize: 18 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFF7EB" },
  scroll: { padding: 14, paddingBottom: 80 },
  intro: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 12 },
  introTxt: { fontSize: 12, color: "#8B7B69", lineHeight: 17 },
  section: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#1F2937", marginBottom: 10 },
  label: { fontSize: 11, color: "#8B7B69", fontWeight: "600", marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: "#F9FAFB", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: "#1F2937" },
  inputMontoRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 8, paddingHorizontal: 10 },
  signo: { fontSize: 16, color: "#9CA3AF", marginRight: 4 },
  inputMonto: { flex: 1, paddingVertical: 10, fontSize: 14, color: "#1F2937" },
  hint: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  ok: { fontSize: 12, color: "#059669", marginTop: 6, fontWeight: "600" },
  pagoRow: { flexDirection: "row", gap: 8 },
  pagoOption: { flex: 1, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12, borderWidth: 2, borderColor: "#F3EFE7", alignItems: "center", backgroundColor: "#fff" },
  pagoOptionActive: { borderColor: "#FF7A2B", backgroundColor: "#FFF2E5" },
  pagoLabel: { fontSize: 13, fontWeight: "700", color: "#8B7B69", marginTop: 4 },
  pagoLabelActive: { color: "#1F2937" },
  pagoDesc: { fontSize: 10, color: "#9CA3AF", marginTop: 2, textAlign: "center" },
  cta: { backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 8 },
  ctaDisabled: { backgroundColor: "#D4D4D8" },
  ctaTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  ctaSecundary: { paddingVertical: 12, alignItems: "center", marginTop: 6 },
  ctaSecundaryTxt: { color: "#8B7B69", fontWeight: "600" },
  successWrap: { padding: 14, gap: 12 },
  successCard: { backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center" },
  successEmoji: { fontSize: 48, marginBottom: 6 },
  successTitle: { fontSize: 20, fontWeight: "800", color: "#1F2937" },
  successSub: { fontSize: 13, color: "#8B7B69", marginTop: 4 },
  statsCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  statsLabel: { fontSize: 13, color: "#8B7B69" },
  statsValue: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  statsHint: { fontSize: 11, color: "#8B7B69", marginTop: 8, lineHeight: 16 },
  divider: { height: 1, backgroundColor: "#F3EFE7", marginVertical: 6 },
  warningBox: { backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", borderRadius: 8, padding: 8, marginTop: 8 },
  warningTxt: { fontSize: 11, color: "#92400E", lineHeight: 15 },
  cotizacionBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", borderRadius: 10, padding: 10, marginBottom: 10 },
  cotizacionEmoji: { fontSize: 22 },
  cotizacionTitle: { fontSize: 12, color: "#92400E", fontWeight: "600" },
  cotizacionMonto: { fontSize: 15, fontWeight: "800", color: "#92400E" },
  cotizacionMeta: { fontSize: 11, color: "#92400E", marginTop: 2 },
  cotizacionResumen: { fontSize: 11, color: "#6B7280", marginTop: 8, lineHeight: 15 },
});
