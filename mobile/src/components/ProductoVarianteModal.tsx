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
    montoSolicitado?: number | null;
  }) => void;
  // Edición desde el carrito: precarga cantidad/monto del item existente.
  inicial?: { cantidad: number; monto: number | null } | null;
  // Si está en edición, el carrito puede pasar este callback para que el
  // modal muestre un botón "Eliminar del carrito" — útil cuando el item
  // tiene cantidad libre (no hay −/+ que llegue a 0 desde la lista).
  onEliminar?: () => void;
}

export default function ProductoVarianteModal({ visible, producto, puestoId, onClose, onAgregar, inicial, onEliminar }: Props) {
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

  // Reset cuando cambia el producto visible. En edición precargamos los
  // valores actuales del item del carrito.
  useMemo(() => {
    if (visible && producto) {
      setValoresElegidos({});
      setModsElegidos([]);
      if (inicial) {
        setCantidad(inicial.cantidad);
        setModo(inicial.monto != null ? "monto" : "cantidad");
        setMonto(inicial.monto != null ? String(inicial.monto) : "");
      } else {
        setCantidad(permiteFraccion ? stepFraccion : 1);
        setModo(permitePorDinero && !permiteFraccion ? "monto" : "cantidad");
        setMonto("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, producto, inicial]);

  const esEdicion = inicial != null;

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
    onAgregar({
      variante: varianteActual,
      modificadores: modsElegidos,
      cantidadInicial: cantidadFinal,
      montoSolicitado: modo === "monto" ? parseFloat(monto) || null : null,
    });
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
                      color={elegido ? "#ED8E3C" : "#8B7B69"}
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

          {permitePorDinero && (
            <View style={styles.modoToggleFull}>
              <TouchableOpacity
                onPress={() => {
                  // Al volver a modo cantidad desde monto, redondear el
                  // valor decimal heredado para que el +/- arranque limpio.
                  setCantidad((c) => {
                    if (permiteFraccion) {
                      const r = Math.round(c / stepFraccion) * stepFraccion;
                      return r > 0 ? r : stepFraccion;
                    }
                    const r = Math.round(c);
                    return r > 0 ? r : 1;
                  });
                  setModo("cantidad");
                }}
                style={[styles.modoChipFull, modo === "cantidad" && styles.modoChipFullActive]}
              >
                <Text style={[styles.modoChipFullText, modo === "cantidad" && styles.modoChipFullTextActive]}>Por {unidadFormato(producto.unidad, 1)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setModo("monto")}
                style={[styles.modoChipFull, modo === "monto" && styles.modoChipFullActive]}
              >
                <Text style={[styles.modoChipFullText, modo === "monto" && styles.modoChipFullTextActive]}>Por monto $</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Caja crema con info de precio + stepper/input + subtotal —
              espejo del layout web para que el cliente vea el subtotal
              calculado y el precio por unidad sin tener que leer el botón. */}
          <View style={styles.cajaLibre}>
            {(permiteFraccion || permitePorDinero) && opciones.length === 0 && (
              <Text style={styles.cajaInfoTxt}>
                {unidadFormato(producto.unidad, 1).charAt(0).toUpperCase() + unidadFormato(producto.unidad, 1).slice(1)} cuesta{" "}
                <Text style={styles.cajaInfoBold}>${Number(precioInfo.precio).toFixed(2)}</Text>
              </Text>
            )}

            {modo === "monto" ? (
              <View>
                <View style={styles.montoRow}>
                  <Text style={styles.montoCurrency}>$</Text>
                  <TextInput
                    placeholderTextColor="#9C8B72"
                    value={monto}
                    onChangeText={(t) => setMonto(t.replace(/[^0-9.]/g, ""))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    style={styles.montoInput}
                  />
                </View>
                <Text style={styles.montoHint}>
                  ≈ {(() => {
                    const m = parseFloat(monto);
                    if (!isFinite(m) || m <= 0) return "0";
                    const base = Number(precioInfo.precio);
                    return (m / base).toFixed(base >= 50 ? 3 : 2);
                  })()} {unidadFormato(producto.unidad, 1)}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={[styles.qtyButton, styles.qtyMinus]}
                    onPress={() => setCantidad((c) => Math.max(permiteFraccion ? stepFraccion : 1, +(c - (permiteFraccion ? stepFraccion : 1)).toFixed(2)))}
                  >
                    <Ionicons name="remove" size={22} color="#DC2626" />
                  </TouchableOpacity>
                  <View style={styles.qtyTextWrap}>
                    <Text style={styles.qtyCount}>
                      {permiteFraccion ? cantidad.toFixed(cantidad % 1 === 0 ? 0 : 2) : cantidad}
                    </Text>
                    <Text style={styles.qtyUnidad}>{unidadFormato(producto.unidad, cantidad)}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.qtyButton, styles.qtyPlus]}
                    onPress={() => setCantidad((c) => +(c + (permiteFraccion ? stepFraccion : 1)).toFixed(2))}
                  >
                    <Ionicons name="add" size={22} color="#059669" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.subtotalCaja}>
                  ${(precioEfectivo.precio_unitario * cantidad).toFixed(2)}
                </Text>
              </>
            )}
          </View>

          {precioEfectivo.aplica_mayoreo && modo === "cantidad" && (
            <Text style={styles.mayoreoBadge}>🎉 Precio de mayoreo aplicado</Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {esEdicion && onEliminar && (
            <TouchableOpacity
              style={styles.eliminarBtn}
              onPress={() => { onEliminar(); onClose(); }}
            >
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={styles.eliminarBtnTxt}>Eliminar del carrito</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.submit} onPress={confirmar}>
            <Text style={styles.submitText}>
              {esEdicion ? "Guardar cambios" : "Agregar al carrito"}
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
  chipActive: { borderColor: "#ED8E3C", backgroundColor: "#FEF5EA" },
  chipText: { fontSize: 13, color: "#4B5563" },
  chipTextActive: { color: "#ED8E3C", fontWeight: "700" },
  chipPrecio: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  chipPrecioActive: { color: "#C2680E" },
  opcionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 6 },
  opcionRowActive: { borderColor: "#ED8E3C", backgroundColor: "#FEF5EA" },
  opcionNombre: { flex: 1, fontSize: 14, color: "#4B5563" },
  opcionNombreActive: { color: "#ED8E3C", fontWeight: "700" },
  opcionExtra: { fontSize: 12, color: "#8B7B69" },
  cajaLibre: { backgroundColor: "#FEF5EA", borderRadius: 16, padding: 16, alignItems: "center", marginBottom: 10 },
  cajaInfoTxt: { fontSize: 12, color: "#8B7B69", marginBottom: 12, textAlign: "center" },
  cajaInfoBold: { fontWeight: "700", color: "#374151" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 18, justifyContent: "center" },
  qtyButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  qtyMinus: { backgroundColor: "#FEE2E2" },
  qtyPlus: { backgroundColor: "#DCFCE7" },
  qtyTextWrap: { alignItems: "center", minWidth: 80 },
  qtyCount: { fontSize: 28, fontWeight: "800", color: "#1F2937" },
  qtyUnidad: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  subtotalCaja: { fontSize: 18, fontWeight: "800", color: "#9A3412", marginTop: 12 },
  modoToggleFull: { flexDirection: "row", backgroundColor: "#F3EFE7", borderRadius: 999, padding: 3, marginBottom: 10 },
  modoChipFull: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: "center" },
  modoChipFullActive: { backgroundColor: "#fff" },
  modoChipFullText: { fontSize: 12, color: "#8B7B69", fontWeight: "700" },
  modoChipFullTextActive: { color: "#9A3412" },
  montoRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  montoCurrency: { fontSize: 32, fontWeight: "700", color: "#9CA3AF" },
  montoInput: { fontSize: 38, fontWeight: "800", color: "#1F2937", textAlign: "center", minWidth: 120, padding: 0 },
  montoHint: { fontSize: 13, color: "#8B7B69", marginTop: 8, textAlign: "center" },
  mayoreoBadge: { fontSize: 13, color: "#059669", backgroundColor: "#ECFDF5", textAlign: "center", padding: 10, borderRadius: 8, fontWeight: "600" },
  footer: { padding: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB", backgroundColor: "#fff", gap: 8 },
  submit: { backgroundColor: "#ED8E3C", borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  eliminarBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: "#FEE2E2", backgroundColor: "#FEF2F2" },
  eliminarBtnTxt: { color: "#DC2626", fontSize: 13, fontWeight: "700" },
});
