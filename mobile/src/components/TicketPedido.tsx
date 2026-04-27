import { Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Pedido } from "../api/pedidos";

interface Props {
  visible: boolean;
  pedido: Pedido | null;
  onClose: () => void;
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_compra: "En compra",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia / DiMo",
};

/**
 * Ticket estilo recibo. Mismo formato que el web (mono, líneas punteadas)
 * para que cliente que ve uno y luego otro reconozca el mismo "papel".
 * Botón Compartir usa el Share nativo: el cliente puede mandarlo por
 * WhatsApp como texto plano (no como imagen, hasta que migremos a captura).
 */
export default function TicketPedido({ visible, pedido, onClose }: Props) {
  if (!pedido) return null;

  const fecha = new Date(pedido.created_at).toLocaleString("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const idCorto = `#${pedido.id.slice(0, 8).toUpperCase()}`;
  const servicio = pedido.items.reduce(
    (s, it) => s + it.cantidad * (Number(it.comision) || 0), 0
  );
  const recargo = Number(pedido.recargo_tarjeta) || 0;

  async function compartir() {
    const lineas: string[] = [];
    lineas.push("🛵 MERCADITO — Ticket de pedido");
    lineas.push(idCorto);
    lineas.push(fecha);
    lineas.push(`Estado: ${ESTADO_LABEL[pedido!.estado] ?? pedido!.estado}`);
    lineas.push("");
    lineas.push(`Cliente: ${pedido!.cliente_nombre}`);
    lineas.push(`Tel: ${pedido!.cliente_telefono}`);
    lineas.push(`Entrega: ${pedido!.direccion_entrega}`);
    lineas.push("");
    for (const it of pedido!.items) {
      const extras = [
        it.variante_nombre,
        ...(it.modificadores ?? []).map((m) => `${m.modificador_nombre}: ${m.opcion_nombre}`),
      ].filter(Boolean).join(" · ");
      lineas.push(`${it.cantidad} ${it.unidad ?? ""} ${it.producto_nombre}${extras ? " (" + extras + ")" : ""} — $${Number(it.subtotal).toFixed(2)}`);
    }
    lineas.push("");
    lineas.push(`Subtotal: $${Number(pedido!.subtotal).toFixed(2)}`);
    if (servicio > 0) lineas.push(`Servicio: $${servicio.toFixed(2)}`);
    lineas.push(`Envío: $${Number(pedido!.costo_envio).toFixed(2)}`);
    if (recargo > 0) lineas.push(`Recargo tarjeta: $${recargo.toFixed(2)}`);
    lineas.push(`TOTAL: $${Number(pedido!.total).toFixed(2)}`);
    lineas.push("");
    lineas.push("mercadito.cx");
    try {
      await Share.share({ message: lineas.join("\n") });
    } catch {
      // user cancelled
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={styles.headerLogo}>
            <Image source={require("../../assets/icon.png")} style={styles.logo} />
            <View>
              <Text style={styles.brand}>Mercadito</Text>
              <Text style={styles.brandSub}>Sahuayo · Jiquilpan · V. Carranza</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={compartir} style={styles.shareBtn}>
              <Ionicons name="share-outline" size={16} color="#4B5563" />
              <Text style={styles.shareTxt}>Compartir</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.titleBlock}>
            <Text style={styles.titleSmall}>TICKET DE PEDIDO</Text>
            <Text style={styles.titleId}>{idCorto}</Text>
            <Text style={styles.titleDate}>{fecha}</Text>
            <View style={styles.estadoChip}>
              <Text style={styles.estadoChipTxt}>
                {(ESTADO_LABEL[pedido.estado] ?? pedido.estado).toUpperCase()}
              </Text>
            </View>
            {pedido.agendado_para && pedido.estado !== "cancelado" && (
              <View style={[styles.estadoChip, { backgroundColor: "#FEF3C7", marginTop: 6 }]}>
                <Text style={[styles.estadoChipTxt, { color: "#92400E" }]}>
                  📅 {new Date(pedido.agendado_para).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.dashed} />

          <View style={styles.kv}>
            <Linea k="Cliente" v={pedido.cliente_nombre} />
            <Linea k="Tel" v={pedido.cliente_telefono} />
            <Linea k="Entrega en" v={pedido.direccion_entrega} />
            {(() => {
              const nombre = pedido.repartidor_nombre || pedido.repartidor_default?.nombre;
              const tel = pedido.repartidor_telefono || pedido.repartidor_default?.telefono;
              if (!nombre) return null;
              const sinAsignar = !pedido.repartidor_nombre;
              return (
                <>
                  <Linea k="Repartidor" v={`${nombre}${sinAsignar ? " (de turno)" : ""}`} />
                  {tel && <Linea k="Tel rep." v={tel} />}
                </>
              );
            })()}
          </View>

          <View style={styles.dashed} />

          <View style={{ gap: 8 }}>
            {pedido.items.map((it) => {
              const extras = [
                it.variante_nombre,
                ...(it.modificadores ?? []).map((m) => `${m.modificador_nombre}: ${m.opcion_nombre}`),
              ].filter(Boolean).join(" · ");
              return (
                <View key={it.id}>
                  <View style={styles.itemRow}>
                    <Text style={styles.itemNombre} numberOfLines={1}>{it.producto_nombre}</Text>
                    <Text style={styles.itemMonto}>${Number(it.subtotal).toFixed(2)}</Text>
                  </View>
                  {extras ? <Text style={styles.itemExtras}>{extras}</Text> : null}
                  <Text style={styles.itemMeta}>
                    {it.cantidad} {it.unidad ?? ""} × ${Number(it.precio_unitario).toFixed(2)} · {it.puesto_nombre}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.dashed} />

          <View style={styles.kv}>
            <Linea k="Subtotal productos" v={`$${Number(pedido.subtotal).toFixed(2)}`} />
            {servicio > 0 && <Linea k="Servicio Mercadito" v={`$${servicio.toFixed(2)}`} />}
            <Linea k="Envío" v={`$${Number(pedido.costo_envio).toFixed(2)}`} />
            {recargo > 0 && <Linea k="Recargo tarjeta" v={`$${recargo.toFixed(2)}`} />}
          </View>

          <View style={styles.dashedDark} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>${Number(pedido.total).toFixed(2)}</Text>
          </View>

          {pedido.metodo_pago && (
            <View style={[styles.kv, { marginTop: 8 }]}>
              <Linea k="Pago" v={METODO_LABEL[pedido.metodo_pago] ?? pedido.metodo_pago} />
              {pedido.metodo_pago === "transferencia" && (
                <Linea k="Estado pago" v={pedido.pago_validado_at ? "✓ Validado" : "⏳ En validación"} />
              )}
            </View>
          )}

          {pedido.notas ? (
            <>
              <View style={styles.dashed} />
              <View>
                <Text style={styles.notaLabel}>Notas:</Text>
                <Text style={styles.notaValue}>{pedido.notas}</Text>
              </View>
            </>
          ) : null}

          {pedido.estado === "cancelado" && pedido.motivo_cancelacion ? (
            <View style={styles.cancelBox}>
              <Text style={styles.cancelTitle}>Pedido cancelado</Text>
              <Text style={styles.cancelText}>{pedido.motivo_cancelacion}</Text>
            </View>
          ) : null}

          <View style={styles.dashed} />
          <View style={{ alignItems: "center", marginTop: 4 }}>
            <Text style={styles.foot}>Gracias por usar Mercadito 🛵</Text>
            <Text style={styles.foot}>mercadito.cx</Text>
            <Text style={styles.foot}>Conserva este ticket — referencia {idCorto}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Linea({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.lineaRow}>
      <Text style={styles.lineaK}>{k}</Text>
      <Text style={styles.lineaV} numberOfLines={2}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  headerLogo: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 40, height: 40, borderRadius: 8 },
  brand: { fontSize: 16, fontWeight: "900", color: "#C2410C" },
  brandSub: { fontSize: 10, color: "#8B7B69" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  shareTxt: { fontSize: 12, color: "#4B5563", fontWeight: "600" },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  body: { padding: 18, paddingBottom: 36, fontFamily: "monospace" as never },
  titleBlock: { alignItems: "center" },
  titleSmall: { fontSize: 11, color: "#8B7B69" },
  titleId: { fontSize: 24, fontWeight: "900", color: "#1F2937", letterSpacing: 2, marginTop: 4 },
  titleDate: { fontSize: 11, color: "#8B7B69", marginTop: 4 },
  estadoChip: { backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4, marginTop: 8 },
  estadoChipTxt: { fontSize: 10, fontWeight: "700", color: "#4B5563", letterSpacing: 1 },
  dashed: { borderTopWidth: 1, borderStyle: "dashed", borderColor: "#D1D5DB", marginVertical: 12 },
  dashedDark: { borderTopWidth: 1, borderStyle: "dashed", borderColor: "#6B7280", marginVertical: 12 },
  kv: { gap: 4 },
  lineaRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  lineaK: { color: "#8B7B69", fontSize: 12 },
  lineaV: { color: "#1F2937", fontSize: 12, flexShrink: 1, textAlign: "right" },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "flex-start" },
  itemNombre: { flex: 1, fontSize: 13, fontWeight: "700", color: "#1F2937" },
  itemMonto: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  itemExtras: { fontSize: 11, color: "#C2410C", marginTop: 1 },
  itemMeta: { fontSize: 10, color: "#8B7B69", marginTop: 1 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  totalLabel: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  totalValue: { fontSize: 24, fontWeight: "900", color: "#C2410C" },
  notaLabel: { fontSize: 11, color: "#8B7B69" },
  notaValue: { fontSize: 12, color: "#1F2937", marginTop: 2 },
  cancelBox: { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5", borderWidth: 1, borderRadius: 6, padding: 10, marginTop: 10 },
  cancelTitle: { fontSize: 12, fontWeight: "700", color: "#991B1B" },
  cancelText: { fontSize: 11, color: "#991B1B", marginTop: 2 },
  foot: { fontSize: 10, color: "#9CA3AF", lineHeight: 14 },
});
