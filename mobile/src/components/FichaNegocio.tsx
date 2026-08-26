import { useMemo } from "react";
import { Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Puesto } from "../api/catalogo";
import type { PaletaMarca } from "../lib/paletaMarca";
import { filasHorario, diaSemanaMX, linkMapa, LABEL_PAGO, LABEL_SERVICIO } from "../lib/fichaNegocio";
import { telefonoWhatsApp, linkLlamada } from "../lib/pedidoWhatsApp";
import { labelCiudad } from "../lib/ciudades";
import Boton3D from "./Boton3D";

/**
 * Hoja "Información del negocio" del menú.
 *
 * ESPEJO de src/components/FichaNegocio.tsx (web). Responde de una las cuatro
 * preguntas que hoy llegan por WhatsApp antes de cualquier pedido: a qué hora
 * abren, dónde están, cómo se paga y si hay para llevar.
 */
export default function FichaNegocio({ visible, puesto, pal, onClose }: {
  visible: boolean;
  puesto: Puesto | null;
  pal: PaletaMarca;
  onClose: () => void;
}) {
  const hoy = useMemo(() => diaSemanaMX(), []);
  const filas = useMemo(
    () => filasHorario(puesto?.horario_atencion ?? [], hoy),
    [puesto?.horario_atencion, hoy]
  );
  if (!puesto) return null;

  const mapa = linkMapa(puesto.lat, puesto.lng, puesto.ubicacion);
  const wa = telefonoWhatsApp(puesto.telefono_contacto);
  const tel = linkLlamada(puesto.telefono_contacto);
  const direccion = puesto.ubicacion?.trim() || labelCiudad(puesto.ciudad);
  const pagos = puesto.metodos_pago?.length ? puesto.metodos_pago : ["efectivo"];
  const servicios = puesto.servicios_pedido ?? [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.titulo} numberOfLines={1}>{puesto.nombre}</Text>
            <Text style={styles.subtitulo}>Información del negocio</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <Ionicons name="close" size={26} color="#4B5563" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.estado, puesto.abierto_ahora ? styles.estadoOn : styles.estadoOff]}>
            <Text style={[styles.estadoTxt, puesto.abierto_ahora ? styles.estadoTxtOn : styles.estadoTxtOff]}>
              ● {puesto.abierto_ahora ? "Abierto ahora" : "Cerrado ahora"}
            </Text>
          </View>

          <Text style={styles.seccion}>Horario</Text>
          {filas.length === 0 ? (
            <Text style={styles.parrafo}>
              Este negocio no publicó un horario. Si tienes duda, pregúntale antes de ir.
            </Text>
          ) : (
            filas.map((f) => (
              <View key={f.dias} style={styles.fila}>
                <Text style={[styles.filaDia, f.hoy && styles.filaHoy]}>
                  {f.dias}
                  {f.hoy ? <Text style={[styles.hoyTag, { color: pal.accentDark }]}>  HOY</Text> : null}
                </Text>
                <Text style={[styles.filaHoras, f.hoy && styles.filaHoy]}>{f.horas}</Text>
              </View>
            ))
          )}

          {servicios.length > 0 && (
            <>
              <Text style={styles.seccion}>Cómo puedes pedir</Text>
              <View style={styles.chips}>
                {servicios.map((s) => (
                  <View key={s} style={[styles.chip, { backgroundColor: pal.soft }]}>
                    <Text style={[styles.chipTxt, { color: pal.accentDark }]}>{LABEL_SERVICIO[s] ?? s}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={styles.seccion}>Formas de pago</Text>
          <View style={styles.chips}>
            {pagos.map((m) => (
              <View key={m} style={[styles.chip, styles.chipGris]}>
                <Text style={[styles.chipTxt, { color: "#374151" }]}>{LABEL_PAGO[m] ?? m}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.seccion}>Dónde está</Text>
          <Text style={styles.parrafo}>📍 {direccion}</Text>
          {mapa && (
            <Boton3D
              onPress={() => Linking.openURL(mapa)}
              color={pal.accent}
              shadow={pal.shadow}
              style={styles.cta}
            >
              <Text style={[styles.ctaTxt, { color: pal.on }]}>Cómo llegar →</Text>
            </Boton3D>
          )}

          {(wa || tel) && (
            <>
              <Text style={styles.seccion}>Contacto</Text>
              <View style={styles.chips}>
                {wa && (
                  <TouchableOpacity onPress={() => Linking.openURL(`https://wa.me/${wa}`)} style={[styles.contacto, { backgroundColor: "#25D366" }]}>
                    <Text style={styles.contactoTxt}>💬 WhatsApp</Text>
                  </TouchableOpacity>
                )}
                {tel && (
                  <TouchableOpacity onPress={() => Linking.openURL(tel)} style={[styles.contacto, styles.chipGris]}>
                    <Text style={[styles.contactoTxt, { color: "#374151" }]}>📞 Llamar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.10)",
  },
  titulo: { fontSize: 17, fontWeight: "800", color: "#111827" },
  subtitulo: { fontSize: 12, color: "#9CA3AF" },
  content: { paddingHorizontal: 18, paddingBottom: 32 },
  estado: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginTop: 16 },
  estadoOn: { backgroundColor: "#DCFCE7" },
  estadoOff: { backgroundColor: "#FEE2E2" },
  estadoTxt: { fontSize: 13, fontWeight: "800" },
  estadoTxtOn: { color: "#15803D" },
  estadoTxtOff: { color: "#B91C1C" },
  seccion: {
    fontSize: 11, fontWeight: "800", color: "#9CA3AF", letterSpacing: 0.6,
    textTransform: "uppercase", marginTop: 24, marginBottom: 8,
  },
  parrafo: { fontSize: 14, color: "#374151", lineHeight: 20 },
  fila: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 3 },
  filaDia: { fontSize: 14, color: "#6B7280", flexShrink: 1 },
  filaHoras: { fontSize: 14, color: "#6B7280", fontVariant: ["tabular-nums"] },
  filaHoy: { color: "#111827", fontWeight: "800" },
  hoyTag: { fontSize: 10, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  chipGris: { backgroundColor: "#F3F4F6" },
  chipTxt: { fontSize: 13, fontWeight: "700" },
  cta: { alignSelf: "flex-start", marginTop: 12, paddingHorizontal: 18, paddingVertical: 10 },
  ctaTxt: { fontSize: 14, fontWeight: "800" },
  contacto: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  contactoTxt: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
