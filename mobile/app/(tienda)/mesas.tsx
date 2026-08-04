import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Switch, Alert, RefreshControl, Linking, Modal, Share } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Print from "expo-print";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../src/contexts/SessionContext";
import { waUrl } from "../../src/lib/contacto";
import ScreenHeader from "../../src/components/ScreenHeader";
import {
  listarMesas, crearMesa, borrarMesa, listarComandas, marcarItemCocina, cerrarCuenta,
  guardarConfigMesa, obtenerConfigMesa, type Mesa, type Comanda, type ComandaItem,
} from "../../src/api/mesas";

/** Sabor/tamaño y extras de una línea, en una sola cadena. Los modificadores
 *  del pedido normal traen `opcion_nombre`; los de mesa, `nombre`. */
function detalleItem(i: ComandaItem): string {
  return [i.variante_nombre, ...(i.modificadores ?? []).map((m) => m.opcion_nombre || m.nombre)]
    .filter(Boolean)
    .join(" · ");
}

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
  const [qrMesa, setQrMesa] = useState<Mesa | null>(null);
  const [dineIn, setDineIn] = useState(false);
  const [metodos, setMetodos] = useState<string[]>(["caja"]);
  const [refrescando, setRefrescando] = useState(false);
  const [premium, setPremium] = useState<boolean | null>(null);
  const [cobrando, setCobrando] = useState<Comanda | null>(null);
  const [propina, setPropina] = useState(0);
  const [dividir, setDividir] = useState(1);
  const [negocioNombre, setNegocioNombre] = useState("");

  const cargar = useCallback(async () => {
    try {
      const [ms, cs, cfg] = await Promise.all([listarMesas(), listarComandas(), obtenerConfigMesa(pid).catch(() => null)]);
      setMesas(ms); setComandas(cs);
      if (cfg) { setDineIn(cfg.dine_in_activo); setMetodos(cfg.metodos_pago_mesa); setPremium(cfg.premium); setNegocioNombre(cfg.nombre); }
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
  // Abre el modal de cobro (propina + dividir + método). Mercadito no procesa
  // el pago: solo registra cómo pagó el cliente y guarda la propina.
  function cerrar(c: Comanda) {
    setPropina(0); setDividir(1); setCobrando(c);
  }
  async function cobrar(metodo: string) {
    if (!cobrando) return;
    await cerrarCuenta(cobrando.cuenta_id, metodo, propina);
    setCobrando(null); cargar();
  }
  // Imprime el ticket de la cuenta (recibo). expo-print manda el HTML a la
  // hoja de impresión del sistema (AirPrint / impresora térmica emparejada).
  async function imprimirTicket(c: Comanda) {
    const filas = c.items.map((i) => {
      const det = detalleItem(i);
      return `<tr><td>${i.cantidad}× ${i.producto_nombre}${det ? `<div style="color:#666;font-size:11px">${det}</div>` : ""}</td><td style="text-align:right;vertical-align:top">$${Number(i.subtotal).toFixed(2)}</td></tr>`;
    }).join("");
    const html = `<html><body style="font-family:monospace;font-size:13px;padding:16px;max-width:340px">
      <div style="text-align:center"><div style="font-weight:bold;font-size:16px">${negocioNombre || "Cuenta"}</div><div style="color:#666">${c.etiqueta}</div></div>
      <hr style="border:none;border-top:1px dashed #999"/>
      <table style="width:100%;border-collapse:collapse">${filas}</table>
      <hr style="border:none;border-top:1px dashed #999"/>
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:15px"><span>TOTAL</span><span>$${c.total.toFixed(2)}</span></div>
      <div style="text-align:center;color:#666;margin-top:16px">¡Gracias por su visita!</div>
    </body></html>`;
    try { await Print.printAsync({ html }); } catch { /* el usuario canceló */ }
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
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemTxt} numberOfLines={1}>{i.cantidad}× {i.producto_nombre}</Text>
                    {detalleItem(i) ? <Text style={styles.itemExtras} numberOfLines={2}>{detalleItem(i)}</Text> : null}
                  </View>
                  <TouchableOpacity disabled={i.estado_cocina === "servido"} onPress={() => marcar(i.id, e.sig)} style={[styles.itemBtn, { backgroundColor: e.color }]}>
                    <Text style={styles.itemBtnTxt}>{e.label}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <View style={styles.accionesCuenta}>
              <TouchableOpacity onPress={() => imprimirTicket(c)} style={styles.ticketBtn}><Text style={styles.ticketTxt}>🖨️ Ticket</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => cerrar(c)} style={[styles.cerrarBtn, { flex: 1 }]}><Text style={styles.cerrarTxt}>Cerrar · cobrar ${c.total.toFixed(0)}</Text></TouchableOpacity>
            </View>
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
                <TouchableOpacity onPress={() => setQrMesa(m)}>
                  <Image source={{ uri: `${BASE}/api/menu/${pid}/qr?mesa=${m.token}` }} style={{ width: 64, height: 64, borderRadius: 8 }} />
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, marginLeft: 10 }} onPress={() => setQrMesa(m)}>
                  <Text style={styles.cardTitle}>{m.etiqueta}</Text>
                  <Text style={[styles.hint, { color: "#ED8E3C" }]}>Toca el QR para ver / imprimir / compartir</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => eliminar(m)}><Text style={{ color: "#DC2626", fontSize: 12, fontWeight: "600" }}>Eliminar</Text></TouchableOpacity>
              </View>
            ))}
            {mesas.length === 0 && <Text style={styles.vacio}>Agrega tus mesas para imprimir su QR.</Text>}
          </>
        )}
      </ScrollView>

      {/* Modal QR de mesa: ver grande, compartir e imprimir/descargar. */}
      <Modal visible={!!qrMesa} transparent animationType="fade" onRequestClose={() => setQrMesa(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setQrMesa(null)} style={styles.qrBackdrop}>
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>{qrMesa?.etiqueta}</Text>
            <Text style={styles.qrSub}>Los clientes escanean este QR para pedir desde su mesa.</Text>
            {qrMesa && (
              <Image source={{ uri: `${BASE}/api/menu/${pid}/qr?mesa=${qrMesa.token}` }} style={{ width: 240, height: 240, marginVertical: 12 }} />
            )}
            <TouchableOpacity
              style={[styles.qrBtn, { backgroundColor: "#25D366" }]}
              onPress={() => qrMesa && Share.share({ message: `📲 Escanea para pedir en ${qrMesa.etiqueta}:\n${BASE}/m/${pid}/mesa/${qrMesa.token}` })}
            >
              <Ionicons name="share-social-outline" size={16} color="#fff" />
              <Text style={styles.qrBtnTxt}>Compartir QR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.qrBtn, { backgroundColor: "#ED8E3C" }]}
              onPress={() => qrMesa && Linking.openURL(`${BASE}/api/menu/${pid}/qr?mesa=${qrMesa.token}`)}
            >
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={styles.qrBtnTxt}>Descargar / Imprimir</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setQrMesa(null)} style={{ marginTop: 10 }}>
              <Text style={{ color: "#6B7280", fontWeight: "600" }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal de cobro: propina + dividir + método de pago. */}
      <Modal visible={!!cobrando} transparent animationType="fade" onRequestClose={() => setCobrando(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setCobrando(null)} style={styles.qrBackdrop}>
          <View style={styles.cobroCard} onStartShouldSetResponder={() => true}>
            {cobrando && (() => {
              const totalItems = cobrando.total;
              const totalConPropina = totalItems + propina;
              const porPersona = totalConPropina / Math.max(1, dividir);
              return (
                <>
                  <Text style={styles.cobroTitle}>{cobrando.etiqueta}</Text>
                  <Text style={styles.cobroSub}>Consumo ${totalItems.toFixed(0)}</Text>
                  <Text style={styles.cobroLabel}>Propina</Text>
                  <View style={styles.propRow}>
                    {[0, 10, 15, 20].map((p) => {
                      const monto = Math.round((totalItems * p) / 100);
                      const on = propina === monto;
                      return (
                        <TouchableOpacity key={p} onPress={() => setPropina(monto)} style={[styles.propBtn, on && styles.propBtnOn]}>
                          <Text style={[styles.propTxt, on && styles.propTxtOn]}>{p === 0 ? "Sin" : `${p}%`}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput keyboardType="numeric" value={propina ? String(propina) : ""} onChangeText={(t) => setPropina(Math.max(0, Math.floor(Number(t.replace(/[^0-9]/g, "")) || 0)))} placeholder="Otra cantidad ($)" placeholderTextColor="#9C8B72" style={styles.cobroInput} />
                  <View style={styles.dividirRow}>
                    <Text style={styles.cobroLabel}>Dividir entre</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity onPress={() => setDividir(Math.max(1, dividir - 1))} disabled={dividir <= 1} style={[styles.stepBtn, dividir <= 1 && { opacity: 0.4 }]}><Text style={styles.stepTxt}>−</Text></TouchableOpacity>
                      <Text style={styles.stepNum}>{dividir}</Text>
                      <TouchableOpacity onPress={() => setDividir(dividir + 1)} style={styles.stepBtn}><Text style={styles.stepTxt}>+</Text></TouchableOpacity>
                    </View>
                  </View>
                  {dividir > 1 && <Text style={styles.porPersona}>${porPersona.toFixed(2)} por persona</Text>}
                  <Text style={styles.cobroTotal}>Total a cobrar  ${totalConPropina.toFixed(0)}</Text>
                  <Text style={[styles.cobroSub, { marginTop: 4 }]}>¿Con qué pagó?</Text>
                  {metodos.map((m) => (
                    <TouchableOpacity key={m} onPress={() => cobrar(m)} style={styles.metodoBtn}>
                      <Text style={styles.metodoTxt}>{m === "caja" ? "💵 Efectivo / Caja" : m === "transferencia" ? "🏦 Transferencia" : m === "tarjeta" ? "💳 Tarjeta" : m}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity onPress={() => setCobrando(null)} style={{ marginTop: 8 }}><Text style={{ color: "#6B7280", fontWeight: "600", textAlign: "center" }}>Cancelar</Text></TouchableOpacity>
                </>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>
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
  qrBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  accionesCuenta: { flexDirection: "row", gap: 8, marginTop: 10 },
  ticketBtn: { backgroundColor: "#F3F4F6", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, justifyContent: "center" },
  ticketTxt: { color: "#374151", fontWeight: "800", fontSize: 13 },
  cobroCard: { backgroundColor: "#fff", borderRadius: 18, padding: 20, width: "100%", maxWidth: 340 },
  cobroTitle: { fontSize: 16, fontWeight: "800", color: "#1F2937", textAlign: "center" },
  cobroSub: { fontSize: 13, color: "#6B7280", textAlign: "center" },
  cobroLabel: { fontSize: 12, fontWeight: "700", color: "#4B5563", marginTop: 10 },
  propRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  propBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB", alignItems: "center" },
  propBtnOn: { backgroundColor: "#ED8E3C", borderColor: "#ED8E3C" },
  propTxt: { fontSize: 12, fontWeight: "700", color: "#6B7280" },
  propTxtOn: { color: "#fff" },
  cobroInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: "#1F2937", marginTop: 8 },
  dividirRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  stepTxt: { fontSize: 18, fontWeight: "800", color: "#374151", lineHeight: 20 },
  stepNum: { fontSize: 15, fontWeight: "800", color: "#1F2937", minWidth: 18, textAlign: "center" },
  porPersona: { fontSize: 12, color: "#6B7280", textAlign: "center", marginTop: 4 },
  cobroTotal: { fontSize: 18, fontWeight: "800", color: "#ED8E3C", textAlign: "center", marginTop: 12 },
  metodoBtn: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingVertical: 11, alignItems: "center", marginTop: 8 },
  metodoTxt: { fontSize: 14, fontWeight: "800", color: "#1F2937" },
  qrCard: { backgroundColor: "#fff", borderRadius: 18, padding: 22, alignItems: "center", width: "100%", maxWidth: 340 },
  qrTitle: { fontSize: 18, fontWeight: "800", color: "#1F2937" },
  qrSub: { fontSize: 12, color: "#6B7280", textAlign: "center", marginTop: 4 },
  qrBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 12, width: "100%", marginTop: 8 },
  qrBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
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
  itemTxt: { fontSize: 13, color: "#374151" },
  itemExtras: { fontSize: 11, color: "#8B7B67", marginTop: 1 },
  itemBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  itemBtnTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cerrarBtn: { backgroundColor: "#ED8E3C", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 10 },
  cerrarTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  input: { flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff" },
  addBtn: { backgroundColor: "#ED8E3C", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center", marginLeft: 8 },
  addTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  vacio: { textAlign: "center", color: "#8B7B69", paddingVertical: 30 },
});
