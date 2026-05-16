import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Alert, Linking, ScrollView, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../src/contexts/SessionContext";
import { listarPedidos, tomarPedido, cambiarEstado, parseDireccion, reportarUbicacion, apagarUbicacion, ordenarPorCercania, obtenerIngresosHoy } from "../../src/api/repartidor";
import IngresoManualModalRN from "../../src/components/IngresoManualModal";
import * as Location from "expo-location";
import type { Pedido, EstadoPedido } from "../../src/api/pedidos";
import PedidoDesgloseRN from "../../src/components/PedidoDesglose";
import EditorPedidoRN from "../../src/components/EditorPedidoRN";
import { pickImageAsDataUrl } from "../../src/lib/imagePicker";
import ScreenHeader from "../../src/components/ScreenHeader";

type Filtro = "todos" | "mios" | "sin_asignar" | "historial";

import { labelEstado, siguienteAccionLabel, type TipoPedido } from "../../src/lib/estadoPedido";

const ESTADO_COLORES: Record<EstadoPedido, { color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  pendiente: { color: "#92400E", bg: "#FEF3C7", icon: "hourglass-outline" },
  en_compra: { color: "#1E40AF", bg: "#DBEAFE", icon: "basket-outline" },
  en_camino: { color: "#6B21A8", bg: "#EDE9FE", icon: "bicycle-outline" },
  entregado: { color: "#065F46", bg: "#D1FAE5", icon: "checkmark-circle-outline" },
  cancelado: { color: "#991B1B", bg: "#FEE2E2", icon: "close-circle-outline" },
};

function infoEstado(estado: EstadoPedido, tipo?: TipoPedido | null) {
  const c = ESTADO_COLORES[estado];
  const icon = tipo === "envio" && estado === "en_compra" ? "cube-outline" : c.icon;
  return { label: labelEstado(estado, tipo), color: c.color, bg: c.bg, icon };
}

