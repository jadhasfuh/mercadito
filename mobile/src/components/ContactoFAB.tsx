import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MERCADITO_TEL, MERCADITO_TEL_DISPLAY, waUrl, telUrl } from "../lib/contacto";

interface Props {
  /** Distancia desde el bottom — para que no se encime con el tab bar.
   *  Default 100 (sobre tabs de 80px). Pasalo más alto si hay barra extra. */
  bottom?: number;
}

/**
 * Botón flotante de ayuda — espejo del web ContactoFAB. Pensado para
 * clientes mayores que prefieren llamar/WhatsApp en vez de navegar.
 * Tap principal expande dos opciones (WhatsApp + Llamar). Auto-contrae
 * a los 6s si no eligen.
 */
export default function ContactoFAB({ bottom = 100 }: Props) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(() => setAbierto(false), 6000);
    return () => clearTimeout(t);
  }, [abierto]);

  function whatsapp() {
    Linking.openURL(waUrl("Hola Mercadito, necesito ayuda"));
    setAbierto(false);
  }

  function llamar() {
    Linking.openURL(telUrl());
    setAbierto(false);
  }

  return (
    <View style={[styles.container, { bottom }]} pointerEvents="box-none">
      {abierto && (
        <>
          <TouchableOpacity onPress={whatsapp} style={[styles.btn, styles.btnWa]}>
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
            <Text style={styles.btnTxt}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={llamar} style={[styles.btn, styles.btnCall]}>
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.btnTxt}>Llamar {MERCADITO_TEL_DISPLAY}</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity
        onPress={() => setAbierto((a) => !a)}
        style={styles.fab}
        accessibilityLabel={abierto ? "Cerrar ayuda" : "Necesito ayuda"}
      >
        <Ionicons name={abierto ? "close" : "chatbubble-ellipses"} size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 16,
    alignItems: "flex-end",
    gap: 10,
    zIndex: 50,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  btnWa: { backgroundColor: "#22C55E" },
  btnCall: { backgroundColor: "#2563EB" },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F2A65A",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
