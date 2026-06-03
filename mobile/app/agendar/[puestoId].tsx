import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { theme } from "../../src/lib/theme";
import { useSession } from "../../src/contexts/SessionContext";
import {
  listarServicios,
  listarSlots,
  listarGrid,
  crearCita,
  reprogramarCita,
  listarCitas,
  type Servicio,
  type Slot,
  type GridSlot,
} from "../../src/api/citas";
import CalendarioMes from "../../src/components/CalendarioMes";
import { waUrl } from "../../src/lib/contacto";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// "9 jun" a partir de "YYYY-MM-DD".
function fechaCorta(key: string): string {
  const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
  return `${d} ${MESES[m - 1]}`;
}

// Agrupa slots en Mañana / Tarde / Noche según la hora del label "HH:MM".
function agruparSlots(slots: Slot[]) {
  const grupos: { titulo: string; icon: string; items: Slot[] }[] = [
    { titulo: "Mañana", icon: "sunny-outline", items: [] },
    { titulo: "Tarde", icon: "partly-sunny-outline", items: [] },
    { titulo: "Noche", icon: "moon-outline", items: [] },
  ];
  for (const s of slots) {
    const h = parseInt(s.label.slice(0, 2), 10);
    if (h < 12) grupos[0].items.push(s);
    else if (h < 18) grupos[1].items.push(s);
    else grupos[2].items.push(s);
  }
  return grupos.filter((g) => g.items.length > 0);
}

