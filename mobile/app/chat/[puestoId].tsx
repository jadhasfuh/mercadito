import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../../src/lib/theme";
import { useSession } from "../../src/contexts/SessionContext";
import { listarChat, enviarChat, type ChatMensaje } from "../../src/api/citas";
import { fmtHora } from "../../src/lib/citasFmt";

// Chat 1:1. Para el cliente, el hilo es con el negocio (puestoId). Para la
// tienda, es con un cliente (clienteTelefono). El rol determina el remitente.
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { usuario } = useSession();
  const { puestoId, clienteTelefono, titulo } = useLocalSearchParams<{
    puestoId: string;
    clienteTelefono?: string;
    titulo?: string;
  }>();
  const esTienda = usuario?.rol === "tienda" || usuario?.rol === "admin";

  const [mensajes, setMensajes] = useState<ChatMensaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(
    (silencioso?: boolean) => {
      if (!puestoId) return;
      if (!silencioso) setLoading(true);
      listarChat(puestoId, esTienda ? clienteTelefono : undefined)
        .then(setMensajes)
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [puestoId, clienteTelefono, esTienda]
  );

  useEffect(() => {
    load();
    const i = setInterval(() => load(true), 8000); // refresco de mensajes nuevos
    return () => clearInterval(i);
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(t);
  }, [mensajes.length]);

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setTexto("");
    try {
      await enviarChat(
        esTienda
          ? { texto: t, puesto_id: puestoId, cliente_telefono: clienteTelefono }
          : { texto: t, puesto_id: puestoId }
      );
      load(true);
    } catch {
      setTexto(t); // restaura si falló
    } finally {
      setEnviando(false);
    }
  }

  // "Mío" = lo que yo escribí: cliente ve sus 'cliente', tienda ve sus 'negocio'.
  const miLado = esTienda ? "negocio" : "cliente";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {titulo || (esTienda ? "Cliente" : "Negocio")}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.serv} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {mensajes.length === 0 && (
            <Text style={styles.vacio}>Aún no hay mensajes. Escribe el primero 👋</Text>
          )}
          {mensajes.map((m) => {
            const mio = m.de === miLado;
            return (
              <View key={m.id} style={[styles.burbujaWrap, mio ? styles.derecha : styles.izquierda]}>
                <View style={[styles.burbuja, mio ? styles.burbujaMia : styles.burbujaOtro]}>
                  <Text style={[styles.burbujaTxt, mio && { color: "#fff" }]}>{m.texto}</Text>
                  <Text style={[styles.hora, mio && { color: "rgba(255,255,255,0.7)" }]}>{fmtHora(m.created_at)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje…"
          placeholderTextColor={theme.colors.gray400}
          value={texto}
          onChangeText={setTexto}
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={enviar} disabled={enviando || !texto.trim()}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  header: {
    backgroundColor: theme.colors.serv,
    paddingHorizontal: 8,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { ...theme.typography.h3, color: "#fff", flex: 1 },
  vacio: { ...theme.typography.body, color: theme.colors.gray500, textAlign: "center", marginTop: 40 },
  burbujaWrap: { marginBottom: 8, maxWidth: "82%" },
  izquierda: { alignSelf: "flex-start" },
  derecha: { alignSelf: "flex-end" },
  burbuja: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  burbujaMia: { backgroundColor: theme.colors.serv, borderBottomRightRadius: 4 },
  burbujaOtro: { backgroundColor: theme.colors.white, borderBottomLeftRadius: 4, ...theme.shadow.sm },
  burbujaTxt: { ...theme.typography.body, color: theme.colors.gray900 },
  hora: { ...theme.typography.caption, color: theme.colors.gray400, marginTop: 3, alignSelf: "flex-end" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray100,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    backgroundColor: theme.colors.gray100,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...theme.typography.body,
    color: theme.colors.gray900,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.serv,
    alignItems: "center",
    justifyContent: "center",
  },
});
