import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Image, Switch } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useSession } from "../src/contexts/SessionContext";
import MapaUbicacion from "../src/components/MapaUbicacion";
import { calcularCostoEnvio, calcularDistanciaRuta, calcularDistanciaIdaVuelta } from "../src/lib/envio";
import { crearMandado } from "../src/api/pedidos";

const RECARGO_TARJETA = 0.0406;
const MIN_DISTANCIA_KM = 0.1; // origen=destino bloqueado
type Paso = "origen" | "destino" | "pago";

/**
 * Pantalla de "mandado": el cliente le pide al repartidor que vaya a un
 * origen, recoja/compre algo, y se lo entregue en su domicilio.
 * Opcionalmente el repartidor regresa al origen (toggle ida+vuelta).
 *
 * Diferencias vs enviar-paquete:
 *  - Sin peso (no hay un "paquete" predefinido).
 *  - Campo "monto estimado" — lo que el repartidor adelanta y cobra al
 *    entregar (medicina, comida, etc.).
 *  - Toggle ida+vuelta multiplica la ruta (origen → destino → origen).
 */
export default function MandadoScreen() {
  const router = useRouter();
  const { usuario } = useSession();
  const [paso, setPaso] = useState<Paso>("origen");
  const scrollRef = useRef<ScrollView>(null);

  // Origen
  const [origenLugar, setOrigenLugar] = useState(""); // nombre de la tienda/persona en origen
  const [origenTel, setOrigenTel] = useState("");
  const [origenDir, setOrigenDir] = useState("");
  const [origenNumero, setOrigenNumero] = useState("");
  const [origenDetalles, setOrigenDetalles] = useState("");
  const [origenUbic, setOrigenUbic] = useState<{ lat: number; lng: number } | null>(null);

  // Mandado (qué necesita + monto)
  const [descripcion, setDescripcion] = useState("");
  const [montoMandado, setMontoMandado] = useState(""); // string para input
  const [idaVuelta, setIdaVuelta] = useState(false);

  // Destino (auto-llenado con datos del usuario)
  const [destNombre, setDestNombre] = useState("");
  const [destTel, setDestTel] = useState("");
  const [destDir, setDestDir] = useState("");
  const [destNumero, setDestNumero] = useState("");
  const [destDetalles, setDestDetalles] = useState("");
  const [destUbic, setDestUbic] = useState<{ lat: number; lng: number } | null>(null);
  // Instrucciones / monto en destino — opcionales. Útil para casos como
  // "pregunta por Juan y entrégale" o "le cobras $X al recibir".
  const [destDescripcion, setDestDescripcion] = useState("");
  const [destMontoTxt, setDestMontoTxt] = useState("");

  // Pago
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Distancia y costo
  const [distanciaKm, setDistanciaKm] = useState(0);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    if (usuario) {
      setDestNombre((prev) => prev || usuario.nombre || "");
      setDestTel((prev) => prev || usuario.telefono || "");
    }
  }, [usuario]);

  // Recalcula la distancia cada vez que cambia origen, destino o ida+vuelta
  useEffect(() => {
    if (!origenUbic || !destUbic) { setDistanciaKm(0); return; }
    let cancel = false;
    setCalculando(true);
    const promise = idaVuelta
      ? calcularDistanciaIdaVuelta(origenUbic, destUbic)
      : calcularDistanciaRuta([origenUbic], destUbic);
    promise
      .then((km) => { if (!cancel) setDistanciaKm(km); })
      .finally(() => { if (!cancel) setCalculando(false); });
    return () => { cancel = true; };
  }, [origenUbic, destUbic, idaVuelta]);

  const { costo: costoEnvio, fueraDeCobertura } = useMemo(
    () => calcularCostoEnvio(distanciaKm, "envio"),
    [distanciaKm]
  );

  const monto = Number(montoMandado) || 0;
  const destMonto = Number(destMontoTxt) || 0;
  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(costoEnvio * RECARGO_TARJETA) : 0;
  const total = costoEnvio + recargoTarjeta + monto + destMonto;

  // Validación origen ≠ destino (haversine inline para no importar más libs)
  const origenIgualDestino = useMemo(() => {
    if (!origenUbic || !destUbic) return false;
    const R = 6371;
    const dLat = ((destUbic.lat - origenUbic.lat) * Math.PI) / 180;
    const dLng = ((destUbic.lng - origenUbic.lng) * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((origenUbic.lat * Math.PI) / 180) *
      Math.cos((destUbic.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
    const km = R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return km < MIN_DISTANCIA_KM;
  }, [origenUbic, destUbic]);

  const direccionOrigenFmt = `${origenDir} #${origenNumero}${origenDetalles ? " — " + origenDetalles : ""}`;
  const direccionDestinoFmt = `${destDir} #${destNumero}${destDetalles ? " — " + destDetalles : ""}`;

  // Telefonos opcionales: a veces el cliente no tiene el número de la tienda.
  // Si se llena, validamos 10 dígitos. El backend cae al teléfono del usuario
  // logueado para el destino cuando viene vacío.
  const origenTelOk = origenTel.trim() === "" || origenTel.replace(/\D/g, "").length === 10;
  const destTelOk = destTel.trim() === "" || destTel.replace(/\D/g, "").length === 10;
  const origenOk = !!(origenLugar && origenTelOk && origenDir && origenNumero && origenUbic && descripcion.trim().length >= 3);
  const destinoOk = !!(destNombre && destTelOk && destDir && destNumero && destUbic && costoEnvio > 0 && !origenIgualDestino);
  const pagoOk = metodoPago !== "transferencia" || (comprobante && comprobante.length > 50);
  const puedeEnviar = origenOk && destinoOk && pagoOk;

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
    if (!puedeEnviar || !origenUbic || !destUbic) return;
    if (fueraDeCobertura) { Alert.alert("Fuera de cobertura", "El destino está a más de 20 km"); return; }
    setEnviando(true);
    try {
      await crearMandado({
        origen_nombre: origenLugar,
        origen_telefono: origenTel,
        origen_direccion: direccionOrigenFmt,
        origen_lat: origenUbic.lat,
        origen_lng: origenUbic.lng,
        destino_nombre: destNombre,
        destino_telefono: destTel,
        destino_direccion: direccionDestinoFmt,
        destino_lat: destUbic.lat,
        destino_lng: destUbic.lng,
        descripcion: descripcion.trim(),
        monto_mandado: monto,
        destino_descripcion: destDescripcion.trim() || null,
        destino_monto: destMonto,
        ida_vuelta: idaVuelta,
        metodo_pago: metodoPago,
        ...(metodoPago === "transferencia" && comprobante ? { comprobante_pago: comprobante } : {}),
      });
      Alert.alert("Listo", "Tu mandado fue solicitado");
      router.replace("/(tabs)/pedidos");
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo crear el mandado");
    } finally {
      setEnviando(false);
    }
  }

  function siguiente() {
    if (paso === "origen") {
      if (!origenOk) { Alert.alert("Falta", "Completa el origen, marca el punto en el mapa, y describe qué necesitas"); return; }
      setPaso("destino");
    } else if (paso === "destino") {
      if (origenIgualDestino) { Alert.alert("Ubicación", "El origen y destino son el mismo lugar"); return; }
      if (!destinoOk) { Alert.alert("Falta", "Completa el destino y espera el cálculo del costo"); return; }
      setPaso("pago");
    }
  }

  function atras() {
    if (paso === "destino") setPaso("origen");
    else if (paso === "pago") setPaso("destino");
  }

  const pasos: Paso[] = ["origen", "destino", "pago"];
  const labels: Record<Paso, string> = { origen: "Origen", destino: "Destino", pago: "Pago" };

  return (
    <>
      <Stack.Screen options={{ title: "Pedir mandado" }} />
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>

          {/* Stepper */}
          <View style={styles.stepper}>
            {pasos.map((p, i) => {
              const activo = paso === p;
              const completo =
                (p === "origen" && origenOk) ||
                (p === "destino" && destinoOk);
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

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={[styles.body, { paddingBottom: 200 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            nestedScrollEnabled
          >

            {/* PASO 1: ORIGEN + descripción del mandado */}
            {paso === "origen" && (
              <>
                <View style={styles.banner}>
                  <Text style={styles.bannerTxt}>🛍️ Aquí va el repartidor a recoger o comprar lo que necesitas. Si tienes que pagar algo (medicina, comida…), te lo cobra al entregar.</Text>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>¿De dónde recogen?</Text>
                  <TextInput value={origenLugar} onChangeText={setOrigenLugar} placeholder="Ej. Farmacia Similares" style={styles.input} />
                  <TextInput value={origenTel} onChangeText={setOrigenTel} placeholder="Tel del lugar (opcional)" keyboardType="phone-pad" style={styles.input} />
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Dirección del origen</Text>
                  <View style={{ marginBottom: 8 }}>
                    <MapaUbicacion
                      valor={origenUbic}
                      onCambio={setOrigenUbic}
                      onDireccionDetectada={setOrigenDir}
                      altura={260}
                    />
                  </View>
                  <View style={styles.dirReadonly}>
                    <Text style={styles.dirReadonlyTxt}>{origenDir || "Toca el mapa o busca para detectar la calle"}</Text>
                    <Text style={styles.dirReadonlyHint}>📍 Auto-detectada del mapa · busca o pica para cambiar</Text>
                  </View>
                  <Text style={styles.fieldLabel}>Número del local</Text>
                  <TextInput
                    value={origenNumero}
                    onChangeText={setOrigenNumero}
                    placeholder="Ej. 42, Local 3…"
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
                    style={styles.input}
                  />
                  <Text style={styles.fieldLabel}>Notas (opcional)</Text>
                  <TextInput
                    value={origenDetalles}
                    onChangeText={setOrigenDetalles}
                    placeholder="Ej. al lado del Oxxo, color verde…"
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
                    style={[styles.input, { marginBottom: 0 }]}
                  />
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>¿Qué necesitas que haga ahí?</Text>
                  <TextInput
                    value={descripcion}
                    onChangeText={setDescripcion}
                    placeholder="Ej. comprar 2 cajas de paracetamol; recoger un sobre…"
                    multiline
                    style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
                  />
                  <Text style={styles.sectionTitle}>Monto a pagar (si aplica)</Text>
                  <TextInput
                    value={montoMandado}
                    onChangeText={setMontoMandado}
                    placeholder="Ej. 250 (vacío si no aplica)"
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                  <Text style={styles.hint}>El repartidor adelanta este dinero y te lo cobra al entregar.</Text>
                </View>
              </>
            )}

            {/* PASO 2: DESTINO + toggle ida y vuelta */}
            {paso === "destino" && (
              <>
                <View style={styles.banner}>
                  <Text style={styles.bannerTxt}>El costo se calcula con la distancia desde el origen.</Text>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>¿Dónde entregar?</Text>
                  <TextInput value={destNombre} onChangeText={setDestNombre} placeholder="Nombre de quien recibe" style={styles.input} />
                  <TextInput value={destTel} onChangeText={setDestTel} placeholder="WhatsApp (opcional)" keyboardType="phone-pad" style={styles.input} />
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Dirección de entrega</Text>
                  <View style={{ marginBottom: 8 }}>
                    <MapaUbicacion
                      valor={destUbic}
                      onCambio={setDestUbic}
                      onDireccionDetectada={setDestDir}
                      altura={260}
                      origenes={origenUbic ? [{ lat: origenUbic.lat, lng: origenUbic.lng, nombre: "Origen" }] : []}
                    />
                  </View>
                  <View style={styles.dirReadonly}>
                    <Text style={styles.dirReadonlyTxt}>{destDir || "Toca el mapa o busca para detectar la calle"}</Text>
                    <Text style={styles.dirReadonlyHint}>📍 Auto-detectada del mapa · busca o pica para cambiar</Text>
                  </View>
                  <Text style={styles.fieldLabel}>No. de casa o apartamento</Text>
                  <TextInput
                    value={destNumero}
                    onChangeText={setDestNumero}
                    placeholder="Ej. 42, Int. 3…"
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
                    style={styles.input}
                  />
                  <Text style={styles.fieldLabel}>Notas (opcional)</Text>
                  <TextInput
                    value={destDetalles}
                    onChangeText={setDestDetalles}
                    placeholder="Ej. casa azul, frente al parque…"
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
                    style={[styles.input, { marginBottom: 0 }]}
                  />
                  {origenIgualDestino && (
                    <Text style={styles.warning}>⚠️ El origen y destino son el mismo lugar</Text>
                  )}
                  {distanciaKm > 0 && !origenIgualDestino && (
                    <Text style={styles.distancia}>
                      {idaVuelta ? "Ruta ida + vuelta" : "Ruta ida"}: {distanciaKm.toFixed(1)} km · {calculando ? "calculando..." : `costo $${costoEnvio.toFixed(0)}`}
                    </Text>
                  )}
                  {fueraDeCobertura && (
                    <Text style={styles.warning}>⚠️ Fuera de cobertura (más de 20 km)</Text>
                  )}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>¿Qué necesitas que haga aquí? (opcional)</Text>
                  <TextInput
                    value={destDescripcion}
                    onChangeText={setDestDescripcion}
                    placeholder="Ej. pregunta por Juan y entrégale; deja en recepción…"
                    multiline
                    style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
                  />
                  <Text style={styles.sectionTitle}>Monto en destino (si aplica)</Text>
                  <TextInput
                    value={destMontoTxt}
                    onChangeText={setDestMontoTxt}
                    placeholder="Ej. 50 (vacío si no aplica)"
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                  <Text style={styles.hint}>Para casos donde le cobras o pagas algo a quien recibe.</Text>
                </View>

                <View style={styles.section}>
                  <View style={styles.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionTitle}>↔️ ¿Repartidor regresa al origen?</Text>
                      <Text style={styles.hint}>Útil si necesitas devolver firma, llaves, o cambio. Cobra ida + vuelta.</Text>
                    </View>
                    <Switch
                      value={idaVuelta}
                      onValueChange={setIdaVuelta}
                      trackColor={{ false: "#D1D5DB", true: "#FF7A2B" }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>
              </>
            )}

            {/* PASO 3: PAGO */}
            {paso === "pago" && (
              <>
                <View style={styles.resumen}>
                  <View>
                    <Text style={styles.resumenLabel}>📤 ORIGEN</Text>
                    <Text style={styles.resumenLine}>{origenLugar} <Text style={styles.resumenFaint}>· {origenTel}</Text></Text>
                    <Text style={styles.resumenAddr}>{direccionOrigenFmt}</Text>
                  </View>
                  <View style={styles.resumenDivider} />
                  <View>
                    <Text style={styles.resumenLabel}>🛍️ MANDADO {idaVuelta ? "· IDA Y VUELTA" : ""}</Text>
                    <Text style={styles.resumenLine}>{descripcion}</Text>
                    {monto > 0 && <Text style={styles.resumenAddr}>Cobrar al entregar el mandado: ${monto.toFixed(2)}</Text>}
                  </View>
                  <View style={styles.resumenDivider} />
                  <View>
                    <Text style={styles.resumenLabel}>📥 DESTINO</Text>
                    <Text style={styles.resumenLine}>{destNombre} <Text style={styles.resumenFaint}>· {destTel}</Text></Text>
                    <Text style={styles.resumenAddr}>{direccionDestinoFmt}</Text>
                    {destDescripcion.trim() !== "" && <Text style={styles.resumenAddr}>📝 {destDescripcion.trim()}</Text>}
                    {destMonto > 0 && <Text style={styles.resumenAddr}>Monto en destino: ${destMonto.toFixed(2)}</Text>}
                  </View>
                </View>

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
                  <View style={styles.totalRow}><Text style={styles.totalLbl}>Costo del mandado</Text><Text>${costoEnvio.toFixed(2)}</Text></View>
                  {recargoTarjeta > 0 && <View style={styles.totalRow}><Text style={styles.totalLbl}>Recargo tarjeta</Text><Text>${recargoTarjeta.toFixed(2)}</Text></View>}
                  {monto > 0 && <View style={styles.totalRow}><Text style={styles.totalLbl}>Monto en origen</Text><Text>${monto.toFixed(2)}</Text></View>}
                  {destMonto > 0 && <View style={styles.totalRow}><Text style={styles.totalLbl}>Monto en destino</Text><Text>${destMonto.toFixed(2)}</Text></View>}
                  <View style={[styles.totalRow, styles.totalGrand]}><Text style={styles.totalGrandLbl}>Total a pagar al entregar</Text><Text style={styles.totalGrandVal}>${total.toFixed(2)}</Text></View>
                </View>
              </>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {paso !== "origen" && (
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
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#4B5563", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  hint: { fontSize: 11, color: "#8B7B69" },
  distancia: { marginTop: 8, fontSize: 13, color: "#1F2937", fontWeight: "500" },
  warning: { marginTop: 6, fontSize: 12, color: "#991B1B", fontWeight: "600" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },

  pagoRow: { flexDirection: "row", gap: 6 },
  pagoBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: "#E5E7EB", alignItems: "center" },
  pagoBtnActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  pagoTxt: { fontSize: 11, color: "#6B7280", fontWeight: "700" },
  pagoTxtActive: { color: "#fff" },
  compButton: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  compTxt: { fontSize: 13, color: "#1F2937", fontWeight: "600" },
  compPreview: { width: 100, height: 100, borderRadius: 8, marginTop: 6 },

  totalBox: { backgroundColor: "#fff", borderRadius: 12, padding: 14 },
  numDetailsRow: { flexDirection: "row", gap: 6 },
  dirReadonly: { backgroundColor: "#F9FAFB", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#E5E7EB" },
  dirReadonlyTxt: { fontSize: 14, color: "#1F2937", fontWeight: "500" },
  dirReadonlyHint: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  resumen: { backgroundColor: "#FEF3C7", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#FCD34D", gap: 8 },
  resumenLabel: { fontSize: 10, fontWeight: "700", color: "#92400E", marginBottom: 2 },
  resumenLine: { fontSize: 13, color: "#1F2937", fontWeight: "500" },
  resumenAddr: { fontSize: 12, color: "#4B5563", marginTop: 2 },
  resumenFaint: { color: "#6B7280", fontWeight: "400" },
  resumenDivider: { height: 1, backgroundColor: "#FCD34D" },
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
