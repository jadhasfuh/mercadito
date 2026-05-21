import { Modal, View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Producto, PrecioInfo } from "../api/catalogo";
import { resolverImagen } from "../lib/imgUrl";

interface Props {
  visible: boolean;
  producto: Producto | null;
  precio: PrecioInfo | null;
  /** Cantidad ya en el carrito (item simple). Solo aplica a productos sin extras. */
  enCarrito?: number;
  /** Para productos con variantes/modificadores/cantidad libre: el botón abre
      el flujo de opciones en lugar de sumar directo. */
  requiereModal?: boolean;
  onAgregar: () => void;
  onCambiarCantidad?: (delta: number) => void;
  onClose: () => void;
}

// Mismo detector de promo que la card, para pintar el mismo chip.
function esPromocion(nombre: string, descripcion?: string | null): boolean {
  const haystack = `${nombre} ${descripcion ?? ""}`.toLowerCase();
  return /\b(3x2|2x1|promo|pack)\b/.test(haystack);
}

/**
 * Modal de detalle de producto. Se abre al tocar la foto en el listado:
 * mismo contenido que la card (precio, tienda, chips y botones de agregar/
 * quitar) pero con la imagen en grande y la descripción completa — que en la
 * card escondemos a propósito para mantener el listado limpio.
 */
export default function ProductoDetalleClienteModal({
  visible,
  producto,
  precio,
  enCarrito,
  requiereModal,
  onAgregar,
  onCambiarCantidad,
  onClose,
}: Props) {
  if (!producto || !precio) return null;

  const cerrada = precio.cerrada === true;
  const lead = precio.puesto_lead_time_dias ?? 0;
  const promo = esPromocion(producto.nombre, producto.descripcion);
  const esEmoji = producto.imagen?.startsWith("emoji:");
  const imagen = producto.imagen && !esEmoji ? (resolverImagen(producto.imagen) ?? producto.imagen) : null;
  const enCarritoNum = enCarrito ?? 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color="#4B5563" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Imagen en grande */}
          {esEmoji ? (
            <View style={[styles.imagen, styles.imagenEmoji]}>
              <Text style={styles.imagenEmojiTxt}>{producto.imagen!.slice(6)}</Text>
            </View>
          ) : imagen ? (
            <Image source={{ uri: imagen }} style={styles.imagen} resizeMode="contain" />
          ) : (
            <View style={[styles.imagen, styles.imagenPlaceholder]}>
              <Ionicons name="image-outline" size={48} color="#D4C9B8" />
            </View>
          )}

          <Text style={styles.nombre}>{producto.nombre}</Text>
          <Text style={styles.tienda}>{precio.puesto_nombre}</Text>

          <View style={styles.precioRow}>
            <Text style={[styles.precio, cerrada && styles.precioCerrada]}>${precio.precio.toFixed(0)}</Text>
            <Text style={styles.unidad}>por {producto.unidad}</Text>
          </View>

          <View style={styles.chipsRow}>
            {promo && !cerrada && (
              <View style={styles.chipPromo}><Text style={styles.chipPromoTxt}>PROMO</Text></View>
            )}
            {cerrada && (
              <View style={styles.chipCerrada}><Text style={styles.chipCerradaTxt}>Cerrada</Text></View>
            )}
            {!cerrada && lead > 0 && (
              <View style={styles.chipLead}><Text style={styles.chipLeadTxt}>{lead === 1 ? "Mañana" : `${lead} días`}</Text></View>
            )}
            {producto.precio_variable_peso && !cerrada && (
              <View style={styles.chipPrecioVar}><Text style={styles.chipPrecioVarTxt}>⚖️ Precio aprox</Text></View>
            )}
          </View>

          {producto.descripcion ? (
            <Text style={styles.descripcion}>{producto.descripcion}</Text>
          ) : (
            <Text style={styles.sinDescripcion}>Sin descripción.</Text>
          )}
        </ScrollView>

        {/* Acción — mismos botones que la card */}
        <View style={styles.footer}>
          {!requiereModal && enCarritoNum > 0 && onCambiarCantidad ? (
            <View style={styles.stepper}>
              <TouchableOpacity onPress={() => onCambiarCantidad(-1)} style={[styles.stepBtn, styles.stepMinus]}>
                <Ionicons name="remove" size={24} color="#DC2626" />
              </TouchableOpacity>
              <Text style={styles.stepNum}>{enCarritoNum}</Text>
              <TouchableOpacity onPress={() => onCambiarCantidad(1)} style={[styles.stepBtn, styles.stepPlus]}>
                <Ionicons name="add" size={24} color="#059669" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.cta, cerrada && styles.ctaAgendar]} onPress={onAgregar}>
              <Text style={styles.ctaTxt}>
                {cerrada ? "📅  Agendar pedido" : requiereModal ? "Elegir opciones" : "🛒  Agregar al carrito"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10 },
  content: { paddingHorizontal: 18, paddingBottom: 24 },
  imagen: { width: "100%", aspectRatio: 1, borderRadius: 16, backgroundColor: "#F3EFE7" },
  imagenEmoji: { alignItems: "center", justifyContent: "center", backgroundColor: "#FEF5EA" },
  imagenEmojiTxt: { fontSize: 120 },
  imagenPlaceholder: { alignItems: "center", justifyContent: "center" },
  nombre: { fontSize: 22, fontWeight: "900", color: "#111827", marginTop: 16, lineHeight: 27 },
  tienda: { fontSize: 14, color: "#8B7B69", marginTop: 2 },
  precioRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 10 },
  precio: { fontSize: 26, fontWeight: "900", color: "#C2680E" },
  precioCerrada: { textDecorationLine: "line-through", color: "#9CA3AF" },
  unidad: { fontSize: 14, color: "#9CA3AF" },
  chipsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" },
  chipCerrada: { backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipCerradaTxt: { fontSize: 10, fontWeight: "700", color: "#991B1B", textTransform: "uppercase" },
  chipLead: { backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipLeadTxt: { fontSize: 10, fontWeight: "700", color: "#92400E", textTransform: "uppercase" },
  chipPromo: { backgroundColor: "#DC2626", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipPromoTxt: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 0.4 },
  chipPrecioVar: { backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipPrecioVarTxt: { fontSize: 10, fontWeight: "700", color: "#92400E", textTransform: "uppercase" },
  descripcion: { fontSize: 15, color: "#4B5563", lineHeight: 22, marginTop: 14 },
  sinDescripcion: { fontSize: 14, color: "#9CA3AF", fontStyle: "italic", marginTop: 14 },

  footer: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: "#EFE7D8", backgroundColor: "#fff" },
  cta: { backgroundColor: "#F2A65A", borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  ctaAgendar: { backgroundColor: "#F59E0B" },
  ctaTxt: { color: "#fff", fontSize: 17, fontWeight: "900" },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  stepBtn: { width: 48, height: 48, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  stepPlus: { backgroundColor: "#D1FAE5" },
  stepMinus: { backgroundColor: "#FEE2E2" },
  stepNum: { fontSize: 24, fontWeight: "900", color: "#1F2937", minWidth: 40, textAlign: "center" },
});
