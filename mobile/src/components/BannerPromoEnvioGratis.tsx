import { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";

interface PromoEstado {
  activa: boolean;
  estado: "vigente" | "proximamente" | "expirada" | "off";
  cada: number;
  inicia?: string;
  termina?: string;
  entregados?: number;
  proximo_gratis?: boolean;
  faltan_para_gratis?: number;
}

interface Props {
  telefono?: string;
}

const BANNER_URL = "https://mercadito.cx/promo-envio-gratis-mayo.png";

/** Mismo banner que en web; se renderiza solo si la promo está vigente o
 *  próxima a arrancar. La imagen se descarga del web. */
export default function BannerPromoEnvioGratis({ telefono }: Props) {
  const [estado, setEstado] = useState<PromoEstado | null>(null);

  useEffect(() => {
    let cancel = false;
    const url = telefono
      ? `https://mercadito.cx/api/cliente/promo-envios?telefono=${encodeURIComponent(telefono)}`
      : `https://mercadito.cx/api/cliente/promo-envios`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => { if (!cancel) setEstado(data); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [telefono]);

  if (!estado || estado.estado === "off" || estado.estado === "expirada") return null;
  const proxima = estado.estado === "proximamente";
  const fmtInicia = estado.inicia
    ? new Date(estado.inicia).toLocaleDateString("es-MX", { day: "numeric", month: "long" })
    : null;

  return (
    <View style={styles.wrap}>
      <Image source={{ uri: BANNER_URL }} style={styles.image} resizeMode="cover" />
      <View style={styles.estadoBox}>
        {proxima && (
          <View style={styles.proximaBadge}>
            <Text style={styles.proximaBadgeTxt}>Próximamente · {fmtInicia}</Text>
          </View>
        )}
        {proxima ? (
          <Text style={styles.estadoTxtAmber}>
            🎉 La promo arranca el {fmtInicia}. Pide normal mientras tanto.
          </Text>
        ) : estado.proximo_gratis ? (
          <Text style={styles.estadoTxtGreen}>
            🎁 Tu próximo envío es <Text style={styles.bold}>GRATIS</Text>. Lo aplicamos al confirmar.
          </Text>
        ) : estado.entregados != null && estado.faltan_para_gratis != null ? (
          <Text style={styles.estadoTxtGray}>
            Llevas <Text style={styles.bold}>{estado.entregados}</Text> pedido{estado.entregados === 1 ? "" : "s"}.
            Te {estado.faltan_para_gratis === 1 ? "falta" : "faltan"} <Text style={styles.bold}>{estado.faltan_para_gratis}</Text> para tu envío gratis.
          </Text>
        ) : (
          <Text style={styles.estadoTxtGray}>
            Empieza a pedir. Cada {estado.cada}° pedido completado, el siguiente envío es gratis.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFF7EB",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  image: {
    width: "100%",
    aspectRatio: 1200 / 400,
  },
  proximaBadge: {
    backgroundColor: "#FCD34D",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "center",
    marginBottom: 4,
  },
  proximaBadgeTxt: { fontSize: 10, fontWeight: "700", color: "#92400E", textTransform: "uppercase" },
  estadoBox: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#FED7AA", alignItems: "center" },
  estadoTxtAmber: { fontSize: 12, color: "#92400E", textAlign: "center" },
  estadoTxtGreen: { fontSize: 13, fontWeight: "700", color: "#065F46", textAlign: "center" },
  estadoTxtGray: { fontSize: 12, color: "#4B5563", textAlign: "center" },
  bold: { fontWeight: "700" },
});
