import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ItemPedido } from "../api/pedidos";
import { editarItemsPedido } from "../api/pedidos";

interface Props {
  pedidoId: string;
  items: ItemPedido[];
  editadoPor: string;
  onSaved: () => void;
  onCancel: () => void;
}

// Versión RN del editor del pedido para el repartidor: quitar items, cambiar
// cantidad, agregar manuales (sustituciones por similar). Espeja la lógica del
// componente web `src/components/EditorPedido.tsx`.
type EditItem = ItemPedido & { eliminado?: boolean; nuevoManual?: boolean };

export default function EditorPedidoRN({ pedidoId, items, editadoPor, onSaved, onCancel }: Props) {
  const [editItems, setEditItems] = useState<EditItem[]>(
    items.map((it) => ({ ...it, eliminado: false }))
  );
  const [saving, setSaving] = useState(false);
  const [nuevoForm, setNuevoForm] = useState<{
    nombre: string;
    precio: string;
    cantidad: string;
    puesto_id: string;
  } | null>(null);

  const tiendas = (() => {
    const map = new Map<string, string>();
    for (const it of items) {
      if (it.puesto_id) map.set(it.puesto_id, it.puesto_nombre || it.puesto_id);
    }
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
  })();

  function cambiarCantidad(itemId: string, delta: number) {
    setEditItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const nueva = it.cantidad + delta;
        if (nueva <= 0) return { ...it, eliminado: true, cantidad: 0 };
        return { ...it, cantidad: nueva, eliminado: false };
      })
    );
  }

  function toggleEliminar(itemId: string) {
    setEditItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const eliminar = !it.eliminado;
        return {
          ...it,
          eliminado: eliminar,
          cantidad: eliminar ? 0 : items.find((o) => o.id === itemId)?.cantidad || 1,
        };
      })
    );
  }

  function abrirNuevo() {
    setNuevoForm({
      nombre: "",
      precio: "",
      cantidad: "1",
      puesto_id: tiendas.length === 1 ? tiendas[0].id : "",
    });
  }

  function agregarManual() {
    if (!nuevoForm) return;
    const nombre = nuevoForm.nombre.trim();
    const precio = parseFloat(nuevoForm.precio);
    const cantidad = parseFloat(nuevoForm.cantidad);
    if (!nombre) { Alert.alert("Falta", "Nombre del producto similar"); return; }
    if (!isFinite(precio) || precio <= 0) { Alert.alert("Falta", "Precio inválido"); return; }
    if (!isFinite(cantidad) || cantidad <= 0) { Alert.alert("Falta", "Cantidad inválida"); return; }
    if (!nuevoForm.puesto_id) { Alert.alert("Falta", "Elige la tienda"); return; }
    const tienda = tiendas.find((t) => t.id === nuevoForm.puesto_id);
    const nuevo: EditItem = {
      id: `nuevo-${Date.now()}`,
      pedido_id: pedidoId,
      producto_id: null,
      producto_nombre: nombre,
      puesto_id: nuevoForm.puesto_id,
      puesto_nombre: tienda?.nombre,
      cantidad,
      precio_unitario: precio,
      subtotal: cantidad * precio,
      comision: 0,
      unidad: "pieza",
      manual: true,
      nuevoManual: true,
      eliminado: false,
    };
    setEditItems((prev) => [...prev, nuevo]);
    setNuevoForm(null);
  }

  function cambiarPrecio(itemId: string, valor: string) {
    const num = parseFloat(valor);
    setEditItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        return { ...it, precio_unitario: isFinite(num) && num >= 0 ? num : 0 };
      })
    );
  }

  const itemsActivos = editItems.filter((i) => !i.eliminado);
  const nuevoSubtotal = itemsActivos.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
  const precioInvalido = itemsActivos.some((i) => !isFinite(i.precio_unitario) || i.precio_unitario <= 0);
  const cambios = editItems.some((e) => {
    const original = items.find((o) => o.id === e.id);
    return (
      e.eliminado ||
      e.nuevoManual ||
      (original && (e.cantidad !== original.cantidad || e.precio_unitario !== original.precio_unitario))
    );
  });

  async function guardar() {
    if (itemsActivos.length === 0) {
      Alert.alert("No puedes dejar el pedido vacío", "Mejor cancela el pedido si no hay nada que entregar.");
      return;
    }
    if (precioInvalido) {
      Alert.alert("Precio inválido", "Hay items con precio en cero o vacío. Revísalos antes de guardar.");
      return;
    }
    setSaving(true);
    try {
      await editarItemsPedido(
        pedidoId,
        itemsActivos.map((i) => ({
          producto_id: i.producto_id || null,
          producto_nombre: i.producto_id ? undefined : i.producto_nombre || "",
          puesto_id: i.puesto_id,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
        })),
        editadoPor
      );
      Alert.alert("Pedido editado", "LLAMA AL CLIENTE para avisarle del cambio.");
      onSaved();
    } catch (e) {
      Alert.alert("Error", (e as { error?: string })?.error ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>EDITANDO PEDIDO</Text>

      {editItems.map((item) => {
        const original = items.find((o) => o.id === item.id);
        const cambiado = !item.eliminado && original && Number(item.precio_unitario) !== Number(original.precio_unitario);
        return (
          <View key={item.id} style={[styles.itemBox, item.eliminado && styles.rowEliminado]}>
            {/* Fila 1: nombre + cantidad + subtotal + eliminar */}
            <View style={styles.itemTopRow}>
              <Text style={[styles.nombre, item.eliminado && styles.lineThrough, { flex: 1, minWidth: 0 }]} numberOfLines={2}>
                {item.producto_nombre}
                {item.manual && !item.eliminado ? <Text style={styles.badge}>  ✏️ Sustitución</Text> : null}
              </Text>

              {!item.eliminado && (
                <View style={styles.qtyBox}>
                  <TouchableOpacity onPress={() => cambiarCantidad(item.id, -1)} style={styles.qtyMinus}>
                    <Text style={styles.qtyMinusText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.cantidad}</Text>
                  <TouchableOpacity onPress={() => cambiarCantidad(item.id, 1)} style={styles.qtyPlus}>
                    <Text style={styles.qtyPlusText}>+</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!item.eliminado && (
                <Text style={styles.subtotalItem}>${(item.cantidad * item.precio_unitario).toFixed(0)}</Text>
              )}
              <TouchableOpacity
                onPress={() => toggleEliminar(item.id)}
                style={[styles.iconBtn, item.eliminado ? styles.iconBtnUndo : styles.iconBtnDel]}
              >
                <Ionicons name={item.eliminado ? "arrow-undo" : "close"} size={14} color={item.eliminado ? "#15803D" : "#DC2626"} />
              </TouchableOpacity>
            </View>

            {/* Fila 2: precio editable, en su propia línea para que no se
                encimen los controles cuando el nombre es largo. */}
            {!item.eliminado ? (
              <View style={styles.precioRow}>
                <Text style={styles.precioPrefix}>$</Text>
                <TextInput
                  value={String(item.precio_unitario)}
                  onChangeText={(v) => cambiarPrecio(item.id, v)}
                  keyboardType="decimal-pad"
                  style={[styles.precioInput, cambiado && styles.precioInputCambiado]}
                />
                <Text style={styles.precioPrefix}>/{item.unidad ?? "pza"}</Text>
                {cambiado && <Text style={styles.precioAntes}>(antes ${original?.precio_unitario})</Text>}
              </View>
            ) : (
              <Text style={[styles.precioUnit, styles.lineThrough]}>${item.precio_unitario}/{item.unidad ?? "pza"}</Text>
            )}
          </View>
        );
      })}

      {/* Form para agregar similar */}
      {nuevoForm ? (
        <View style={styles.formBox}>
          <Text style={styles.formTitle}>AGREGAR SIMILAR</Text>
          <TextInput
            value={nuevoForm.nombre}
            onChangeText={(v) => setNuevoForm({ ...nuevoForm, nombre: v })}
            placeholder="Nombre del producto"
            style={styles.input}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>Precio</Text>
              <TextInput
                value={nuevoForm.precio}
                onChangeText={(v) => setNuevoForm({ ...nuevoForm, precio: v })}
                placeholder="0.00"
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>Cantidad</Text>
              <TextInput
                value={nuevoForm.cantidad}
                onChangeText={(v) => setNuevoForm({ ...nuevoForm, cantidad: v })}
                placeholder="1"
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
          </View>
          {tiendas.length > 1 && (
            <View style={styles.tiendaChips}>
              {tiendas.map((t) => {
                const sel = nuevoForm.puesto_id === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setNuevoForm({ ...nuevoForm, puesto_id: t.id })}
                    style={[styles.tiendaChip, sel && styles.tiendaChipSel]}
                  >
                    <Text style={[styles.tiendaChipTxt, sel && styles.tiendaChipTxtSel]} numberOfLines={1}>{t.nombre}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => setNuevoForm(null)} style={[styles.btn, styles.btnGris]}>
              <Text style={styles.btnGrisTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={agregarManual} style={[styles.btn, styles.btnAmber]}>
              <Text style={styles.btnAmberTxt}>Agregar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={abrirNuevo} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Agregar producto similar</Text>
        </TouchableOpacity>
      )}

      <View style={styles.subtotalRow}>
        <Text style={styles.subtotalLbl}>Nuevo subtotal</Text>
        <Text style={styles.subtotalVal}>${nuevoSubtotal.toFixed(2)}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity onPress={onCancel} style={[styles.btn, styles.btnGris]}>
          <Text style={styles.btnGrisTxt}>Cancelar edición</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={guardar}
          disabled={!cambios || saving || precioInvalido}
          style={[styles.btn, styles.btnBrand, (!cambios || saving || precioInvalido) && styles.btnDisabled]}
        >
          <Text style={styles.btnBrandTxt}>{saving ? "Guardando…" : "Guardar"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: "#FFF7EB", borderColor: "#FF7A2B", borderWidth: 2, borderRadius: 12, padding: 10, gap: 8 },
  title: { fontSize: 11, fontWeight: "800", color: "#9A3412" },
  itemBox: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,122,43,0.15)", gap: 4 },
  itemTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowEliminado: { opacity: 0.4 },
  nombre: { fontSize: 13, color: "#1F2937", fontWeight: "500" },
  lineThrough: { textDecorationLine: "line-through" },
  badge: { fontSize: 10, color: "#92400E", fontWeight: "700" },
  precioUnit: { fontSize: 11, color: "#9CA3AF" },
  precioRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  precioPrefix: { fontSize: 11, color: "#9CA3AF" },
  precioInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, fontSize: 12, width: 70, color: "#4B5563" },
  precioInputCambiado: { borderColor: "#FCD34D", color: "#92400E", fontWeight: "700" },
  precioAntes: { fontSize: 10, color: "#92400E" },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 6 },
  qtyMinus: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },
  qtyMinusText: { color: "#DC2626", fontSize: 16, fontWeight: "700" },
  qtyText: { width: 22, textAlign: "center", fontSize: 13, fontWeight: "800" },
  qtyPlus: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center" },
  qtyPlusText: { color: "#15803D", fontSize: 16, fontWeight: "700" },
  subtotalItem: { fontSize: 13, fontWeight: "700", color: "#4B5563", width: 50, textAlign: "right" },
  iconBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  iconBtnDel: { backgroundColor: "#FEE2E2" },
  iconBtnUndo: { backgroundColor: "#DCFCE7" },
  formBox: { backgroundColor: "#FEF3C7", borderColor: "#FCD34D", borderWidth: 1, borderRadius: 10, padding: 8, gap: 6 },
  formTitle: { fontSize: 10, fontWeight: "800", color: "#92400E" },
  formLabel: { fontSize: 9, color: "#92400E", marginBottom: 2, textTransform: "uppercase" },
  input: { borderWidth: 1, borderColor: "#FCD34D", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff" },
  tiendaChips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tiendaChip: { borderColor: "#FCD34D", borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#fff" },
  tiendaChipSel: { backgroundColor: "#F59E0B", borderColor: "#F59E0B" },
  tiendaChipTxt: { fontSize: 11, color: "#92400E", fontWeight: "600" },
  tiendaChipTxtSel: { color: "#fff" },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  btnGris: { backgroundColor: "#E5E7EB" },
  btnGrisTxt: { color: "#4B5563", fontWeight: "600", fontSize: 13 },
  btnAmber: { backgroundColor: "#F59E0B" },
  btnAmberTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  btnBrand: { backgroundColor: "#FF7A2B" },
  btnBrandTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  btnDisabled: { backgroundColor: "#D1D5DB" },
  addBtn: { borderWidth: 2, borderStyle: "dashed", borderColor: "#FCD34D", paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  addBtnText: { color: "#92400E", fontSize: 12, fontWeight: "800" },
  subtotalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "rgba(255,122,43,0.3)", paddingTop: 6 },
  subtotalLbl: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  subtotalVal: { fontSize: 13, fontWeight: "800", color: "#0F172A" },
});
