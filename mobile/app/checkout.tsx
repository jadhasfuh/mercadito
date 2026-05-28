import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../src/contexts/CartContext";
import { useSession } from "../src/contexts/SessionContext";
import { crearPedido } from "../src/api/pedidos";
import { obtenerEstadoReferidos } from "../src/api/auth";
import { calcularCostoEnvio, calcularDistanciaRuta, type LatLng } from "../src/lib/envio";
import { useKeyboardHeight } from "../src/lib/useKeyboard";
import MapaUbicacion from "../src/components/MapaUbicacion";
import { pickImageAsDataUrl } from "../src/lib/imagePicker";
import { DATOS_PAGO } from "../src/lib/datosPago";
import { listarProductosCliente } from "../src/api/catalogo";
import BannerPromoEnvioGratis from "../src/components/BannerPromoEnvioGratis";
import { sumarExtrasDeVariante } from "../src/lib/variantes";
import { calcularComision } from "../src/lib/comision";

const RECARGO_TARJETA = 0.0406;

export default function CheckoutScreen() {
  const { items, subtotal, servicioMercadito, promocionMayoreo, vaciar } = useCart();
  const { usuario } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const kbHeight = useKeyboardHeight();

  useEffect(() => {
    if (items.length === 0) router.replace("/(tabs)/carrito");
  }, [items.length, router]);

  // Checkout sí requiere cuenta (el pedido va a tu nombre + teléfono +
  // dirección). Si llegan aquí sin sesión, mandamos a login con retorno
  // explícito a /checkout para no perder el carrito.
  useEffect(() => {
    if (!usuario) {
      router.replace({ pathname: "/login", params: { redirect: "/checkout" } });
    }
  }, [usuario, router]);

  // Pre-fill de dirección/notas/ubicación desde el último pedido. Persiste
  // entre aperturas de la app. Es info no sensible, pero usamos SecureStore
  // por consistencia con el resto.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("mercadito_perfil_entrega");
        if (!raw || cancel) return;
        const perfil = JSON.parse(raw) as {
          direccion?: string;
          numero?: string;
          notas?: string;
          ubicacion?: { lat: number; lng: number };
        };
        if (perfil.direccion) setDireccion((d) => d || perfil.direccion!);
        if (perfil.numero) setNumero((n) => n || perfil.numero!);
        if (perfil.notas) setNotas((n) => n || perfil.notas!);
        if (perfil.ubicacion) setUbicacion((u) => u || perfil.ubicacion!);
      } catch {
        // Ignoramos errores de parse / acceso.
      }
    })();
    return () => { cancel = true; };
  }, []);

  const [direccion, setDireccion] = useState("");
  const [numero, setNumero] = useState("");
  const [notas, setNotas] = useState("");
  const [ubicacion, setUbicacion] = useState<LatLng | null>(null);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  // Saldo de referidos disponible y si el cliente lo va a aplicar.
  const [saldoCredito, setSaldoCredito] = useState(0);
  const [usarCredito, setUsarCredito] = useState(false);

  useEffect(() => {
    obtenerEstadoReferidos().then((r) => setSaldoCredito(r.saldo_credito)).catch(() => setSaldoCredito(0));
  }, []);
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [clabeCopiada, setClabeCopiada] = useState(false);
  const [dimoCopiado, setDimoCopiado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Selector dinámico: las opciones se traen del back con las ventanas en
  // que TODAS las tiendas del carrito coinciden abiertas. Adiós a opciones
  // rígidas que ofrecían "Mañana 9 am" cuando alguna tienda no abre a esa
  // hora. Igual que web.
  const [agendadoIso, setAgendadoIso] = useState<string | null>(null);
  const [ventanasOpciones, setVentanasOpciones] = useState<{ inicio: string; fin: string; label: string }[]>([]);
  const [ahoraDisponible, setAhoraDisponible] = useState<boolean>(true);

  useEffect(() => {
    if (items.length === 0) {
      setVentanasOpciones([]);
      setAhoraDisponible(true);
      return;
    }
    const pares = Array.from(new Set(items.map((c) => `${c.producto_id}:${c.puesto_id}`))).join(",");
    let cancel = false;
    fetch(`https://mercadito.cx/api/puestos/ventanas-comunes?pares=${pares}`)
      .then((r) => r.json())
      .then((data: { ahora_disponible: boolean; ventanas: { inicio: string; fin: string; label: string }[] }) => {
        if (cancel) return;
        setAhoraDisponible(!!data.ahora_disponible);
        setVentanasOpciones(data.ventanas || []);
        if (!data.ahora_disponible && agendadoIso === null && data.ventanas?.length) {
          setAgendadoIso(data.ventanas[0].inicio);
        }
      })
      .catch(() => {});
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, items.map((i) => `${i.producto_id}:${i.puesto_id}`).join(",")]);

  async function copiarDimo() {
    await Clipboard.setStringAsync(DATOS_PAGO.dimo.telefono);
    setDimoCopiado(true);
    setTimeout(() => setDimoCopiado(false), 2000);
  }
  async function copiarClabe() {
    await Clipboard.setStringAsync(DATOS_PAGO.clabe);
    setClabeCopiada(true);
    setTimeout(() => setClabeCopiada(false), 2000);
  }

  // Orígenes: coordenadas únicas de tiendas con items en el carrito.
  // Incluimos `nombre` para mostrarlo en el popup del marker en el mapa.
  const origenes = useMemo((): Array<LatLng & { nombre?: string }> => {
    const vistos = new Set<string>();
    const out: Array<LatLng & { nombre?: string }> = [];
    for (const i of items) {
      if (i.puesto_lat == null || i.puesto_lng == null) continue;
      if (vistos.has(i.puesto_id)) continue;
      vistos.add(i.puesto_id);
      out.push({ lat: i.puesto_lat, lng: i.puesto_lng, nombre: i.puesto_nombre });
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
  const totalAntesCredito = baseConEnvio + recargoTarjeta;
  // Crédito aplicado: solo subsidia servicio Mercadito + envío. La tienda
  // siempre cobra íntegro y el recargo de tarjeta no se descuenta. Mismo
  // cálculo que el server (autoritativo en /api/pedidos).
  const capCredito = Math.max(0, servicioMercadito + costoEnvio);
  const creditoAplicado = usarCredito && saldoCredito > 0
    ? Math.min(saldoCredito, capCredito)
    : 0;
  const total = totalAntesCredito - creditoAplicado;

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
      const agendadoFecha = agendadoIso ? new Date(agendadoIso) : null;
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
        agendado_para: agendadoFecha ? agendadoFecha.toISOString() : undefined,
        usar_credito: creditoAplicado > 0 ? creditoAplicado : undefined,
        items: itemsAEnviar,
      });
      vaciar();
      // Guardar perfil de entrega para pre-llenar el próximo pedido.
      try {
        await SecureStore.setItemAsync(
          "mercadito_perfil_entrega",
          JSON.stringify({ direccion, numero, notas, ubicacion })
        );
      } catch {
        // No crítico.
      }
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
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(kbHeight + 200, 200 + insets.bottom) }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
        >
          <BannerPromoEnvioGratis telefono={usuario?.telefono} />

          {/* Ubicación */}
          <Section title="¿A dónde llevamos tu pedido?" icon="location-outline">
            <Text style={styles.hint}>Toca el mapa para marcar dónde entregar, o usa &quot;Mi ubicación&quot;.</Text>
            {/* Mapa expandido — antes 260px, ahora 360px. El checkout es la
                pantalla más crítica de conversión; precisión de ubicación >
                espacio vertical. El campo de búsqueda flota encima del mapa
                en su propio componente. TODO: integrar Google Places autocomplete
                cuando tengamos API key (hoy es solo input manual de calle). */}
            <MapaUbicacion
              valor={ubicacion}
              onCambio={(p) => setUbicacion(p)}
              onDireccionDetectada={setDireccion}
              origenes={origenes.map((o) => ({ lat: o.lat, lng: o.lng, nombre: o.nombre }))}
              altura={360}
            />
            {ubicacion && (
              <View style={[styles.envioBox, fueraDeCobertura && styles.envioBoxError]}>
                {calculandoRuta ? (
                  <>
                    <ActivityIndicator size="small" color="#F2A65A" />
                    <Text style={styles.envioTexto}>Calculando ruta…</Text>
                  </>
                ) : fueraDeCobertura ? (
                  <>
                    <Ionicons name="warning-outline" size={16} color="#DC2626" />
                    <Text style={styles.envioError}>Fuera de cobertura (&gt; 20 km)</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="bicycle-outline" size={16} color="#F2A65A" />
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
            <View style={styles.dirReadonly}>
              <Text style={styles.dirReadonlyTxt}>{direccion || "Toca el mapa para detectar la calle"}</Text>
              <Text style={styles.dirReadonlyHint}>📍 Auto-detectada · busca o pica el mapa para cambiar</Text>
            </View>
            <TextInput
              placeholderTextColor="#9C8B72"
              value={numero}
              onChangeText={setNumero}
              placeholder="Número / interior (opcional)"
              style={styles.input}
              onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
            />
            <TextInput
              placeholderTextColor="#9C8B72"
              value={notas}
              onChangeText={setNotas}
              placeholder="Referencias o notas (opcional)"
              style={[styles.input, { minHeight: 60 }]}
              multiline
              onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
            />
          </Section>

          {/* ¿Cuándo lo quieres? — chips más grandes (de ~36px alto a ~54px)
              porque eran apenas táctiles para un pulgar. Min height respeta
              guideline 44pt de Apple. Color brand del theme. */}
          <Section title="¿Cuándo lo quieres?" icon="time-outline">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {ahoraDisponible && (
                <TouchableOpacity
                  onPress={() => setAgendadoIso(null)}
                  activeOpacity={0.85}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderRadius: 16,
                    minWidth: 140,
                    minHeight: 54,
                    backgroundColor: agendadoIso === null ? "#ED8E3C" : "#fff",
                    borderWidth: 1.5,
                    borderColor: agendadoIso === null ? "#ED8E3C" : "#E5E7EB",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: agendadoIso === null ? "#fff" : "#1F2937" }}>🛵 Ahora</Text>
                  <Text style={{ fontSize: 11, color: agendadoIso === null ? "rgba(255,255,255,0.9)" : "#6B7280", marginTop: 3 }}>lo antes posible</Text>
                </TouchableOpacity>
              )}
              {ventanasOpciones.map((v) => {
                const sel = agendadoIso === v.inicio;
                return (
                  <TouchableOpacity
                    key={v.inicio}
                    onPress={() => setAgendadoIso(v.inicio)}
                    activeOpacity={0.85}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderRadius: 16,
                      minWidth: 150,
                      minHeight: 54,
                      backgroundColor: sel ? "#ED8E3C" : "#fff",
                      borderWidth: 1.5,
                      borderColor: sel ? "#ED8E3C" : "#E5E7EB",
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: sel ? "#fff" : "#1F2937" }}>📅 {v.label}</Text>
                    <Text style={{ fontSize: 11, color: sel ? "rgba(255,255,255,0.9)" : "#6B7280", marginTop: 3 }}>ventana válida</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {!ahoraDisponible && (
              <Text style={{ fontSize: 11, color: "#92400E", backgroundColor: "#FEF3C7", padding: 8, borderRadius: 8, marginTop: 8 }}>
                ⚠️ Hay tiendas en tu carrito que no están abiertas ahora. Solo puedes agendar para una hora donde TODAS abran.
              </Text>
            )}
            {agendadoIso && (() => {
              const f = new Date(agendadoIso);
              const fmt = f.toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
              return (
                <Text style={{ fontSize: 11, color: "#92400E", backgroundColor: "#FEF3C7", padding: 8, borderRadius: 8, marginTop: 8 }}>
                  📅 Tu pedido se agenda para {fmt}. El repartidor lo verá con anticipación. Puedes cancelar hasta que confirme que va a comprarlo.
                </Text>
              );
            })()}
            {ventanasOpciones.length === 0 && !ahoraDisponible && (
              <Text style={{ fontSize: 11, color: "#991B1B", backgroundColor: "#FEE2E2", padding: 8, borderRadius: 8, marginTop: 8 }}>
                No encontramos un horario común para todas las tiendas de tu carrito en los próximos días. Quita alguna y vuelve a intentar.
              </Text>
            )}
          </Section>

          {/* Método de pago */}
          <Section title="Método de pago" icon="card-outline">
            <View style={styles.pagoRow}>
              <TouchableOpacity
                style={[styles.pagoOption, metodoPago === "efectivo" && styles.pagoOptionActive]}
                onPress={() => setMetodoPago("efectivo")}
              >
                <Ionicons name="cash-outline" size={22} color={metodoPago === "efectivo" ? "#F2A65A" : "#8B7B69"} />
                <Text style={[styles.pagoText, metodoPago === "efectivo" && styles.pagoTextActive]}>Efectivo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pagoOption, metodoPago === "transferencia" && styles.pagoOptionActive]}
                onPress={() => setMetodoPago("transferencia")}
              >
                <Ionicons name="business-outline" size={22} color={metodoPago === "transferencia" ? "#F2A65A" : "#8B7B69"} />
                <Text style={[styles.pagoText, metodoPago === "transferencia" && styles.pagoTextActive]}>Transf.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pagoOption, metodoPago === "tarjeta" && styles.pagoOptionActive]}
                onPress={() => setMetodoPago("tarjeta")}
              >
                <Ionicons name="card-outline" size={22} color={metodoPago === "tarjeta" ? "#F2A65A" : "#8B7B69"} />
                <Text style={[styles.pagoText, metodoPago === "tarjeta" && styles.pagoTextActive]}>Tarjeta</Text>
              </TouchableOpacity>
            </View>
            {metodoPago === "tarjeta" && (
              <Text style={styles.pagoHint}>El repartidor lleva terminal. Se aplica recargo del 4% por comisión bancaria.</Text>
            )}
            {metodoPago === "transferencia" && (
              <View style={styles.bancoBox}>
                <Text style={styles.bancoTitulo}>Paga por transferencia (SPEI):</Text>

                {/* DiMo — opción rápida con teléfono */}
                <View style={[styles.bancoCard, styles.dimoCard]}>
                  <View style={styles.dimoHeader}>
                    <View style={styles.dimoBadge}><Text style={styles.dimoBadgeText}>RECOMENDADO</Text></View>
                    <Text style={styles.dimoTitle}>📱 DiMo (más fácil)</Text>
                  </View>
                  <Text style={styles.dimoHint}>
                    Desde tu app del banco busca <Text style={{fontWeight:"700"}}>&quot;DiMo&quot;</Text> o <Text style={{fontWeight:"700"}}>&quot;Enviar a número&quot;</Text> y mete este teléfono.
                  </Text>
                  <View>
                    <View style={styles.clabeHeader}>
                      <Text style={styles.bancoLabel}>Teléfono DiMo</Text>
                      <TouchableOpacity onPress={copiarDimo} style={[styles.copiarBtn, dimoCopiado && styles.copiarBtnOk]}>
                        <Ionicons name={dimoCopiado ? "checkmark" : "copy-outline"} size={14} color={dimoCopiado ? "#059669" : "#F2A65A"} />
                        <Text style={[styles.copiarBtnText, dimoCopiado && { color: "#059669" }]}>
                          {dimoCopiado ? "Copiado" : "Copiar"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={copiarDimo}>
                      <Text selectable style={[styles.clabeTxt, { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                        {DATOS_PAGO.dimo.telefono}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.bancoRow}><Text style={styles.bancoLabel}>Banco</Text><Text style={styles.bancoValor}>{DATOS_PAGO.dimo.banco}</Text></View>
                  <View style={styles.bancoRow}><Text style={styles.bancoLabel}>A nombre de</Text><Text style={styles.bancoValor}>{DATOS_PAGO.dimo.titular}</Text></View>
                  <View style={[styles.bancoRow, styles.montoRow]}>
                    <Text style={styles.bancoLabel}>Monto a transferir</Text>
                    <Text style={styles.montoValor}>${total.toFixed(2)}</Text>
                  </View>
                </View>

                <Text style={styles.divisorTxt}>— o también por CLABE —</Text>

                <View style={styles.bancoCard}>
                  <View style={styles.bancoRow}><Text style={styles.bancoLabel}>Banco</Text><Text style={styles.bancoValor}>{DATOS_PAGO.banco}</Text></View>
                  <View>
                    <View style={styles.clabeHeader}>
                      <Text style={styles.bancoLabel}>CLABE</Text>
                      <TouchableOpacity
                        onPress={copiarClabe}
                        style={[styles.copiarBtn, clabeCopiada && styles.copiarBtnOk]}
                      >
                        <Ionicons name={clabeCopiada ? "checkmark" : "copy-outline"} size={14} color={clabeCopiada ? "#059669" : "#F2A65A"} />
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
                      <Ionicons name="camera-outline" size={18} color="#F2A65A" />
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
            {servicioMercadito > 0 && (
              <RowConInfo
                label="Servicio Mercadito"
                value={servicioMercadito}
                infoTitulo="¿Qué es el Servicio Mercadito?"
                infoCuerpo="Una pequeña comisión por producto que ayuda a mantener la app funcionando, pagar a los repartidores y a las tiendas. No es propina — la propina puede ir aparte al repartidor."
              />
            )}
            <Row label="Envío" value={costoEnvio} placeholder={ubicacion ? undefined : "Marca ubicación"} />
            {recargoTarjeta > 0 && <Row label="Recargo tarjeta" value={recargoTarjeta} />}

            {/* Saldo de referidos. Solo subsidia servicio + envío (no
                productos de la tienda). Server cap idéntico. */}
            {saldoCredito > 0 && (
              <TouchableOpacity
                onPress={() => setUsarCredito(!usarCredito)}
                style={styles.creditoRow}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={usarCredito ? "checkbox" : "square-outline"}
                  size={22}
                  color={usarCredito ? "#F2A65A" : "#9CA3AF"}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.creditoTxt}>
                    Usar mi saldo (${saldoCredito.toFixed(2)} disponibles)
                  </Text>
                  <Text style={styles.creditoDesc}>
                    {usarCredito && creditoAplicado > 0
                      ? `Se aplican $${creditoAplicado.toFixed(2)} a envío y servicio.`
                      : "Solo aplica a envío y servicio Mercadito."}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            {creditoAplicado > 0 && (
              <View style={styles.promoRow}>
                <Text style={styles.promoLabel}>🎁 Saldo aplicado</Text>
                <Text style={styles.promoValue}>-${creditoAplicado.toFixed(2)}</Text>
              </View>
            )}

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

// Variante del Row con icono ⓘ a la derecha del label. Al tap, abre un Alert
// con explicación. Útil para conceptos que el cliente puede confundir como
// "Servicio Mercadito" — antes era opaco y daba sensación de cargo escondido.
function RowConInfo({
  label,
  value,
  infoTitulo,
  infoCuerpo,
}: {
  label: string;
  value: number;
  infoTitulo: string;
  infoCuerpo: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <TouchableOpacity
          onPress={() => Alert.alert(infoTitulo, infoCuerpo)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="information-circle-outline" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
      <Text style={styles.summaryValue}>${value.toFixed(2)}</Text>
    </View>
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
  dirReadonly: { backgroundColor: "#F9FAFB", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#E5E7EB" },
  dirReadonlyTxt: { fontSize: 14, color: "#1F2937", fontWeight: "500" },
  dirReadonlyHint: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  envioBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF7EB", borderRadius: 10, padding: 10, marginTop: 10 },
  envioBoxError: { backgroundColor: "#FEE2E2" },
  envioTexto: { fontSize: 14, color: "#1F2937", fontWeight: "500" },
  envioCosto: { color: "#F2A65A", fontWeight: "700" },
  envioError: { fontSize: 13, color: "#DC2626", fontWeight: "600" },
  pagoRow: { flexDirection: "row", gap: 8 },
  pagoOption: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB" },
  pagoOptionActive: { borderColor: "#F2A65A", backgroundColor: "#FEF5EA" },
  pagoText: { fontSize: 14, color: "#8B7B69", fontWeight: "500" },
  pagoTextActive: { color: "#F2A65A", fontWeight: "700" },
  pagoHint: { marginTop: 8, fontSize: 11, color: "#8B7B69", textAlign: "center" },
  bancoBox: { marginTop: 12, backgroundColor: "#EFF6FF", borderWidth: 2, borderColor: "#93C5FD", borderRadius: 12, padding: 12 },
  bancoTitulo: { fontSize: 14, fontWeight: "700", color: "#1E3A8A", marginBottom: 8 },
  bancoCard: { backgroundColor: "#fff", borderRadius: 10, padding: 12, gap: 8 },
  bancoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  bancoLabel: { fontSize: 12, color: "#6B7280" },
  bancoValor: { fontSize: 14, color: "#111827", fontWeight: "700", flexShrink: 1, textAlign: "right" },
  clabeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  clabeTxt: { fontSize: 16, color: "#111827", fontWeight: "700", letterSpacing: 1.5 },
  copiarBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF5EA", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  copiarBtnOk: { backgroundColor: "#D1FAE5" },
  copiarBtnText: { color: "#F2A65A", fontSize: 12, fontWeight: "700" },
  montoRow: { borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 8, marginTop: 4 },
  dimoCard: { marginBottom: 8, borderWidth: 2, borderColor: "#A7F3D0" },
  dimoHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  dimoBadge: { backgroundColor: "#D1FAE5", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  dimoBadgeText: { fontSize: 9, fontWeight: "700", color: "#065F46" },
  dimoTitle: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  dimoHint: { fontSize: 11, color: "#6B7280", lineHeight: 15 },
  divisorTxt: { textAlign: "center", fontSize: 11, color: "#9CA3AF", marginVertical: 6 },
  montoValor: { fontSize: 18, color: "#C2680E", fontWeight: "800" },
  subirBtnGrande: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F2A65A", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  subirBtnGrandeTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
  subirBtnGrandeHint: { color: "#FFD9BE", fontSize: 11 },
  subirBtnAlt: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  subirBtnAltTxt: { color: "#F2A65A", fontSize: 13, fontWeight: "600" },
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
  creditoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, marginTop: 2 },
  creditoTxt: { fontSize: 13, color: "#1F2937", fontWeight: "600" },
  creditoDesc: { fontSize: 11, color: "#059669", marginTop: 1 },
  promoLabel: { color: "#059669", fontWeight: "600" },
  promoValue: { color: "#059669", fontWeight: "700" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  totalLabel: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  totalValue: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  // CTA principal — más alto, brand del theme, sombra ligera para que se
  // sienta el "tap me" sobre el cream. Antes 16/16, ahora 18/20.
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ED8E3C",
    paddingVertical: 18,
    borderRadius: 999,
    marginTop: 12,
    marginBottom: 8,
    shadowColor: "#ED8E3C",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  submitDisabled: { backgroundColor: "#D4D4D8" },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
