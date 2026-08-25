import { View, Text, StyleSheet, TouchableOpacity, Image, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Producto, PrecioInfo } from "../api/catalogo";
import { resolverImagen } from "../lib/imgUrl";
import { theme } from "../lib/theme";

interface Props {
  producto: Producto;
  precio: PrecioInfo;
  /** Cantidad ya en el carrito (item simple). 0 → muestra botón +. */
  enCarrito?: number;
  onAgregar: () => void;
  onCambiarCantidad?: (delta: number) => void;
  tieneExtras?: boolean;
  /** Tap en la card → abre el modal de detalle (imagen grande + opciones). */
  onVerDetalle?: () => void;
  /** Próxima apertura del puesto en formato "HH:MM" — opcional. Cuando el
   *  padre la pasa, el badge de tienda cerrada muestra "Abre 12:30" en
   *  lugar de un genérico "Cerrada". Mejora claridad sin requerir un
   *  endpoint nuevo. */
  proximaAperturaHora?: string;
}

/**
 * Card horizontal compacta para listas de productos. Foto cuadrada izquierda,
 * nombre + precio en línea, chips contextuales (promo, lead, opciones,
 * precio variable). Toda la card es presionable: tap → modal de detalle;
 * tap en el botón / stepper → agregar o cambiar cantidad sin abrir detalle.
 *
 * Estado "cerrada":
 * - Overlay gris semi-transparente sobre la foto (47% opacity).
 * - Badge prominente abajo de la foto: "Cerrada · Abre 12:30" si tenemos hora,
 *   o solo "Cerrada" si no.
 * - Botón "+" se muestra con icono de calendario en color warning (se puede
 *   agendar pedido). No se tacha el precio (eso era confuso — parecía oferta
 *   tachada).
 */
function esPromocion(nombre: string, descripcion?: string | null): boolean {
  const haystack = `${nombre} ${descripcion ?? ""}`.toLowerCase();
  return /\b(3x2|2x1|promo|pack)\b/.test(haystack);
}

