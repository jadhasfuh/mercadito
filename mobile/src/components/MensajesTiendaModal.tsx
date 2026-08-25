import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";
import BottomSheet from "./BottomSheet";
import { enviarMensajeASoporte, type Mensaje } from "../api/admin";
import { fechaHoraMX } from "../lib/fecha";
import { theme } from "../lib/theme";

interface Props {
  abierto: boolean;
  onClose: () => void;
  mensajes: Mensaje[];
  /** Se dispara al enviar, para que el layout recargue el hilo. */
  onEnviado?: () => void;
}

// Hilo de soporte del negocio con Mercadito. Antes era solo lectura
// (admin→tienda): el negocio no tenía a dónde preguntar dentro del producto y
// su única salida era el WhatsApp general. Ahora puede contestar aquí.
export default function MensajesTiendaModal({ abierto, onClose, mensajes, onEnviado }: Props) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  // La API devuelve del más nuevo al más viejo; el hilo se lee al revés.
  const hilo = [...mensajes].reverse();

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      await enviarMensajeASoporte(t);
      setTexto("");
      onEnviado?.();
    } catch {
      /* el layout recarga solo; no vale la pena una alerta por esto */
    } finally {
      setEnviando(false);
    }
  }

  return (
    <BottomSheet abierto={abierto} onClose={onClose} titulo="Soporte Mercadito">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {hilo.length === 0 ? (
          <Text style={styles.empty}>
            ¿Alguna duda con tu menú, tu cuenta o tu suscripción? Escríbenos aquí.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 380 }}>
            {hilo.map((m) => {
              // Los mensajes viejos no traen `de` y son todos del admin.
              const mio = m.de === "tienda";
              return (
                <View key={m.id} style={[styles.burbujaWrap, mio ? styles.derecha : styles.izquierda]}>
                  <View style={[styles.burbuja, mio ? styles.burbujaMia : styles.burbujaOtro]}>
                    <Text style={[styles.msg, mio && styles.msgMio]}>{m.mensaje}</Text>
                    <Text style={[styles.metaTxt, mio && styles.metaTxtMio]}>
                      {fechaHoraMX(m.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.inputRow}>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Escribe tu mensaje…"
            placeholderTextColor="#9C8B72"
            maxLength={2000}
            multiline
            style={styles.input}
          />
          <TouchableOpacity
            onPress={enviar}
            disabled={!texto.trim() || enviando}
            style={[styles.btn, (!texto.trim() || enviando) && styles.btnOff]}
          >
            <Text style={styles.btnTxt}>{enviando ? "…" : "Enviar"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: "center", color: "#8B7B69", paddingVertical: 26, paddingHorizontal: 16, fontSize: 13, lineHeight: 19 },
  burbujaWrap: { flexDirection: "row", marginBottom: 8 },
  izquierda: { justifyContent: "flex-start" },
  derecha: { justifyContent: "flex-end" },
  burbuja: { maxWidth: "82%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  burbujaOtro: { backgroundColor: "#F3F4F6", borderBottomLeftRadius: 4 },
  burbujaMia: { backgroundColor: theme.colors.brand, borderBottomRightRadius: 4 },
  msg: { fontSize: 13, color: "#1F2937", lineHeight: 19 },
  msgMio: { color: "#fff" },
  metaTxt: { fontSize: 10, color: "#9CA3AF", marginTop: 3 },
  metaTxtMio: { color: "rgba(255,255,255,0.75)" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingTop: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: "#1F2937", maxHeight: 100 },
  btn: { backgroundColor: theme.colors.brand, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  btnOff: { opacity: 0.4 },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
