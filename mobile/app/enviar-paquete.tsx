import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Image } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useSession } from "../src/contexts/SessionContext";
import MapaUbicacion from "../src/components/MapaUbicacion";
import { calcularCostoEnvio, calcularDistanciaRuta } from "../src/lib/envio";
import { crearEnvio } from "../src/api/pedidos";

const RECARGO_TARJETA = 0.0406;

export default function EnviarPaqueteScreen() {
  const router = useRouter();
  const { usuario } = useSession();

  // Recogida (quien envía)
  const [recogeNombre, setRecogeNombre] = useState("");
  const [recogeTel, setRecogeTel] = useState("");
  const [recogeDir, setRecogeDir] = useState("");
  const [recogeUbic, setRecogeUbic] = useState<{ lat: number; lng: number } | null>(null);

  // Entrega
  const [destNombre, setDestNombre] = useState("");
  const [destTel, setDestTel] = useState("");
  const [destDir, setDestDir] = useState("");
  const [destUbic, setDestUbic] = useState<{ lat: number; lng: number } | null>(null);

  // Paquete
  const [pesoKg, setPesoKg] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [aceptaIlegal, setAceptaIlegal] = useState(false);
  const [aceptaPeligrosos, setAceptaPeligrosos] = useState(false);

  // Pago
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Distancia y costo. Cuando ambas ubicaciones están listas, calculamos.
  const [distanciaKm, setDistanciaKm] = useState(0);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    if (usuario) {
      setRecogeNombre(usuario.nombre || "");
      setRecogeTel(usuario.telefono || "");
    }
  }, [usuario]);

  useEffect(() => {
    if (!recogeUbic || !destUbic) { setDistanciaKm(0); return; }
    let cancel = false;
    setCalculando(true);
    calcularDistanciaRuta([recogeUbic], destUbic)
      .then((km) => { if (!cancel) setDistanciaKm(km); })
      .finally(() => { if (!cancel) setCalculando(false); });
    return () => { cancel = true; };
  }, [recogeUbic, destUbic]);

  const { costo: costoEnvio, fueraDeCobertura } = useMemo(
    () => calcularCostoEnvio(distanciaKm),
    [distanciaKm]
  );

  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(costoEnvio * RECARGO_TARJETA) : 0;
  const total = costoEnvio + recargoTarjeta;

  async function elegirComprobante() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setComprobante(`data:image/jpeg;base64,${result.assets[0].base64}`);
  }

  async function solicitar() {
    if (!recogeNombre || !recogeTel) { Alert.alert("Falta", "Datos del que envía"); return; }
    if (!recogeDir || !recogeUbic) { Alert.alert("Falta", "Marca el punto de recogida en el mapa"); return; }
    if (!destNombre || !destTel) { Alert.alert("Falta", "Datos del destinatario"); return; }
    if (!destDir || !destUbic) { Alert.alert("Falta", "Marca el destino en el mapa"); return; }
    const peso = Number(pesoKg);
    if (!isFinite(peso) || peso <= 0 || peso > 10) { Alert.alert("Peso", "Debe ser entre 0.1 y 10 kg"); return; }
    if (descripcion.trim().length < 3) { Alert.alert("Falta", "Describe qué envías"); return; }
    if (!aceptaIlegal || !aceptaPeligrosos) { Alert.alert("Términos", "Acepta los términos del contenido"); return; }
    if (fueraDeCobertura) { Alert.alert("Fuera de cobertura", "El destino está a más de 20 km"); return; }
    if (costoEnvio <= 0) { Alert.alert("Espera", "Calculando costo de envío..."); return; }
    if (metodoPago === "transferencia" && !comprobante) { Alert.alert("Falta", "Sube el comprobante"); return; }

    setEnviando(true);
    try {
      await crearEnvio({
        cliente_nombre: destNombre,
        cliente_telefono: destTel,
        zona_id: "custom",
        direccion_entrega: `${destDir} [${destUbic.lat.toFixed(6)}, ${destUbic.lng.toFixed(6)}]`,
        recogida_nombre: recogeNombre,
        recogida_telefono: recogeTel,
        direccion_recogida: `${recogeDir} [${recogeUbic.lat.toFixed(6)}, ${recogeUbic.lng.toFixed(6)}]`,
        recogida_lat: recogeUbic.lat,
        recogida_lng: recogeUbic.lng,
        peso_kg: peso,
        descripcion_contenido: descripcion.trim(),
        costo_envio_override: costoEnvio,
        metodo_pago: metodoPago,
        ...(metodoPago === "transferencia" && comprobante ? { comprobante_pago: comprobante } : {}),
      });
      Alert.alert("Listo", "Tu envío fue solicitado");
      router.replace("/(tabs)/pedidos");
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo crear el envío");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Mandar paquete" }} />
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            <View style={styles.banner}>
              <Text style={styles.bannerTxt}>Sahuayo · Jiquilpan · V. Carranza · máx 10 kg</Text>
            </View>

            {/* Recogida */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📍 Quién envía</Text>
              <TextInput value={recogeNombre} onChangeText={setRecogeNombre} placeholder="Nombre" style={styles.input} />
              <TextInput value={recogeTel} onChangeText={setRecogeTel} placeholder="Teléfono" keyboardType="phone-pad" style={styles.input} />
              <TextInput value={recogeDir} onChangeText={setRecogeDir} placeholder="Dirección de recogida" style={styles.input} />
              <View style={{ height: 220, marginTop: 6 }}>
                <MapaUbicacion
                  valor={recogeUbic}
                  onCambio={setRecogeUbic}
                  onDireccionDetectada={(d) => { if (!recogeDir) setRecogeDir(d); }}
                  altura={220}
                />
              </View>
            </View>

            {/* Destino */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🎯 Quién recibe</Text>
              <TextInput value={destNombre} onChangeText={setDestNombre} placeholder="Nombre del destinatario" style={styles.input} />
              <TextInput value={destTel} onChangeText={setDestTel} placeholder="Teléfono" keyboardType="phone-pad" style={styles.input} />
              <TextInput value={destDir} onChangeText={setDestDir} placeholder="Dirección de entrega" style={styles.input} />
              <View style={{ height: 220, marginTop: 6 }}>
                <MapaUbicacion
                  valor={destUbic}
                  onCambio={setDestUbic}
                  onDireccionDetectada={(d) => { if (!destDir) setDestDir(d); }}
                  altura={220}
                />
              </View>
              {distanciaKm > 0 && (
                <Text style={styles.distancia}>
                  Distancia: {distanciaKm.toFixed(1)} km · {calculando ? "calculando..." : `costo $${costoEnvio.toFixed(0)}`}
                </Text>
              )}
              {fueraDeCobertura && (
                <Text style={styles.warning}>⚠️ Fuera de cobertura (más de 20 km)</Text>
              )}
            </View>

            {/* Paquete */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📦 El paquete</Text>
              <Text style={styles.label}>Peso aproximado (kg)</Text>
              <TextInput value={pesoKg} onChangeText={setPesoKg} keyboardType="decimal-pad" placeholder="Ej: 1.5" style={styles.input} />
              <Text style={styles.hint}>Máximo 10 kg</Text>

              <Text style={[styles.label, { marginTop: 8 }]}>¿Qué envías?</Text>
              <TextInput
                value={descripcion}
                onChangeText={setDescripcion}
                placeholder="Ej: documentos, ropa, regalo..."
                multiline
                style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
              />

              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>⚠️ Importante</Text>
                <TouchableOpacity style={styles.checkRow} onPress={() => setAceptaIlegal(!aceptaIlegal)}>
                  <Ionicons name={aceptaIlegal ? "checkbox" : "square-outline"} size={20} color="#991B1B" />
                  <Text style={styles.checkTxt}>
                    Declaro que el contenido NO incluye sustancias ilegales (drogas, armas).
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.checkRow} onPress={() => setAceptaPeligrosos(!aceptaPeligrosos)}>
                  <Ionicons name={aceptaPeligrosos ? "checkbox" : "square-outline"} size={20} color="#991B1B" />
                  <Text style={styles.checkTxt}>
                    El contenido NO es peligroso (líquidos inflamables, animales vivos, etc).
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Pago */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💳 Método de pago</Text>
              <View style={styles.pagoRow}>
                {(["efectivo", "tarjeta", "transferencia"] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMetodoPago(m)}
                    style={[styles.pagoBtn, metodoPago === m && styles.pagoBtnActive]}
                  >
                    <Text style={[styles.pagoTxt, metodoPago === m && styles.pagoTxtActive]}>
                      {m === "efectivo" ? "💵 Efectivo" : m === "tarjeta" ? "💳 Tarjeta" : "🏦 Transferencia"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {metodoPago === "tarjeta" && (
                <Text style={styles.hint}>Recargo 4.06% por tarjeta: ${recargoTarjeta.toFixed(2)}</Text>
              )}
              {metodoPago === "transferencia" && (
                <View style={{ marginTop: 8 }}>
                  <TouchableOpacity style={styles.compButton} onPress={elegirComprobante}>
                    <Ionicons name="cloud-upload-outline" size={18} color="#1F2937" />
                    <Text style={styles.compTxt}>{comprobante ? "Cambiar comprobante" : "Subir comprobante"}</Text>
                  </TouchableOpacity>
                  {comprobante && <Image source={{ uri: comprobante }} style={styles.compPreview} />}
                </View>
              )}
            </View>

            {/* Total */}
            <View style={styles.totalBox}>
              <View style={styles.totalRow}><Text style={styles.totalLbl}>Costo de envío</Text><Text>${costoEnvio.toFixed(2)}</Text></View>
              {recargoTarjeta > 0 && <View style={styles.totalRow}><Text style={styles.totalLbl}>Recargo tarjeta</Text><Text>${recargoTarjeta.toFixed(2)}</Text></View>}
              <View style={[styles.totalRow, styles.totalGrand]}><Text style={styles.totalGrandLbl}>Total</Text><Text style={styles.totalGrandVal}>${total.toFixed(2)}</Text></View>
            </View>

            <TouchableOpacity
              style={[styles.solicitarBtn, (enviando || costoEnvio <= 0) && { opacity: 0.6 }]}
              onPress={solicitar}
              disabled={enviando || costoEnvio <= 0}
            >
              <Text style={styles.solicitarTxt}>{enviando ? "Solicitando..." : `Solicitar envío · $${total.toFixed(2)}`}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFF7EB" },
  content: { padding: 12, paddingBottom: 40 },
  banner: { backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "#FCD34D" },
  bannerTxt: { fontSize: 12, color: "#92400E", fontWeight: "600", textAlign: "center" },
  section: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#1F2937", marginBottom: 8 },
  label: { fontSize: 12, color: "#8B7B69", fontWeight: "600", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  hint: { fontSize: 11, color: "#8B7B69", marginTop: -4, marginBottom: 4 },
  distancia: { marginTop: 8, fontSize: 13, color: "#1F2937", fontWeight: "500" },
  warning: { marginTop: 6, fontSize: 12, color: "#991B1B", fontWeight: "600" },
  warningBox: { marginTop: 10, backgroundColor: "#FEE2E2", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#FECACA" },
  warningTitle: { fontSize: 12, color: "#991B1B", fontWeight: "700", marginBottom: 6 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 4 },
  checkTxt: { flex: 1, fontSize: 12, color: "#7F1D1D" },
  pagoRow: { flexDirection: "row", gap: 6 },
  pagoBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: "#E5E7EB", alignItems: "center" },
  pagoBtnActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  pagoTxt: { fontSize: 11, color: "#6B7280", fontWeight: "700" },
  pagoTxtActive: { color: "#fff" },
  compButton: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  compTxt: { fontSize: 13, color: "#1F2937", fontWeight: "600" },
  compPreview: { width: 100, height: 100, borderRadius: 8, marginTop: 6 },
  totalBox: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  totalLbl: { color: "#6B7280", fontSize: 13 },
  totalGrand: { borderTopWidth: 1, borderTopColor: "#F3F4F6", paddingTop: 8, marginTop: 4 },
  totalGrandLbl: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  totalGrandVal: { fontSize: 16, fontWeight: "700", color: "#FF7A2B" },
  solicitarBtn: { backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  solicitarTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
