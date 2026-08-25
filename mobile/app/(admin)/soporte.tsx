import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ScrollView, RefreshControl, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import ScreenHeader from "../../src/components/ScreenHeader";
import BottomSheet from "../../src/components/BottomSheet";
import {
  listarHilosSoporte, listarMisMensajes, enviarMensajeATienda,
  type HiloSoporte, type Mensaje,
} from "../../src/api/admin";
import { apiFetch } from "../../src/api/client";
import { fechaHoraMX } from "../../src/lib/fecha";
import { theme } from "../../src/lib/theme";

// Bandeja de soporte del admin: un renglón por negocio con conversación, los
// que escribieron y siguen sin respuesta hasta arriba. Espejo de
// src/components/AdminSoporte.tsx en web.
export default function SoporteScreen() {
  const [hilos, setHilos] = useState<HiloSoporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [abierto, setAbierto] = useState<HiloSoporte | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setHilos((await listarHilosSoporte()).hilos ?? []);
    } catch { /* la pantalla muestra el vacío */ } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  async function abrirHilo(h: HiloSoporte) {
    setAbierto(h);
    setMensajes([]);
    try {
      setMensajes(await listarMisMensajes(h.puesto_id));
      // Marcar leído SOLO lo que mandó el negocio: si marcáramos el hilo
      // entero, borraríamos el pendiente del negocio sin que lo haya visto.
      await apiFetch("/api/mensajes", {
        method: "PATCH",
        body: JSON.stringify({ id: "all", puesto_id: h.puesto_id }),
      });
      cargar();
    } catch { /* no-op */ }
  }

  async function enviar() {
    const t = texto.trim();
    if (!t || !abierto || enviando) return;
    setEnviando(true);
    try {
      await enviarMensajeATienda(abierto.puesto_id, t);
      setTexto("");
      setMensajes(await listarMisMensajes(abierto.puesto_id));
      cargar();
    } catch { /* no-op */ } finally {
      setEnviando(false);
    }
  }

  const hilo = [...mensajes].reverse();

  return (
    <>
      <ScreenHeader title="Soporte" subtitle="Conversaciones con los negocios" />
      {cargando ? (
        <Text style={styles.vacio}>Cargando…</Text>
      ) : (
        <FlatList
          data={hilos}
          keyExtractor={(h) => h.puesto_id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}
          ListEmptyComponent={
            <Text style={styles.vacio}>Todavía no hay conversaciones.{"\n"}Cuando un negocio escriba, aparece aquí.</Text>
          }
          renderItem={({ item: h }) => (
            <TouchableOpacity style={styles.card} onPress={() => abrirHilo(h)} activeOpacity={0.85}>
              <View style={styles.cardTop}>
                <Text style={styles.nombre} numberOfLines={1}>{h.puesto_nombre}</Text>
                {h.sin_leer > 0 && (
                  <View style={styles.badge}><Text style={styles.badgeTxt}>{h.sin_leer}</Text></View>
                )}
              </View>
              <Text style={styles.ultimo} numberOfLines={1}>
                {h.ultimo_de === "admin" ? "Tú: " : ""}{h.ultimo}
              </Text>
              <Text style={styles.fecha}>
                {fechaHoraMX(h.ultimo_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      <BottomSheet abierto={!!abierto} onClose={() => { setAbierto(null); cargar(); }} titulo={abierto?.puesto_nombre ?? "Soporte"}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {hilo.length === 0 ? (
            <Text style={styles.vacio}>Todavía no hay mensajes con este negocio.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 380 }}>
              {hilo.map((m) => {
                const mio = m.de !== "tienda"; // los viejos son del admin
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
              placeholder="Escribe tu respuesta…"
              placeholderTextColor="#9C8B72"
              maxLength={2000}
              multiline
              style={styles.input}
            />
            <TouchableOpacity onPress={enviar} disabled={!texto.trim() || enviando} style={[styles.btn, (!texto.trim() || enviando) && styles.btnOff]}>
              <Text style={styles.btnTxt}>{enviando ? "…" : "Enviar"}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: "#8B7B69", paddingVertical: 30, paddingHorizontal: 20, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#F3F4F6" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  nombre: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: "800", color: "#111827" },
  badge: { backgroundColor: "#EF4444", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  badgeTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
  ultimo: { fontSize: 13, color: "#6B7280", marginTop: 3 },
  fecha: { fontSize: 10, color: "#9CA3AF", marginTop: 3 },
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
