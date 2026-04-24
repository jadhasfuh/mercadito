import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../src/contexts/CartContext";
import { useSession } from "../src/contexts/SessionContext";
import { crearPedido } from "../src/api/pedidos";
import { calcularCostoEnvio, calcularDistanciaRuta, type LatLng } from "../src/lib/envio";
import { useKeyboardHeight } from "../src/lib/useKeyboard";
import MapaUbicacion from "../src/components/MapaUbicacion";
import { pickImageAsDataUrl } from "../src/lib/imagePicker";
import { DATOS_PAGO } from "../src/lib/datosPago";
import { listarProductosCliente } from "../src/api/catalogo";
import { sumarExtrasDeVariante } from "../src/lib/variantes";
import { calcularComision } from "../src/lib/comision";

const RECARGO_TARJETA = 0.0406;

export default function CheckoutScreen() {
  const { items, subtotal, servicioMercadito, promocionMayoreo, vaciar } = useCart();
  const { usuario } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();

  useEffect(() => {
    if (items.length === 0) router.replace("/(tabs)/carrito");
  }, [items.length, router]);

  const [direccion, setDireccion] = useState("");
  const [numero, setNumero] = useState("");
  const [notas, setNotas] = useState("");
  const [ubicacion, setUbicacion] = useState<LatLng | null>(null);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [clabeCopiada, setClabeCopiada] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function copiarClabe() {
    await Clipboard.setStringAsync(DATOS_PAGO.clabe);
    setClabeCopiada(true);
    setTimeout(() => setClabeCopiada(false), 2000);
  }

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

  // Distancia se resuelve async contra OSRM (con fallback a haversine × 1.4).
  const [distanciaKm, setDistanciaKm] = useState(0);
  const [calculandoRuta, setCalculandoRuta] = useState(false);

  useEffect(() => {
    if (!ubicacion) { setDistanciaKm(0); return; }
    let cancelado = false;
    setCalculandoRuta(true);
    calcularDistanciaRuta(origenes, ubicacion)
      .then((km) => { if (!cancelado) setDistanciaKm(km); })
      .finally(() => { if (!cancelado) setCalculandoRuta(false); });
    return () => { cancelado = true; };
  }, [ubicacion, origenes]);

  const { costo: costoEnvio, fueraDeCobertura } = useMemo(
    () => calcularCostoEnvio(distanciaKm),
    [distanciaKm]
  );

  const baseConEnvio = subtotal + servicioMercadito + costoEnvio;
  const recargoTarjeta = metodoPago === "tarjeta" ? Math.round(baseConEnvio * RECARGO_TARJETA) : 0;
  const total = baseConEnvio + recargoTarjeta;

  async function confirmar() {
    if (!ubicacion) { Alert.alert("Falta", "Marca tu ubicación en el mapa"); return; }
    if (fueraDeCobertura) { Alert.alert("Fuera de cobertura", "Esta dirección está a más de 20 km."); return; }
    if (costoEnvio <= 0) { Alert.alert("Falta", "No se pudo calcular el costo de envío"); return; }
    if (!direccion.trim()) { Alert.alert("Falta", "Escribe tu dirección"); return; }
    if (!usuario) { Alert.alert("Sesión", "Vuelve a iniciar sesión"); return; }
    if (metodoPago === "transferencia" && !comprobante) {
      Alert.alert("Falta", "Sube tu comprobante de transferencia");
      return;
    }

    setEnviando(true);
    try {
      // Verificar precios: la tienda pudo cambiar el precio base o el mayoreo
      // mientras el cliente armaba su pedido. Recalculamos cada item con la
      // variante y modificadores congelados + precio base actual del API.
      let itemsAEnviar = items.map((i) => ({
        producto_id: i.producto_id,
        puesto_id: i.puesto_id,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        comision: i.comision,
        variante_id: i.variante_id,
        variante_nombre: i.variante_nombre,
        modificadores: i.modificadores,
      }));

      try {
        const productosActuales = await listarProductosCliente();
        const cambios: string[] = [];
        itemsAEnviar = items.map((i) => {
          const prod = productosActuales.find((p) => p.id === i.producto_id);
          const precioActual = prod?.precios.find((pr) => pr.puesto_id === i.puesto_id);
          if (!prod || !precioActual) return {
            producto_id: i.producto_id, puesto_id: i.puesto_id, cantidad: i.cantidad,
            precio_unitario: i.precio_unitario, comision: i.comision,
            variante_id: i.variante_id, variante_nombre: i.variante_nombre, modificadores: i.modificadores,
          };
          const variante = i.variante_id ? prod.variantes?.find((v) => v.id === i.variante_id) ?? null : null;
          const extrasVals = sumarExtrasDeVariante(prod.opciones ?? [], variante);
          const extrasMods = i.modificadores.reduce((s, m) => s + (Number(m.precio_extra) || 0), 0);
          const baseRaw = Number(variante?.precio_override ?? precioActual.precio);
          const mayRaw = variante?.precio_mayoreo_override ?? precioActual.precio_mayoreo ?? null;
          const mayDesde = variante?.mayoreo_desde_override ?? precioActual.mayoreo_desde ?? null;
          const baseEfectivo = baseRaw + extrasVals + extrasMods;
          const mayEfectivo = mayRaw != null ? Number(mayRaw) + extrasVals + extrasMods : null;
          const efectivo = mayEfectivo != null && mayDesde != null && i.cantidad >= mayDesde ? mayEfectivo : baseEfectivo;
          if (Math.abs(efectivo - i.precio_unitario) > 0.01) {
            cambios.push(`${i.producto_nombre}: $${i.precio_unitario.toFixed(2)} → $${efectivo.toFixed(2)}`);
          }
          return {
            producto_id: i.producto_id, puesto_id: i.puesto_id, cantidad: i.cantidad,
            precio_unitario: efectivo, comision: calcularComision(efectivo),
            variante_id: i.variante_id, variante_nombre: i.variante_nombre, modificadores: i.modificadores,
          };
        });
        if (cambios.length > 0) {
          const confirmar = await new Promise<boolean>((resolve) => {
            Alert.alert(
              "Precios actualizados",
              `Algunos precios cambiaron mientras armabas tu pedido:\n\n${cambios.join("\n")}\n\n¿Confirmar con los nuevos precios?`,
              [
                { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
                { text: "Confirmar", onPress: () => resolve(true) },
              ]
            );
          });
          if (!confirmar) { setEnviando(false); return; }
        }
      } catch {
        // Si falla la verificación, enviamos con los precios del carrito
      }

      const direccionEntrega = `${direccion.trim()}${numero.trim() ? ` #${numero.trim()}` : ""} [${ubicacion.lat.toFixed(6)}, ${ubicacion.lng.toFixed(6)}]`;
      const { id } = await crearPedido({
        cliente_nombre: usuario.nombre,
        cliente_telefono: usuario.telefono,
        zona_id: "mapa",
        direccion_entrega: direccionEntrega,
        notas: notas.trim() || undefined,
        metodo_pago: metodoPago,
        recargo_tarjeta: recargoTarjeta,
        comprobante_pago: metodoPago === "transferencia" ? comprobante ?? undefined : undefined,
        costo_envio_override: costoEnvio,
        items: itemsAEnviar,
      });
      vaciar();
      const msg = metodoPago === "transferencia"
        ? `#${id.slice(0, 8).toUpperCase()}\n\nTu pago está en validación. Te avisamos en cuanto lo confirmemos.`
        : `#${id.slice(0, 8).toUpperCase()}`;
      Alert.alert("Pedido enviado", msg, [
        { text: "Ver mis pedidos", onPress: () => router.replace("/(tabs)/pedidos") },
      ]);
    } catch (e) {
      const msg = (e as { error?: string })?.error ?? "Error al enviar";
      Alert.alert("No se pudo enviar", msg);
    } finally {
      setEnviando(false);
    }
  }

  const puedeConfirmar = ubicacion != null && !fueraDeCobertura && costoEnvio > 0 && direccion.trim() !== "" && !enviando && !calculandoRuta && (metodoPago !== "transferencia" || !!comprobante);

  return (
    <>
      <Stack.Screen options={{ title: "Confirmar pedido", headerStyle: { backgroundColor: "#FFF7EB" } }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(kbHeight + 40, 24 + insets.bottom) }]}
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
                {calculandoRuta ? (
                  <>
                    <ActivityIndicator size="small" color="#FF7A2B" />
                    <Text style={styles.envioTexto}>Calculando ruta…</Text>
                  </>
                ) : fueraDeCobertura ? (
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
                style={[styles.pagoOption, metodoPago === "transferencia" && styles.pagoOptionActive]}
                onPress={() => setMetodoPago("transferencia")}
              >
                <Ionicons name="business-outline" size={22} color={metodoPago === "transferencia" ? "#FF7A2B" : "#8B7B69"} />
                <Text style={[styles.pagoText, metodoPago === "transferencia" && styles.pagoTextActive]}>Transf.</Text>
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
            {metodoPago === "transferencia" && (
              <View style={styles.bancoBox}>
                <Text style={styles.bancoTitulo}>Transfiere por SPEI a:</Text>

                <View style={styles.bancoCard}>
                  <View style={styles.bancoRow}><Text style={styles.bancoLabel}>Banco</Text><Text style={styles.bancoValor}>{DATOS_PAGO.banco}</Text></View>
                  <View>
                    <View style={styles.clabeHeader}>
                      <Text style={styles.bancoLabel}>CLABE</Text>
                      <TouchableOpacity
                        onPress={copiarClabe}
                        style={[styles.copiarBtn, clabeCopiada && styles.copiarBtnOk]}
                      >
                        <Ionicons name={clabeCopiada ? "checkmark" : "copy-outline"} size={14} color={clabeCopiada ? "#059669" : "#FF7A2B"} />
                        <Text style={[styles.copiarBtnText, clabeCopiada && { color: "#059669" }]}>
                          {clabeCopiada ? "Copiada" : "Copiar"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={copiarClabe}>
                      <Text selectable style={[styles.clabeTxt, { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                        {DATOS_PAGO.clabe}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.bancoRow}><Text style={styles.bancoLabel}>Nombre</Text><Text style={styles.bancoValor}>{DATOS_PAGO.beneficiario}</Text></View>
                  <View style={[styles.bancoRow, styles.montoRow]}>
                    <Text style={styles.bancoLabel}>Monto a transferir</Text>
                    <Text style={styles.montoValor}>${total.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Botón comprobante prominente */}
                {comprobante ? (
                  <View style={styles.comprobanteOk}>
                    <Image source={{ uri: comprobante }} style={styles.comprobanteImg} resizeMode="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.comprobanteOkTitulo}>✓ Comprobante listo</Text>
                      <Text style={styles.comprobanteOkHint}>Validaremos al recibir el pedido</Text>
                    </View>
                    <TouchableOpacity onPress={() => setComprobante(null)}>
                      <Text style={styles.comprobanteQuitar}>Cambiar</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.subirBtnGrande}
                      onPress={async () => {
                        const url = await pickImageAsDataUrl("library");
                        if (url) setComprobante(url);
                      }}
                    >
                      <Ionicons name="cloud-upload-outline" size={24} color="#fff" />
                      <View>
                        <Text style={styles.subirBtnGrandeTxt}>Subir comprobante de pago</Text>
                        <Text style={styles.subirBtnGrandeHint}>Sin comprobante no podemos validar</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.subirBtnAlt}
                      onPress={async () => {
                        const url = await pickImageAsDataUrl("camera");
                        if (url) setComprobante(url);
                      }}
                    >
                      <Ionicons name="camera-outline" size={18} color="#FF7A2B" />
                      <Text style={styles.subirBtnAltTxt}>O tomar foto con la cámara</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </Section>

          {/* Resumen */}
          <Section title="Resumen" icon="receipt-outline">
            {promocionMayoreo > 0 ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Productos ({items.length})</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text style={styles.precioTachado}>${(subtotal + promocionMayoreo).toFixed(2)}</Text>
                  <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
                </View>
              </View>
            ) : (
              <Row label={`Productos (${items.length})`} value={subtotal} />
            )}
            {promocionMayoreo > 0 && (
              <View style={styles.promoRow}>
                <Text style={styles.promoLabel}>🎉 Ahorro por mayoreo</Text>
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
  bancoBox: { marginTop: 12, backgroundColor: "#EFF6FF", borderWidth: 2, borderColor: "#93C5FD", borderRadius: 12, padding: 12 },
  bancoTitulo: { fontSize: 14, fontWeight: "700", color: "#1E3A8A", marginBottom: 8 },
  bancoCard: { backgroundColor: "#fff", borderRadius: 10, padding: 12, gap: 8 },
  bancoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bancoLabel: { fontSize: 12, color: "#6B7280" },
  bancoValor: { fontSize: 14, color: "#111827", fontWeight: "700" },
  clabeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  clabeTxt: { fontSize: 16, color: "#111827", fontWeight: "700", letterSpacing: 1.5 },
  copiarBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FFF2E5", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  copiarBtnOk: { backgroundColor: "#D1FAE5" },
  copiarBtnText: { color: "#FF7A2B", fontSize: 12, fontWeight: "700" },
  montoRow: { borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 8, marginTop: 4 },
  montoValor: { fontSize: 18, color: "#C2410C", fontWeight: "800" },
  subirBtnGrande: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FF7A2B", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  subirBtnGrandeTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
  subirBtnGrandeHint: { color: "#FFD9BE", fontSize: 11 },
  subirBtnAlt: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  subirBtnAltTxt: { color: "#FF7A2B", fontSize: 13, fontWeight: "600" },
  comprobanteOk: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", padding: 10, borderRadius: 10, borderWidth: 2, borderColor: "#86EFAC" },
  comprobanteImg: { width: 60, height: 60, borderRadius: 8, backgroundColor: "#F3F4F6" },
  comprobanteOkTitulo: { color: "#059669", fontWeight: "700", fontSize: 14 },
  comprobanteOkHint: { color: "#6B7280", fontSize: 11 },
  comprobanteQuitar: { color: "#DC2626", fontSize: 13, fontWeight: "600" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  summaryLabel: { color: "#4B5563" },
  summaryValue: { color: "#4B5563", fontWeight: "500" },
  precioTachado: { color: "#9CA3AF", textDecorationLine: "line-through", marginRight: 6, fontSize: 13 },
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
