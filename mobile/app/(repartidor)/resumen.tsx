import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import ScreenHeader from "../../src/components/ScreenHeader";
import { obtenerResumen, type ResumenRepartidor } from "../../src/api/repartidor";

export default function ResumenRepartidorScreen() {
  const [data, setData] = useState<ResumenRepartidor | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setData(await obtenerResumen());
    } catch {
      /* no-op */
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const saldo = data?.saldo ?? 0;
  return (
    <View style={styles.container}>
      <ScreenHeader title="Mi resumen" subtitle="Repartidor" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
      >
        {/* Saldo: lo que debo a Mercadito */}
        {data?.confianza ? (
          <View style={[styles.saldoCard, { backgroundColor: "#EFF6FF" }]}>
            <Text style={styles.saldoLabel}>Repartidor de confianza</Text>
            <Text style={[styles.saldoMonto, { color: "#1D4ED8" }]}>Sin deuda</Text>
            <Text style={styles.saldoNota}>No acumulas comisión por pedidos en efectivo.</Text>
          </View>
        ) : (
          <View style={[styles.saldoCard, { backgroundColor: saldo > 0 ? "#FEF2F2" : "#F0FDF4" }]}>
            <Text style={styles.saldoLabel}>Le debo a Mercadito</Text>
            <Text style={[styles.saldoMonto, { color: saldo > 0 ? "#DC2626" : "#16A34A" }]}>${saldo.toFixed(0)}</Text>
            <Text style={styles.saldoNota}>
              {saldo > 0
                ? "Comisión de pedidos en efectivo que cobraste completos. Págala (transferencia o efectivo) para no caer en morosidad."
                : "Estás al corriente. ¡Bien!"}
            </Text>
          </View>
        )}

        {/* KPIs */}
        <View style={styles.kpiRow}>
          <View style={styles.kpi}>
            <Text style={styles.kpiNum}>{data?.entregados ?? 0}</Text>
            <Text style={styles.kpiLabel}>Entregas</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={[styles.kpiNum, { color: "#16A34A" }]}>${(data?.envios_cobrados ?? 0).toFixed(0)}</Text>
            <Text style={styles.kpiLabel}>Envíos cobrados</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiNum}>{data?.pedidos_activos ?? 0}</Text>
            <Text style={styles.kpiLabel}>Activos</Text>
          </View>
        </View>

        {/* Movimientos */}
        <Text style={styles.sectionTitle}>Movimientos</Text>
        {(data?.movimientos ?? []).length === 0 ? (
          <Text style={styles.vacio}>Aún no tienes movimientos.</Text>
        ) : (
          (data?.movimientos ?? []).map((m) => (
            <View key={m.id} style={styles.movRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.movConcepto}>{m.concepto ?? (m.tipo === "cargo" ? "Cargo" : "Abono")}</Text>
                <Text style={styles.movMeta}>
                  {m.cliente_nombre ? `${m.cliente_nombre} · ` : ""}
                  {new Date(m.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                </Text>
              </View>
              <Text style={[styles.movMonto, { color: m.tipo === "cargo" ? "#DC2626" : "#16A34A" }]}>
                {m.tipo === "cargo" ? "+" : "−"}${m.monto.toFixed(0)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FCFBFA" },
  body: { padding: 16 },
  saldoCard: { borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 14 },
  saldoLabel: { fontSize: 12, color: "#8B7B69", fontWeight: "600" },
  saldoMonto: { fontSize: 36, fontWeight: "800", marginTop: 2 },
  saldoNota: { fontSize: 12, color: "#6B7280", textAlign: "center", marginTop: 6 },
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  kpi: { flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 12, alignItems: "center" },
  kpiNum: { fontSize: 20, fontWeight: "800", color: "#1F2937" },
  kpiLabel: { fontSize: 10, color: "#8B7B69", marginTop: 2 },
  sectionTitle: { fontSize: 11, color: "#8B7B69", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: "700" },
  vacio: { color: "#8B7B69", textAlign: "center", paddingVertical: 24 },
  movRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 10, padding: 12, marginBottom: 6 },
  movConcepto: { fontSize: 13, fontWeight: "600", color: "#1F2937" },
  movMeta: { fontSize: 11, color: "#8B7B69", marginTop: 1 },
  movMonto: { fontSize: 15, fontWeight: "800" },
});
