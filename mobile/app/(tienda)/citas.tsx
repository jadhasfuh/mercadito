import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { theme } from "../../src/lib/theme";
import { useSession } from "../../src/contexts/SessionContext";
import { listarCitas, actualizarCita, eliminarCita, limpiarCitas, ajustarMontoCita, type Cita, type EstadoCita } from "../../src/api/citas";
import { obtenerMiTienda, activarReservas } from "../../src/api/tienda";
import { quitarDeCola } from "../../src/lib/offlineCitas";
import { fmtCitaCorta, ESTADO_CITA } from "../../src/lib/citasFmt";
import ScreenHeader from "../../src/components/ScreenHeader";

type Filtro = "hoy" | "proximas" | "historial";

function esHoy(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function TiendaCitasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { usuario } = useSession();
  const [citas, setCitas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("hoy");
  const [q, setQ] = useState("");
  // Ajuste de monto cobrado en una cita completada.
  const [ajustando, setAjustando] = useState<Cita | null>(null);
  const [montoInput, setMontoInput] = useState("");
  // ¿Reservas activas? (tipo servicios|ambos). false = negocio de catálogo que
  // aún no las activó → mostramos tarjeta de activación. null = cargando.
  const [reservasActiva, setReservasActiva] = useState<boolean | null>(null);

  const load = useCallback(() => {
    listarCitas()
      .then(setCitas)
      .catch(() => setCitas([]))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Saber si el negocio ya tiene Reservas activas (tipo servicios|ambos).
  useFocusEffect(
    useCallback(() => {
      if (!usuario?.puesto_id) return;
      obtenerMiTienda(usuario.puesto_id)
        .then((p) => setReservasActiva(!!p && (p.tipo === "servicios" || p.tipo === "ambos")))
        .catch(() => setReservasActiva(true));
    }, [usuario?.puesto_id])
  );

  async function activar() {
    try {
      await activarReservas();
      setReservasActiva(true);
      load();
    } catch {
      Alert.alert("Ups", "No se pudo activar Reservas. Intenta de nuevo.");
    }
  }

  async function cambiar(c: Cita, estado: EstadoCita) {
    try {
      await actualizarCita(c.id, estado);
      load();
    } catch {
      Alert.alert("Ups", "No se pudo actualizar la reserva.");
    }
  }

  function eliminar(c: Cita) {
    Alert.alert("Eliminar reserva", `¿Eliminar esta reserva de ${c.cliente_nombre}? No se puede deshacer.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await eliminarCita(c.id);
            load();
          } catch {
            Alert.alert("Ups", "No se pudo eliminar.");
          }
        },
      },
    ]);
  }

  function limpiar() {
    Alert.alert("Limpiar historial", "Se borrarán todas las reservas canceladas y de 'no asistió'. Las completadas se conservan (cuentan en tus ventas).", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Limpiar",
        style: "destructive",
        onPress: async () => {
          try {
            const r = await limpiarCitas();
            load();
            Alert.alert("Listo", `${r.borradas} reserva${r.borradas === 1 ? "" : "s"} eliminada${r.borradas === 1 ? "" : "s"}.`);
          } catch {
            Alert.alert("Ups", "No se pudo limpiar.");
          }
        },
      },
    ]);
  }

  function abrirAjuste(c: Cita) {
    const actual = c.monto_cobrado ?? c.precio;
    setMontoInput(actual != null ? String(Number(actual)) : "");
    setAjustando(c);
  }
  async function guardarMonto() {
    if (!ajustando) return;
    const limpio = montoInput.replace(/[^0-9.]/g, "");
    const monto = limpio === "" ? null : Number(limpio);
    if (monto !== null && (isNaN(monto) || monto < 0)) {
      Alert.alert("Monto inválido", "Escribe una cantidad válida.");
      return;
    }
    try {
      await ajustarMontoCita(ajustando.id, monto);
      setAjustando(null);
      load();
    } catch {
      Alert.alert("Ups", "No se pudo guardar el monto.");
    }
  }

  const ahora = Date.now();
  // "Activa" = aún por atender (pendiente/confirmada). Completada/cancelada/
  // no_show van a Historial, nunca a Hoy/Próximas.
  const esActiva = (e: EstadoCita) => e === "pendiente" || e === "confirmada";
  const needle = q.trim().toLowerCase();
  const visibles = citas
    .filter((c) => {
      if (needle && !(c.cliente_nombre.toLowerCase().includes(needle) || c.cliente_telefono.includes(needle))) return false;
      const t = new Date(c.inicio).getTime();
      if (filtro === "hoy") return esHoy(c.inicio) && esActiva(c.estado);
      if (filtro === "proximas") return t > ahora && esActiva(c.estado);
      // Historial: todo lo que ya no está activo, o cuya hora ya pasó.
      return !esActiva(c.estado) || t < ahora;
    })
    .sort((a, b) =>
      filtro === "historial"
        ? new Date(b.inicio).getTime() - new Date(a.inicio).getTime()
        : new Date(a.inicio).getTime() - new Date(b.inicio).getTime()
    );

  const proximasCount = citas.filter(
    (c) => new Date(c.inicio).getTime() > ahora && esActiva(c.estado)
  ).length;

  if (reservasActiva === false) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Reservas" subtitle="Actívalas para tu negocio" bg={theme.colors.serv} />
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={styles.activarCard}>
            <Text style={{ fontSize: 40, textAlign: "center" }}>📅</Text>
            <Text style={styles.activarTitle}>Activa Reservas para tu negocio</Text>
            <Text style={styles.activarSub}>
              Restaurantes, cafés, salones y cualquier negocio pueden recibir reservas en línea:
              tus clientes eligen día y hora y tú las administras aquí. Tu catálogo y pedidos a
              domicilio siguen igual.
            </Text>
            <Text style={styles.activarItem}>✅ Agenda con horarios y disponibilidad</Text>
            <Text style={styles.activarItem}>✅ Recordatorios automáticos al cliente</Text>
            <Text style={styles.activarItem}>✅ Reportes de reservas e ingresos</Text>
            <Text style={styles.activarPrice}>Prueba 30 días gratis</Text>
            <Text style={styles.activarMes}>Después $99/mes. Sin comisiones por reserva.</Text>
            <TouchableOpacity style={styles.activarBtn} onPress={activar}>
              <Text style={styles.activarBtnTxt}>Activar Reservas</Text>
            </TouchableOpacity>
            <Text style={styles.activarNota}>Te dejamos lista una reserva de ejemplo (“Reservar mesa”) que puedes editar.</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header estándar de tienda, en índigo, con el conteo de próximas citas. */}
      <ScreenHeader
        title="Reservas"
        subtitle={`${proximasCount} ${proximasCount === 1 ? "próxima reserva" : "próximas reservas"}`}
        bg={theme.colors.serv}
      />

      {/* Accesos rápidos del negocio — slider horizontal (altura fija para que
          los chips no se recorten). */}
      <View style={styles.accesosWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accesos}>
          <Acceso icon="chatbubbles-outline" label="Mensajes" onPress={() => router.push("/chats")} />
          <Acceso icon="list-outline" label="Servicios" onPress={() => router.push("/tienda-servicios")} />
          <Acceso icon="people-outline" label="Contactos" onPress={() => router.push("/tienda-contactos")} />
        </ScrollView>
      </View>

      {/* Buscar citas por cliente */}
      <View style={styles.buscarWrap}>
        <Ionicons name="search" size={16} color={theme.colors.gray400} />
        <TextInput
          style={styles.buscar}
          placeholder="Buscar cliente o teléfono…"
          placeholderTextColor={theme.colors.gray400}
          value={q}
          onChangeText={setQ}
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ("")}>
            <Ionicons name="close-circle" size={18} color={theme.colors.gray400} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filtros}>
        {(["hoy", "proximas", "historial"] as Filtro[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filtroChip, filtro === f && styles.filtroChipSel]}
            onPress={() => setFiltro(f)}
          >
            <Text style={[styles.filtroTxt, filtro === f && styles.filtroTxtSel]}>
              {f === "hoy" ? "Hoy" : f === "proximas" ? "Próximas" : "Historial"}
            </Text>
          </TouchableOpacity>
        ))}
        {filtro === "historial" && (
          <TouchableOpacity style={styles.limpiarBtn} onPress={limpiar} accessibilityLabel="Limpiar historial">
            <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.serv} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 88 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {visibles.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-clear-outline" size={48} color={theme.colors.gray300} />
              <Text style={styles.emptyTxt}>
                {filtro === "hoy" ? "No hay reservas para hoy." : filtro === "proximas" ? "No hay reservas próximas." : "Sin historial."}
              </Text>
            </View>
          ) : (
            visibles.map((c) => {
              const est = ESTADO_CITA[c.estado];
              // Cita agendada sin conexión (id local, aún no en el server): sin
              // acciones, con su estado de sincronización.
              if (c._offline) {
                return (
                  <View key={c.id} style={[styles.card, theme.shadow.sm, { borderWidth: 1, borderColor: c._syncError ? "#FCA5A5" : "#FCD34D" }]}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cliente} numberOfLines={1}>{c.cliente_nombre || "Cliente"}</Text>
                      <View style={[styles.badge, { backgroundColor: c._syncError ? "#FEE2E2" : "#FEF3C7" }]}>
                        <Text style={[styles.badgeTxt, { color: c._syncError ? "#991B1B" : "#92400E" }]}>
                          {c._syncError ? "No se envió" : "Sin conexión"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.servicio}>{c.servicio_nombre}</Text>
                    <View style={styles.fila}>
                      <Ionicons name="time-outline" size={14} color={theme.colors.serv} />
                      <Text style={styles.hora}>{fmtCitaCorta(c.inicio)}</Text>
                    </View>
                    <Text style={styles.notas}>
                      {c._syncError ? `⚠️ ${c._syncError}. Vuelve a agendarla.` : "📴 Se enviará sola cuando vuelva el internet."}
                    </Text>
                    {c._syncError && (
                      <TouchableOpacity style={styles.eliminarRow} onPress={async () => { if (c._localId) await quitarDeCola(c._localId); load(); }}>
                        <Ionicons name="close-circle-outline" size={15} color={theme.colors.gray500} />
                        <Text style={styles.eliminarTxt}>Descartar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }
              return (
                <View key={c.id} style={[styles.card, theme.shadow.sm]}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cliente} numberOfLines={1}>
                      {c.cliente_nombre}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: est.bg }]}>
                      <Text style={[styles.badgeTxt, { color: est.color }]}>{est.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.servicio}>{c.servicio_nombre}</Text>
                  <View style={styles.fila}>
                    <Ionicons name="time-outline" size={14} color={theme.colors.serv} />
                    <Text style={styles.hora}>{fmtCitaCorta(c.inicio)}</Text>
                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => Linking.openURL(`tel:${c.cliente_telefono}`)}
                    >
                      <Ionicons name="call" size={13} color={theme.colors.accentDark} />
                      <Text style={styles.callTxt}>{c.cliente_telefono}</Text>
                    </TouchableOpacity>
                    {(c.estado === "pendiente" || c.estado === "confirmada") && (
                      <TouchableOpacity
                        style={styles.chatBtn}
                        onPress={() =>
                          router.push(
                            `/chat/${c.puesto_id}?clienteTelefono=${encodeURIComponent(
                              c.cliente_telefono
                            )}&titulo=${encodeURIComponent(c.cliente_nombre)}`
                          )
                        }
                      >
                        <Ionicons name="chatbubble-ellipses" size={15} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                  {!!c.notas && <Text style={styles.notas}>“{c.notas}”</Text>}

                  {/* Acciones según estado. "No asistió" solo si ya pasó la hora. */}
                  {c.estado === "pendiente" && (
                    <View style={styles.acciones}>
                      <Accion label="Confirmar" color={theme.colors.accentDark} onPress={() => cambiar(c, "confirmada")} />
                      <Accion label="Editar" color={theme.colors.serv} outline onPress={() => router.push(`/agendar/${c.puesto_id}?editar=${c.id}`)} />
                      <Accion label="Cancelar" color={theme.colors.danger} outline onPress={() => cambiar(c, "cancelada")} />
                    </View>
                  )}
                  {c.estado === "confirmada" && (
                    <View style={styles.acciones}>
                      <Accion label="Editar" color={theme.colors.serv} outline onPress={() => router.push(`/agendar/${c.puesto_id}?editar=${c.id}`)} />
                      <Accion label="Cancelar" color={theme.colors.danger} outline onPress={() => cambiar(c, "cancelada")} />
                      {/* Completar y No asistió solo tienen sentido al llegar la hora. */}
                      {new Date(c.inicio).getTime() <= ahora && (
                        <>
                          <Accion label="Completada" color={theme.colors.serv} onPress={() => cambiar(c, "completada")} />
                          <Accion label="No asistió" color={theme.colors.gray500} outline onPress={() => cambiar(c, "no_show")} />
                        </>
                      )}
                    </View>
                  )}
                  {/* Completada: monto cobrado (editable para registrar extras). */}
                  {c.estado === "completada" && (
                    <View style={styles.montoRow}>
                      <Text style={styles.montoTxt}>
                        Cobrado: <Text style={styles.montoVal}>${Number(c.monto_cobrado ?? c.precio ?? 0)}</Text>
                        {c.monto_cobrado != null && Number(c.monto_cobrado) !== Number(c.precio ?? 0) ? " (ajustado)" : ""}
                      </Text>
                      <TouchableOpacity style={styles.ajustarBtn} onPress={() => abrirAjuste(c)}>
                        <Ionicons name="pencil" size={13} color={theme.colors.serv} />
                        <Text style={styles.ajustarTxt}>Ajustar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {/* Historial: opción de eliminar la cita. */}
                  {(c.estado === "completada" || c.estado === "cancelada" || c.estado === "no_show") && (
                    <TouchableOpacity style={styles.eliminarRow} onPress={() => eliminar(c)}>
                      <Ionicons name="trash-outline" size={15} color={theme.colors.gray500} />
                      <Text style={styles.eliminarTxt}>Eliminar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* FAB para agregar cita (índigo, como el + de /productos) */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 20 + insets.bottom }]}
        onPress={() => usuario?.puesto_id && router.push(`/agendar/${usuario.puesto_id}`)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal: ajustar monto cobrado de una cita completada */}
      <Modal visible={!!ajustando} transparent animationType="fade" onRequestClose={() => setAjustando(null)}>
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setAjustando(null)}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <Text style={styles.modalTitulo}>Monto cobrado</Text>
            <Text style={styles.modalSub}>
              {ajustando?.servicio_nombre} · precio ${Number(ajustando?.precio ?? 0)}
            </Text>
            <View style={styles.montoInputWrap}>
              <Text style={styles.montoSigno}>$</Text>
              <TextInput
                style={styles.montoInput}
                value={montoInput}
                onChangeText={(v) => setMontoInput(v.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.colors.gray400}
                autoFocus
              />
            </View>
            <Text style={styles.modalHint}>Deja vacío para volver al precio del servicio.</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setAjustando(null)}>
                <Text style={styles.modalCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalGuardar} onPress={guardarMonto}>
                <Text style={styles.modalGuardarTxt}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function Acceso({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.acceso} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={18} color={theme.colors.serv} />
      <Text style={styles.accesoTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

function Accion({ label, color, onPress, outline }: { label: string; color: string; onPress: () => void; outline?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.accionBtn, outline ? { borderWidth: 1.5, borderColor: color } : { backgroundColor: color }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.accionTxt, { color: outline ? color : "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  activarCard: { backgroundColor: "#fff", borderRadius: 18, padding: 22, borderWidth: 2, borderColor: theme.colors.servLight, borderStyle: "dashed" },
  activarTitle: { fontSize: 18, fontWeight: "800", color: "#374151", textAlign: "center", marginTop: 6 },
  activarSub: { fontSize: 13, color: "#6B7280", textAlign: "center", marginTop: 8, lineHeight: 19 },
  activarItem: { fontSize: 13, color: "#4B5563", marginTop: 6 },
  activarPrice: { fontSize: 18, fontWeight: "800", color: theme.colors.serv, textAlign: "center", marginTop: 14 },
  activarMes: { fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 2 },
  activarBtn: { backgroundColor: theme.colors.serv, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  activarBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  activarNota: { fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 12 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    // Deja espacio a la derecha para la campana flotante del layout.
    paddingHorizontal: 16,
    paddingRight: 56,
    paddingVertical: 12,
  },
  titulo: { ...theme.typography.h2, color: theme.colors.gray900 },
  // Contenedor de altura fija para el slider: garantiza que los chips no se
  // recorten (el ScrollView horizontal llena esta altura y centra el contenido).
  accesosWrap: { height: 52, marginTop: 12, marginBottom: 4 },
  accesos: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  acceso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.servLight,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
  },
  accesoTxt: { ...theme.typography.buttonSmall, color: theme.colors.servDark },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.serv,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  buscarWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.white, borderRadius: theme.radius.md, paddingHorizontal: 12, marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.gray200 },
  buscar: { flex: 1, paddingVertical: 9, ...theme.typography.body, color: theme.colors.gray900 },
  filtros: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  limpiarBtn: { alignItems: "center", justifyContent: "center", marginLeft: "auto", width: 34, height: 34, borderRadius: theme.radius.pill, borderWidth: 1.5, borderColor: theme.colors.danger },
  limpiarTxt: { ...theme.typography.caption, color: theme.colors.danger, fontFamily: theme.fontFamily.semibold },
  eliminarRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, alignSelf: "flex-start" },
  eliminarTxt: { ...theme.typography.bodySmall, color: theme.colors.gray500 },
  filtroChip: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.white,
  },
  filtroChipSel: { backgroundColor: theme.colors.serv },
  filtroTxt: { ...theme.typography.buttonSmall, color: theme.colors.gray600 },
  filtroTxtSel: { color: "#fff" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyTxt: { ...theme.typography.body, color: theme.colors.gray500 },
  card: { backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cliente: { ...theme.typography.title, color: theme.colors.gray900, flex: 1 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radius.pill },
  badgeTxt: { ...theme.typography.caption, fontFamily: theme.fontFamily.semibold },
  servicio: { ...theme.typography.bodyMedium, color: theme.colors.serv, marginTop: 4 },
  fila: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  hora: { ...theme.typography.bodyMedium, color: theme.colors.gray700 },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    backgroundColor: theme.colors.accentLight,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.radius.pill,
  },
  callTxt: { ...theme.typography.caption, color: theme.colors.accentDark },
  chatBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.serv,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  notas: { ...theme.typography.bodySmall, color: theme.colors.gray500, fontStyle: "italic", marginTop: 8 },
  acciones: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  accionBtn: { flexGrow: 1, flexBasis: "46%", paddingVertical: 10, borderRadius: theme.radius.md, alignItems: "center" },
  accionTxt: { ...theme.typography.buttonSmall },
  montoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  montoTxt: { ...theme.typography.bodySmall, color: theme.colors.gray600 },
  montoVal: { color: theme.colors.gray900, fontFamily: theme.fontFamily.bold },
  ajustarBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: theme.radius.pill, backgroundColor: theme.colors.servLight },
  ajustarTxt: { ...theme.typography.caption, color: theme.colors.serv, fontFamily: theme.fontFamily.semibold },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 20, width: "100%", maxWidth: 360 },
  modalTitulo: { ...theme.typography.h3, color: theme.colors.gray900 },
  modalSub: { ...theme.typography.bodySmall, color: theme.colors.gray500, marginTop: 4, marginBottom: 14 },
  montoInputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: theme.colors.gray200, borderRadius: theme.radius.md, paddingHorizontal: 14 },
  montoSigno: { ...theme.typography.h3, color: theme.colors.gray500, marginRight: 4 },
  montoInput: { flex: 1, paddingVertical: 12, fontSize: 22, fontFamily: theme.fontFamily.bold, color: theme.colors.gray900 },
  modalHint: { ...theme.typography.caption, color: theme.colors.gray400, marginTop: 8 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 18 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.md, alignItems: "center", backgroundColor: theme.colors.gray100 },
  modalCancelTxt: { ...theme.typography.button, color: theme.colors.gray600 },
  modalGuardar: { flex: 2, paddingVertical: 12, borderRadius: theme.radius.md, alignItems: "center", backgroundColor: theme.colors.serv },
  modalGuardarTxt: { ...theme.typography.button, color: "#fff" },
});
