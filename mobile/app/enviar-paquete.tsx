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
type Paso = "recogida" | "entrega" | "paquete" | "pago";

/**
 * Stepper de envío de paquete. Reemplaza al formato "una sola página con
 * todas las secciones" porque en pantallas pequeñas dos mapas embebidos
 * + tarjetas hacían scroll interminable. Ahora un paso a la vez con
 * progreso visible arriba y botones atrás/siguiente abajo.
 */
export default function EnviarPaqueteScreen() {
  const router = useRouter();
  const { usuario } = useSession();
  const [paso, setPaso] = useState<Paso>("recogida");

  // Recogida
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

  // Distancia y costo
  const [distanciaKm, setDistanciaKm] = useState(0);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    if (usuario) {
      setRecogeNombre((prev) => prev || usuario.nombre || "");
      setRecogeTel((prev) => prev || usuario.telefono || "");
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
    () => calcularCostoEnvio(distanciaKm, "envio"),
    [distanciaKm]
  );

  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(costoEnvio * RECARGO_TARJETA) : 0;
  const total = costoEnvio + recargoTarjeta;

  const recogidaOk = !!(recogeNombre && recogeTel && recogeDir && recogeUbic);
  const entregaOk = !!(destNombre && destTel && destDir && destUbic && costoEnvio > 0);
  const peso = Number(pesoKg);
  const paqueteOk = !!(pesoKg && peso > 0 && peso <= 10 && descripcion.trim().length >= 3 && aceptaIlegal && aceptaPeligrosos);
  const pagoOk = metodoPago !== "transferencia" || (comprobante && comprobante.length > 50);
  const puedeEnviar = recogidaOk && entregaOk && paqueteOk && pagoOk;

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
    if (!puedeEnviar || !recogeUbic || !destUbic) return;
    if (fueraDeCobertura) { Alert.alert("Fuera de cobertura", "El destino está a más de 20 km"); return; }
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

  function siguiente() {
    if (paso === "recogida") {
      if (!recogidaOk) { Alert.alert("Falta", "Completa nombre, teléfono, dirección y marca el punto en el mapa"); return; }
      setPaso("entrega");
    } else if (paso === "entrega") {
      if (!entregaOk) { Alert.alert("Falta", "Completa el destino y espera el cálculo del costo"); return; }
      setPaso("paquete");
    } else if (paso === "paquete") {
      if (!paqueteOk) { Alert.alert("Falta", "Completa peso, descripción y acepta los términos"); return; }
      setPaso("pago");
    }
  }

  function atras() {
    if (paso === "entrega") setPaso("recogida");
    else if (paso === "paquete") setPaso("entrega");
    else if (paso === "pago") setPaso("paquete");
  }

  const pasos: Paso[] = ["recogida", "entrega", "paquete", "pago"];
  const labels: Record<Paso, string> = { recogida: "Recogida", entrega: "Entrega", paquete: "Paquete", pago: "Pago" };

  return (
    <>
      <Stack.Screen options={{ title: "Mandar paquete" }} />
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>

          {/* Stepper fijo arriba */}
          <View style={styles.stepper}>
            {pasos.map((p, i) => {
              const activo = paso === p;
              const completo =
                (p === "recogida" && recogidaOk) ||
                (p === "entrega" && entregaOk) ||
                (p === "paquete" && paqueteOk);
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPaso(p)}
                  style={[styles.stepBtn, activo && styles.stepBtnActive, !activo && completo && styles.stepBtnDone]}
                >
                  <Text style={[styles.stepTxt, activo && styles.stepTxtActive, !activo && completo && styles.stepTxtDone]}>
                    {i + 1}. {labels[p]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

            {/* PASO 1: RECOGIDA */}
            {paso === "recogida" && (
              <>
                <View style={styles.banner}>
                  <Text style={styles.bannerTxt}>¿De dónde recogemos? Aquí va el repartidor primero.</Text>
                </View>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Quién envía</Text>
                  <TextInput value={recogeNombre} onChangeText={setRecogeNombre} placeholder="Nombre" style={styles.input} />
                  <TextInput value={recogeTel} onChangeText={setRecogeTel} placeholder="Teléfono / WhatsApp" keyboardType="phone-pad" style={styles.input} />
                </View>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Dirección de recogida</Text>
                  <TextInput value={recogeDir} onChangeText={setRecogeDir} placeholder="Calle, colonia, número, referencias" style={styles.input} />
                  <View style={{ marginTop: 6 }}>
                    <MapaUbicacion
                      valor={recogeUbic}
                      onCambio={setRecogeUbic}
                      onDireccionDetectada={(d) => { if (!recogeDir) setRecogeDir(d); }}
                      altura={260}
                    />
                  </View>
                </View>
              </>
            )}

            {/* PASO 2: ENTREGA */}
            {paso === "entrega" && (
              <>
                <View style={styles.banner}>
                  <Text style={styles.bannerTxt}>El costo se calcula con la distancia desde la recogida.</Text>
                </View>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Quién recibe</Text>
                  <TextInput value={destNombre} onChangeText={setDestNombre} placeholder="Nombre del destinatario" style={styles.input} />
                  <TextInput value={destTel} onChangeText={setDestTel} placeholder="Teléfono / WhatsApp" keyboardType="phone-pad" style={styles.input} />
                </View>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Dirección de entrega</Text>
                  <TextInput value={destDir} onChangeText={setDestDir} placeholder="Calle, colonia, número" style={styles.input} />
                  <View style={{ height: 280, marginTop: 6 }}>
                    <MapaUbicacion
                      valor={destUbic}
                      onCambio={setDestUbic}
                      onDireccionDetectada={(d) => { if (!destDir) setDestDir(d); }}
                      altura={280}
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
              </>
            )}

            {/* PASO 3: PAQUETE */}
            {paso === "paquete" && (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Peso aproximado (kg)</Text>
                  <TextInput value={pesoKg} onChangeText={setPesoKg} keyboardType="decimal-pad" placeholder="Ej: 1.5" style={styles.input} />
                  <Text style={styles.hint}>Máximo 10 kg</Text>
                </View>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>¿Qué envías?</Text>
                  <TextInput
                    value={descripcion}
                    onChangeText={setDescripcion}
                    placeholder="Ej: documentos, ropa, regalo..."
                    multiline
                    style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
                  />
                </View>
                <View style={styles.warningBox}>
                  <Text style={styles.warningTitle}>⚠️ Importante</Text>
                  <TouchableOpacity style={styles.checkRow} onPress={() => setAceptaIlegal(!aceptaIlegal)}>
                    <Ionicons name={aceptaIlegal ? "checkbox" : "square-outline"} size={22} color="#991B1B" />
                    <Text style={styles.checkTxt}>
                      Declaro que el contenido NO incluye sustancias ilegales (drogas, armas).
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.checkRow} onPress={() => setAceptaPeligrosos(!aceptaPeligrosos)}>
                    <Ionicons name={aceptaPeligrosos ? "checkbox" : "square-outline"} size={22} color="#991B1B" />
                    <Text style={styles.checkTxt}>
                      El contenido NO es peligroso (líquidos inflamables, animales vivos, etc).
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* PASO 4: PAGO */}
            {paso === "pago" && (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Método de pago</Text>
                  <View style={styles.pagoRow}>
                    {(["efectivo", "tarjeta", "transferencia"] as const).map((m) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setMetodoPago(m)}
                        style={[styles.pagoBtn, metodoPago === m && styles.pagoBtnActive]}
                      >
                        <Text style={[styles.pagoTxt, metodoPago === m && styles.pagoTxtActive]} numberOfLines={1}>
                          {m === "efectivo" ? "💵 Efectivo" : m === "tarjeta" ? "💳 Tarjeta" : "🏦 Transfer."}
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

                <View style={styles.totalBox}>
                  <View style={styles.totalRow}><Text style={styles.totalLbl}>Costo de envío</Text><Text>${costoEnvio.toFixed(2)}</Text></View>
                  {recargoTarjeta > 0 && <View style={styles.totalRow}><Text style={styles.totalLbl}>Recargo tarjeta</Text><Text>${recargoTarjeta.toFixed(2)}</Text></View>}
                  <View style={[styles.totalRow, styles.totalGrand]}><Text style={styles.totalGrandLbl}>Total</Text><Text style={styles.totalGrandVal}>${total.toFixed(2)}</Text></View>
                </View>
              </>
            )}
          </ScrollView>

          {/* Footer fijo abajo */}
          <View style={styles.footer}>
            {paso !== "recogida" && (
              <TouchableOpacity style={styles.btnBack} onPress={atras}>
                <Text style={styles.btnBackTxt}>← Atrás</Text>
              </TouchableOpacity>
            )}
            {paso !== "pago" ? (
              <TouchableOpacity style={styles.btnNext} onPress={siguiente}>
                <Text style={styles.btnNextTxt}>Continuar →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.btnNext, (!puedeEnviar || enviando) && { opacity: 0.5 }]}
                onPress={solicitar}
                disabled={!puedeEnviar || enviando}
              >
                <Text style={styles.btnNextTxt}>{enviando ? "Solicitando..." : `Solicitar · $${total.toFixed(0)}`}</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFF7EB" },
  stepper: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F3EFE7" },
  stepBtn: { flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: "#F9FAFB" },
  stepBtnActive: { backgroundColor: "#FF7A2B" },
  stepBtnDone: { backgroundColor: "#ECFDF5" },
  stepTxt: { fontSize: 11, fontWeight: "700", color: "#6B7280" },
  stepTxtActive: { color: "#fff" },
  stepTxtDone: { color: "#065F46" },

  body: { padding: 12, paddingBottom: 30 },
  banner: { backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "#FCD34D" },
  bannerTxt: { fontSize: 12, color: "#92400E", fontWeight: "600" },
  section: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#1F2937", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  hint: { fontSize: 11, color: "#8B7B69" },
  distancia: { marginTop: 8, fontSize: 13, color: "#1F2937", fontWeight: "500" },
  warning: { marginTop: 6, fontSize: 12, color: "#991B1B", fontWeight: "600" },
  warningBox: { backgroundColor: "#FEE2E2", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#FECACA" },
  warningTitle: { fontSize: 12, color: "#991B1B", fontWeight: "700", marginBottom: 6 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 6 },
  checkTxt: { flex: 1, fontSize: 13, color: "#7F1D1D", lineHeight: 18 },

  pagoRow: { flexDirection: "row", gap: 6 },
  pagoBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: "#E5E7EB", alignItems: "center" },
  pagoBtnActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  pagoTxt: { fontSize: 11, color: "#6B7280", fontWeight: "700" },
  pagoTxtActive: { color: "#fff" },
  compButton: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  compTxt: { fontSize: 13, color: "#1F2937", fontWeight: "600" },
  compPreview: { width: 100, height: 100, borderRadius: 8, marginTop: 6 },

  totalBox: { backgroundColor: "#fff", borderRadius: 12, padding: 14 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  totalLbl: { color: "#6B7280", fontSize: 13 },
  totalGrand: { borderTopWidth: 1, borderTopColor: "#F3F4F6", paddingTop: 8, marginTop: 4 },
  totalGrandLbl: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  totalGrandVal: { fontSize: 16, fontWeight: "700", color: "#FF7A2B" },

  footer: { flexDirection: "row", gap: 8, padding: 12, paddingBottom: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#F3EFE7" },
  btnBack: { flex: 1, backgroundColor: "#F3F4F6", borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  btnBackTxt: { color: "#4B5563", fontWeight: "700", fontSize: 14 },
  btnNext: { flex: 2, backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  btnNextTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
