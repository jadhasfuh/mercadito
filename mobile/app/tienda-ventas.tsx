import { useCallback, useState } from "react";
import { fechaHoraMX } from "../src/lib/fecha";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, Stack } from "expo-router";
import { theme } from "../src/lib/theme";
import { statsCitas, listarCitas, type CitasStats, type Cita } from "../src/api/citas";
import { fmtCitaCorta } from "../src/lib/citasFmt";
import { CATEGORIAS_SERVICIOS } from "../src/lib/categorias";
import { waUrl } from "../src/lib/contacto";

const PERIODOS = [
  { dias: 7, label: "1 semana" },
  { dias: 15, label: "15 días" },
  { dias: 30, label: "1 mes" },
];

export default function TiendaVentasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [dias, setDias] = useState(30);
  const [stats, setStats] = useState<CitasStats | null>(null);
  const [completadas, setCompletadas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([statsCitas(dias), listarCitas({ estado: "completada" })])
      .then(([s, c]) => {
        setStats(s);
        setCompletadas(c);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dias]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const r = stats?.resumen;
  const ingreso = r ? Number(r.ingreso) || 0 : 0;
  const pi = stats?.planInfo;
  const estadoPlan = pi?.estado ?? (stats?.plan === "pro" ? "pro" : "trial");
  const diasPlan = pi?.dias_restantes ?? 0;
  const abrirWA = () => Linking.openURL(waUrl("Hola, quiero activar/renovar el plan Pro de reservas de mi negocio en Mercadito."));
  const fechaPlan = (iso: string | null | undefined) =>
    iso ? fechaHoraMX(iso, { day: "numeric", month: "short" }) : "";

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ title: "Ventas" }} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.gray800} />
        </TouchableOpacity>
        <Text style={styles.titulo}>Ventas y resumen</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.serv} style={{ marginTop: 40 }} />
      ) : !r ? (
        <View style={styles.vacio}>
          <Ionicons name="stats-chart-outline" size={48} color={theme.colors.gray300} />
          <Text style={styles.vacioTxt}>Aún no hay datos de ventas.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          {/* Plan: prueba / pro / vencido (estado del modelo de suscripción). */}
          {estadoPlan === "vencido" ? (
            <View style={[styles.planCard, styles.planVencido]}>
              <Ionicons name="alert-circle" size={20} color={theme.colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.planTitulo, { color: theme.colors.danger }]}>Tu prueba terminó</Text>
                <Text style={styles.planSub}>Reactiva tu plan para seguir agendando.</Text>
              </View>
              <TouchableOpacity style={styles.planWaBtn} onPress={abrirWA}>
                <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                <Text style={styles.planWaTxt}>Reactivar</Text>
              </TouchableOpacity>
            </View>
          ) : estadoPlan === "pro" ? (
            <View style={[styles.planCard, styles.planPro]}>
              <Ionicons name="star" size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.planTitulo, { color: "#fff" }]}>Plan Pro</Text>
                <Text style={[styles.planSub, { color: "rgba(255,255,255,0.85)" }]}>
                  Reservas ilimitadas{pi?.hasta ? ` · hasta ${fechaPlan(pi.hasta)}` : ""}.
                  {diasPlan <= 5 ? ` Vence en ${diasPlan}d.` : ""}
                </Text>
              </View>
              {diasPlan <= 5 && (
                <TouchableOpacity style={styles.planWaBtn} onPress={abrirWA}>
                  <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                  <Text style={styles.planWaTxt}>Renovar</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={[styles.planCard, styles.planGratis]}>
              <Ionicons name="gift-outline" size={20} color={theme.colors.serv} />
              <View style={{ flex: 1 }}>
                <Text style={styles.planTitulo}>Prueba gratis · quedan {diasPlan} {diasPlan === 1 ? "día" : "días"}</Text>
                <Text style={styles.planSub}>Todo sin límite. Sin comisiones por reserva.</Text>
              </View>
              {diasPlan <= 7 && (
                <TouchableOpacity style={[styles.planWaBtn, { backgroundColor: theme.colors.serv }]} onPress={abrirWA}>
                  <Text style={styles.planWaTxt}>Pásate a Pro</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Periodo */}
          <View style={styles.periodos}>
            {PERIODOS.map((p) => (
              <TouchableOpacity
                key={p.dias}
                style={[styles.periodoChip, dias === p.dias && styles.periodoChipSel]}
                onPress={() => setDias(p.dias)}
              >
                <Text style={[styles.periodoTxt, dias === p.dias && styles.periodoTxtSel]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Ingreso destacado de citas. El ícono refleja el tipo de negocio
              (peluquería, dentista, etc.); genérico si no hay categoría. */}
          <View style={styles.sectionRow}>
            <Ionicons
              name={(stats?.categoria_servicio && CATEGORIAS_SERVICIOS[stats.categoria_servicio]?.icon) || "calendar-outline"}
              size={18}
              color={theme.colors.serv}
            />
            <Text style={[styles.sectionTitle, { color: theme.colors.serv, marginTop: 0 }]}>Reservas</Text>
          </View>
          <View style={[styles.ingresoCard, theme.shadow.sm]}>
            <Text style={styles.ingresoLabel}>Ingreso por reservas completadas</Text>
            <Text style={styles.ingresoMonto}>${ingreso.toLocaleString("es-MX")}</Text>
          </View>

          {/* Métricas */}
          <View style={styles.metricsGrid}>
            <Metric label="Completadas" value={Number(r.completadas) || 0} color={theme.colors.accentDark} />
            <Metric label="Pendientes" value={Number(r.pendientes) || 0} color={theme.colors.warningDark} />
            <Metric label="Canceladas" value={Number(r.canceladas) || 0} color={theme.colors.danger} />
            <Metric label="No asistió" value={Number(r.no_shows) || 0} color={theme.colors.gray500} />
          </View>

          {/* Top servicios */}
          {stats.top.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Servicios más solicitados</Text>
              {stats.top.map((t, i) => (
                <View key={i} style={styles.topRow}>
                  <Text style={styles.topPos}>{i + 1}</Text>
                  <Text style={styles.topNombre} numberOfLines={1}>
                    {t.servicio_nombre}
                  </Text>
                  <Text style={styles.topN}>{Number(t.n)} reservas</Text>
                  <Text style={styles.topIngreso}>${Number(t.ingreso) || 0}</Text>
                </View>
              ))}
            </>
          )}

          {/* Productos (si la tienda también vende en Mercadito) */}
          {stats.tieneProductos && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.colors.brand }]}>🛒 Productos (Mercadito)</Text>
              <View style={[styles.ingresoCard, theme.shadow.sm]}>
                <Text style={styles.ingresoLabel}>Ingreso por productos</Text>
                <Text style={[styles.ingresoMonto, { color: theme.colors.brand }]}>
                  ${(Number(stats.productos.ingreso) || 0).toLocaleString("es-MX")}
                </Text>
              </View>
              <View style={styles.metricsGrid}>
                <Metric label="Pedidos" value={Number(stats.productos.pedidos) || 0} color={theme.colors.brand} />
                <Metric label="Artículos" value={Number(stats.productos.items) || 0} color={theme.colors.accentDark} />
              </View>
              {stats.topProductos.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Productos más vendidos</Text>
                  {stats.topProductos.map((p, i) => (
                    <View key={i} style={styles.topRow}>
                      <Text style={styles.topPos}>{i + 1}</Text>
                      <Text style={styles.topNombre} numberOfLines={1}>
                        {p.nombre}
                      </Text>
                      <Text style={styles.topN}>{Number(p.cantidad)} u.</Text>
                      <Text style={styles.topIngreso}>${Number(p.ingreso) || 0}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          {/* Historial reciente */}
          <Text style={styles.sectionTitle}>Historial de reservas completadas</Text>
          {completadas.length === 0 ? (
            <Text style={styles.empty}>Aún no hay reservas completadas.</Text>
          ) : (
            completadas.slice(0, 30).map((c) => (
              <View key={c.id} style={styles.histRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.histCliente} numberOfLines={1}>
                    {c.cliente_nombre}
                  </Text>
                  <Text style={styles.histServ} numberOfLines={1}>
                    {c.servicio_nombre} · {fmtCitaCorta(c.inicio)}
                  </Text>
                </View>
                {c.precio != null && <Text style={styles.histPrecio}>${Number(c.precio)}</Text>}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.metric, theme.shadow.sm]}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  titulo: { ...theme.typography.h3, color: theme.colors.gray900 },
  vacio: { alignItems: "center", gap: 12, paddingVertical: 60 },
  vacioTxt: { ...theme.typography.body, color: theme.colors.gray500 },
  planCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: theme.radius.lg, padding: 16, marginBottom: 16 },
  planGratis: { backgroundColor: theme.colors.servLight },
  planPro: { backgroundColor: theme.colors.serv },
  planVencido: { backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FCA5A5" },
  planWaBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#25D366", paddingVertical: 7, paddingHorizontal: 12, borderRadius: theme.radius.pill },
  planWaTxt: { ...theme.typography.caption, color: "#fff", fontFamily: theme.fontFamily.semibold },
  planTitulo: { ...theme.typography.title, color: theme.colors.servDark },
  planSub: { ...theme.typography.bodySmall, color: theme.colors.serv, marginTop: 2 },
  periodos: { flexDirection: "row", gap: 8, marginBottom: 16 },
  periodoChip: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: theme.radius.pill, backgroundColor: theme.colors.white },
  periodoChipSel: { backgroundColor: theme.colors.serv },
  periodoTxt: { ...theme.typography.buttonSmall, color: theme.colors.gray600 },
  periodoTxtSel: { color: "#fff" },
  ingresoCard: { backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 20, marginBottom: 16, alignItems: "center" },
  ingresoLabel: { ...theme.typography.bodySmall, color: theme.colors.gray500 },
  ingresoMonto: { ...theme.typography.h1, color: theme.colors.serv, marginTop: 6, fontVariant: ["tabular-nums"] },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  metric: { width: "47%", flexGrow: 1, backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 16, alignItems: "center" },
  metricValue: { ...theme.typography.h2, fontVariant: ["tabular-nums"] },
  metricLabel: { ...theme.typography.bodySmall, color: theme.colors.gray500, marginTop: 4 },
  sectionTitle: { ...theme.typography.h3, color: theme.colors.gray800, marginTop: 20, marginBottom: 10 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 10 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.colors.white, borderRadius: theme.radius.md, padding: 12, marginBottom: 8 },
  topPos: { ...theme.typography.title, color: theme.colors.serv, width: 20 },
  topNombre: { ...theme.typography.bodyMedium, color: theme.colors.gray900, flex: 1 },
  topN: { ...theme.typography.bodySmall, color: theme.colors.gray500 },
  topIngreso: { ...theme.typography.title, color: theme.colors.accentDark },
  empty: { ...theme.typography.body, color: theme.colors.gray500, paddingVertical: 12 },
  histRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.gray100 },
  histCliente: { ...theme.typography.bodyMedium, color: theme.colors.gray900 },
  histServ: { ...theme.typography.bodySmall, color: theme.colors.gray500, marginTop: 2 },
  histPrecio: { ...theme.typography.title, color: theme.colors.serv },
});
