import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Linking, Alert, TextInput, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { misPedidos, type Pedido, type EstadoPedido } from "../../src/api/pedidos";
import { listarProductosCliente } from "../../src/api/catalogo";
import { useCart } from "../../src/contexts/CartContext";
import { calificarPedido, cambiarEstado } from "../../src/api/repartidor";
import TicketPedido from "../../src/components/TicketPedido";
import AppHeader from "../../src/components/AppHeader";
import EditorPedidoRN from "../../src/components/EditorPedidoRN";
import MapaTrackingClienteRN from "../../src/components/MapaTrackingCliente";
import { useSession } from "../../src/contexts/SessionContext";
import { useAndroidBack } from "../../src/lib/useAndroidBack";

import { labelEstado, type TipoPedido } from "../../src/lib/estadoPedido";

const ESTADO_COLORES: Record<EstadoPedido, { color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  pendiente: { color: "#92400E", bg: "#FEF3C7", icon: "hourglass-outline" },
  en_compra: { color: "#1E40AF", bg: "#DBEAFE", icon: "basket-outline" },
  en_camino: { color: "#6B21A8", bg: "#EDE9FE", icon: "bicycle-outline" },
  entregado: { color: "#065F46", bg: "#D1FAE5", icon: "checkmark-circle-outline" },
  cancelado: { color: "#991B1B", bg: "#FEE2E2", icon: "close-circle-outline" },
};

function infoEstado(estado: EstadoPedido, tipo?: TipoPedido | null) {
  const c = ESTADO_COLORES[estado];
  // Para envío, cambiar también el icono de "carrito" a "caja".
  const icon = tipo === "envio" && estado === "en_compra" ? "cube-outline" : c.icon;
  return { label: labelEstado(estado, tipo), color: c.color, bg: c.bg, icon };
}