export default function ProductCardCompacta({
  producto,
  precio,
  enCarrito,
  onAgregar,
  onCambiarCantidad,
  tieneExtras,
  onVerDetalle,
  proximaAperturaHora,
}: Props) {
  const cerrada = precio.cerrada === true;
  const lead = precio.puesto_lead_time_dias ?? 0;
  const imagen = producto.imagen ? (resolverImagen(producto.imagen) ?? producto.imagen) : null;
  const promo = esPromocion(producto.nombre, producto.descripcion);

  // Pressable outer en lugar de TouchableOpacity: queremos un solo gesto en
  // toda la card que dispare onVerDetalle, pero los hijos interactivos
  // (botón +, stepper) capturan su propio tap sin propagarlo aquí. RN ya lo
  // hace por defecto con TouchableOpacity hijos.
  const Contenedor = onVerDetalle ? Pressable : View;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contenedorProps = onVerDetalle ? { onPress: onVerDetalle } : ({} as any);

  return (
    <Contenedor style={styles.card} {...contenedorProps}>
      {/* Columna foto con overlay si está cerrada */}
      <View style={styles.thumbWrap}>
        {producto.imagen?.startsWith("emoji:") ? (
          <View style={[styles.thumb, styles.thumbEmoji]}>
            <Text style={styles.thumbEmojiTxt}>{producto.imagen.slice(6)}</Text>
          </View>
        ) : imagen ? (
          <Image source={{ uri: imagen }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="image-outline" size={22} color={theme.colors.gray300} />
          </View>
        )}
        {/* Overlay gris cuando la tienda está cerrada — feedback visual claro,
            no destructivo. La foto sigue visible debajo. */}
        {cerrada && <View style={styles.cerradaOverlay} />}
        {cerrada && (
          <View style={styles.cerradaBadge}>
            <Ionicons name="time-outline" size={11} color={theme.colors.white} />
            <Text style={styles.cerradaBadgeTxt}>
              {proximaAperturaHora ? `Abre ${proximaAperturaHora}` : "Cerrada"}
            </Text>
          </View>
        )}
        {/* Lupa indicando que se puede tap para abrir detalle. */}
        {onVerDetalle && !cerrada && (
          <View style={styles.zoomBadge}>
            <Ionicons name="search" size={11} color={theme.colors.white} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.nombre}>{producto.nombre}</Text>
        <View style={styles.tiendaRow}>
          <Text style={styles.tienda}>{precio.puesto_nombre}</Text>
          <Text style={styles.precio}>${precio.precio.toFixed(0)}</Text>
        </View>
        <View style={styles.chipsRow}>
          {promo && !cerrada && (
            <View style={styles.chipPromo}><Text style={styles.chipPromoTxt}>PROMO</Text></View>
          )}
          {!cerrada && lead > 0 && (
            <View style={styles.chipLead}><Text style={styles.chipLeadTxt}>{lead === 1 ? "Mañana" : `${lead} días`}</Text></View>
          )}
          {tieneExtras && !cerrada && (
            <Text style={styles.chipOpciones}>+ opciones</Text>
          )}
          {producto.precio_variable_peso && !cerrada && (
            <View style={styles.chipPrecioVar}><Text style={styles.chipPrecioVarTxt}>⚖️ aprox</Text></View>
          )}
          {/* Mayoreo: el carrito ya lo aplicaba al cobrar, pero no se veía en
              la tarjeta — el cliente no tenía cómo enterarse de que subiendo
              la cantidad baja el precio. */}
          {precio.precio_mayoreo != null && precio.mayoreo_desde != null && !cerrada && (
            <View style={styles.chipMayoreo}>
              <Text style={styles.chipMayoreoTxt}>
                🏷️ {precio.mayoreo_desde}+ a ${Number(precio.precio_mayoreo).toFixed(0)}
              </Text>
            </View>
          )}
          <Text style={styles.unidad}>por {producto.unidad}</Text>
        </View>
      </View>

      <View style={styles.action}>
        {enCarrito && enCarrito > 0 && onCambiarCantidad ? (
          // Stepper expandido: -, cantidad, +. Vertical para mantener la altura
          // de la card constante. Usamos accent (teal) para + porque éxito, y
          // danger (rojo suave) para -.
          <View style={styles.qtyCol}>
            <TouchableOpacity onPress={() => onCambiarCantidad(1)} style={[styles.qtyBtn, styles.qtyPlus]}>
              <Ionicons name="add" size={18} color={theme.colors.accentDark} />
            </TouchableOpacity>
            <Text style={styles.qtyNum}>{enCarrito}</Text>
            <TouchableOpacity onPress={() => onCambiarCantidad(-1)} style={[styles.qtyBtn, styles.qtyMinus]}>
              <Ionicons name="remove" size={18} color={theme.colors.dangerDark} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addBtn, cerrada && styles.addBtnAgendar]}
            onPress={onAgregar}
          >
            {cerrada
              ? <Ionicons name="calendar-outline" size={20} color={theme.colors.white} />
              : <Ionicons name="add" size={22} color={theme.colors.white} />}
          </TouchableOpacity>
        )}
      </View>
    </Contenedor>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: theme.colors.gray100,
    ...theme.shadow.sm,
  },
  // ── columna foto ─────────────────────────────────────────────
  thumbWrap: { position: "relative", width: 84, height: 84 },
  thumb: { width: 84, height: 84, borderRadius: theme.radius.md, backgroundColor: theme.colors.creamDark },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  thumbEmoji: { alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brandLight },
  thumbEmojiTxt: { fontSize: 42 },
  cerradaOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: theme.colors.closed,
    borderRadius: theme.radius.md,
  },
  cerradaBadge: {
    position: "absolute",
    left: 4,
    right: 4,
    bottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: theme.colors.closedBadge,
    borderRadius: theme.radius.sm,
  },
  cerradaBadgeTxt: {
    fontFamily: theme.fontFamily.semibold,
    fontSize: 10,
    color: theme.colors.white,
    letterSpacing: 0.3,
  },
  zoomBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  // ── body ─────────────────────────────────────────────────────
  body: { flex: 1, justifyContent: "space-between", minWidth: 0 },
  nombre: {
    fontFamily: theme.fontFamily.bold,
    fontSize: 15,
    color: theme.colors.gray900,
    lineHeight: 19,
  },
  tiendaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 4,
  },
  precio: {
    fontFamily: theme.fontFamily.bold,
    fontSize: 18,
    color: theme.colors.brandDark,
    fontVariant: ["tabular-nums"],
  },
  tienda: {
    fontFamily: theme.fontFamily.regular,
    flex: 1,
    fontSize: 12,
    color: theme.colors.gray500,
  },
  chipsRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, flexWrap: "wrap" },
  chipLead: {
    backgroundColor: theme.colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chipLeadTxt: {
    fontFamily: theme.fontFamily.semibold,
    fontSize: 9,
    color: theme.colors.warningDark,
    textTransform: "uppercase",
  },
  chipPromo: {
    backgroundColor: theme.colors.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chipPromoTxt: {
    fontFamily: theme.fontFamily.bold,
    fontSize: 9,
    color: theme.colors.white,
    letterSpacing: 0.4,
  },
  chipMayoreo: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chipMayoreoTxt: {
    fontFamily: theme.fontFamily.bold,
    fontSize: 9,
    color: "#047857",
  },
  chipOpciones: {
    fontFamily: theme.fontFamily.semibold,
    fontSize: 11,
    color: theme.colors.brandDark,
  },
  chipPrecioVar: {
    backgroundColor: theme.colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chipPrecioVarTxt: {
    fontFamily: theme.fontFamily.semibold,
    fontSize: 9,
    color: theme.colors.warningDark,
    textTransform: "uppercase",
  },
  unidad: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 10,
    color: theme.colors.gray400,
    marginLeft: "auto",
  },
  // ── botón + / stepper ────────────────────────────────────────
  action: { alignItems: "center", justifyContent: "center" },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadow.sm,
  },
  addBtnAgendar: { backgroundColor: theme.colors.warningDark },
  qtyCol: { alignItems: "center", gap: 2 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyPlus: { backgroundColor: theme.colors.accentLight },
  qtyMinus: { backgroundColor: theme.colors.dangerLight },
  qtyNum: {
    fontFamily: theme.fontFamily.bold,
    fontSize: 13,
    color: theme.colors.gray800,
    fontVariant: ["tabular-nums"],
  },
});
