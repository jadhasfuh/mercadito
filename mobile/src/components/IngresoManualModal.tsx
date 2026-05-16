import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import BottomSheet from "./BottomSheet";
import { registrarIngresoManual } from "../api/repartidor";
import { listarTiendasAdmin } from "../api/admin";

interface Props {
  abierto: boolean;
  onClose: () => void;
  onGuardado?: () => void;
}

interface TiendaOpcion {
  id: string;
  nombre: string;
}

// Mismo flujo que el modal web (src/components/IngresoManualModal.tsx).
// Captura SOLO la ganancia Mercadito (envío + servicio + propina) — el
// helper amarillo lo enfatiza para que el repartidor no meta el ticket total.
export default function IngresoManualModalRN({ abierto, onClose, onGuardado }: Props) {
  const [tipo, setTipo] = useState<"tienda" | "mandado">("tienda");
  const [puestoId, setPuestoId] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [monto, setMonto] = useState("");
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "transferencia" | "tarjeta">("efectivo");
  const [detalle, setDetalle] = useState("");
  const [tiendas, setTiendas] = useState<TiendaOpcion[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    listarTiendasAdmin()
      .then((data) => setTiendas(data.map((t) => ({ id: t.id, nombre: t.nombre }))))
      .catch(() => {});
  }, [abierto]);

  useEffect(() => {
    if (!abierto) {
      setTipo("tienda");
      setPuestoId("");
      setClienteNombre("");
      setClienteTelefono("");
      setMonto("");
      setMetodoPago("efectivo");
      setDetalle("");
      setError(null);
    }
  }, [abierto]);

  async function guardar() {
    setError(null);
    const montoNum = Number(monto);
    if (!isFinite(montoNum) || montoNum <= 0) {
      setError("Monto debe ser mayor a 0");
      return;
    }
    if (tipo === "tienda" && !puestoId) {
      setError("Elige una tienda");
      return;
    }
    if (tipo === "mandado" && !clienteNombre.trim()) {
      setError("Pon el nombre del cliente");
      return;
    }
    setGuardando(true);
    try {
      await registrarIngresoManual({
        tipo,
        puesto_id: tipo === "tienda" ? puestoId : undefined,
        cliente_nombre: tipo === "mandado" ? clienteNombre.trim() : undefined,
        cliente_telefono: tipo === "mandado" ? clienteTelefono.trim() || undefined : undefined,
        monto: montoNum,
        metodo_pago: metodoPago,
        detalle: detalle.trim() || undefined,
      });
      onGuardado?.();
      onClose();
    } catch (e) {
      setError((e as Error).message || "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <BottomSheet
      abierto={abierto}
      onClose={onClose}
      titulo="Registrar venta manual"
      footer={
        <TouchableOpacity style={[styles.btnGuardar, guardando && styles.btnDisabled]} onPress={guardar} disabled={guardando}>
          {guardando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnGuardarTxt}>Guardar ingreso</Text>
          )}
        </TouchableOpacity>
      }
    >
      <View style={styles.helper}>
        <Text style={styles.helperTxt}>
          💡 Captura <Text style={{ fontWeight: "700" }}>solo la ganancia Mercadito</Text> (envío + servicio + propina), no el ticket completo del cliente.
        </Text>
      </View>

      <Text style={styles.label}>¿De qué fue el pedido?</Text>
      <View style={styles.row2}>
        <TouchableOpacity
          style={[styles.toggleBtn, tipo === "tienda" && styles.toggleBtnOn]}
          onPress={() => setTipo("tienda")}
        >
          <Text style={[styles.toggleTxt, tipo === "tienda" && styles.toggleTxtOn]}>🏪 Compra en tienda</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, tipo === "mandado" && styles.toggleBtnOn]}
          onPress={() => setTipo("mandado")}
        >
          <Text style={[styles.toggleTxt, tipo === "mandado" && styles.toggleTxtOn]}>🛵 Mandado</Text>
        </TouchableOpacity>
      </View>

      {tipo === "tienda" ? (
        <View>
          <Text style={styles.label}>Tienda</Text>
          <View style={styles.tiendaList}>
            {tiendas.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tiendaChip, puestoId === t.id && styles.tiendaChipOn]}
                onPress={() => setPuestoId(t.id)}
              >
                <Text style={[styles.tiendaChipTxt, puestoId === t.id && styles.tiendaChipTxtOn]} numberOfLines={1}>
                  {t.nombre}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.label}>Cliente</Text>
          <TextInput
            value={clienteNombre}
            onChangeText={setClienteNombre}
            placeholder="Nombre del cliente"
            placeholderTextColor="#B5A88F"
            style={styles.input}
          />
          <Text style={styles.label}>Teléfono (opcional)</Text>
          <TextInput
            value={clienteTelefono}
            onChangeText={setClienteTelefono}
            placeholder="10 dígitos"
            placeholderTextColor="#B5A88F"
            keyboardType="phone-pad"
            style={styles.input}
          />
        </>
      )}

      <Text style={styles.label}>Monto (ganancia Mercadito)</Text>
      <View style={styles.montoBox}>
        <Text style={styles.montoSign}>$</Text>
        <TextInput
          value={monto}
          onChangeText={(t) => setMonto(t.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          placeholderTextColor="#B5A88F"
          keyboardType="decimal-pad"
          style={styles.montoInput}
        />
      </View>

      <Text style={styles.label}>Cómo te pagaron</Text>
      <View style={styles.row3}>
        {(["efectivo", "transferencia", "tarjeta"] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.metodoBtn, metodoPago === m && styles.metodoBtnOn]}
            onPress={() => setMetodoPago(m)}
          >
            <Text style={[styles.metodoTxt, metodoPago === m && styles.metodoTxtOn]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Detalle (opcional)</Text>
      <TextInput
        value={detalle}
        onChangeText={setDetalle}
        placeholder="Ej: 2 órdenes de pastor · entregado en Tepeyac"
        placeholderTextColor="#B5A88F"
        multiline
        numberOfLines={3}
        style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
      />

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTxt}>{error}</Text>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  helper: { backgroundColor: "#FEF3C7", borderColor: "#FCD34D", borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12 },
  helperTxt: { fontSize: 12, color: "#78350F", lineHeight: 17 },
  label: { fontSize: 11, fontWeight: "700", color: "#8B7B69", textTransform: "uppercase", marginBottom: 6, marginTop: 12, letterSpacing: 0.3 },
  row2: { flexDirection: "row", gap: 8 },
  row3: { flexDirection: "row", gap: 6 },
  toggleBtn: { flex: 1, paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: "#D6CDB8", backgroundColor: "#fff", alignItems: "center" },
  toggleBtnOn: { backgroundColor: "#F2A65A", borderColor: "#F2A65A" },
  toggleTxt: { fontSize: 13, color: "#5A4F3F", fontWeight: "600" },
  toggleTxtOn: { color: "#fff" },
  tiendaList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tiendaChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#D6CDB8", backgroundColor: "#fff", maxWidth: "100%" },
  tiendaChipOn: { backgroundColor: "#F2A65A", borderColor: "#F2A65A" },
  tiendaChipTxt: { fontSize: 12, color: "#5A4F3F", fontWeight: "600" },
  tiendaChipTxtOn: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#D6CDB8", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#1F2937", backgroundColor: "#fff" },
  montoBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#D6CDB8", borderRadius: 8, paddingHorizontal: 12, backgroundColor: "#fff" },
  montoSign: { fontSize: 16, color: "#8B7B69", marginRight: 4 },
  montoInput: { flex: 1, fontSize: 18, fontWeight: "700", color: "#1F2937", paddingVertical: 10 },
  metodoBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: "#D6CDB8", backgroundColor: "#fff", alignItems: "center" },
  metodoBtnOn: { backgroundColor: "#F2A65A", borderColor: "#F2A65A" },
  metodoTxt: { fontSize: 12, color: "#5A4F3F", fontWeight: "600", textTransform: "capitalize" },
  metodoTxtOn: { color: "#fff" },
  errorBox: { backgroundColor: "#FEE2E2", borderColor: "#FECACA", borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 12 },
  errorTxt: { color: "#B91C1C", fontSize: 13 },
  btnGuardar: { backgroundColor: "#F2A65A", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  btnDisabled: { opacity: 0.6 },
  btnGuardarTxt: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
