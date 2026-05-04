import { useMemo } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { resolverImagen } from "../lib/imgUrl";
import type { Producto } from "../api/catalogo";

export interface OfertaSugerida {
  producto: Producto;
  precio: Producto["precios"][number];
}

interface Props {
  ofertas: OfertaSugerida[];
  onAgregar: (oferta: OfertaSugerida) => void;
}

/**
 * Banner promocional: producto+tienda al azar para impulsar descubrimiento
 * mientras llegan más tiendas. La selección es estable durante una sesión:
 * Math.random() corre una vez al montar (gracias a useMemo).
 */
export default function BannerProductoDestacado({ ofertas, onAgregar }: Props) {
  const sel = useMemo(() => {
    const aptas = ofertas.filter((o) => !o.precio.cerrada);
    if (aptas.length === 0) return null;
    return aptas[Math.floor(Math.random() * aptas.length)];
  }, [ofertas]);

  if (!sel) return null;
  const { producto: prod, precio } = sel;
  // Productos sin foto real llevan `imagen = "emoji:<glyph>"`. Hay que
  // diferenciar antes de pasar al <Image>: si no, RN intenta cargar
  // "emoji:🥃" como URL y queda como imagen rota.
  const esEmoji = prod.imagen?.startsWith("emoji:");
  const imgUri = !esEmoji && prod.imagen ? resolverImagen(prod.imagen) ?? prod.imagen : null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>🌟 ¿YA PROBASTE ESTO?</Text>
      <View style={styles.row}>
        {esEmoji ? (
          <View style={[styles.img, styles.imgEmoji]}>
            <Text style={styles.imgEmojiTxt}>{prod.imagen!.slice(6)}</Text>
          </View>
        ) : imgUri ? (
          <Image source={{ uri: imgUri }} style={styles.img} />
        ) : (
          <View style={[styles.img, styles.imgPlaceholder]}>
            <Ionicons name="bag-outline" size={28} color="#D4C9B8" />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.nombre} numberOfLines={2}>{prod.nombre}</Text>
          <Text style={styles.tienda} numberOfLines={1}>de <Text style={styles.tiendaBold}>{precio.puesto_nombre}</Text></Text>
          <View style={styles.precioRow}>
            <Text style={styles.precio}>${Number(precio.precio).toFixed(0)}</Text>
            <Text style={styles.unidad}>por {prod.unidad}</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity style={styles.btn} onPress={() => onAgregar(sel)}>
        <Text style={styles.btnTxt}>Agregar a mi lista 🛒</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFF2E5",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  kicker: { fontSize: 11, fontWeight: "700", color: "#9A3412", letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  img: { width: 76, height: 76, borderRadius: 12, backgroundColor: "#fff" },
  imgPlaceholder: { alignItems: "center", justifyContent: "center" },
  imgEmoji: { alignItems: "center", justifyContent: "center" },
  imgEmojiTxt: { fontSize: 44 },
  info: { flex: 1, minWidth: 0 },
  nombre: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  tienda: { fontSize: 11, color: "#8B7B69", marginTop: 1 },
  tiendaBold: { fontWeight: "700", color: "#374151" },
  precioRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 },
  precio: { fontSize: 22, fontWeight: "800", color: "#9A3412" },
  unidad: { fontSize: 10, color: "#9CA3AF" },
  btn: { marginTop: 10, backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 10, alignItems: "center" },
  btnTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
