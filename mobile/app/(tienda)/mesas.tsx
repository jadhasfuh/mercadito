import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Switch, Alert, RefreshControl, Linking } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../src/contexts/SessionContext";
import { waUrl } from "../../src/lib/contacto";
import ScreenHeader from "../../src/components/ScreenHeader";
import {
  listarMesas, crearMesa, borrarMesa, listarComandas, marcarItemCocina, cerrarCuenta,
  guardarConfigMesa, obtenerConfigMesa, type Mesa, type Comanda,
} from "../../src/api/mesas";

const SIG: Record<string, { sig: string; label: string; color: string }> = {
  pendiente: { sig: "preparando", label: "Empezar", color: "#F59E0B" },
  preparando: { sig: "listo", label: "Listo", color: "#0EA5A4" },
  listo: { sig: "servido", label: "Servido", color: "#16A34A" },
  servido: { sig: "servido", label: "✓", color: "#9CA3AF" },
};
const BASE = "https://mercadito.cx";

export default function MesasScreen() {
  const { usuario } = useSession();
  const pid = usuario?.puesto_id || "";
  const [sub, setSub] = useState<"comandas" | "mesas">("comandas");
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [nueva, setNueva] = useState("");
  const [dineIn, setDineIn] = useState(false);
  const [metodos, setMetodos] = useState<string[]>(["caja"]);
  const [refrescando, setRefrescando] = useState(false);
  const [premium, setPremium] = useState<boolean | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [ms, cs, cfg] = await Promise.all([listarMesas(), listarComandas(), obtenerConfigMesa(pid).catch(() => null)]);
      setMesas(ms); setComandas(cs);
      if (cfg) { setDineIn(cfg.dine_in_activo); setMetodos(cfg.metodos_pago_mesa); setPremium(cfg.premium); }
    } catch { /* no-op */ } finally { setRefrescando(false); }
  }, [pid]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  useEffect(() => { const i = setInterval(() => listarComandas().then(setComandas).catch(() => {}), 15000); return () => clearInterval(i); }, []);

  async function toggleDineIn(v: boolean) { setDineIn(v); await guardarConfigMesa({ dine_in_activo: v }); }
  async function toggleMetodo(m: string) {
    const next = metodos.includes(m) ? metodos.filter((x) => x !== m) : [...metodos, m];
    const arr = next.length ? next : ["caja"];
    setMetodos(arr); await guardarConfigMesa({ metodos_pago_mesa: arr });
  }
  async function agregar() { if (!nueva.trim()) return; await crearMesa(nueva.trim()); setNueva(""); cargar(); }
  function eliminar(m: Mesa) { Alert.alert("Eliminar mesa", `¿Eliminar ${m.etiqueta}?`, [{ text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: async () => { await borrarMesa(m.id); cargar(); } }]); }
  async function marcar(itemId: string, estado: string) { await marcarItemCocina(itemId, estado); listarComandas().then(setComandas); }
  function cerrar(c: Comanda) {
    const metodo = metodos[0] || "caja";
    Alert.alert("Cerrar cuenta", `${c.etiqueta} · $${c.total.toFixed(0)} (${metodo === "caja" ? "en caja" : metodo})`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar y cobrar", onPress: async () => { await cerrarCuenta(c.cuenta_id, metodo); cargar(); } },
    ]);
  }

  // Gate por plan: si no es Premium, ocultar mesas/QR y mostrar upsell.
  if (premium === false) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Mesas" subtitle="Pedido en mesa" />
        <View style={{ padding: 20 }}>
          <View style={styles.upsell}>
            <Text style={{ fontSize: 40, textAlign: "center" }}>✨</Text>
            <Text style={styles.upsellTitle}>Mesas, meseros y Reservas</Text>
            <Text style={styles.upsellSub}>Pedidos en mesa con código QR, cuentas de mesero y agenda de reservas — en el plan Premium. (Tu menú digital es gratis.)</Text>
            <Text style={styles.upsellPrice}>$99 <Text style={styles.upsellMes}>/ mes</Text></Text>
            <Text style={styles.upsellSub}>Sin comisiones por venta.</Text>
            <TouchableOpacity
              style={styles.upsellBtn}
              onPress={() => Linking.openURL(waUrl("Hola, quiero activar el plan Premium ($99/mes) para mi negocio en Mercadito (mesas, meseros y reservas)."))}
            >
              <Ionicons name="logo-whatsapp" size={16} color="#fff" />
              <Text style={styles.upsellBtnTxt}>Activar Premium por WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Mesas" subtitle="Pedido en mesa" />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}>
        {/* Config */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Pedido en mesa (sin mesero)</Text>
            <Switch value={dineIn} onValueChange={toggleDineIn} trackColor={{ false: "#E5E7EB", true: "#ED8E3C" }} thumbColor="#fff" />
          </View>
          <Text style={styles.hint}>Los clientes escanean el QR de su mesa y piden desde su celular. Requiere plan Pro.</Text>
          {dineIn && (
            <>
              <Text style={[styles.hint, { marginTop: 6, fontWeight: "700" }]}>Cómo cobras (tú decides):</Text>
              <View style={styles.chips}>
                {[["caja", "En caja"], ["transferencia", "Transferencia"], ["tarjeta", "Tarjeta"]].map(([m, l]) => (
                  <TouchableOpacity key={m} onPress={() => toggleMetodo(m)} style={[styles.chip, metodos.includes(m) && styles.chipOn]}>
                    <Text style={[styles.chipTxt, metodos.includes(m) && styles.chipTxtOn]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Sub-tabs */}
        <View style={styles.subTabs}>
          <TouchableOpacity onPress={() => setSub("comandas")} style={[styles.subTab, sub === "comandas" && styles.subTabOn]}><Text style={[styles.subTabTxt, sub === "comandas" && styles.subTabTxtOn]}>Comandas ({comandas.length})</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setSub("mesas")} style={[styles.subTab, sub === "mesas" && styles.subTabOn]}><Text style={[styles.subTabTxt, sub === "mesas" && styles.subTabTxtOn]}>Mesas ({mesas.length})</Text></TouchableOpacity>
        </View>

        {sub === "comandas" && (comandas.length === 0 ? (
          <Text style={styles.vacio}>No hay mesas con cuenta abierta.</Text>
        ) : comandas.map((c) => (
          <View key={c.cuenta_id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{c.etiqueta}{c.estado === "por_cobrar" ? "  · pidió cuenta" : ""}</Text>
              <Text style={styles.total}>${c.total.toFixed(0)}</Text>
            </View>
            {c.items.map((i) => {
              const e = SIG[i.estado_cocina] || SIG.pendiente;
              return (
                <View key={i.id} style={styles.itemRow}>
                  <Text style={styles.itemTxt} numberOfLines={1}>{i.cantidad}× {i.producto_nombre}</Text>
                  <TouchableOpacity disabled={i.estado_cocina === "servido"} onPress={() => marcar(i.id, e.sig)} style={[styles.itemBtn, { backgroundColor: e.color }]}>
                    <Text style={styles.itemBtnTxt}>{e.label}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <TouchableOpacity onPress={() => cerrar(c)} style={styles.cerrarBtn}><Text style={styles.cerrarTxt}>Cerrar cuenta · cobrar ${c.total.toFixed(0)}</Text></TouchableOpacity>
          </View>
        )))}

        {sub === "mesas" && (
          <>
            <View style={[styles.row, { marginBottom: 10 }]}>
              <TextInput value={nueva} onChangeText={setNueva} placeholder="Ej. Mesa 1, Barra 3" placeholderTextColor="#9C8B72" style={styles.input} />
              <TouchableOpacity onPress={agregar} style={styles.addBtn}><Text style={styles.addTxt}>+ Agregar</Text></TouchableOpacity>
            </View>
            {mesas.map((m) => (
              <View key={m.id} style={[styles.card, styles.row]}>
                <Image source={{ uri: `${BASE}/api/menu/${pid}/qr?mesa=${m.token}` }} style={{ width: 64, height: 64, borderRadius: 8 }} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardTitle}>{m.etiqueta}</Text>
                  <Text style={styles.hint}>QR listo para imprimir</Text>
                </View>
                <TouchableOpacity onPress={() => eliminar(m)}><Text style={{ color: "#DC2626", fontSize: 12, fontWeight: "600" }}>Eliminar</Text></TouchableOpacity>
              </View>
            ))}
            {mesas.length === 0 && <Text style={styles.vacio}>Agrega tus mesas para imprimir su QR.</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FCFBFA" },
  upsell: { backgroundColor: "#fff", borderRadius: 18, padding: 24, alignItems: "center", borderWidth: 2, borderColor: "rgba(237,142,60,0.3)", borderStyle: "dashed" },
  upsellTitle: { fontSize: 18, fontWeight: "800", color: "#1F2937", marginTop: 8, textAlign: "center" },
  upsellSub: { fontSize: 13, color: "#6B7280", marginTop: 4, textAlign: "center" },
  upsellPrice: { fontSize: 26, fontWeight: "800", color: "#ED8E3C", marginTop: 12 },
  upsellMes: { fontSize: 14, fontWeight: "700", color: "#9CA3AF" },
  upsellBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#25D366", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, marginTop: 16 },
  upsellBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  hint: { fontSize: 12, color: "#8B7B69", marginTop: 4 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center" },
  chips: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: "#E5E7EB" },
  chipOn: { backgroundColor: "#ED8E3C", borderColor: "#ED8E3C" },
  chipTxt: { fontSize: 12, color: "#8B7B69", fontWeight: "600" },
  chipTxtOn: { color: "#fff" },
  subTabs: { flexDirection: "row", gap: 6, marginBottom: 10 },
  subTab: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center" },
  subTabOn: { backgroundColor: "#ED8E3C" },
  subTabTxt: { fontSize: 13, fontWeight: "700", color: "#8B7B69" },
  subTabTxtOn: { color: "#fff" },
  total: { fontSize: 16, fontWeight: "800", color: "#1F2937" },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  itemTxt: { flex: 1, fontSize: 13, color: "#374151" },
  itemBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  itemBtnTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cerrarBtn: { backgroundColor: "#ED8E3C", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 10 },
  cerrarTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  input: { flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff" },
  addBtn: { backgroundColor: "#ED8E3C", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center", marginLeft: 8 },
  addTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  vacio: { textAlign: "center", color: "#8B7B69", paddingVertical: 30 },
});