export default function AgendarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { usuario } = useSession();
  const { puestoId, servicio: servicioParam, editar } = useLocalSearchParams<{
    puestoId: string;
    servicio?: string;
    editar?: string;
  }>();

  const [servicios, setServicios] = useState<Servicio[]>([]);
  // Una entrada por persona: el servicio que se le hará y su nombre (opcional).
  const [personas, setPersonas] = useState<{ servicioId: string | null; nombre: string }[]>([
    { servicioId: servicioParam ?? null, nombre: "" },
  ]);
  const [fecha, setFecha] = useState<string>(ymd(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [grid, setGrid] = useState<GridSlot[]>([]); // cuadrícula visual al reagendar
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Agendado manual (la tienda agenda a nombre de un cliente).
  const esTienda = usuario?.rol === "tienda" || usuario?.rol === "admin";
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTel, setClienteTel] = useState("");

  // Prellena el teléfono de contacto con el de la cuenta logueada (editable),
  // para no teclear 10 dígitos y agendar rápido:
  //  • Cliente: su nombre + su teléfono (por si agenda para alguien más, edita).
  //  • Tienda: el teléfono del negocio como contacto por defecto — así la cita
  //    es un bloque rápido en su agenda y los recordatorios le llegan a ella.
  //    El nombre lo deja vacío para escribir el del cliente que llega.
  useEffect(() => {
    if (editar || !usuario) return;
    if (esTienda) {
      setClienteTel((v) => v || usuario.telefono);
    } else {
      setClienteNombre((v) => v || usuario.nombre);
      setClienteTel((v) => v || usuario.telefono);
    }
  }, [esTienda, usuario, editar]);

  const durDe = (sid: string | null) => servicios.find((s) => s.id === sid)?.duracion_min ?? 0;
  const totalDuracion = personas.reduce((a, p) => a + durDe(p.servicioId), 0);
  const todosElegidos = personas.length > 0 && personas.every((p) => !!p.servicioId);
  const primerServicioId = personas.find((p) => p.servicioId)?.servicioId ?? null;

  function setPersonaServicio(i: number, sid: string) {
    setPersonas((ps) => ps.map((p, idx) => (idx === i ? { ...p, servicioId: sid } : p)));
  }
  function setPersonaNombre(i: number, nombre: string) {
    setPersonas((ps) => ps.map((p, idx) => (idx === i ? { ...p, nombre } : p)));
  }

  // Carga servicios del negocio.
  useEffect(() => {
    if (!puestoId) return;
    listarServicios(puestoId)
      .then((s) => {
        const activos = s.filter((x) => x.activo);
        setServicios(activos);
        // Con un solo servicio, lo preseleccionamos para la persona 1.
        if (activos.length === 1) {
          setPersonas((ps) => ps.map((p, i) => (i === 0 && !p.servicioId ? { ...p, servicioId: activos[0].id } : p)));
        }
      })
      .catch(() => {});
  }, [puestoId]);

  // Modo edición: precarga personas/servicios y la fecha de la cita.
  useEffect(() => {
    if (!editar) return;
    listarCitas()
      .then((cs) => {
        const c = cs.find((x) => x.id === editar);
        if (!c) return;
        if (c.personas && c.personas.length) {
          setPersonas(c.personas.map((pp) => ({ servicioId: pp.servicio_id, nombre: pp.nombre ?? "" })));
        } else if (c.servicio_id) {
          setPersonas([{ servicioId: c.servicio_id, nombre: "" }]);
        }
        setFecha(ymd(new Date(c.inicio)));
      })
      .catch(() => {});
  }, [editar]);

  // Carga slots cuando todas las personas tienen servicio. La duración total
  // (suma) define cuánto debe caber el bloque; los slots van cada 15 min.
  useEffect(() => {
    if (!puestoId || !todosElegidos || !primerServicioId || !fecha) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSlot(null);
    // Al reagendar, excluimos la propia cita para que su lugar (y el espacio
    // libre alrededor) aparezca como disponible.
    listarSlots(puestoId, primerServicioId, fecha, totalDuracion, editar)
      .then((r) => setSlots(r.slots))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [puestoId, primerServicioId, totalDuracion, todosElegidos, fecha, editar]);

  // Cuadrícula visual (solo al reagendar): todos los bloques con su estado.
  useEffect(() => {
    if (!editar || !puestoId || !todosElegidos || !primerServicioId || !fecha) {
      setGrid([]);
      return;
    }
    listarGrid(puestoId, primerServicioId, fecha, totalDuracion, editar)
      .then((r) => setGrid(r.grid))
      .catch(() => setGrid([]));
  }, [editar, puestoId, primerServicioId, totalDuracion, todosElegidos, fecha]);

  async function confirmar() {
    if (!usuario) {
      router.push("/login");
      return;
    }
    if (!todosElegidos || !slot) return;
    setSubmitting(true);
    try {
      // Modo edición: solo mueve la hora (conserva servicios y duración).
      if (editar) {
        await reprogramarCita(editar, { inicio: slot.inicio, notas: notas.trim() || null });
        Alert.alert("Cita reagendada ✅", "Se movió a la nueva hora.", [{ text: "Listo", onPress: () => router.back() }]);
        return;
      }
      if (!clienteNombre.trim() || clienteTel.replace(/\D/g, "").length < 10) {
        Alert.alert("Faltan datos", "Escribe el nombre y un teléfono válido (10 dígitos).");
        return;
      }
      // Datos para pintar la cita optimista si se guarda sin conexión.
      const servSel = personas
        .map((p) => servicios.find((s) => s.id === p.servicioId))
        .filter(Boolean) as Servicio[];
      const resumenNombre =
        servSel.length === 1 ? servSel[0].nombre : servSel.length > 1 ? `${servSel[0].nombre} +${servSel.length - 1} más` : "Cita";
      const precios = servSel.map((s) => (s.precio != null ? Number(s.precio) : null));
      const totalPrecio = precios.some((x) => x != null) ? precios.reduce<number>((a, x) => a + (x ?? 0), 0) : null;
      const finIso = new Date(new Date(slot.inicio).getTime() + totalDuracion * 60_000).toISOString();
      const personasDisplay = personas.map((p) => {
        const s = servicios.find((x) => x.id === p.servicioId);
        return { servicio_id: p.servicioId as string, servicio_nombre: s?.nombre ?? "", precio: s?.precio ?? null, nombre: p.nombre.trim() || null };
      });

      const { offline } = await crearCita(
        {
          puesto_id: puestoId!,
          personas: personas.map((p) => ({ servicio_id: p.servicioId as string, nombre: p.nombre.trim() || undefined })),
          inicio: slot.inicio,
          notas: notas.trim() || null,
          cliente_nombre: clienteNombre.trim(),
          cliente_telefono: clienteTel.replace(/\D/g, ""),
        },
        {
          estado: esTienda ? "confirmada" : "pendiente",
          personas: personasDisplay,
          servicio_nombre: resumenNombre,
          precio: totalPrecio,
          fin: finIso,
          cliente_id: esTienda ? null : usuario?.id ?? null,
        }
      );

      if (offline) {
        Alert.alert(
          "Guardada sin conexión 📴",
          "No hay internet ahora. La cita quedó guardada en tu dispositivo y se enviará sola cuando vuelva la señal.",
          [{ text: "Listo", onPress: () => (esTienda ? router.back() : router.replace("/mis-citas")) }]
        );
        return;
      }
      Alert.alert(
        esTienda ? "Cita agendada ✅" : "¡Cita agendada! 📅",
        esTienda
          ? "La cita quedó confirmada en tu agenda."
          : "El negocio recibió tu solicitud. Te avisaremos cuando la confirme.",
        [{ text: esTienda ? "Listo" : "Ver mis citas", onPress: () => (esTienda ? router.back() : router.replace("/mis-citas")) }]
      );
    } catch (e: unknown) {
      const err = e as { error?: string; code?: string };
      if (err?.code === "PLAN_VENCIDO" && esTienda) {
        Alert.alert("Plan vencido", err.error ?? "Reactiva tu plan para seguir agendando.", [
          { text: "Cerrar", style: "cancel" },
          { text: "WhatsApp", onPress: () => Linking.openURL(waUrl("Hola, quiero reactivar el plan Pro de citas de mi negocio en Mercadito.")) },
        ]);
        return;
      }
      Alert.alert("Ups", err?.error ?? "No se pudo agendar. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: editar ? "Reagendar cita" : "Agendar cita",
          headerStyle: { backgroundColor: theme.colors.serv },
          headerTintColor: "#fff",
          headerTitleStyle: { color: "#fff", fontFamily: theme.fontFamily.bold },
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}>
        {!usuario && (
          <TouchableOpacity style={styles.loginBanner} onPress={() => router.push("/login")}>
            <Ionicons name="person-circle-outline" size={20} color={theme.colors.serv} />
            <Text style={styles.loginBannerTxt}>Inicia sesión para confirmar tu cita</Text>
          </TouchableOpacity>
        )}

        {/* Cliente (solo agendado manual desde la tienda, no al reagendar) */}
        {!editar && (
          <>
            <Text style={styles.step}>{esTienda ? "Cliente" : "Tus datos"}</Text>
            <TextInput
              style={[styles.notas, { minHeight: 0 }]}
              placeholder="Nombre"
              placeholderTextColor={theme.colors.gray400}
              value={clienteNombre}
              onChangeText={setClienteNombre}
            />
            <TextInput
              style={[styles.notas, { minHeight: 0, marginTop: 8 }]}
              placeholder="Teléfono (10 dígitos)"
              placeholderTextColor={theme.colors.gray400}
              value={clienteTel}
              onChangeText={(v) => setClienteTel(v.replace(/[^0-9]/g, ""))}
              keyboardType="phone-pad"
              maxLength={10}
            />
          </>
        )}

        {/* 1. Personas y servicios */}
        <Text style={styles.step}>1 · Personas y servicios</Text>
        {servicios.length === 0 ? (
          <Text style={styles.empty}>Cargando servicios…</Text>
        ) : (
          <>
            {personas.map((persona, i) => (
              <View key={i} style={styles.personaCard}>
                <View style={styles.personaHead}>
                  <Text style={styles.personaTitulo}>Persona {i + 1}</Text>
                  {personas.length > 1 && (
                    <TouchableOpacity onPress={() => setPersonas((ps) => ps.filter((_, idx) => idx !== i))}>
                      <Ionicons name="close-circle" size={20} color={theme.colors.gray400} />
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={styles.personaNombre}
                  placeholder="Nombre (opcional)"
                  placeholderTextColor={theme.colors.gray400}
                  value={persona.nombre}
                  onChangeText={(v) => setPersonaNombre(i, v)}
                />
                <View style={styles.servChips}>
                  {servicios.map((s) => {
                    const sel = persona.servicioId === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.servChip, sel && styles.servChipSel]}
                        onPress={() => setPersonaServicio(i, s.id)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.servChipTxt, sel && { color: "#fff" }]}>
                          {s.nombre}
                          {s.precio != null ? ` · $${Number(s.precio)}` : ""} · {s.duracion_min}m
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={styles.addPersona}
              onPress={() =>
                setPersonas((ps) => [...ps, { servicioId: servicios.length === 1 ? servicios[0].id : null, nombre: "" }])
              }
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color={theme.colors.serv} />
              <Text style={styles.addPersonaTxt}>Agregar persona</Text>
            </TouchableOpacity>
            {totalDuracion > 0 && <Text style={styles.totalDur}>Duración total: {totalDuracion} min</Text>}
          </>
        )}

        {/* 2. Fecha */}
        <Text style={styles.step}>2 · Fecha</Text>
        <CalendarioMes selected={fecha} onSelect={setFecha} accent={theme.colors.serv} mesesAdelante={3} />

        {/* 3. Hora */}
        <Text style={styles.step}>3 · Hora</Text>
        {!todosElegidos ? (
          <Text style={styles.empty}>Elige el servicio de cada persona.</Text>
        ) : editar ? (
          /* Cuadrícula visual al reagendar: gris = ocupado, azul = esta cita,
             libres seleccionables resaltados. */
          grid.length === 0 ? (
            <Text style={styles.empty}>Sin horarios ese día.</Text>
          ) : (
            <>
              <View style={styles.legend}>
                <LegendDot color={theme.colors.gray200} label="Ocupado" />
                <LegendDot color={theme.colors.servLight} border={theme.colors.serv} label="Esta cita" />
                <LegendDot color={theme.colors.serv} label="Nuevo horario" />
                <LegendDot color="#fff" border={theme.colors.gray300} label="Libre" />
              </View>
              <View style={styles.gridWrap}>
                {(() => {
                  // Franja que cubrirá la nueva cita: desde el inicio elegido por
                  // la duración total (p. ej. 60 min = 4 casillas de 15 min).
                  const selStart = slot ? new Date(slot.inicio).getTime() : null;
                  const selEnd = selStart != null ? selStart + totalDuracion * 60_000 : null;
                  return grid.map((g) => {
                  const blockMs = new Date(g.inicio).getTime();
                  const enNuevo = selStart != null && selEnd != null && blockMs >= selStart && blockMs < selEnd;
                  let bg: string = "#fff";
                  let color: string = theme.colors.gray700;
                  let border: string = theme.colors.gray200;
                  if (g.estado === "ocupado") { bg = theme.colors.gray200; color = theme.colors.gray400; }
                  else if (g.estado === "actual") { bg = theme.colors.servLight; color = theme.colors.servDark; border = theme.colors.serv; }
                  else if (!g.seleccionable) { bg = theme.colors.gray50; color = theme.colors.gray300; }
                  if (enNuevo) { bg = theme.colors.serv; color = "#fff"; border = theme.colors.serv; }
                  return (
                    <TouchableOpacity
                      key={g.inicio}
                      disabled={!g.seleccionable}
                      onPress={() => setSlot({ inicio: g.inicio, fin: g.inicio, label: g.label })}
                      style={[styles.gridBlock, { backgroundColor: bg, borderColor: border }]}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.gridTxt, { color }]}>{g.label}</Text>
                    </TouchableOpacity>
                  );
                  });
                })()}
              </View>
            </>
          )
        ) : loadingSlots ? (
          <ActivityIndicator color={theme.colors.serv} style={{ marginTop: 12 }} />
        ) : slots.length === 0 ? (
          <Text style={styles.empty}>No hay horarios disponibles ese día. Prueba otra fecha.</Text>
        ) : (
          agruparSlots(slots).map((g) => (
            <View key={g.titulo} style={styles.periodo}>
              <View style={styles.periodoHead}>
                <Ionicons name={g.icon as keyof typeof Ionicons.glyphMap} size={15} color={theme.colors.gray500} />
                <Text style={styles.periodoTxt}>{g.titulo}</Text>
              </View>
              <View style={styles.slotGrid}>
                {g.items.map((s) => {
                  const sel = slot?.inicio === s.inicio;
                  return (
                    <TouchableOpacity
                      key={s.inicio}
                      style={[styles.slotChip, sel && styles.slotChipSel]}
                      onPress={() => setSlot(s)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.slotTxt, sel && styles.slotTxtSel]}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))
        )}

        {/* Notas */}
        <Text style={styles.step}>Notas (opcional)</Text>
        <TextInput
          style={styles.notas}
          placeholder="Algo que el negocio deba saber…"
          placeholderTextColor={theme.colors.gray400}
          value={notas}
          onChangeText={setNotas}
          multiline
        />
      </ScrollView>

      {/* Barra de confirmación */}
      {slot && todosElegidos && (
        <View style={[styles.confirmBar, { paddingBottom: insets.bottom + 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.confirmServ} numberOfLines={1}>
              {personas.length} {personas.length === 1 ? "persona" : "personas"} · {totalDuracion} min
            </Text>
            <Text style={styles.confirmHora}>
              {fechaCorta(fecha)} · {slot.label}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.confirmBtn, submitting && { opacity: 0.6 }]}
            onPress={confirmar}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmBtnTxt}>{usuario ? "Confirmar" : "Iniciar sesión"}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function LegendDot({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendBox, { backgroundColor: color, borderColor: border ?? color }]} />
      <Text style={styles.legendTxt}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  header: {
    backgroundColor: theme.colors.serv,
    paddingHorizontal: 12,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { ...theme.typography.h3, color: "#fff" },
  loginBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.servLight,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 16,
  },
  loginBannerTxt: { ...theme.typography.bodyMedium, color: theme.colors.servDark, flex: 1 },
  step: {
    ...theme.typography.title,
    color: theme.colors.gray800,
    marginTop: 20,
    marginBottom: 10,
  },
  empty: { ...theme.typography.body, color: theme.colors.gray500 },
  personaCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.gray200,
  },
  personaHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  personaTitulo: { ...theme.typography.bodyMedium, color: theme.colors.serv },
  personaNombre: {
    backgroundColor: theme.colors.gray50,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    ...theme.typography.body,
    color: theme.colors.gray900,
    marginBottom: 8,
  },
  servChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  servChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.gray100,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  servChipSel: { backgroundColor: theme.colors.serv, borderColor: theme.colors.serv },
  servChipTxt: { ...theme.typography.bodySmall, color: theme.colors.gray700 },
  addPersona: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.serv,
    borderStyle: "dashed",
  },
  addPersonaTxt: { ...theme.typography.buttonSmall, color: theme.colors.serv },
  totalDur: { ...theme.typography.bodySmall, color: theme.colors.gray500, marginTop: 8, textAlign: "right" },
  servRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  servRowSel: { borderColor: theme.colors.serv, backgroundColor: theme.colors.servBg },
  servNombre: { ...theme.typography.bodyMedium, color: theme.colors.gray900 },
  servMeta: { ...theme.typography.bodySmall, color: theme.colors.gray500, marginTop: 2 },
  dayStrip: { gap: 8, paddingVertical: 2 },
  dayChip: {
    width: 56,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    gap: 2,
  },
  dayChipSel: { backgroundColor: theme.colors.serv },
  dayDow: { ...theme.typography.caption, color: theme.colors.gray500 },
  dayNum: { ...theme.typography.h3, color: theme.colors.gray900 },
  dayMes: { ...theme.typography.caption, color: theme.colors.gray500 },
  dayTxtSel: { color: "#fff" },
  legend: { flexDirection: "row", gap: 14, marginBottom: 10, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendBox: { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5 },
  legendTxt: { ...theme.typography.caption, color: theme.colors.gray500 },
  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  gridBlock: { width: "18%", paddingVertical: 8, borderRadius: theme.radius.sm, borderWidth: 1.5, alignItems: "center" },
  gridTxt: { ...theme.typography.caption, fontFamily: theme.fontFamily.semibold },
  periodo: { marginBottom: 14 },
  periodoHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  periodoTxt: { ...theme.typography.bodySmall, color: theme.colors.gray500, fontFamily: theme.fontFamily.semibold },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slotChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.gray200,
  },
  slotChipSel: { backgroundColor: theme.colors.serv, borderColor: theme.colors.serv },
  slotTxt: { ...theme.typography.bodyMedium, color: theme.colors.gray700 },
  slotTxtSel: { color: "#fff" },
  notas: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    padding: 14,
    minHeight: 70,
    ...theme.typography.body,
    color: theme.colors.gray900,
    textAlignVertical: "top",
  },
  confirmBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray100,
    ...theme.shadow.lg,
  },
  confirmServ: { ...theme.typography.bodyMedium, color: theme.colors.gray900 },
  confirmHora: { ...theme.typography.bodySmall, color: theme.colors.serv, marginTop: 2 },
  confirmBtn: {
    backgroundColor: theme.colors.serv,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: theme.radius.md,
  },
  confirmBtnTxt: { ...theme.typography.button, color: "#fff" },
});
