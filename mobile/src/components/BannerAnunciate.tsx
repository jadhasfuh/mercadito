import { TouchableOpacity, View, Text, StyleSheet, Linking } from "react-native";
import { MERCADITO_TEL } from "../lib/contacto";

const WA_VENTAS = MERCADITO_TEL;
const PRECIO_DESDE = 99;

/**
 * Versión RN del banner publicitario — mismo layout y paleta que el web
 * (src/components/BannerAnunciate.tsx). Sin SVG porque no tenemos
 * react-native-svg en el bundle; usamos un círculo brand con la
 * tipografía 🏪 centrada, que cumple la misma función de "ilustración
 * del local" sin agregar dependencias nativas.
 */
export default function BannerAnunciate() {
  function abrir() {
    const msg = encodeURIComponent(
      "Hola, me interesa anunciar mi negocio en Mercadito. ¿Me cuentan los detalles?"
    );
    Linking.openURL(`https://wa.me/${WA_VENTAS}?text=${msg}`);
  }
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={abrir} style={styles.card}>
      <View style={styles.localBox}>
        <Text style={styles.localEmoji}>🏪</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowLine} />
          <Text style={styles.eyebrow}>PARA TU NEGOCIO</Text>
          <View style={[styles.eyebrowLine, { flex: 1 }]} />
        </View>
        <Text style={styles.titulo}>ANÚNCIATE AQUÍ</Text>
        <Text style={styles.subtitulo}>Llega a más clientes de tu zona</Text>
        <View style={styles.precioBadge}>
          <Text style={styles.precioBadgeTxt}>Desde ${PRECIO_DESDE}</Text>
          <Text style={styles.precioBadgeUnit}> / semana</Text>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FEF3E2",
    borderWidth: 2,
    borderColor: "rgba(146,64,14,0.15)",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  localBox: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: "#ED8E3C",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#92400E", shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  localEmoji: { fontSize: 30, lineHeight: 34 },
  body: { flex: 1, minWidth: 0 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  eyebrowLine: { width: 14, height: 1, backgroundColor: "rgba(146,64,14,0.3)" },
  eyebrow: { fontSize: 9, fontWeight: "800", color: "#92400E", letterSpacing: 1.5 },
  titulo: { fontSize: 19, fontWeight: "900", color: "#92400E", letterSpacing: -0.3, lineHeight: 22 },
  subtitulo: { fontSize: 12, color: "#B45309", marginTop: 2, lineHeight: 15 },
  precioBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "baseline", backgroundColor: "#ED8E3C", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, marginTop: 8 },
  precioBadgeTxt: { color: "#fff", fontSize: 11, fontWeight: "900" },
  precioBadgeUnit: { color: "#FFF7EB", fontSize: 10, fontWeight: "700" },
  chevron: { fontSize: 24, color: "rgba(146,64,14,0.4)", marginLeft: 4 },
});
