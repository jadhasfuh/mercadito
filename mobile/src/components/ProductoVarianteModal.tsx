import { useMemo, useState } from "react";
import { Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Producto } from "../api/catalogo";
import {
  calcularPrecioEfectivo,
  sumarExtrasDeVariante,
  validarSeleccion,
  type ProductoVariante,
  type SeleccionModificador,
} from "../lib/variantes";
import { unidadFormato } from "../lib/unidades";

interface Props {
  visible: boolean;
  producto: Producto | null;
  puestoId: string | null;
  onClose: () => void;
  onAgregar: (args: {
    variante: ProductoVariante | null;
    modificadores: SeleccionModificador[];
    cantidadInicial: number;
  }) => void;
}

export default function ProductoVarianteModal({ visible, producto, puestoId, onClose, onAgregar }: Props) {
  const opciones = producto?.opciones ?? [];
  const variantes = producto?.variantes ?? [];
  const modificadores = producto?.modificadores ?? [];
  const precioInfo = producto?.precios.find((p) => p.puesto_id === puestoId);

  const [valoresElegidos, setValoresElegidos] = useState<Record<string, string>>({});
  const [modsElegidos, setModsElegidos] = useState<SeleccionModificador[]>([]);
  const [cantidad, setCantidad] = useState(1);
  // Cantidad libre (productos sin variantes con permite_fraccion / permite_por_dinero).
  // modo controla si el cliente teclea cantidad o un monto en pesos.
  const [modo, setModo] = useState<"cantidad" | "monto">("cantidad");
  const [monto, setMonto] = useState<string>("");

  const permiteFraccion = !!producto?.permite_fraccion && opciones.length === 0;
  const permitePorDinero = !!producto?.permite_por_dinero && opciones.length === 0;
  const stepFraccion = 0.5;

  // Reset cuando cambia el producto visible
  useMemo(() => {
    if (visible && producto) {
      setValoresElegidos({});
      setModsElegidos([]);
      setCantidad(permiteFraccion ? stepFraccion : 1);
      setModo(permitePorDinero && !permiteFraccion ? "monto" : "cantidad");
      setMonto("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, producto]);

  const varianteActual: ProductoVariante | null = useMemo(() => {
    if (opciones.length === 0) return null;
    const seleccionados = Object.values(valoresElegidos);
    if (seleccionados.length !== opciones.length) return null;
    const set = new Set(seleccionados);
    return (
      variantes.find(
        (v) => v.valor_ids.length === seleccionados.length && v.valor_ids.every((id) => set.has(id))
      ) ?? null
    );
  }, [opciones, variantes, valoresElegidos]);

  const extrasValores = useMemo(
    () => sumarExtrasDeVariante(opciones, varianteActual),
    [opciones, varianteActual]
  );

  const precioEfectivo = useMemo(() => {
    if (!precioInfo) return { precio_unitario: 0, precio_base_unitario: 0, extras_modificadores: 0, extras_valores: 0, aplica_mayoreo: false };
    return calcularPrecioEfectivo(
      {
        precio: Number(precioInfo.precio),
        precio_mayoreo: precioInfo.precio_mayoreo != null ? Number(precioInfo.precio_mayoreo) : null,
        mayoreo_desde: precioInfo.mayoreo_desde != null ? Number(precioInfo.mayoreo_desde) : null,
      },
      varianteActual,
      modsElegidos,
      cantidad,
      extrasValores
    );
  }, [precioInfo, varianteActual, modsElegidos, cantidad, extrasValores]);

  // Precio total si eligieras este valor manteniendo lo demás (o primer valor
  // por default). Igual que en web, para mostrar "Grande · $179".
  function precioTotalConValor(grupoId: string, valorId: string): number {
    if (!precioInfo) return 0;
    const valIds: string[] = [];
    for (const op of opciones) {
      if (op.id === grupoId) valIds.push(valorId);
      else if (valoresElegidos[op.id]) valIds.push(valoresElegidos[op.id]);
      else if (op.valores.length > 0) valIds.push(op.valores[0].id);
    }
    const set = new Set(valIds);
    const variante = variantes.find(
      (v) => v.valor_ids.length === valIds.length && v.valor_ids.every((id) => set.has(id))
    ) ?? null;
    const base = Number(variante?.precio_override ?? precioInfo.precio);
    let extras = 0;
    for (const op of opciones) {
      for (const vv of op.valores) {
        if (set.has(vv.id)) extras += Number(vv.precio_extra) || 0;
      }
    }
    return base + extras;
  }

  function toggleMod(o: { id: string; nombre: string; precio_extra: number }, grupo: { id: string; nombre: string; multiple: boolean }) {
    setModsElegidos((prev) => {
      const yaEsta = prev.find((p) => p.opcion_id === o.id);
      if (yaEsta) return prev.filter((p) => p.opcion_id !== o.id);
      let base = prev;
      if (!grupo.multiple) base = prev.filter((p) => p.modificador_id !== grupo.id);
      return [
        ...base,
        {
          modificador_id: grupo.id,
          modificador_nombre: grupo.nombre,
          opcion_id: o.id,
          opcion_nombre: o.nombre,
          precio_extra: Number(o.precio_extra) || 0,
        },
      ];
    });
  }

  // Cantidad final: si modo=monto, calcula desde el monto en pesos.
  const cantidadFinal = useMemo(() => {
    if (modo === "monto") {
      const m = parseFloat(monto);
      if (!isFinite(m) || m <= 0) return 0;
      const base = Number(precioInfo?.precio ?? 0);
      if (base <= 0) return 0;
      return Math.round((m / base) * 1000) / 1000; // 3 decimales para gramos
    }
    return cantidad;
  }, [modo, monto, cantidad, precioInfo]);

  function confirmar() {
    for (const op of opciones) {
      if (!valoresElegidos[op.id]) {
        Alert.alert("Falta elegir", `Elige una opción en "${op.nombre}"`);
        return;
      }
    }
    if (opciones.length > 0 && !varianteActual) {
      Alert.alert("No disponible", "Esa combinación no está disponible");
      return;
    }
    const err = validarSeleccion(modificadores, modsElegidos);
    if (err) { Alert.alert("Falta elegir", err); return; }
    if (cantidadFinal <= 0) {
      Alert.alert("Cantidad inválida", modo === "monto" ? "Escribe el monto en pesos" : "Elige una cantidad");
      return;
    }
    onAgregar({ variante: varianteActual, modificadores: modsElegidos, cantidadInicial: cantidadFinal });
    onClose();
  }

  if (!producto || !precioInfo) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo} numberOfLines={1}>{producto.nombre}</Text>
            <Text style={styles.subtitulo} numberOfLines={1}>{precioInfo.puesto_nombre}</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color="#4B5563" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {opciones.map((op) => (
            <View key={op.id} style={styles.grupo}>
              <Text style={styles.grupoLabel}>
                {op.nombre}<Text style={styles.asterisk}> *</Text>
              </Text>
              <View style={styles.chipRow}>
                {op.valores.map((v) => {
                  const elegido = valoresElegidos[op.id] === v.id;
                  const precioTotal = precioTotalConValor(op.id, v.id);
                  return (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => setValoresElegidos((prev) => ({ ...prev, [op.id]: v.id }))}
                      style={[styles.chip, elegido && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, elegido && styles.chipTextActive]}>
                        {v.valor}  <Text style={[styles.chipPrecio, elegido && styles.chipPrecioActive]}>${precioTotal.toFixed(0)}</Text>
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {modificadores.map((m) => {
            const elegidas = modsElegidos.filter((x) => x.modificador_id === m.id).length;
            const min = m.minimo ?? null;
            const max = m.maximo ?? null;
            const reglaTxt = (() => {
              if (m.multiple && min != null && max != null && min === max) return `Elige ${min}`;
              if (m.multiple && min != null && max != null) return `Elige entre ${min} y ${max}`;
              if (m.multiple && min != null) return `Elige al menos ${min}`;
              if (m.multiple && max != null) return `Máx ${max}`;
              return null;
            })();
            const badgeOk = min != null ? elegidas >= min : true;
            return (
            <View key={m.id} style={styles.grupo}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={styles.grupoLabel}>
                  {m.nombre}
                  {m.obligatorio && <Text style={styles.asterisk}> *</Text>}
                </Text>
                {reglaTxt && (
                  <Text style={[styles.grupoHint, !badgeOk && { color: "#DC2626", fontWeight: "700" }]}>
                    {m.multiple ? `${elegidas}/${max ?? "∞"} · ${reglaTxt}` : reglaTxt}
                  </Text>
                )}
              </View>
              {m.opciones.map((o) => {
                const elegido = modsElegidos.some((x) => x.opcion_id === o.id);
                const bloqueado = !elegido && m.multiple && max != null && elegidas >= max;
                return (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => !bloqueado && toggleMod(o, m)}
                    disabled={bloqueado}
                    style={[styles.opcionRow, elegido && styles.opcionRowActive, bloqueado && { opacity: 0.4 }]}
                  >
                    <Ionicons
                      name={elegido ? (m.multiple ? "checkbox" : "radio-button-on") : (m.multiple ? "square-outline" : "radio-button-off")}
                      size={20}
                      color={elegido ? "#FF7A2B" : "#8B7B69"}
                    />
                    <Text style={[styles.opcionNombre, elegido && styles.opcionNombreActive]}>{o.nombre}</Text>
                    <Text style={styles.opcionExtra}>
                      {Number(o.precio_extra) > 0 ? `+$${Number(o.precio_extra).toFixed(2)}` : "Incluido"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            );
          })}

          <View style={styles.grupo}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={styles.grupoLabel}>{modo === "monto" ? "Monto a comprar" : "Cantidad"}</Text>
              {permitePorDinero && (
                <View style={styles.modoToggle}>
                  <TouchableOpacity
                    onPress={() => setModo("cantidad")}
                    style={[styles.modoChip, modo === "cantidad" && styles.modoChipActive]}
                  >
                    <Text style={[styles.modoChipText, modo === "cantidad" && styles.modoChipTextActive]}>Por {unidadFormato(producto.unidad, 1)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setModo("monto")}
                    style={[styles.modoChip, modo === "monto" && styles.modoChipActive]}
                  >
                    <Text style={[styles.modoChipText, modo === "monto" && styles.modoChipTextActive]}>Por monto $</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {modo === "monto" ? (
              <View>
                <View style={styles.montoRow}>
                  <Text style={styles.montoCurrency}>$</Text>
                  <TextInput
                    value={monto}
                    onChangeText={(t) => setMonto(t.replace(/[^0-9.]/g, ""))}
                    keyboardType="decimal-pad"
                    placeholder="20"
                    style={styles.montoInput}
                  />
                </View>
                <Text style={styles.montoHint}>
                  ≈ {(() => {
                    const m = parseFloat(monto);
                    if (!isFinite(m) || m <= 0) return "0";
                    const base = Number(precioInfo.precio);
                    return (m / base).toFixed(base >= 50 ? 3 : 2);
                  })()} {unidadFormato(producto.unidad, 1)} (a ${Number(precioInfo.precio).toFixed(2)}/{unidadFormato(producto.unidad, 1)})
                </Text>
              </View>
            ) : (
              <View style={styles.qtyRow}>
                <TouchableOpacity
                  style={[styles.qtyButton, styles.qtyMinus]}
                  onPress={() => setCantidad((c) => Math.max(permiteFraccion ? stepFraccion : 1, +(c - (permiteFraccion ? stepFraccion : 1)).toFixed(2)))}
                >
                  <Ionicons name="remove" size={20} color="#DC2626" />
                </TouchableOpacity>
                <Text style={styles.qtyCount}>{permiteFraccion ? cantidad.toFixed(cantidad % 1 === 0 ? 0 : 2) : cantidad}</Text>
                <TouchableOpacity
                  style={[styles.qtyButton, styles.qtyPlus]}
                  onPress={() => setCantidad((c) => +(c + (permiteFraccion ? stepFraccion : 1)).toFixed(2))}
                >
                  <Ionicons name="add" size={20} color="#059669" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {precioEfectivo.aplica_mayoreo && modo === "cantidad" && (
            <Text style={styles.mayoreoBadge}>🎉 Precio de mayoreo aplicado</Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.submit} onPress={confirmar}>
            <Text style={styles.submitText}>
              {modo === "monto"
                ? `Agregar $${(parseFloat(monto) || 0).toFixed(2)} · ≈${cantidadFinal.toFixed(cantidadFinal % 1 === 0 ? 0 : 2)} ${unidadFormato(producto.unidad, cantidadFinal)}`
                : `Agregar ${cantidad} ${unidadFormato(producto.unidad, cantidad)} · $${(precioEfectivo.precio_unitario * cantidad).toFixed(2)}`}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", backgroundColor: "#fff" },
  titulo: { fontSize: 17, fontWeight: "700", color: "#1F2937" },
  subtitulo: { fontSize: 12, color: "#8B7B69" },
  content: { padding: 16, paddingBottom: 24 },
  grupo: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 10 },
  grupoLabel: { fontSize: 14, fontWeight: "700", color: "#1F2937", marginBottom: 8 },
  grupoHint: { fontSize: 11, color: "#8B7B69", fontWeight: "400" },
  asterisk: { color: "#DC2626" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 2, borderColor: "#E5E7EB", backgroundColor: "#fff" },
  chipActive: { borderColor: "#FF7A2B", backgroundColor: "#FFF2E5" },
  chipText: { fontSize: 13, color: "#4B5563" },
  chipTextActive: { color: "#FF7A2B", fontWeight: "700" },
  chipPrecio: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  chipPrecioActive: { color: "#C2410C" },
  opcionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 6 },
  opcionRowActive: { borderColor: "#FF7A2B", backgroundColor: "#FFF2E5" },
  opcionNombre: { flex: 1, fontSize: 14, color: "#4B5563" },
  opcionNombreActive: { color: "#FF7A2B", fontWeight: "700" },
  opcionExtra: { fontSize: 12, color: "#8B7B69" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 14, justifyContent: "center" },
  qtyButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  qtyMinus: { backgroundColor: "#FEE2E2" },
  qtyPlus: { backgroundColor: "#DCFCE7" },
  qtyCount: { fontSize: 20, fontWeight: "700", minWidth: 60, textAlign: "center" },
  modoToggle: { flexDirection: "row", backgroundColor: "#F3EFE7", borderRadius: 999, padding: 2 },
  modoChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  modoChipActive: { backgroundColor: "#fff" },
  modoChipText: { fontSize: 11, color: "#8B7B69", fontWeight: "600" },
  modoChipTextActive: { color: "#FF7A2B" },
  montoRow: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: "#fff" },
  montoCurrency: { fontSize: 22, fontWeight: "700", color: "#1F2937" },
  montoInput: { flex: 1, fontSize: 22, fontWeight: "700", color: "#1F2937", padding: 8 },
  montoHint: { fontSize: 12, color: "#8B7B69", marginTop: 6, textAlign: "center" },
  mayoreoBadge: { fontSize: 13, color: "#059669", backgroundColor: "#ECFDF5", textAlign: "center", padding: 10, borderRadius: 8, fontWeight: "600" },
  footer: { padding: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB", backgroundColor: "#fff" },
  submit: { backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
