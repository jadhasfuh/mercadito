import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Linking, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  obtenerStats,
  listarCuentasTienda,
  marcarCuentaTiendaPagada,
  listarAporteTiendas,
  marcarAporteTiendaPagado,
  listarLiquidaciones,
  registrarAbonoRepartidor,
  type AdminStats,
  type CuentasTiendaResp,
  type AporteTienda,
  type RepartidorSaldo,
} from "../../src/api/admin";
import ScreenHeader from "../../src/components/ScreenHeader";
import Loader from "../../src/components/Loader";
import IngresoManualModalRN from "../../src/components/IngresoManualModal";

export default function ResumenScreen() {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [cuentas, setCuentas] = useState<CuentasTiendaResp | null>(null);
  // Periodo global del dashboard (1 semana / 15 días / 1 mes).
  const [dias, setDias] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ingresoModalAbierto, setIngresoModalAbierto] = useState(false);
  const [marcandoCuenta, setMarcandoCuenta] = useState<string | null>(null);
  const [verRecientes, setVerRecientes] = useState(false);
  const [aportes, setAportes] = useState<AporteTienda[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<RepartidorSaldo[]>([]);

  async function cobrarAporte(t: AporteTienda) {
    Alert.alert("Aporte de tienda", `¿Marcar como pagado el aporte de ${t.nombre} ($${Number(t.total_a_cobrar).toFixed(0)})?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Pagado", onPress: async () => { try { await marcarAporteTiendaPagado(t.id); await load(); } catch { Alert.alert("Error", "No se pudo"); } } },
    ]);
  }

  function abonarRepartidor(r: RepartidorSaldo) {
    const saldo = Number(r.saldo);
    const registrar = async (monto: number) => {
      if (!isFinite(monto) || monto <= 0) { Alert.alert("Monto inválido"); return; }
      try { await registrarAbonoRepartidor(r.id, monto); await load(); } catch { Alert.alert("Error", "No se pudo"); }
    };
    // iOS: pedir monto exacto. Android (sin Alert.prompt): confirmar saldo completo.
    if (typeof Alert.prompt === "function") {
      Alert.prompt(
        "Registrar pago",
        `¿Cuánto pagó ${r.nombre}? (debe $${saldo.toFixed(0)})`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Registrar", onPress: (txt?: string) => registrar(Number(txt)) },
        ],
        "plain-text",
        saldo.toFixed(0),
        "numeric"
      );
    } else {
      Alert.alert("Registrar pago", `¿${r.nombre} pagó su saldo completo de $${saldo.toFixed(0)}?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, pagó todo", onPress: () => registrar(saldo) },
      ]);
    }
  }

  const load = useCallback(async () => {
    try {
      const pad = (n: number) => String(n).padStart(2, "0");
      const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const hastaD = new Date();
      const desdeD = new Date();
      desdeD.setDate(desdeD.getDate() - dias + 1);
      const [data, cts, aps, liqs] = await Promise.all([
        obtenerStats(ymd(desdeD), ymd(hastaD)),
        listarCuentasTienda(dias).catch(() => null),
        listarAporteTiendas().catch(() => []),
        listarLiquidaciones().catch(() => []),
      ]);
      setStats(data);
      setCuentas(cts);
      setAportes(aps);
      setLiquidaciones(liqs);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dias]);
  useEffect(() => { load(); }, [load]);

  // Marcar la cuenta B2B de una tienda como pagada (mismo flow que el botón
  // verde en la web). Confirma con monto y refresca al terminar.
  async function marcarPagada(tiendaId: string, tiendaNombre: string, monto: number, n: number) {
    Alert.alert(
      "Marcar como pagado",
      `¿Confirmar que ${tiendaNombre} pagó $${monto.toFixed(2)} (${n} pedido${n !== 1 ? "s" : ""})?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, pagado",
          style: "destructive",
          onPress: async () => {
            setMarcandoCuenta(tiendaId);
            try {
              await marcarCuentaTiendaPagada(tiendaId);
              await load();
            } catch (e) {
              Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo marcar como pagado");
            } finally {
              setMarcandoCuenta(null);
            }
          },
        },
      ],
    );
  }

  if (loading && !stats) {
    return <Loader fullScreen texto="Cargando resumen…" />;
  }
  if (!stats) {
    return <View style={styles.center}><Text style={styles.error}>No se pudieron cargar las estadísticas</Text></View>;
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Resumen" subtitle="Estadísticas de Mercadito" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
      {/* Periodo global del dashboard */}
      <View style={styles.periodos}>
        {[{ d: 7, l: "1 semana" }, { d: 15, l: "15 días" }, { d: 30, l: "1 mes" }].map((p) => (
          <TouchableOpacity
            key={p.d}
            style={[styles.periodoChip, dias === p.d && styles.periodoChipSel]}
            onPress={() => setDias(p.d)}
          >
            <Text style={[styles.periodoTxt, dias === p.d && styles.periodoTxtSel]}>{p.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Ganancia destacada del periodo */}
      <View style={styles.ganaCard}>
        <Text style={styles.ganaLabel}>Ganancia Mercadito</Text>
        <Text style={styles.ganaMonto}>
          ${(
            Number(stats.totales.ingresos_envio) +
            Number(stats.totales.ingresos_comisiones) +
            Number(stats.totales.ingresos_manuales ?? 0)
          ).toLocaleString("es-MX", { maximumFractionDigits: 0 })}
        </Text>
        <Text style={styles.ganaSub}>
          Ventas totales ${Number(stats.totales.ventas_total).toLocaleString("es-MX", { maximumFractionDigits: 0 })}
        </Text>
      </View>

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
        {(stats.totales.ingresos_manuales ?? 0) > 0 && (
          <Kpi icon="hand-left-outline" label="Manuales" value={`$${Number(stats.totales.ingresos_manuales).toFixed(0)}`} color="#059669" />
        )}
        <Kpi
          icon="trending-up-outline"
          label="Ganancia total"
          value={`$${(Number(stats.totales.ingresos_envio) + Number(stats.totales.ingresos_comisiones) + Number(stats.totales.ingresos_manuales ?? 0)).toFixed(0)}`}
          color="#059669"
        />
      </View>

      <Text style={styles.section}>Clientes únicos</Text>
      <View style={styles.cardBig}>
        <Ionicons name="people-outline" size={28} color="#ED8E3C" />
        <Text style={styles.cardBigValue}>{stats.totales.clientes_unicos}</Text>
        <Text style={styles.cardBigLabel}>compradores</Text>
      </View>

      {/* Aporte de tiendas foráneas al envío ($20/pedido sin repartidor local) */}
      {aportes.length > 0 && (
        <>
          <Text style={styles.section}>Aporte de tiendas foráneas</Text>
          {aportes.map((t) => (
            <View key={t.id} style={styles.liqCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.liqNombre}>{t.nombre}</Text>
                <Text style={styles.liqMeta}>{t.num_pedidos} pedido{t.num_pedidos === 1 ? "" : "s"} · {t.ciudad}</Text>
              </View>
              <Text style={[styles.liqMonto, { color: "#B45309" }]}>${Number(t.total_a_cobrar).toFixed(0)}</Text>
              <TouchableOpacity onPress={() => cobrarAporte(t)} style={styles.liqBtn}>
                <Text style={styles.liqBtnTxt}>Pagado</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      {/* Liquidaciones de repartidores (deuda con Mercadito) */}
      {liquidaciones.some((r) => Number(r.saldo) > 0 || !r.repartidor_confianza) && (
        <>
          <Text style={styles.section}>Liquidaciones de repartidores</Text>
          {liquidaciones.map((r) => {
            const saldo = Number(r.saldo);
            const moroso = saldo >= 100;
            return (
              <View key={r.id} style={[styles.liqCard, moroso && { borderColor: "#FCA5A5", borderWidth: 1 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.liqNombre}>{r.nombre}{r.repartidor_confianza ? " · confianza" : ""}{!r.activo ? " · baja" : ""}</Text>
                  <Text style={styles.liqMeta}>{r.ciudad}</Text>
                </View>
                <Text style={[styles.liqMonto, { color: saldo > 0 ? (moroso ? "#DC2626" : "#B45309") : "#16A34A" }]}>${saldo.toFixed(0)}</Text>
                {saldo > 0 && (
                  <TouchableOpacity onPress={() => abonarRepartidor(r)} style={styles.liqBtn}>
                    <Text style={styles.liqBtnTxt}>Pago</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </>
      )}

      {cuentas && cuentas.tiendas.length > 0 && (
        <>
          <Text style={styles.section}>Cuentas por cobrar a tiendas</Text>
          <View style={styles.cuentasTotal}>
            <Text style={styles.cuentasLabel}>TOTAL POR COBRAR</Text>
            <Text style={styles.cuentasMonto}>${cuentas.total_general.toFixed(2)}</Text>
          </View>
          {cuentas.tiendas.map((t) => (
            <View key={t.tienda_id} style={styles.cuentaCard}>
              <View style={styles.cuentaRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cuentaNombre} numberOfLines={1}>{t.tienda_nombre}</Text>
                  <Text style={styles.cuentaMeta}>
                    {t.num_pedidos} pedido{t.num_pedidos !== 1 ? "s" : ""}
                    {t.telefono_contacto && (
                      <Text
                        onPress={() => Linking.openURL(
                          `https://wa.me/52${t.telefono_contacto!.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, te paso la cuenta de envíos de Mercadito de los últimos ${cuentas.dias} días: $${t.total_a_cobrar.toFixed(2)} (${t.num_pedidos} pedido${t.num_pedidos !== 1 ? "s" : ""}). ¿Cómo te queda transferir hoy?`)}`
                        )}
                        style={styles.cuentaWa}
                      > · WhatsApp</Text>
                    )}
                  </Text>
                </View>
                <Text style={styles.cuentaVal}>${t.total_a_cobrar.toFixed(2)}</Text>
              </View>
              <TouchableOpacity
                style={styles.btnPagado}
                onPress={() => marcarPagada(t.tienda_id, t.tienda_nombre, t.total_a_cobrar, t.num_pedidos)}
                disabled={marcandoCuenta === t.tienda_id}
              >
                {marcandoCuenta === t.tienda_id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnPagadoTxt}>✓ Marcar como pagado</Text>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      {stats.ventasPorDia.length > 0 && (
        <>
          <Text style={styles.section}>Ventas por día</Text>
          {stats.ventasPorDia.slice(0, 7).map((d) => {
            const man = Number(d.manuales ?? 0);
            const totalDia = Number(d.total) + man;
            return (
              <View key={d.fecha} style={styles.row}>
                <Text style={styles.rowKey}>{new Date(d.fecha).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}</Text>
                <Text style={styles.rowMeta}>
                  {d.pedidos} pedidos{man > 0 ? ` · +$${man.toFixed(0)} man.` : ""}
                </Text>
                <Text style={styles.rowVal}>${totalDia.toFixed(0)}</Text>
              </View>
            );
          })}
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

      {/* Ventas manuales (pedidos por WhatsApp / mandados con cobro mental).
          Mismo desglose que la web: total + por repartidor + recientes. */}
      {stats.ingresosManuales && stats.ingresosManuales.count > 0 && (
        <>
          <View style={styles.cuentasHeader}>
            <Text style={styles.section}>💰 Ventas manuales</Text>
            <View style={styles.ingresoBadge}>
              <Text style={styles.ingresoBadgeTxt}>
                {stats.ingresosManuales.count} · ${stats.ingresosManuales.total.toFixed(0)}
              </Text>
            </View>
          </View>
          <Text style={styles.helperTxt}>
            Pedidos por WhatsApp / mandados con cobro mental que el repartidor o admin capturó. Monto = ganancia Mercadito.
          </Text>
          {stats.ingresosManuales.por_repartidor.length > 0 && (
            <View style={styles.grid}>
              {stats.ingresosManuales.por_repartidor.map((r) => (
                <View key={r.repartidor} style={styles.ingresoTile}>
                  <Text style={styles.ingresoTileNom} numberOfLines={1}>{r.repartidor}</Text>
                  <Text style={styles.ingresoTileMon}>${r.total.toFixed(0)}</Text>
                  <Text style={styles.ingresoTileVen}>{r.ventas} venta{r.ventas === 1 ? "" : "s"}</Text>
                </View>
              ))}
            </View>
          )}
          {stats.ingresosManuales.recientes.length > 0 && (
            <>
              <TouchableOpacity onPress={() => setVerRecientes((v) => !v)} style={styles.toggleRecientes}>
                <Text style={styles.toggleRecientesTxt}>
                  {verRecientes ? "▼" : "▶"} Ver últimas {stats.ingresosManuales.recientes.length}
                </Text>
              </TouchableOpacity>
              {verRecientes && stats.ingresosManuales.recientes.map((r) => (
                <View key={r.id} style={styles.ingresoItem}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.ingresoItemTit}>
                      {r.tipo === "tienda" ? `🏪 ${r.puesto_nombre || "—"}` : `🛵 ${r.cliente_nombre || "Cliente"}`}
                    </Text>
                    <Text style={styles.ingresoItemMeta}>
                      {r.repartidor_nombre} · {r.metodo_pago || "efectivo"} · {new Date(r.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                    </Text>
                    {r.detalle && <Text style={styles.ingresoItemDet}>{r.detalle}</Text>}
                    {r.cliente_telefono && (
                      <Text style={styles.ingresoItemTel} onPress={() => Linking.openURL(`tel:${r.cliente_telefono}`)}>
                        📞 {r.cliente_telefono}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.ingresoItemMon}>${r.monto.toFixed(0)}</Text>
                </View>
              ))}
            </>
          )}
        </>
      )}
      </ScrollView>

      <View style={[styles.fabWrap, { bottom: 16 + insets.bottom }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.fabBtn} onPress={() => setIngresoModalAbierto(true)} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={styles.fabBtnTxt}>Venta manual</Text>
        </TouchableOpacity>
      </View>

      <IngresoManualModalRN
        abierto={ingresoModalAbierto}
        onClose={() => setIngresoModalAbierto(false)}
        onGuardado={load}
      />
    </View>
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
      <Ionicons name={icon} size={20} color={color ?? "#ED8E3C"} />
      <Text style={[styles.kpiValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FCFBFA" },
  content: { padding: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "#FCFBFA" },
  error: { color: "#8B7B69" },
  section: { fontSize: 11, color: "#8B7B69", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  periodos: { flexDirection: "row", gap: 8, marginBottom: 14 },
  periodoChip: { flex: 1, paddingVertical: 9, borderRadius: 999, backgroundColor: "#fff", alignItems: "center" },
  periodoChipSel: { backgroundColor: "#ED8E3C" },
  periodoTxt: { fontSize: 13, fontWeight: "700", color: "#6B7280" },
  periodoTxtSel: { color: "#fff" },
  ganaCard: { backgroundColor: "#fff", borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 4 },
  ganaLabel: { fontSize: 12, color: "#8B7B69", fontWeight: "600" },
  ganaMonto: { fontSize: 32, fontWeight: "900", color: "#059669", marginTop: 4 },
  ganaSub: { fontSize: 12, color: "#8B7B69", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpi: { flexBasis: "48%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 12, padding: 12, alignItems: "flex-start" },
  kpiValue: { fontSize: 22, fontWeight: "800", color: "#ED8E3C", marginTop: 4 },
  kpiLabel: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  cardBig: { backgroundColor: "#fff", borderRadius: 12, padding: 16, alignItems: "center", flexDirection: "row", gap: 12 },
  cardBigValue: { fontSize: 28, fontWeight: "800", color: "#1F2937" },
  cardBigLabel: { fontSize: 12, color: "#8B7B69" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#fff", borderRadius: 10, marginBottom: 6, gap: 8 },
  rowKey: { flex: 1, fontSize: 13, color: "#1F2937", fontWeight: "500" },
  rowMeta: { fontSize: 11, color: "#8B7B69" },
  rowVal: { fontSize: 13, fontWeight: "700", color: "#ED8E3C", minWidth: 60, textAlign: "right" },
  cuentasHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  diasToggle: { flexDirection: "row", gap: 4 },
  diasBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "#F3F4F6" },
  diasBtnActive: { backgroundColor: "#ED8E3C" },
  diasBtnTxt: { fontSize: 11, color: "#6B7280", fontWeight: "700" },
  diasBtnTxtActive: { color: "#fff" },
  liqCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 10, padding: 12, marginBottom: 6 },
  liqNombre: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  liqMeta: { fontSize: 11, color: "#8B7B69", marginTop: 1 },
  liqMonto: { fontSize: 16, fontWeight: "800" },
  liqBtn: { backgroundColor: "#ED8E3C", borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  liqBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
  cuentasTotal: { backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", borderRadius: 12, padding: 14, marginBottom: 8 },
  cuentasLabel: { fontSize: 10, fontWeight: "800", color: "#92400E", letterSpacing: 0.5 },
  cuentasMonto: { fontSize: 26, fontWeight: "900", color: "#78350F", marginTop: 2 },
  cuentaCard: { backgroundColor: "#fff", borderRadius: 10, padding: 10, marginBottom: 6, gap: 8 },
  cuentaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cuentaNombre: { fontSize: 13, fontWeight: "600", color: "#1F2937" },
  cuentaMeta: { fontSize: 11, color: "#8B7B69", marginTop: 1 },
  cuentaWa: { color: "#059669", fontWeight: "700" },
  cuentaVal: { fontSize: 13, fontWeight: "700", color: "#92400E", minWidth: 60, textAlign: "right" },
  btnPagado: { backgroundColor: "#10B981", borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  btnPagadoTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
  ingresoBadge: { backgroundColor: "#D1FAE5", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  ingresoBadgeTxt: { color: "#065F46", fontSize: 11, fontWeight: "700" },
  helperTxt: { fontSize: 11, color: "#6B7280", marginBottom: 8, marginTop: -4 },
  ingresoTile: { flexBasis: "48%", flexGrow: 1, backgroundColor: "#ECFDF5", borderRadius: 10, padding: 10 },
  ingresoTileNom: { fontSize: 11, fontWeight: "700", color: "#065F46" },
  ingresoTileMon: { fontSize: 18, fontWeight: "800", color: "#064E3B", marginTop: 2 },
  ingresoTileVen: { fontSize: 10, color: "#10B981", marginTop: 1 },
  toggleRecientes: { paddingVertical: 8, marginTop: 4 },
  toggleRecientesTxt: { fontSize: 12, fontWeight: "700", color: "#ED8E3C" },
  ingresoItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#fff", borderRadius: 10, padding: 10, marginBottom: 6 },
  ingresoItemTit: { fontSize: 12, fontWeight: "700", color: "#1F2937" },
  ingresoItemMeta: { fontSize: 10, color: "#8B7B69", marginTop: 2 },
  ingresoItemDet: { fontSize: 11, color: "#4B5563", marginTop: 4 },
  ingresoItemTel: { fontSize: 11, color: "#1E40AF", marginTop: 2 },
  ingresoItemMon: { fontSize: 14, fontWeight: "800", color: "#059669" },
  fabWrap: { position: "absolute", right: 16, alignItems: "flex-end" },
  fabBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#ED8E3C", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, elevation: 6 },
  fabBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
