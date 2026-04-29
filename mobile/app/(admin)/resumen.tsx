import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { obtenerStats, type AdminStats } from "../../src/api/admin";

export default function ResumenScreen() {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await obtenerStats();
      setStats(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !stats) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#FF7A2B" /></View>;
  }
  if (!stats) {
    return <View style={styles.center}><Text style={styles.error}>No se pudieron cargar las estadísticas</Text></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.section}>Totales</Text>
      <View style={styles.grid}>
        <Kpi icon="receipt-outline" label="Total pedidos" value={String(stats.totales.total_pedidos)} />
        <Kpi icon="checkmark-done-outline" label="Entregados" value={String(stats.totales.entregados)} color="#065F46" />
        <Kpi icon="close-circle-outline" label="Cancelados" value={String(stats.totales.cancelados)} color="#991B1B" />
        <Kpi icon="bicycle-outline" label="Activos" value={String(stats.totales.activos)} color="#1E40AF" />
      </View>

      <Text style={styles.section}>Ingresos</Text>
      <View style={styles.grid}>
        <Kpi icon="cash-outline" label="Ventas total" value={`$${Number(stats.totales.ventas_total).toFixed(0)}`} color="#065F46" />
        <Kpi icon="bag-handle-outline" label="Productos" value={`$${Number(stats.totales.subtotal_productos).toFixed(0)}`} />
        <Kpi icon="bicycle-outline" label="Envíos" value={`$${Number(stats.totales.ingresos_envio).toFixed(0)}`} />
        <Kpi icon="pricetag-outline" label="Comisiones" value={`$${Number(stats.totales.ingresos_comisiones).toFixed(0)}`} />
      </View>

      <Text style={styles.section}>Clientes únicos</Text>
      <View style={styles.cardBig}>
        <Ionicons name="people-outline" size={28} color="#FF7A2B" />
        <Text style={styles.cardBigValue}>{stats.totales.clientes_unicos}</Text>
        <Text style={styles.cardBigLabel}>compradores</Text>
      </View>

      {stats.ventasPorDia.length > 0 && (
        <>
          <Text style={styles.section}>Últimos 7 días</Text>
          {stats.ventasPorDia.slice(0, 7).map((d) => (
            <View key={d.fecha} style={styles.row}>
              <Text style={styles.rowKey}>{new Date(d.fecha).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}</Text>
              <Text style={styles.rowMeta}>{d.pedidos} pedidos</Text>
              <Text style={styles.rowVal}>${Number(d.total).toFixed(0)}</Text>
            </View>
          ))}
        </>
      )}

      {stats.ventasPorTienda.length > 0 && (
        <>
          <Text style={styles.section}>Top tiendas</Text>
          {stats.ventasPorTienda.slice(0, 5).map((t) => (
            <View key={t.puesto_id} style={styles.row}>
              <Text style={styles.rowKey} numberOfLines={1}>🏪 {t.puesto_nombre}</Text>
              <Text style={styles.rowMeta}>{t.pedidos} ped.</Text>
              <Text style={styles.rowVal}>${Number(t.total_vendido).toFixed(0)}</Text>
            </View>
          ))}
        </>
      )}

      {stats.topProductos.length > 0 && (
        <>
          <Text style={styles.section}>Productos más pedidos</Text>
          {stats.topProductos.slice(0, 5).map((p) => (
            <View key={p.producto} style={styles.row}>
              <Text style={styles.rowKey} numberOfLines={1}>{p.producto}</Text>
              <Text style={styles.rowMeta}>{Number(p.cantidad_total).toFixed(0)} u.</Text>
              <Text style={styles.rowVal}>${Number(p.total_vendido).toFixed(0)}</Text>
            </View>
          ))}
        </>
      )}

      {stats.ventasPorRepartidor.length > 0 && (
        <>
          <Text style={styles.section}>Repartidores</Text>
          {stats.ventasPorRepartidor.map((r) => (
            <View key={r.repartidor} style={styles.row}>
              <Text style={styles.rowKey} numberOfLines={1}>🛵 {r.repartidor}</Text>
              <Text style={styles.rowMeta}>{r.pedidos_entregados} entregas</Text>
              <Text style={styles.rowVal}>${Number(r.envios).toFixed(0)}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Kpi({ icon, label, value, color }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.kpi}>
      <Ionicons name={icon} size={20} color={color ?? "#FF7A2B"} />
      <Text style={[styles.kpiValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  content: { padding: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "#FFF7EB" },
  error: { color: "#8B7B69" },
  section: { fontSize: 11, color: "#8B7B69", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpi: { flexBasis: "48%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 12, padding: 12, alignItems: "flex-start" },
  kpiValue: { fontSize: 22, fontWeight: "800", color: "#FF7A2B", marginTop: 4 },
  kpiLabel: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  cardBig: { backgroundColor: "#fff", borderRadius: 12, padding: 16, alignItems: "center", flexDirection: "row", gap: 12 },
  cardBigValue: { fontSize: 28, fontWeight: "800", color: "#1F2937" },
  cardBigLabel: { fontSize: 12, color: "#8B7B69" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#fff", borderRadius: 10, marginBottom: 6, gap: 8 },
  rowKey: { flex: 1, fontSize: 13, color: "#1F2937", fontWeight: "500" },
  rowMeta: { fontSize: 11, color: "#8B7B69" },
  rowVal: { fontSize: 13, fontWeight: "700", color: "#FF7A2B", minWidth: 60, textAlign: "right" },
});
