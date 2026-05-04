import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Producto, PrecioInfo } from "../api/catalogo";
import { resolverImagen } from "../lib/imgUrl";

interface Props {
  producto: Producto;
  precio: PrecioInfo;
  /** Cantidad ya en el carrito (item simple). 0 → muestra botón +. */
  enCarrito?: number;
  onAgregar: () => void;
  onCambiarCantidad?: (delta: number) => void;
  tieneExtras?: boolean;
}

/**
 * Card horizontal compacta para listas de productos. Foto cuadrada
 * izquierda, nombre + precio en línea, chips contextuales (cerrada,
 * sobre pedido, opciones) solo cuando aplican. ~96 px alto vs ~280 px
 * de la card vertical antigua.
 */
// Detecta promociones tipo 3x2 / Pack / Promo en nombre o descripción.
// Pinta un chip rojo "PROMO" para que el cliente identifique al vuelo.
function esPromocion(nombre: string, descripcion?: string | null): boolean {
  const haystack = `${nombre} ${descripcion ?? ""}`.toLowerCase();
  return /\b(3x2|2x1|promo|pack)\b/.test(haystack);
}

export default function ProductCardCompacta({ producto, precio, enCarrito, onAgregar, onCambiarCantidad, tieneExtras }: Props) {
  const cerrada = precio.cerrada === true;
  const lead = precio.puesto_lead_time_dias ?? 0;
  const imagen = producto.imagen ? (resolverImagen(producto.imagen) ?? producto.imagen) : null;
  const promo = esPromocion(producto.nombre, producto.descripcion);

  return (
    <View style={[styles.card, cerrada && styles.cardCerrada]}>
      {producto.imagen?.startsWith("emoji:") ? (
        <View style={[styles.thumb, styles.thumbEmoji]}>
          <Text style={styles.thumbEmojiTxt}>{producto.imagen.slice(6)}</Text>
        </View>
      ) : imagen ? (
        <Image source={{ uri: imagen }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons name="image-outline" size={22} color="#D4C9B8" />
        </View>
      )}

      <View style={styles.body}>
        {/* Título a ancho completo en 2 líneas; precio se mueve al lado
            del nombre de la tienda para no robarle espacio al nombre
            (los 3-Packs de licores se cortaban). */}
        <Text style={styles.nombre} numberOfLines={2}>{producto.nombre}</Text>
        <View style={styles.tiendaRow}>
          <Text style={styles.tienda} numberOfLines={1}>{precio.puesto_nombre}</Text>
          <Text style={[styles.precio, cerrada && styles.precioCerrada]}>${precio.precio.toFixed(0)}</Text>
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
          {tieneExtras && !cerrada && (
            <Text style={styles.chipOpciones}>+ opciones</Text>
          )}
          <Text style={styles.unidad}>por {producto.unidad}</Text>
        </View>
      </View>

      <View style={styles.action}>
        {enCarrito && enCarrito > 0 && onCambiarCantidad ? (
          <View style={styles.qtyCol}>
            <TouchableOpacity onPress={() => onCambiarCantidad(1)} style={[styles.qtyBtn, styles.qtyPlus]}>
              <Ionicons name="add" size={18} color="#059669" />
            </TouchableOpacity>
            <Text style={styles.qtyNum}>{enCarrito}</Text>
            <TouchableOpacity onPress={() => onCambiarCantidad(-1)} style={[styles.qtyBtn, styles.qtyMinus]}>
              <Ionicons name="remove" size={18} color="#DC2626" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addBtn, cerrada && styles.addBtnAgendar]}
            onPress={onAgregar}
          >
            {cerrada ? <Text style={{ fontSize: 18 }}>📅</Text> : <Ionicons name="add" size={22} color="#fff" />}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: 10, padding: 10, backgroundColor: "#fff", borderRadius: 12, alignItems: "stretch" },
  cardCerrada: { opacity: 0.7 },
  thumb: { width: 76, height: 76, borderRadius: 10, backgroundColor: "#F3EFE7" },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  thumbEmoji: { alignItems: "center", justifyContent: "center", backgroundColor: "#FFF7EB" },
  thumbEmojiTxt: { fontSize: 38 },
  body: { flex: 1, justifyContent: "space-between", minWidth: 0 },
  nombre: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  tiendaRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginTop: 2 },
  precio: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  precioCerrada: { textDecorationLine: "line-through", color: "#9CA3AF" },
  tienda: { flex: 1, fontSize: 11, color: "#8B7B69" },
  chipsRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, flexWrap: "wrap" },
  chipCerrada: { backgroundColor: "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  chipCerradaTxt: { fontSize: 9, fontWeight: "700", color: "#991B1B", textTransform: "uppercase" },
  chipLead: { backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  chipLeadTxt: { fontSize: 9, fontWeight: "700", color: "#92400E", textTransform: "uppercase" },
  chipPromo: { backgroundColor: "#DC2626", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  chipPromoTxt: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.4 },
  chipOpciones: { fontSize: 10, color: "#C2410C" },
  unidad: { fontSize: 10, color: "#9CA3AF", marginLeft: "auto" },

  action: { alignItems: "center", justifyContent: "center" },
  addBtn: { width: 36, height: 36, borderRadius: 999, backgroundColor: "#FF7A2B", alignItems: "center", justifyContent: "center" },
  addBtnDisabled: { backgroundColor: "#E5E7EB" },
  addBtnAgendar: { backgroundColor: "#F59E0B" },
  qtyCol: { alignItems: "center", gap: 2 },
  qtyBtn: { width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  qtyPlus: { backgroundColor: "#D1FAE5" },
  qtyMinus: { backgroundColor: "#FEE2E2" },
  qtyNum: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
});
