import { useState } from "react";
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../lib/theme";
import { DIAS_CORTOS } from "../lib/precioPromo";
import { guardarPromo, quitarPromo } from "../api/tienda";

export interface PromoActual {
  precio: number | null;
  etiqueta: string | null;
  dias: number[];
  desde: string | null;
  hasta: string | null;
  termina: string | null;
}

/**
 * Promoción de un producto: precio especial con días y horario.
 * ESPEJO de src/components/PromoEditor.tsx (web).
 *
 * El precio promocional se resuelve en la MISMA consulta que el de lista, así
 * que lo que anuncia el menú es exactamente lo que cobra la caja y lo que llega
 * a la comanda de mesa. Lo que NO cubre: combos de varios productos.
 */
export default function PromoEditorModal({ visible, productoId, productoNombre, puestoId, precioLista, promo, onListo, onCerrar }: {
  visible: boolean;
  productoId: string;
  productoNombre: string;
  puestoId: string;
  precioLista: number;
  promo: PromoActual | null;
  onListo: () => void;
  onCerrar: () => void;
}) {
  const [precio, setPrecio] = useState(promo?.precio != null ? String(promo.precio) : "");
  const [etiqueta, setEtiqueta] = useState(promo?.etiqueta ?? "");
  const [dias, setDias] = useState<number[]>(promo?.dias ?? []);
  const [desde, setDesde] = useState(promo?.desde ?? "");
  const [hasta, setHasta] = useState(promo?.hasta ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const alternarDia = (d: number) =>
    setDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const ahorro = Number(precio) > 0 && Number(precio) < precioLista
    ? Math.round((1 - Number(precio) / precioLista) * 100)
    : null;

  async function guardar() {
    setOcupado(true); setError(null);
    try {
      await guardarPromo(productoId, puestoId, {
        precio: Number(precio), etiqueta, dias, desde, hasta, termina: null,
      });
      onListo(); onCerrar();
    } catch (e) {
      setError((e as { error?: string })?.error ?? "No se pudo guardar");
    } finally { setOcupado(false); }
  }

  async function quitar() {
    setOcupado(true); setError(null);
    try {
      await quitarPromo(productoId, puestoId);
      onListo(); onCerrar();
    } catch (e) {
      setError((e as { error?: string })?.error ?? "No se pudo quitar");
    } finally { setOcupado(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCerrar}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.titulo}>Promoción</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {productoNombre} · precio normal ${precioLista.toFixed(0)}
            </Text>
          </View>
          <TouchableOpacity onPress={onCerrar} hitSlop={10} accessibilityLabel="Cerrar">
            <Ionicons name="close" size={26} color="#4B5563" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Precio de promoción</Text>
          <TextInput
            value={precio}
            onChangeText={(v) => setPrecio(v.replace(/[^\d.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={theme.colors.gray400}
            style={[styles.input, styles.inputMonto]}
          />
          {ahorro != null && <Text style={styles.ahorro}>{ahorro}% menos que el precio normal.</Text>}

          <Text style={styles.label}>¿Cómo se llama? (opcional)</Text>
          <TextInput
            value={etiqueta}
            onChangeText={setEtiqueta}
            maxLength={40}
            placeholder="Martes de tacos, Happy hour…"
            placeholderTextColor={theme.colors.gray400}
            style={styles.input}
          />
          <Text style={styles.hint}>Es lo que ve el cliente en tu menú.</Text>

          <Text style={styles.label}>¿Qué días?</Text>
          <View style={styles.dias}>
            {DIAS_CORTOS.map((d, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => alternarDia(i)}
                style={[styles.dia, dias.includes(i) && styles.diaOn]}
                activeOpacity={0.8}
              >
                <Text style={[styles.diaTxt, dias.includes(i) && styles.diaTxtOn]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            {dias.length === 0 ? "Sin marcar nada aplica todos los días." : `Sólo ${dias.length} ${dias.length === 1 ? "día" : "días"}.`}
          </Text>

          <Text style={styles.label}>¿A qué hora? (opcional)</Text>
          <View style={styles.horas}>
            <TextInput value={desde} onChangeText={setDesde} placeholder="18:00" placeholderTextColor={theme.colors.gray400} style={[styles.input, { flex: 1 }]} />
            <Text style={styles.a}>a</Text>
            <TextInput value={hasta} onChangeText={setHasta} placeholder="20:00" placeholderTextColor={theme.colors.gray400} style={[styles.input, { flex: 1 }]} />
          </View>
          <Text style={styles.hint}>Vacías = todo el día que estés abierto.</Text>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          {promo?.precio != null && (
            <TouchableOpacity onPress={quitar} disabled={ocupado} style={[styles.btn, styles.btnQuitar]}>
              <Text style={styles.btnQuitarTxt}>Quitar</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={guardar}
            disabled={ocupado || !precio}
            style={[styles.btn, styles.btnGuardar, (ocupado || !precio) && { opacity: 0.5 }]}
          >
            <Text style={styles.btnGuardarTxt}>{ocupado ? "Guardando…" : "Guardar promoción"}</Text>
          </TouchableOpacity>
        </View>
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
  sub: { fontSize: 12, color: theme.colors.gray400 },
  content: { paddingHorizontal: 18, paddingBottom: 24 },
  label: { fontSize: 12, fontWeight: "700", color: theme.colors.gray600, marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: theme.colors.gray200, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: theme.colors.gray900,
  },
  inputMonto: { fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] },
  ahorro: { fontSize: 11.5, fontWeight: "700", color: "#047857", marginTop: 5 },
  hint: { fontSize: 11, color: theme.colors.gray400, marginTop: 5 },
  dias: { flexDirection: "row", gap: 6 },
  dia: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.colors.gray100, alignItems: "center" },
  diaOn: { backgroundColor: theme.colors.brand },
  diaTxt: { fontSize: 12, fontWeight: "800", color: theme.colors.gray500 },
  diaTxtOn: { color: "#fff" },
  horas: { flexDirection: "row", alignItems: "center", gap: 8 },
  a: { color: theme.colors.gray400, fontSize: 13 },
  error: { fontSize: 13, color: theme.colors.dangerDark, marginTop: 12 },
  footer: {
    flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.10)",
  },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  btnQuitar: { backgroundColor: "#FEE2E2", paddingHorizontal: 20 },
  btnQuitarTxt: { color: "#B91C1C", fontWeight: "800", fontSize: 14 },
  btnGuardar: { flex: 1, backgroundColor: theme.colors.brand },
  btnGuardarTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