export default function RepartidorPedidosScreen() {
  const { usuario } = useSession();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [actuando, setActuando] = useState<string | null>(null);
  const [cancelarPedido, setCancelarPedido] = useState<string | null>(null);
  // ID del pedido cuya lista está editando el repartidor (para sustituciones).
  const [editandoPedido, setEditandoPedido] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const insets = useSafeAreaInsets();
  // Ubicación viva: si el repartidor la activa, la app reporta cada fix
  // al backend para que el cliente vea su posición.
  const [ubi, setUbi] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const [obteniendoUbi, setObteniendoUbi] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  // Registro de venta manual (pedidos por WhatsApp / mandados con cobro mental).
  const [ingresoModalAbierto, setIngresoModalAbierto] = useState(false);
  const [ingresosHoy, setIngresosHoy] = useState<{ total: number; count: number } | null>(null);

  async function refrescarIngresosHoy() {
    try {
      setIngresosHoy(await obtenerIngresosHoy());
    } catch { /* no-op */ }
  }

  useEffect(() => { refrescarIngresosHoy(); }, []);

  async function activarUbicacion() {
    setObteniendoUbi(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso", "Necesitamos acceso a tu ubicación para mejorar las rutas.");
        return;
      }
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setUbi({ lat: fix.coords.latitude, lng: fix.coords.longitude, ts: Date.now() });
      reportarUbicacion(fix.coords.latitude, fix.coords.longitude).catch(() => {});
      // Suscripción continua. distanceInterval permite ahorrar batería:
      // solo nos avisa si se movió ≥30 m.
      if (watchRef.current) watchRef.current.remove();
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 30, timeInterval: 30000 },
        (pos) => {
          setUbi({ lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() });
          reportarUbicacion(pos.coords.latitude, pos.coords.longitude).catch(() => {});
        }
      );
    } catch (e) {
      Alert.alert("Error", (e as { message?: string })?.message ?? "No se pudo obtener ubicación");
    } finally {
      setObteniendoUbi(false);
    }
  }

  async function detenerUbicacion() {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    setUbi(null);
    apagarUbicacion().catch(() => {});
  }

  useEffect(() => {
    return () => { if (watchRef.current) watchRef.current.remove(); };
  }, []);

  const MOTIVOS_CANCEL = [
    "Puesto cerrado",
    "Producto no disponible",
    "Cliente no contesta",
    "Dirección incorrecta",
    "Otro",
  ];

  const load = useCallback(async () => {
    try {
      const data = await listarPedidos();
      setPedidos(data);
    } catch (e) {
      console.warn(e);
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

  const filtered = useMemo(() => {
    const uid = usuario?.id;
    const esActivo = (estado: EstadoPedido) => estado !== "entregado" && estado !== "cancelado";
    let list = [...pedidos];
    if (filtro === "historial") {
      list = list.filter((p) => !esActivo(p.estado));
    } else if (filtro === "mios") {
      list = list.filter((p) => esActivo(p.estado) && ("repartidor_id" in p ? (p as unknown as { repartidor_id: string }).repartidor_id === uid : false));
    } else if (filtro === "sin_asignar") {
      list = list.filter((p) => p.estado === "pendiente" && !(p as unknown as { repartidor_id: string | null }).repartidor_id);
    } else {
      // "todos" = solo activos
      list = list.filter((p) => esActivo(p.estado));
    }
    // Historial: más recientes arriba. Activos: por prioridad de estado, dentro del grupo más recientes arriba.
    if (filtro === "historial") {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      const prioridad: Record<EstadoPedido, number> = {
        pendiente: 0, en_compra: 1, en_camino: 2, entregado: 3, cancelado: 4,
      };
      list.sort((a, b) => {
        const d = prioridad[a.estado] - prioridad[b.estado];
        if (d !== 0) return d;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return list;
  }, [pedidos, filtro, usuario]);

  async function accionTomar(pedido: Pedido) {
    if (!usuario) return;
    setActuando(pedido.id);
    try {
      await tomarPedido(pedido.id, usuario.id);
      await load();
    } catch (e) {
      Alert.alert("No se pudo tomar", (e as { error?: string })?.error ?? "Error");
    } finally {
      setActuando(null);
    }
  }

  async function accionEstado(pedido: Pedido, estado: EstadoPedido) {
    // Para cancelar, primero pedimos motivo con el modal.
    if (estado === "cancelado") {
      setCancelarPedido(pedido.id);
      return;
    }
    setActuando(pedido.id);
    try {
      // Al marcar 'entregado' capturamos GPS (si B2B, recalcula costo)
      // + foto opcional como prueba de entrega (refuerza confianza).
      const opts: { entrega_lat?: number; entrega_lng?: number; foto_entrega?: string } = {};
      const esB2B = pedido.tipo === "envio" && pedido.solicitado_por_tienda_id != null;
      if (estado === "entregado" && esB2B) {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          let granted = status === "granted";
          if (!granted) {
            const r = await Location.requestForegroundPermissionsAsync();
            granted = r.status === "granted";
          }
          if (granted) {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            opts.entrega_lat = loc.coords.latitude;
            opts.entrega_lng = loc.coords.longitude;
          }
        } catch {
          // Sin GPS no rompe — el backend deja el costo estimado.
        }
      }
      // Foto de entrega — preguntar antes de confirmar. Si el usuario
      // da skip, igual marcamos entregado sin foto (legacy compatible).
      if (estado === "entregado") {
        const foto = await new Promise<string | null>((resolve) => {
          Alert.alert(
            "Foto de entrega",
            "¿Quieres tomar foto del paquete entregado? (recomendado)",
            [
              { text: "Sin foto", style: "cancel", onPress: () => resolve(null) },
              { text: "Tomar foto", onPress: async () => {
                try {
                  const f = await pickImageAsDataUrl("camera");
                  resolve(f);
                } catch { resolve(null); }
              } },
            ],
            { cancelable: false }
          );
        });
        if (foto) opts.foto_entrega = foto;
      }
      const res = await cambiarEstado(pedido.id, estado, opts);
      if (res.costo_envio_actualizado != null) {
        Alert.alert(
          "Entregado",
          `Costo del envío recalculado con tu ubicación: $${res.costo_envio_actualizado.toFixed(2)}`,
          [{ text: "OK" }]
        );
      }
      await load();
    } catch (e) {
      Alert.alert("No se pudo actualizar", (e as { error?: string })?.error ?? "Error");
    } finally {
      setActuando(null);
    }
  }

  async function confirmarCancelacion(motivo: string) {
    if (!cancelarPedido) return;
    const pedidoId = cancelarPedido;
    setCancelarPedido(null);
    setActuando(pedidoId);
    try {
      await cambiarEstado(pedidoId, "cancelado", { motivo_cancelacion: motivo });
      await load();
    } catch (e) {
      Alert.alert("No se pudo cancelar", (e as { error?: string })?.error ?? "Error");
    } finally {
      setActuando(null);
    }
  }

  function abrirMapa(pedido: Pedido) {
    const { texto, lat, lng } = parseDireccion(pedido.direccion_entrega);
    if (!lat || !lng) {
      // Sin coords del cliente caemos a search por dirección.
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`);
      return;
    }
    // Tiendas únicas con coords. Si hay ubi propia las ordenamos por NN.
    const vistos = new Set<string>();
    let paradas: { lat: number; lng: number; nombre: string }[] = [];
    for (const it of pedido.items) {
      if (vistos.has(it.puesto_id)) continue;
      vistos.add(it.puesto_id);
      const la = it.puesto_lat != null ? Number(it.puesto_lat) : null;
      const ln = it.puesto_lng != null ? Number(it.puesto_lng) : null;
      if (la == null || ln == null || Number.isNaN(la) || Number.isNaN(ln)) continue;
      paradas.push({ lat: la, lng: ln, nombre: it.puesto_nombre || it.puesto_id });
    }
    if (ubi && paradas.length > 0) paradas = ordenarPorCercania(ubi, paradas);
    const params = ["api=1", `destination=${lat},${lng}`, "travelmode=driving"];
    if (ubi) params.push(`origin=${ubi.lat},${ubi.lng}`);
    if (paradas.length > 0) {
      const wp = paradas.map((p) => `${p.lat},${p.lng}`).join("|");
      params.push(`waypoints=${encodeURIComponent(wp)}`);
    }
    Linking.openURL(`https://www.google.com/maps/dir/?${params.join("&")}`);
  }

  function abrirMapaTienda(lat: number | null | undefined, lng: number | null | undefined, ubicacion: string | undefined) {
    if (lat != null && lng != null) {
      const params = ["api=1", `destination=${lat},${lng}`, "travelmode=driving"];
      if (ubi) params.push(`origin=${ubi.lat},${ubi.lng}`);
      Linking.openURL(`https://www.google.com/maps/dir/?${params.join("&")}`);
      return;
    }
    if (ubicacion) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ubicacion)}`);
    }
  }

  // Promedio de calificación del repartidor.
  const misRatings = useMemo(() => {
    const calificados = pedidos.filter(
      (p) => (p.repartidor_id ?? null) === (usuario?.id ?? null)
        && p.estado === "entregado"
        && p.repartidor_rating != null
    );
    if (calificados.length === 0) return null;
    const total = calificados.reduce((s, p) => s + (Number(p.repartidor_rating) || 0), 0);
    return { promedio: total / calificados.length, cuenta: calificados.length };
  }, [pedidos, usuario]);

  function llamarCliente(telefono: string) {
    Linking.openURL(`tel:${telefono}`);
  }

  function whatsappCliente(telefono: string) {
    Linking.openURL(`https://wa.me/52${telefono.replace(/\D/g, "")}`);
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Pedidos" />
        <View style={styles.center}><ActivityIndicator size="large" color="#F2A65A" /></View>
      </View>
    );
  }

  // Tiene pedidos activos asignados a él que requieren tracking visible
  // al cliente (en_compra o en_camino) y NO está compartiendo ubicación.
  // Si esto pasa, el cliente ve "esperando repartidor" sin mapa — friction
  // alta. Mostramos un banner amarillo prominente para que Fer lo prenda.
  const hayActivosPropios = pedidos.some(
    (p) => (p.estado === "en_compra" || p.estado === "en_camino") &&
      p.repartidor_id === usuario?.id
  );
  const necesitaActivarUbi = hayActivosPropios && !ubi;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Pedidos" subtitle="Tus rutas y pedidos disponibles" />
      {necesitaActivarUbi && (
        <TouchableOpacity onPress={activarUbicacion} style={styles.gpsAlerta} activeOpacity={0.85}>
          <Ionicons name="alert-circle" size={20} color="#92400E" />
          <View style={{ flex: 1 }}>
            <Text style={styles.gpsAlertaTxt}>Tus clientes no pueden verte</Text>
            <Text style={styles.gpsAlertaSub}>Activa tu ubicación para que vean dónde vas y cuánto falta.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#92400E" />
        </TouchableOpacity>
      )}
      {/* Toggle ubicación + chip de calificaciones */}
      <View style={styles.topBar}>
        {ubi ? (
          <View style={styles.ubiOn}>
            <Ionicons name="navigate" size={14} color="#065F46" />
            <Text style={styles.ubiTxt}>Compartiendo · hace {Math.max(0, Math.round((Date.now() - ubi.ts) / 60000))} min</Text>
            <TouchableOpacity onPress={detenerUbicacion} style={styles.ubiOff}>
              <Text style={styles.ubiOffTxt}>Apagar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={activarUbicacion} disabled={obteniendoUbi} style={styles.ubiActivar}>
            <Ionicons name="locate-outline" size={14} color="#9A3412" />
            <Text style={styles.ubiActivarTxt}>{obteniendoUbi ? "Obteniendo…" : "Activar ubicación · mejora rutas"}</Text>
          </TouchableOpacity>
        )}
        {misRatings && (
          <View style={styles.ratingChip}>
            <Text style={styles.ratingChipTxt}>⭐ {misRatings.promedio.toFixed(1)} · {misRatings.cuenta}</Text>
          </View>
        )}
      </View>

      {/* Filtro */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slider} contentContainerStyle={styles.filtros}>
        <FiltroChip label="Todos" active={filtro === "todos"} onPress={() => setFiltro("todos")} count={pedidos.filter(p => p.estado !== "entregado" && p.estado !== "cancelado").length} />
        <FiltroChip label="Míos" active={filtro === "mios"} onPress={() => setFiltro("mios")} />
        <FiltroChip label="Sin asignar" active={filtro === "sin_asignar"} onPress={() => setFiltro("sin_asignar")} />
        <FiltroChip label="Historial" active={filtro === "historial"} onPress={() => setFiltro("historial")} count={pedidos.filter(p => p.estado === "entregado" || p.estado === "cancelado").length} />
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="happy-outline" size={48} color="#D4C9B8" />
            <Text style={styles.emptyText}>No hay pedidos activos</Text>
          </View>
        }
        renderItem={({ item: pedido }) => {
          const info = infoEstado(pedido.estado, pedido.tipo);
          const miPedido = (pedido as unknown as { repartidor_id: string | null }).repartidor_id === usuario?.id;
          const sinAsignar = !(pedido as unknown as { repartidor_id: string | null }).repartidor_id;
          const { texto: direccionTexto } = parseDireccion(pedido.direccion_entrega);

          return (
            <View style={styles.card}>
              <View style={styles.header}>
                <View style={[styles.badge, { backgroundColor: info.bg }]}>
                  <Ionicons name={info.icon} size={14} color={info.color} />
                  <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
                </View>
                <Text style={styles.total}>${pedido.total.toFixed(2)}</Text>
              </View>

              <Text style={styles.cliente}>{pedido.cliente_nombre}</Text>
              <Text style={styles.meta}>
                {new Date(pedido.created_at).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })} · #{pedido.id.slice(0, 8).toUpperCase()}
              </Text>

              <View style={styles.contactRow}>
                <TouchableOpacity style={styles.contactButton} onPress={() => llamarCliente(pedido.cliente_telefono)}>
                  <Ionicons name="call-outline" size={16} color="#1F2937" />
                  <Text style={styles.contactText}>Llamar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.contactButton, styles.whatsappButton]} onPress={() => whatsappCliente(pedido.cliente_telefono)}>
                  <Ionicons name="logo-whatsapp" size={16} color="#059669" />
                  <Text style={[styles.contactText, { color: "#059669" }]}>WhatsApp</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.direccionRow} onPress={() => abrirMapa(pedido)}>
                <Ionicons name="location-outline" size={16} color="#1F2937" />
                <Text style={styles.direccionText} numberOfLines={2}>{direccionTexto}</Text>
                <Ionicons name="chevron-forward" size={14} color="#8B7B69" />
              </TouchableOpacity>

              {pedido.tipo === "envio" ? (
                <View style={styles.envioBox}>
                  {pedido.monto_mandado != null || pedido.ida_vuelta ? (
                    <Text style={styles.envioBoxTitle}>🛍️ Mandado{pedido.ida_vuelta ? " · Ida y vuelta ↔️" : ""}</Text>
                  ) : (
                    <Text style={styles.envioBoxTitle}>📦 Envío de paquete</Text>
                  )}
                  {pedido.peso_kg != null && (
                    <Text style={styles.envioBoxLine}>Peso: <Text style={{ fontWeight: "700" }}>{Number(pedido.peso_kg).toFixed(1)} kg</Text></Text>
                  )}
                  <Text style={styles.envioBoxLine}>{pedido.monto_mandado != null ? "Hacer:" : "Contenido:"} <Text style={{ fontWeight: "600" }}>{pedido.descripcion_contenido || "—"}</Text></Text>
                  {pedido.monto_mandado != null && Number(pedido.monto_mandado) > 0 && (
                    <Text style={[styles.envioBoxLine, { color: "#92400E", fontWeight: "700" }]}>
                      💸 Adelantar ${Number(pedido.monto_mandado).toFixed(2)} y cobrar al entregar
                    </Text>
                  )}
                  <View style={styles.envioBoxDivider} />
                  <Text style={styles.envioBoxSection}>🏠 Recoger en</Text>
                  <Text style={styles.envioBoxLine}>{pedido.recogida_nombre} {pedido.recogida_telefono && (
                    <Text onPress={() => Linking.openURL(`tel:${pedido.recogida_telefono}`)} style={{ color: "#1E40AF" }}>· {pedido.recogida_telefono}</Text>
                  )}</Text>
                  <Text style={styles.envioBoxLineFaint} numberOfLines={2}>{pedido.direccion_recogida?.split("[")[0].trim()}</Text>
                  {pedido.recogida_lat != null && pedido.recogida_lng != null && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${pedido.recogida_lat},${pedido.recogida_lng}&travelmode=driving${ubi ? `&origin=${ubi.lat},${ubi.lng}` : ""}`)}
                      style={styles.envioMapaBtn}
                    >
                      <Text style={styles.envioMapaBtnTxt}>📍 Mapa a recogida</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.envioBoxDivider} />
                  <Text style={styles.envioBoxSection}>🎯 Entregar a</Text>
                  <Text style={styles.envioBoxLine}>{pedido.cliente_nombre} {pedido.cliente_telefono && (
                    <Text onPress={() => Linking.openURL(`tel:${pedido.cliente_telefono}`)} style={{ color: "#1E40AF" }}>· {pedido.cliente_telefono}</Text>
                  )}</Text>
                  {(() => {
                    const { texto: dirTexto, lat: dirLat, lng: dirLng } = parseDireccion(pedido.direccion_entrega);
                    // Si hay coords -> navegar al punto. Si no, buscar
                    // el texto en Maps (flow B2B donde la tienda sólo
                    // escribió la dirección sin marcar pin).
                    const mapsUrl = dirLat != null && dirLng != null
                      ? `https://www.google.com/maps/dir/?api=1&destination=${dirLat},${dirLng}`
                      : dirTexto
                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dirTexto)}`
                        : null;
                    return (
                      <>
                        {dirTexto ? <Text style={styles.envioBoxLine}>{dirTexto}</Text> : null}
                        {mapsUrl && (
                          <TouchableOpacity
                            onPress={() => Linking.openURL(mapsUrl)}
                            style={[styles.envioMapaBtn, { backgroundColor: "#FEF3C7" }]}
                          >
                            <Text style={[styles.envioMapaBtnTxt, { color: "#92400E" }]}>📍 Buscar en mapa</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    );
                  })()}
                </View>
              ) : editandoPedido === pedido.id ? (
                <View style={{ marginTop: 10 }}>
                  <EditorPedidoRN
                    pedidoId={pedido.id}
                    items={pedido.items}
                    editadoPor={`repartidor ${usuario?.nombre ?? usuario?.id ?? ""}`}
                    onSaved={() => {
                      setEditandoPedido(null);
                      load();
                    }}
                    onCancel={() => setEditandoPedido(null)}
                  />
                </View>
              ) : (
              <View style={styles.items}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={styles.itemsTitle}>Productos</Text>
                  {/* "Editar lista": solo el repartidor del pedido (o nadie aún) durante pendiente/en_compra */}
                  {(miPedido || sinAsignar) && (pedido.estado === "pendiente" || pedido.estado === "en_compra") && (
                    <TouchableOpacity onPress={() => setEditandoPedido(pedido.id)} style={styles.editarChip}>
                      <Ionicons name="pencil-outline" size={11} color="#92400E" />
                      <Text style={styles.editarChipTxt}>Editar lista</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {(() => {
                  // Agrupar por tienda y ordenar por cercanía si hay ubi propia.
                  const porTienda = new Map<string, { nombre: string; lat: number | null; lng: number | null; ubicacion: string | undefined; items: typeof pedido.items }>();
                  for (const it of pedido.items) {
                    if (!porTienda.has(it.puesto_id)) {
                      porTienda.set(it.puesto_id, {
                        nombre: it.puesto_nombre || it.puesto_id,
                        lat: it.puesto_lat != null ? Number(it.puesto_lat) : null,
                        lng: it.puesto_lng != null ? Number(it.puesto_lng) : null,
                        ubicacion: it.puesto_ubicacion,
                        items: [],
                      });
                    }
                    porTienda.get(it.puesto_id)!.items.push(it);
                  }
                  let entradas = Array.from(porTienda.entries());
                  if (ubi) {
                    const conCoords = entradas.filter(([, t]) => t.lat != null && t.lng != null);
                    const sinCoords = entradas.filter(([, t]) => t.lat == null || t.lng == null);
                    const ordenado = ordenarPorCercania(
                      ubi,
                      conCoords.map(([id, t]) => ({ id, t, lat: t.lat as number, lng: t.lng as number }))
                    );
                    entradas = [
                      ...ordenado.map((x) => [x.id, x.t] as typeof entradas[number]),
                      ...sinCoords,
                    ];
                  }
                  return entradas.map(([id, tienda], idx) => (
                    <View key={id} style={styles.tiendaBox}>
                      <View style={styles.tiendaHeader}>
                        <Text style={styles.tiendaNombre} numberOfLines={2}>
                          <Text style={styles.tiendaNum}>{idx + 1}</Text>  🏪 {tienda.nombre}
                        </Text>
                        {(tienda.lat != null || tienda.ubicacion) && (
                          <TouchableOpacity
                            onPress={() => abrirMapaTienda(tienda.lat, tienda.lng, tienda.ubicacion)}
                            style={styles.mapaChip}
                          >
                            <Text style={styles.mapaChipTxt}>📍 Mapa</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      {tienda.items.map((it) => (
                        <View key={it.id} style={styles.itemRow}>
                          <Text style={styles.itemLabel} numberOfLines={2}>
                            {it.cantidad} {it.unidad ?? ""} {it.producto_nombre}
                            {it.manual ? <Text style={styles.itemManualBadge}>  ✏️ Sustitución</Text> : null}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ));
                })()}
              </View>
              )}

              {/* Desglose del pedido para aclaraciones al cliente */}
              <View style={{ marginTop: 8 }}>
                <PedidoDesgloseRN pedido={pedido} />
              </View>

              {pedido.notas ? (
                <View style={styles.notaBox}>
                  <Ionicons name="alert-circle-outline" size={14} color="#92400E" />
                  <Text style={styles.notaText}>{pedido.notas}</Text>
                </View>
              ) : null}

              {/* Calificación del cliente (solo en pedidos propios entregados). */}
              {pedido.estado === "entregado" && miPedido && (pedido.repartidor_rating != null || pedido.repartidor_review) && (
                <View style={styles.calificacionBox}>
                  <Text style={styles.calificacionTitulo}>Calificación del cliente</Text>
                  {pedido.repartidor_rating != null && (
                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Text
                          key={n}
                          style={[styles.star, n > (pedido.repartidor_rating ?? 0) && styles.starOff]}
                        >⭐</Text>
                      ))}
                      <Text style={styles.ratingNum}>{pedido.repartidor_rating}/5</Text>
                    </View>
                  )}
                  {pedido.repartidor_review ? (
                    <Text style={styles.calificacionTexto}>&ldquo;{pedido.repartidor_review}&rdquo;</Text>
                  ) : null}
                </View>
              )}

              {/* Acciones */}
              {pedido.estado === "pendiente" && sinAsignar && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionPrimary]}
                  onPress={() => accionTomar(pedido)}
                  disabled={actuando === pedido.id}
                >
                  <Ionicons name="hand-right-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>{actuando === pedido.id ? "Tomando…" : "Tomar pedido"}</Text>
                </TouchableOpacity>
              )}
              {pedido.estado === "en_compra" && miPedido && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionPrimary]}
                  onPress={() => accionEstado(pedido, "en_camino")}
                  disabled={actuando === pedido.id}
                >
                  <Ionicons name="bicycle-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>{siguienteAccionLabel("en_compra", pedido.tipo) ?? "Salir a entregar"}</Text>
                </TouchableOpacity>
              )}
              {pedido.estado === "en_camino" && miPedido && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionSuccess]}
                  onPress={() => accionEstado(pedido, "entregado")}
                  disabled={actuando === pedido.id}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>{siguienteAccionLabel("en_camino", pedido.tipo) ?? "Marcar entregado"}</Text>
                </TouchableOpacity>
              )}
              {/* Cancelar: solo pendiente o en_compra, se abre modal con motivos */}
              {(pedido.estado === "pendiente" || pedido.estado === "en_compra") && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => accionEstado(pedido, "cancelado")}
                  disabled={actuando === pedido.id}
                >
                  <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
                  <Text style={styles.cancelText}>Cancelar pedido</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Modal: motivo de cancelación. paddingBottom dinámico con insets para
          que el último botón no quede debajo de la barra de gestos Android. */}
      <Modal visible={!!cancelarPedido} transparent animationType="fade" onRequestClose={() => setCancelarPedido(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
            <Text style={styles.modalTitulo}>¿Por qué se cancela?</Text>
            <Text style={styles.modalHint}>Esto queda registrado y ayuda a mejorar el servicio.</Text>
            {MOTIVOS_CANCEL.map((m) => (
              <TouchableOpacity key={m} style={styles.motivoBtn} onPress={() => confirmarCancelacion(m)}>
                <Text style={styles.motivoTxt}>{m}</Text>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setCancelarPedido(null)}>
              <Text style={styles.modalCancelTxt}>Volver</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FAB venta manual (pedidos por WhatsApp con cobro mental).
          Chip arriba refuerza que las capturas están sumando. */}
      <View style={[styles.fabWrap, { bottom: 16 + insets.bottom }]} pointerEvents="box-none">
        {ingresosHoy && ingresosHoy.count > 0 && (
          <View style={styles.ingresoHoyChip}>
            <Text style={styles.ingresoHoyTxt}>💰 Hoy: ${ingresosHoy.total.toFixed(0)} · {ingresosHoy.count}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.fabBtn} onPress={() => setIngresoModalAbierto(true)} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={styles.fabBtnTxt}>Venta manual</Text>
        </TouchableOpacity>
      </View>

      <IngresoManualModalRN
        abierto={ingresoModalAbierto}
        onClose={() => setIngresoModalAbierto(false)}
        onGuardado={refrescarIngresosHoy}
      />
    </View>
  );
}

function FiltroChip({ label, active, onPress, count }: { label: string; active: boolean; onPress: () => void; count?: number }) {
  return (
    <TouchableOpacity style={[styles.filtroChip, active && styles.filtroChipActive]} onPress={onPress}>
      <Text style={[styles.filtroText, active && styles.filtroTextActive]}>
        {label}{count != null ? ` (${count})` : ""}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  envioBox: { backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, marginTop: 6, borderWidth: 1, borderColor: "#FCD34D" },
  envioBoxTitle: { fontSize: 12, fontWeight: "700", color: "#92400E", marginBottom: 4, textTransform: "uppercase" },
  envioBoxSection: { fontSize: 11, fontWeight: "700", color: "#92400E", marginBottom: 2, textTransform: "uppercase" },
  envioBoxLine: { fontSize: 13, color: "#1F2937", marginVertical: 1 },
  envioBoxLineFaint: { fontSize: 12, color: "#6B7280", marginVertical: 1 },
  envioBoxDivider: { height: 1, backgroundColor: "#FCD34D", marginVertical: 6 },
  envioMapaBtn: { alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#FFEDD5" },
  envioMapaBtnTxt: { fontSize: 11, color: "#9A3412", fontWeight: "700" },
  slider: { flexGrow: 0, flexShrink: 0, maxHeight: 58 },
  filtros: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filtroChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  filtroChipActive: { backgroundColor: "#F2A65A", borderColor: "#F2A65A" },
  filtroText: { fontSize: 12, color: "#8B7B69", fontWeight: "600", lineHeight: 15, includeFontPadding: false },
  filtroTextActive: { color: "#fff" },
  list: { padding: 12, paddingTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  total: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  cliente: { fontSize: 16, fontWeight: "600", color: "#1F2937", marginTop: 6 },
  meta: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  contactRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  contactButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, backgroundColor: "#F3EFE7", borderRadius: 8 },
  whatsappButton: { backgroundColor: "#DCFCE7" },
  contactText: { fontSize: 13, color: "#1F2937", fontWeight: "500" },
  direccionRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFF7EB", borderRadius: 8, padding: 10, marginTop: 8 },
  direccionText: { flex: 1, fontSize: 13, color: "#1F2937" },
  items: { backgroundColor: "#F9FAFB", borderRadius: 8, padding: 10, marginTop: 10 },
  itemsTitle: { fontSize: 11, fontWeight: "700", color: "#8B7B69", marginBottom: 4 },
  itemRow: { paddingVertical: 3 },
  itemLabel: { fontSize: 13, color: "#1F2937" },
  itemManualBadge: { fontSize: 10, color: "#92400E", fontWeight: "700" },
  editarChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: "#FEF3C7", borderRadius: 999 },
  editarChipTxt: { fontSize: 10, color: "#92400E", fontWeight: "700" },
  itemTienda: { fontSize: 11, color: "#8B7B69" },
  notaBox: { flexDirection: "row", gap: 6, alignItems: "flex-start", backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginTop: 8 },
  notaText: { flex: 1, fontSize: 12, color: "#92400E" },
  actionButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 999, marginTop: 10 },
  actionPrimary: { backgroundColor: "#F2A65A" },
  actionSuccess: { backgroundColor: "#059669" },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  empty: { alignItems: "center", marginTop: 40 },
  emptyText: { color: "#8B7B69", marginTop: 10 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitulo: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 },
  modalHint: { fontSize: 12, color: "#6B7280", marginBottom: 16 },
  motivoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#F9FAFB", marginBottom: 8 },
  motivoTxt: { fontSize: 15, color: "#111827", fontWeight: "500" },
  modalCancel: { marginTop: 8, paddingVertical: 12, alignItems: "center" },
  modalCancelTxt: { color: "#6B7280", fontSize: 14 },
  cancelButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginTop: 6 },
  cancelText: { color: "#DC2626", fontSize: 13, fontWeight: "600" },

  topBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F3EFE7", flexWrap: "wrap" },
  ubiActivar: { flex: 1, minWidth: 200, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: "#FEF5EA" },
  ubiActivarTxt: { fontSize: 12, fontWeight: "700", color: "#9A3412", flexShrink: 1 },
  gpsAlerta: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FEF3C7", borderBottomWidth: 1, borderBottomColor: "#FDE68A", paddingHorizontal: 14, paddingVertical: 10 },
  gpsAlertaTxt: { fontSize: 13, fontWeight: "800", color: "#92400E" },
  gpsAlertaSub: { fontSize: 11, color: "#92400E", marginTop: 1 },
  ubiOn: { flex: 1, minWidth: 200, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: "#D1FAE5" },
  ubiTxt: { flex: 1, fontSize: 11, color: "#065F46", fontWeight: "600" },
  ubiOff: { backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  ubiOffTxt: { color: "#991B1B", fontSize: 11, fontWeight: "700" },
  ratingChip: { backgroundColor: "#FCD34D", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  ratingChipTxt: { color: "#92400E", fontSize: 12, fontWeight: "700" },

  tiendaBox: { marginTop: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  tiendaHeader: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "space-between", flexWrap: "wrap" },
  tiendaNombre: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "700", color: "#9A3412" },
  tiendaNum: { backgroundColor: "#FED7AA", color: "#9A3412", fontSize: 11, paddingHorizontal: 6, borderRadius: 999, overflow: "hidden" },
  mapaChip: { backgroundColor: "#FFE4D2", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  mapaChipTxt: { color: "#9A3412", fontSize: 11, fontWeight: "700" },

  calificacionBox: { backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#FCD34D" },
  calificacionTitulo: { fontSize: 10, fontWeight: "700", color: "#92400E", textTransform: "uppercase", marginBottom: 4 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 4 },
  star: { fontSize: 16 },
  starOff: { opacity: 0.25 },
  ratingNum: { fontSize: 12, fontWeight: "700", color: "#92400E", marginLeft: 4 },
  calificacionTexto: { fontSize: 12, color: "#1F2937", fontStyle: "italic" },

  fabWrap: { position: "absolute", right: 16, alignItems: "flex-end", gap: 6 },
  ingresoHoyChip: { backgroundColor: "#fff", borderColor: "#E5E7EB", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  ingresoHoyTxt: { fontSize: 11, fontWeight: "700", color: "#1F2937" },
  fabBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F2A65A", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, elevation: 6 },
  fabBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