export default function PedidosScreen() {
  const insets = useSafeAreaInsets();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [editandoPedido, setEditandoPedido] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { agregar } = useCart();
  const router = useRouter();
  const { usuario } = useSession();

  // Back de Android — primero cierra ticket/editor abierto, si no, va a home.
  // Cancelando no cuenta como estado consumible: es un loading transitorio.
  useAndroidBack(
    [
      () => { if (ticketId) { setTicketId(null); return true; } return false; },
      () => { if (editandoPedido) { setEditandoPedido(null); return true; } return false; },
      () => { router.replace("/(tabs)/home"); return true; },
    ],
    { skipExit: true }
  );

  async function cancelarPedido(pedidoId: string) {
    Alert.alert(
      "¿Cancelar pedido?",
      "Solo se pueden cancelar pedidos pendientes. Si ya estaban comprando, llama al repartidor.",
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: async () => {
            setCancelando(pedidoId);
            try {
              await cambiarEstado(pedidoId, "cancelado", { motivo_cancelacion: "Cancelado por el cliente" });
              await load();
            } catch (e) {
              Alert.alert("No se pudo cancelar", (e as { error?: string })?.error ?? "Error");
            } finally {
              setCancelando(null);
            }
          },
        },
      ]
    );
  }

  async function volverAComprar(pedido: Pedido) {
    try {
      const productos = await listarProductosCliente();
      let agregados = 0;
      const omitidos: string[] = [];
      for (const item of pedido.items) {
        const prod = productos.find((p) => p.id === item.producto_id);
        if (!prod) {
          omitidos.push(item.producto_nombre || "producto");
          continue;
        }
        // Variantes/modificadores: si los teníamos, intentamos rehidratar.
        let varianteRehid = null;
        if (item.variante_id) {
          varianteRehid = (prod.variantes ?? []).find((v) => v.id === item.variante_id) ?? null;
          if (!varianteRehid) {
            omitidos.push(item.producto_nombre || "producto");
            continue;
          }
        }
        agregar(prod, item.puesto_id, {
          variante: varianteRehid,
          modificadores: item.modificadores ?? [],
          cantidadInicial: Number(item.cantidad) || 1,
        });
        agregados++;
      }
      router.push("/(tabs)/carrito");
      if (omitidos.length > 0) {
        const lista = Array.from(new Set(omitidos)).slice(0, 5).join(", ");
        Alert.alert("Repedido", `Se agregaron ${agregados} producto${agregados === 1 ? "" : "s"}. No pudimos agregar: ${lista}.`);
      }
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo repetir el pedido");
    }
  }

  const load = useCallback(async () => {
    try {
      const data = await misPedidos();
      setPedidos(data);
      setError(null);
    } catch (e) {
      setError((e as { error?: string })?.error ?? "Error al cargar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    pollingRef.current = setInterval(load, 15000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [load]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <AppHeader />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F2A65A" />
        </View>
      </View>
    );
  }

  if (pedidos.length === 0) {
    return (
      <View style={styles.screen}>
        <AppHeader />
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={64} color="#D4C9B8" />
          <Text style={styles.emptyText}>Aún no tienes pedidos</Text>
          <Text style={styles.emptyHint}>{error ?? "Haz tu primer pedido desde la pestaña Inicio."}</Text>
        </View>
      </View>
    );
  }

  const ticketPedido = pedidos.find((p) => p.id === ticketId) ?? null;

  return (
    <View style={styles.screen}>
    <AppHeader />
    <FlatList
      data={pedidos}
      keyExtractor={(p) => p.id}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      renderItem={({ item: pedido }) => {
        const info = infoEstado(pedido.estado, pedido.tipo);
        const servicio = pedido.items.reduce((s, it) => s + it.cantidad * (Number(it.comision) || 0), 0);
        return (
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.badgesRow}>
                <View style={[styles.badge, { backgroundColor: info.bg }]}>
                  <Ionicons name={info.icon} size={14} color={info.color} />
                  <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
                </View>
                {pedido.tipo === "envio" && (
                  <View style={[styles.badge, { backgroundColor: "#FEF3C7" }]}>
                    <Text style={[styles.badgeText, { color: "#92400E" }]}>📦 Envío</Text>
                  </View>
                )}
                {pedido.metodo_pago === "transferencia" && !pedido.pago_validado_at && pedido.estado !== "cancelado" && (
                  <View style={[styles.badge, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="time-outline" size={14} color="#92400E" />
                    <Text style={[styles.badgeText, { color: "#92400E" }]}>Validando pago</Text>
                  </View>
                )}
                {pedido.agendado_para && pedido.estado !== "cancelado" && (
                  <View style={[styles.badge, { backgroundColor: "#FEF3C7" }]}>
                    <Ionicons name="calendar-outline" size={14} color="#92400E" />
                    <Text style={[styles.badgeText, { color: "#92400E" }]}>
                      {new Date(pedido.agendado_para).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.total}>${pedido.total.toFixed(2)}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {new Date(pedido.created_at).toLocaleString("es-MX")} · #{pedido.id.slice(0, 8).toUpperCase()}
              </Text>
              <TouchableOpacity onPress={() => setTicketId(pedido.id)} style={styles.ticketBtn}>
                <Text style={styles.ticketBtnTxt}>🧾 Ver ticket</Text>
              </TouchableOpacity>
            </View>

            {/* Tracking en vivo: si el repartidor reporta GPS y es
                reciente (≤15 min), mostramos distancia + ETA estimado.
                Aproximación haversine × 1.4 a 25 km/h ciudad. */}
            {(pedido.estado === "en_compra" || pedido.estado === "en_camino") &&
              pedido.repartidor_lat != null && pedido.repartidor_lng != null &&
              pedido.repartidor_ubicacion_at &&
              (Date.now() - new Date(pedido.repartidor_ubicacion_at).getTime()) < 15 * 60 * 1000 &&
              (() => {
                const m = pedido.direccion_entrega.match(/\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]/);
                if (!m) return null;
                const dirLat = parseFloat(m[1]);
                const dirLng = parseFloat(m[2]);
                const R = 6371;
                const toRad = (n: number) => (n * Math.PI) / 180;
                const dLat = toRad(dirLat - pedido.repartidor_lat!);
                const dLng = toRad(dirLng - pedido.repartidor_lng!);
                const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(pedido.repartidor_lat!)) * Math.cos(toRad(dirLat)) * Math.sin(dLng / 2) ** 2;
                const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const etaMin = Math.max(2, Math.round((distKm * 1.4) * (60 / 25)));
                const minHace = Math.max(0, Math.round((Date.now() - new Date(pedido.repartidor_ubicacion_at!).getTime()) / 60000));
                return (
                  <View>
                    <View style={styles.trackingBox}>
                      <Text style={styles.trackingEmoji}>🛵</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.trackingTitle}>
                          {pedido.repartidor_nombre || "Tu repartidor"} a {distKm.toFixed(1)} km · llega en ~{etaMin} min
                        </Text>
                        <Text style={styles.trackingMeta}>
                          Última ubicación hace {minHace} min
                        </Text>
                      </View>
                    </View>
                    <MapaTrackingClienteRN
                      repartidor={{ lat: pedido.repartidor_lat!, lng: pedido.repartidor_lng! }}
                      cliente={{ lat: dirLat, lng: dirLng }}
                      altura={170}
                    />
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`https://www.google.com/maps?q=${pedido.repartidor_lat},${pedido.repartidor_lng}`)}
                      style={styles.abrirMapsBtn}
                    >
                      <Text style={styles.abrirMapsTxt}>📍 Abrir en Google Maps</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}

            {/* Repartidor: el asignado si existe, si no el "de turno". */}
            {pedido.estado !== "cancelado" && (() => {
              const nombre = pedido.repartidor_nombre || pedido.repartidor_default?.nombre;
              const tel = pedido.repartidor_telefono || pedido.repartidor_default?.telefono;
              if (!nombre) return null;
              const sinAsignar = !pedido.repartidor_nombre;
              const telLimpio = (tel || "").replace(/\D/g, "");
              return (
                <View style={styles.repartidorBox}>
                  <View style={styles.repartidorRow}>
                    <Ionicons name="bicycle" size={14} color="#065F46" />
                    <Text style={styles.repartidor}>
                      {nombre}{sinAsignar ? " (de turno)" : ""}
                    </Text>
                  </View>
                  {tel && (
                    <View style={styles.repartidorActions}>
                      <Text style={styles.repartidorTel}>📱 {tel}</Text>
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`https://wa.me/52${telLimpio}`)}
                        style={[styles.repartidorBtn, { backgroundColor: "#D1FAE5" }]}
                      >
                        <Text style={[styles.repartidorBtnTxt, { color: "#065F46" }]}>WhatsApp</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${tel}`)}
                        style={[styles.repartidorBtn, { backgroundColor: "#DBEAFE" }]}
                      >
                        <Text style={[styles.repartidorBtnTxt, { color: "#1E40AF" }]}>Llamar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })()}

            <View style={styles.itemsBox}>
              {pedido.tipo === "envio" ? (
                <View>
                  <Text style={styles.itemLabel}>📦 Envío de paquete{pedido.peso_kg != null ? ` · ${Number(pedido.peso_kg).toFixed(1)} kg` : ""}</Text>
                  {pedido.descripcion_contenido && <Text style={styles.itemLabelFaint}>{pedido.descripcion_contenido}</Text>}
                  {pedido.recogida_nombre && <Text style={styles.itemLabelFaint}>Envía: {pedido.recogida_nombre}</Text>}
                  {pedido.direccion_recogida && <Text style={styles.itemLabelFaint} numberOfLines={2}>📍 {pedido.direccion_recogida.split("[")[0].trim()}</Text>}
                </View>
              ) : pedido.items.map((it) => (
                <View key={it.id} style={styles.itemRow}>
                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {it.cantidad} {it.unidad ?? ""} {it.producto_nombre}
                    {it.manual ? <Text style={styles.itemManualBadge}>  ✏️ Sustitución</Text> : null}
                  </Text>
                  <Text style={styles.itemValue}>${Number(it.subtotal).toFixed(2)}</Text>
                </View>
              ))}
              {servicio > 0 && (
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabelFaint}>Servicio Mercadito</Text>
                  <Text style={styles.itemValueFaint}>${servicio.toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.itemRow}>
                <Text style={styles.itemLabelFaint}>Envío</Text>
                <Text style={styles.itemValueFaint}>${Number(pedido.costo_envio).toFixed(2)}</Text>
              </View>
              {pedido.recargo_tarjeta > 0 && (
                <View style={styles.itemRow}>
                  <Text style={styles.itemLabelFaint}>Recargo tarjeta</Text>
                  <Text style={styles.itemValueFaint}>${Number(pedido.recargo_tarjeta).toFixed(2)}</Text>
                </View>
              )}
            </View>

            <Text style={styles.direccion} numberOfLines={2}>
              <Ionicons name="location-outline" size={12} /> {pedido.direccion_entrega}
            </Text>

            {/* Cliente puede editar (cantidades) y cancelar mientras esté
                pendiente. Sustituciones y cambio de precios siguen siendo
                feature del repartidor (modoCliente=true en el editor). */}
            {pedido.estado === "pendiente" && pedido.tipo !== "envio" && editandoPedido === pedido.id && (
              <View style={{ marginTop: 8 }}>
                <EditorPedidoRN
                  pedidoId={pedido.id}
                  items={pedido.items}
                  editadoPor={`cliente ${usuario?.nombre ?? ""}`}
                  modoCliente
                  onSaved={() => { setEditandoPedido(null); load(); }}
                  onCancel={() => setEditandoPedido(null)}
                />
              </View>
            )}

            {pedido.estado === "pendiente" && editandoPedido !== pedido.id && (
              <View style={styles.accionesPendiente}>
                {pedido.tipo !== "envio" && (
                  <TouchableOpacity
                    onPress={() => setEditandoPedido(pedido.id)}
                    style={[styles.accionBtn, styles.accionEditar]}
                  >
                    <Ionicons name="create-outline" size={14} color="#92400E" />
                    <Text style={styles.accionEditarTxt}>Editar</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => cancelarPedido(pedido.id)}
                  disabled={cancelando === pedido.id}
                  style={[styles.accionBtn, styles.accionCancelar]}
                >
                  <Ionicons name="close-circle-outline" size={14} color="#DC2626" />
                  <Text style={styles.accionCancelarTxt}>{cancelando === pedido.id ? "Cancelando…" : "Cancelar"}</Text>
                </TouchableOpacity>
              </View>
            )}

            {pedido.estado === "entregado" && pedido.foto_entrega && (
              <View style={styles.fotoEntregaBox}>
                <Text style={styles.fotoEntregaLabel}>📸 Foto al entregar</Text>
                <Image
                  source={{ uri: pedido.foto_entrega }}
                  style={styles.fotoEntregaImg}
                  resizeMode="cover"
                />
              </View>
            )}

            {(pedido.estado === "entregado" || pedido.estado === "cancelado") && (
              <TouchableOpacity onPress={() => volverAComprar(pedido)} style={styles.repedirBtn}>
                <Ionicons name="repeat" size={16} color="#C2680E" />
                <Text style={styles.repedirBtnTxt}>Volver a comprar</Text>
              </TouchableOpacity>
            )}

            {pedido.estado === "entregado" && (
              <CalificarRepartidorWidget pedido={pedido} onSaved={load} />
            )}
          </View>
        );
      }}
    />
    <TicketPedido visible={!!ticketPedido} pedido={ticketPedido} onClose={() => setTicketId(null)} />
    </View>
  );
}

function CalificarRepartidorWidget({ pedido, onSaved }: { pedido: Pedido; onSaved: () => void }) {
  const yaCalifico = pedido.repartidor_rating != null;
  const [editando, setEditando] = useState(false);
  const [rating, setRating] = useState<number | null>(pedido.repartidor_rating ?? null);
  const [comentario, setComentario] = useState(pedido.repartidor_review ?? "");
  const [saving, setSaving] = useState(false);

  async function guardar() {
    if (rating == null) {
      Alert.alert("Falta", "Toca las estrellas para calificar");
      return;
    }
    setSaving(true);
    try {
      await calificarPedido(pedido.id, rating, comentario.trim() || null);
      setEditando(false);
      onSaved();
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (yaCalifico && !editando) {
    return (
      <View style={cstyles.box}>
        <View style={cstyles.headerRow}>
          <Text style={cstyles.titulo}>Tu calificación</Text>
          <TouchableOpacity onPress={() => setEditando(true)}>
            <Text style={cstyles.editar}>Editar</Text>
          </TouchableOpacity>
        </View>
        <View style={cstyles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Text key={n} style={[cstyles.star, n > (pedido.repartidor_rating ?? 0) && cstyles.starOff]}>⭐</Text>
          ))}
          <Text style={cstyles.ratingNum}>{pedido.repartidor_rating}/5</Text>
        </View>
        {pedido.repartidor_review ? (
          <Text style={cstyles.review}>&ldquo;{pedido.repartidor_review}&rdquo;</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={cstyles.box}>
      <Text style={cstyles.pregunta}>
        ¿Cómo te trató {pedido.repartidor_nombre || "el repartidor"}?
      </Text>
      <View style={cstyles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => setRating(rating === n ? null : n)}
            style={cstyles.starButton}
          >
            <Text style={[cstyles.starBig, rating !== null && n <= rating ? null : cstyles.starOff]}>⭐</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        placeholderTextColor="#9C8B72"
        value={comentario}
        onChangeText={setComentario}
        placeholder="Cuéntanos cómo fue (opcional)…"
        multiline
        style={cstyles.input}
      />
      <View style={cstyles.actions}>
        {yaCalifico && (
          <TouchableOpacity
            style={cstyles.cancelar}
            onPress={() => { setEditando(false); setRating(pedido.repartidor_rating ?? null); setComentario(pedido.repartidor_review ?? ""); }}
          >
            <Text style={cstyles.cancelarTxt}>Cancelar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={cstyles.guardar} onPress={guardar} disabled={saving}>
          <Text style={cstyles.guardarTxt}>{saving ? "Guardando…" : yaCalifico ? "Actualizar" : "Enviar"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cstyles = StyleSheet.create({
  box: { backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#FCD34D" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  titulo: { fontSize: 10, fontWeight: "700", color: "#92400E", textTransform: "uppercase" },
  editar: { color: "#C2680E", fontSize: 11, fontWeight: "700", textDecorationLine: "underline" },
  pregunta: { fontSize: 12, color: "#1F2937", marginBottom: 6 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  star: { fontSize: 16 },
  starButton: { padding: 2 },
  starBig: { fontSize: 28 },
  starOff: { opacity: 0.25 },
  ratingNum: { fontSize: 12, fontWeight: "700", color: "#92400E", marginLeft: 4 },
  review: { fontSize: 12, color: "#1F2937", fontStyle: "italic" },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#FED7AA", borderRadius: 8, padding: 8, fontSize: 12, minHeight: 50, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 6, marginTop: 8 },
  cancelar: { flex: 1, backgroundColor: "#F3F4F6", paddingVertical: 8, borderRadius: 999, alignItems: "center" },
  cancelarTxt: { color: "#6B7280", fontWeight: "700", fontSize: 12 },
  guardar: { flex: 1, backgroundColor: "#F2A65A", paddingVertical: 8, borderRadius: 999, alignItems: "center" },
  guardarTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
});

const styles = StyleSheet.create({
  list: { padding: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 },
  badgesRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flexShrink: 1 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  total: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  meta: { fontSize: 11, color: "#8B7B69", flex: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  ticketBtn: { backgroundColor: "#FEF5EA", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  ticketBtnTxt: { color: "#C2680E", fontSize: 11, fontWeight: "700" },
  repartidorBox: { backgroundColor: "#FFF4E6", padding: 8, borderRadius: 10, marginBottom: 8 },
  repartidorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  repartidor: { fontSize: 13, color: "#9A3412", fontWeight: "700" },
  repartidorActions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  repartidorTel: { fontSize: 11, color: "#6B7280" },
  repartidorBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  repartidorBtnTxt: { fontSize: 11, fontWeight: "700" },
  repedirBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, paddingVertical: 8, backgroundColor: "#FEF5EA", borderRadius: 10 },
  repedirBtnTxt: { color: "#C2680E", fontWeight: "700", fontSize: 13 },
  accionesPendiente: { flexDirection: "row", gap: 8, marginTop: 10 },
  accionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 10 },
  accionEditar: { backgroundColor: "#FEF3C7" },
  accionEditarTxt: { color: "#92400E", fontWeight: "700", fontSize: 12 },
  accionCancelar: { backgroundColor: "#FEE2E2" },
  accionCancelarTxt: { color: "#DC2626", fontWeight: "700", fontSize: 12 },
  fotoEntregaBox: { marginTop: 10 },
  fotoEntregaLabel: { fontSize: 10, color: "#8B7B69", fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  fotoEntregaImg: { width: "100%", height: 160, borderRadius: 10, backgroundColor: "#F3EFE7" },
  trackingBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#DBEAFE", borderColor: "#BFDBFE", borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8 },
  trackingEmoji: { fontSize: 22 },
  trackingTitle: { fontSize: 12, fontWeight: "800", color: "#1E3A8A" },
  trackingMeta: { fontSize: 10, color: "#3B82F6", marginTop: 1 },
  trackingArrow: { fontSize: 18, color: "#1E3A8A", fontWeight: "700" },
  abrirMapsBtn: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "#DBEAFE" },
  abrirMapsTxt: { fontSize: 11, fontWeight: "700", color: "#1E3A8A" },
  itemsBox: { backgroundColor: "#F9FAFB", borderRadius: 8, padding: 10, marginTop: 4 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  itemLabel: { flex: 1, color: "#4B5563", fontSize: 13, paddingRight: 8 },
  itemManualBadge: { fontSize: 10, color: "#92400E", fontWeight: "700" },
  itemValue: { color: "#4B5563", fontSize: 13, fontWeight: "500" },
  itemLabelFaint: { flex: 1, color: "#8B7B69", fontSize: 12, paddingRight: 8 },
  itemValueFaint: { color: "#8B7B69", fontSize: 12 },
  direccion: { fontSize: 11, color: "#8B7B69", marginTop: 10 },
  screen: { flex: 1, backgroundColor: "#FFF7EB" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { fontSize: 18, color: "#1F2937", fontWeight: "600", marginTop: 12 },
  emptyHint: { color: "#8B7B69", marginTop: 6, textAlign: "center" },
});
