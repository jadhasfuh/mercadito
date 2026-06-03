import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { theme } from "../lib/theme";
import { listarCitas, actualizarCita, type Cita } from "../api/citas";
import { quitarDeCola } from "../lib/offlineCitas";
import { fmtCitaLarga, ESTADO_CITA } from "../lib/citasFmt";

// Ordena: primero las citas activas y futuras (de la más próxima a la más
// lejana), luego el historial (lo más reciente primero).
function ordenarCitas(citas: Cita[]): Cita[] {
  const ahora = Date.now();
  const proxima = (c: Cita) =>
    (c.estado === "pendiente" || c.estado === "confirmada") && new Date(c.inicio).getTime() > ahora;
  return [...citas].sort((a, b) => {
    const pa = proxima(a), pb = proxima(b);
    if (pa && pb) return new Date(a.inicio).getTime() - new Date(b.inicio).getTime();
    if (pa !== pb) return pa ? -1 : 1;
    return new Date(b.inicio).getTime() - new Date(a.inicio).getTime();
  });
}

// Cuerpo reutilizable de "Mis citas" (cliente). Lo usan la pantalla apilada
// app/mis-citas.tsx y el tab (tabs)/citas.tsx.
export default function MisCitasView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [citas, setCitas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  function cancelar(c: Cita) {
    Alert.alert("Cancelar cita", `¿Cancelar tu cita de ${c.servicio_nombre}?`, [
      { text: "No", style: "cancel" },
      {
        text: "Sí, cancelar",
        style: "destructive",
        onPress: async () => {
          try {
            await actualizarCita(c.id, "cancelada");
            load();
          } catch {
            Alert.alert("Ups", "No se pudo cancelar.");
          }
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator color={theme.colors.serv} style={{ marginTop: 40 }} />;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {citas.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={theme.colors.gray300} />
          <Text style={styles.emptyTxt}>Aún no tienes citas agendadas.</Text>
          <TouchableOpacity style={styles.cta} onPress={() => router.replace("/(tabs)/home")}>
            <Text style={styles.ctaTxt}>Explorar negocios</Text>
          </TouchableOpacity>
        </View>
      ) : (
        ordenarCitas(citas).map((c) => {
          const est = ESTADO_CITA[c.estado];
          const futura = new Date(c.inicio).getTime() > Date.now();
          const cancelable = futura && (c.estado === "pendiente" || c.estado === "confirmada");
          // Cita guardada sin conexión (aún no en el server): no permite acciones
          // (su id es local); muestra su estado de sincronización.
          if (c._offline) {
            return (
              <View key={c.id} style={[styles.card, theme.shadow.sm, c._syncError ? styles.cardError : styles.cardOffline]}>
                <View style={styles.cardTop}>
                  <Text style={styles.servicio} numberOfLines={1}>{c.servicio_nombre}</Text>
                  <View style={[styles.badge, { backgroundColor: c._syncError ? "#FEE2E2" : "#FEF3C7" }]}>
                    <Text style={[styles.badgeTxt, { color: c._syncError ? "#991B1B" : "#92400E" }]}>
                      {c._syncError ? "No se envió" : "Sin conexión"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.negocio}>{c.puesto_nombre || "Cita pendiente de enviar"}</Text>
                <View style={styles.fila}>
                  <Ionicons name="calendar-outline" size={15} color={theme.colors.serv} />
                  <Text style={styles.fecha}>{fmtCitaLarga(c.inicio)}</Text>
                </View>
                <Text style={styles.offlineNota}>
                  {c._syncError ? `⚠️ ${c._syncError}. Vuelve a agendarla.` : "📴 Se enviará sola cuando vuelva el internet."}
                </Text>
                {c._syncError && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={async () => { if (c._localId) await quitarDeCola(c._localId); load(); }}
                  >
                    <Text style={styles.cancelTxt}>Descartar</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }
          return (
            <View key={c.id} style={[styles.card, theme.shadow.sm]}>
              <View style={styles.cardTop}>
                <Text style={styles.servicio} numberOfLines={1}>
                  {c.servicio_nombre}
                </Text>
                <View style={[styles.badge, { backgroundColor: est.bg }]}>
                  <Text style={[styles.badgeTxt, { color: est.color }]}>{est.label}</Text>
                </View>
              </View>
              <Text style={styles.negocio}>{c.puesto_nombre}</Text>
              <View style={styles.fila}>
                <Ionicons name="calendar-outline" size={15} color={theme.colors.serv} />
                <Text style={styles.fecha}>{fmtCitaLarga(c.inicio)}</Text>
              </View>
              {c.precio != null && <Text style={styles.precio}>${Number(c.precio)}</Text>}
              <View style={styles.acciones}>
                {(c.estado === "pendiente" || c.estado === "confirmada") && (
                  <TouchableOpacity
                    style={styles.msgBtn}
                    onPress={() => router.push(`/chat/${c.puesto_id}?titulo=${encodeURIComponent(c.puesto_nombre)}`)}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.serv} />
                    <Text style={styles.msgTxt}>Mensaje</Text>
                  </TouchableOpacity>
                )}
                {cancelable && (
                  <TouchableOpacity
                    style={styles.msgBtn}
                    onPress={() => router.push(`/agendar/${c.puesto_id}?editar=${c.id}`)}
                  >
                    <Ionicons name="time-outline" size={16} color={theme.colors.serv} />
                    <Text style={styles.msgTxt}>Reagendar</Text>
                  </TouchableOpacity>
                )}
                {cancelable && (
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => cancelar(c)}>
                    <Text style={styles.cancelTxt}>Cancelar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyTxt: { ...theme.typography.body, color: theme.colors.gray500 },
  cta: { marginTop: 6, backgroundColor: theme.colors.serv, paddingVertical: 10, paddingHorizontal: 20, borderRadius: theme.radius.md },
  ctaTxt: { ...theme.typography.buttonSmall, color: "#fff" },
  card: { backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 16, marginBottom: 12 },
  cardOffline: { borderWidth: 1, borderColor: "#FCD34D" },
  cardError: { borderWidth: 1, borderColor: "#FCA5A5" },
  offlineNota: { ...theme.typography.bodySmall, color: theme.colors.gray600, marginTop: 8 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  servicio: { ...theme.typography.title, color: theme.colors.gray900, flex: 1 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radius.pill },
  badgeTxt: { ...theme.typography.caption, fontFamily: theme.fontFamily.semibold },
  negocio: { ...theme.typography.bodySmall, color: theme.colors.gray500, marginTop: 2 },
  fila: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  fecha: { ...theme.typography.bodyMedium, color: theme.colors.gray700 },
  precio: { ...theme.typography.title, color: theme.colors.serv, marginTop: 8 },
  acciones: { flexDirection: "row", gap: 10, marginTop: 12 },
  msgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.servLight,
  },
  msgTxt: { ...theme.typography.buttonSmall, color: theme.colors.servDark },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
  },
  cancelTxt: { ...theme.typography.buttonSmall, color: theme.colors.danger },
});
