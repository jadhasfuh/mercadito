// Editor mobile de variantes + modificadores. Espejo del componente web,
// diseño inspirado en Shopify + Uber Eats + Mercado Libre:
//  - cards grandes con sombra suave
//  - switches nativos en vez de checkboxes
//  - inputs grandes, mobile-first
//  - plantillas rápidas de 1 click para casos comunes

import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface OpcionEdit {
  id: string;
  nombre: string;
  valores: { id: string; valor: string; precio_extra: string }[];
}

export interface ModificadorEdit {
  id: string;
  nombre: string;
  obligatorio: boolean;
  multiple: boolean;
  maximo: string;
  minimo: string;
  opciones: { id: string; nombre: string; precio_extra: string }[];
}

function tempId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Plantillas rápidas ───
type Template<T> = { titulo: string; icono: string; build: () => T };

const TEMPLATES_OPCIONES: Template<OpcionEdit>[] = [
  {
    titulo: "Carne tacos", icono: "🌮",
    build: () => ({
      id: tempId(), nombre: "Carne",
      valores: [
        { id: tempId(), valor: "Pastor", precio_extra: "" },
        { id: tempId(), valor: "Suadero", precio_extra: "" },
        { id: tempId(), valor: "Bistec", precio_extra: "" },
        { id: tempId(), valor: "Arrachera", precio_extra: "15" },
      ],
    }),
  },
  {
    titulo: "Tamaño bebida", icono: "🥤",
    build: () => ({
      id: tempId(), nombre: "Tamaño",
      valores: [
        { id: tempId(), valor: "Chico", precio_extra: "" },
        { id: tempId(), valor: "Mediano", precio_extra: "10" },
        { id: tempId(), valor: "Grande", precio_extra: "20" },
      ],
    }),
  },
  {
    titulo: "Talla ropa", icono: "👕",
    build: () => ({
      id: tempId(), nombre: "Talla",
      valores: [
        { id: tempId(), valor: "CH", precio_extra: "" },
        { id: tempId(), valor: "M", precio_extra: "" },
        { id: tempId(), valor: "G", precio_extra: "" },
        { id: tempId(), valor: "XG", precio_extra: "" },
      ],
    }),
  },
  {
    titulo: "Color", icono: "🎨",
    build: () => ({
      id: tempId(), nombre: "Color",
      valores: [
        { id: tempId(), valor: "Negro", precio_extra: "" },
        { id: tempId(), valor: "Blanco", precio_extra: "" },
        { id: tempId(), valor: "Rojo", precio_extra: "" },
        { id: tempId(), valor: "Azul", precio_extra: "" },
      ],
    }),
  },
];

const TEMPLATES_MODIFICADORES: Template<ModificadorEdit>[] = [
  {
    titulo: "Salsas", icono: "🌶️",
    build: () => ({
      id: tempId(), nombre: "Salsa", obligatorio: true, multiple: false, maximo: "", minimo: "",
      opciones: [
        { id: tempId(), nombre: "Verde", precio_extra: "" },
        { id: tempId(), nombre: "Roja", precio_extra: "" },
        { id: tempId(), nombre: "Picante", precio_extra: "" },
      ],
    }),
  },
  {
    titulo: "Extras pizza", icono: "🍕",
    build: () => ({
      id: tempId(), nombre: "Extras", obligatorio: false, multiple: true, maximo: "3", minimo: "",
      opciones: [
        { id: tempId(), nombre: "Queso extra", precio_extra: "15" },
        { id: tempId(), nombre: "Pepperoni", precio_extra: "20" },
        { id: tempId(), nombre: "Champiñón", precio_extra: "10" },
      ],
    }),
  },
  {
    titulo: "Ingredientes", icono: "🥬",
    build: () => ({
      id: tempId(), nombre: "Ingredientes", obligatorio: false, multiple: true, maximo: "", minimo: "",
      opciones: [
        { id: tempId(), nombre: "Cebolla", precio_extra: "" },
        { id: tempId(), nombre: "Cilantro", precio_extra: "" },
        { id: tempId(), nombre: "Aguacate", precio_extra: "10" },
        { id: tempId(), nombre: "Queso", precio_extra: "8" },
      ],
    }),
  },
];

function Plantillas<T>({ items, onUse }: { items: Template<T>[]; onUse: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
      {items.map((t) => (
        <TouchableOpacity key={t.titulo} style={s.plantillaChip} onPress={() => onUse(t.build())}>
          <Text style={s.plantillaIcon}>{t.icono}</Text>
          <Text style={s.plantillaTxt}>{t.titulo}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function FilaValor({
  nombre,
  precioExtra,
  placeholder,
  productoNombre,
  precioBase,
  onNombreChange,
  onPrecioChange,
  onQuitar,
}: {
  nombre: string;
  precioExtra: string;
  placeholder: string;
  productoNombre: string;
  /** Si se pasa, el input muestra el precio TOTAL (base+extra) en vez del extra. */
  precioBase?: number;
  onNombreChange: (v: string) => void;
  onPrecioChange: (v: string) => void;
  onQuitar: () => void;
}) {
  const extraNum = Number(precioExtra) || 0;
  const base = Number(precioBase) || 0;
  const modoTotal = base > 0;
  const displayValue = modoTotal
    ? (precioExtra === "" ? "" : String(base + extraNum))
    : precioExtra;

  function handleChange(t: string) {
    if (!modoTotal) { onPrecioChange(t); return; }
    if (!t.trim()) { onPrecioChange(""); return; }
    const n = Number(t);
    if (!isFinite(n)) { onPrecioChange(t); return; }
    onPrecioChange(String(n - base));
  }

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={s.filaValorRow}>
        <TextInput
          style={s.filaInputNombre}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          value={nombre}
          onChangeText={onNombreChange}
        />
        <View style={s.filaPrecioWrap}>
          <Text style={s.filaPrecioSymbol}>$</Text>
          <TextInput
            style={s.filaPrecioInput}
            placeholder={modoTotal ? String(base) : "0"}
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
            value={displayValue}
            onChangeText={handleChange}
          />
        </View>
        <TouchableOpacity onPress={onQuitar} style={s.filaQuitarBtn}>
          <Ionicons name="close" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
      {modoTotal && extraNum > 0 && (
        <Text style={s.filaHint}>
          +${extraNum.toFixed(2)} respecto a <Text style={{ fontWeight: "700" }}>{productoNombre}</Text> (${base.toFixed(2)})
        </Text>
      )}
      {!modoTotal && extraNum > 0 && (
        <Text style={s.filaHint}>
          +${extraNum.toFixed(2)} al precio de <Text style={{ fontWeight: "700" }}>{productoNombre}</Text>
        </Text>
      )}
    </View>
  );
}

// ─── VariantesEditor ───
export function VariantesEditorRN({
  opciones,
  onOpcionesChange,
  productoNombre,
  precioBase,
}: {
  opciones: OpcionEdit[];
  onOpcionesChange: (v: OpcionEdit[]) => void;
  productoNombre?: string;
  /** Cuando se pasa, los inputs de precio se muestran como TOTAL (no como +$). */
  precioBase?: number;
}) {
  const refProd = productoNombre?.trim() || "producto";
  const base = Number(precioBase) || 0;
  const modoTotal = base > 0;

  return (
    <View style={s.section}>
      <Text style={s.sectionTitulo}>Opciones</Text>
      <Text style={s.sectionHint}>
        Variantes del producto (color, talla, sabor...). El cliente elige una de cada grupo.
        {modoTotal ? ` Pon el precio total de cada opción — la diferencia contra $${base.toFixed(2)} se calcula sola.` : ""}
      </Text>

      {opciones.length === 0 && (
        <Plantillas items={TEMPLATES_OPCIONES} onUse={(v) => onOpcionesChange([...opciones, v])} />
      )}

      {opciones.map((op, i) => (
        <View key={op.id} style={s.card}>
          <View style={s.cardHeader}>
            <TextInput
              style={s.cardTituloInput}
              placeholder="Nombre del grupo (ej: Color)"
              placeholderTextColor="#9CA3AF"
              value={op.nombre}
              onChangeText={(t) => {
                const next = [...opciones];
                next[i] = { ...op, nombre: t };
                onOpcionesChange(next);
              }}
            />
            <TouchableOpacity
              style={s.eliminarBtn}
              onPress={() => onOpcionesChange(opciones.filter((_, j) => j !== i))}
            >
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </TouchableOpacity>
          </View>

          {op.valores.map((v, j) => (
            <FilaValor
              key={v.id}
              nombre={v.valor}
              precioExtra={v.precio_extra}
              placeholder="Ej: Rojo"
              productoNombre={refProd}
              precioBase={modoTotal ? base : undefined}
              onNombreChange={(t) => {
                const next = [...opciones];
                next[i] = { ...op, valores: op.valores.map((x, k) => (k === j ? { ...x, valor: t } : x)) };
                onOpcionesChange(next);
              }}
              onPrecioChange={(t) => {
                const next = [...opciones];
                next[i] = { ...op, valores: op.valores.map((x, k) => (k === j ? { ...x, precio_extra: t } : x)) };
                onOpcionesChange(next);
              }}
              onQuitar={() => {
                const next = [...opciones];
                next[i] = { ...op, valores: op.valores.filter((_, k) => k !== j) };
                onOpcionesChange(next);
              }}
            />
          ))}

          <TouchableOpacity
            style={s.agregarValorBtn}
            onPress={() => {
              const next = [...opciones];
              next[i] = { ...op, valores: [...op.valores, { id: tempId(), valor: "", precio_extra: "" }] };
              onOpcionesChange(next);
            }}
          >
            <Ionicons name="add" size={18} color="#6B7280" />
            <Text style={s.agregarValorTxt}>Agregar opción</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity
        style={s.agregarGrupoBtn}
        onPress={() => onOpcionesChange([...opciones, { id: tempId(), nombre: "", valores: [{ id: tempId(), valor: "", precio_extra: "" }] }])}
      >
        <Ionicons name="add-circle-outline" size={20} color="#FF7A2B" />
        <Text style={s.agregarGrupoTxt}>Agregar grupo de opciones</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── ModificadoresEditor ───
export function ModificadoresEditorRN({
  value,
  onChange,
  productoNombre,
}: {
  value: ModificadorEdit[];
  onChange: (v: ModificadorEdit[]) => void;
  productoNombre?: string;
}) {
  const refProd = productoNombre?.trim() || "producto";

  return (
    <View style={s.section}>
      <Text style={s.sectionTitulo}>Modificadores</Text>
      <Text style={s.sectionHint}>Extras, salsas e ingredientes que el cliente puede agregar.</Text>

      {value.length === 0 && (
        <Plantillas items={TEMPLATES_MODIFICADORES} onUse={(v) => onChange([...value, v])} />
      )}

      {value.map((m, i) => (
        <View key={m.id} style={s.card}>
          <View style={s.cardHeader}>
            <TextInput
              style={s.cardTituloInput}
              placeholder="Nombre del grupo (ej: Salsa)"
              placeholderTextColor="#9CA3AF"
              value={m.nombre}
              onChangeText={(t) => {
                const next = [...value];
                next[i] = { ...m, nombre: t };
                onChange(next);
              }}
            />
            <TouchableOpacity
              style={s.eliminarBtn}
              onPress={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </TouchableOpacity>
          </View>

          <View style={s.toggles}>
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLabel}>Obligatorio</Text>
                <Text style={s.toggleHint}>El cliente debe elegir al menos una opción</Text>
              </View>
              <Switch
                value={m.obligatorio}
                onValueChange={(v) => {
                  const next = [...value];
                  next[i] = { ...m, obligatorio: v };
                  onChange(next);
                }}
                trackColor={{ false: "#D1D5DB", true: "#FF7A2B" }}
                thumbColor="#fff"
              />
            </View>
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLabel}>Permitir varias</Text>
                <Text style={s.toggleHint}>{m.multiple ? "Puede elegir varias opciones" : "Solo una opción a la vez"}</Text>
              </View>
              <Switch
                value={m.multiple}
                onValueChange={(v) => {
                  const next = [...value];
                  next[i] = { ...m, multiple: v };
                  onChange(next);
                }}
                trackColor={{ false: "#D1D5DB", true: "#FF7A2B" }}
                thumbColor="#fff"
              />
            </View>
            {m.multiple && (
              <>
                <View style={s.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.toggleLabel}>Mínimo a elegir</Text>
                    <Text style={s.toggleHint}>Vacío = opcional</Text>
                  </View>
                  <TextInput
                    style={s.maxInput}
                    keyboardType="numeric"
                    placeholder="—"
                    placeholderTextColor="#9CA3AF"
                    value={m.minimo}
                    onChangeText={(t) => {
                      const next = [...value];
                      next[i] = { ...m, minimo: t };
                      onChange(next);
                    }}
                  />
                </View>
                <View style={s.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.toggleLabel}>Máximo a elegir</Text>
                    <Text style={s.toggleHint}>Si mínimo = máximo, elige exactamente esa cantidad</Text>
                  </View>
                  <TextInput
                    style={s.maxInput}
                    keyboardType="numeric"
                    placeholder="Sin límite"
                    placeholderTextColor="#9CA3AF"
                    value={m.maximo}
                    onChangeText={(t) => {
                      const next = [...value];
                      next[i] = { ...m, maximo: t };
                      onChange(next);
                    }}
                  />
                </View>
              </>
            )}
          </View>

          {m.opciones.map((o, j) => (
            <FilaValor
              key={o.id}
              nombre={o.nombre}
              precioExtra={o.precio_extra}
              placeholder="Ej: Verde"
              productoNombre={refProd}
              onNombreChange={(t) => {
                const next = [...value];
                const opciones = [...m.opciones];
                opciones[j] = { ...o, nombre: t };
                next[i] = { ...m, opciones };
                onChange(next);
              }}
              onPrecioChange={(t) => {
                const next = [...value];
                const opciones = [...m.opciones];
                opciones[j] = { ...o, precio_extra: t };
                next[i] = { ...m, opciones };
                onChange(next);
              }}
              onQuitar={() => {
                const next = [...value];
                next[i] = { ...m, opciones: m.opciones.filter((_, k) => k !== j) };
                onChange(next);
              }}
            />
          ))}

          <TouchableOpacity
            style={s.agregarValorBtn}
            onPress={() => {
              const next = [...value];
              next[i] = { ...m, opciones: [...m.opciones, { id: tempId(), nombre: "", precio_extra: "" }] };
              onChange(next);
            }}
          >
            <Ionicons name="add" size={18} color="#6B7280" />
            <Text style={s.agregarValorTxt}>Agregar opción</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity
        style={s.agregarGrupoBtn}
        onPress={() =>
          onChange([
            ...value,
            { id: tempId(), nombre: "", obligatorio: false, multiple: false, maximo: "", minimo: "", opciones: [{ id: tempId(), nombre: "", precio_extra: "" }] },
          ])
        }
      >
        <Ionicons name="add-circle-outline" size={20} color="#FF7A2B" />
        <Text style={s.agregarGrupoTxt}>Agregar grupo de modificadores</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Validación ───
export function validarExtras(
  opciones: OpcionEdit[],
  modificadores: ModificadorEdit[]
): string | null {
  for (const op of opciones) {
    if (!op.nombre.trim()) return "Ponle nombre a cada grupo de opciones (ej: Color, Talla).";
    if (op.valores.filter((v) => v.valor.trim()).length === 0) {
      return `El grupo "${op.nombre}" no tiene valores. Agrega al menos uno.`;
    }
  }
  for (const m of modificadores) {
    if (!m.nombre.trim()) return "Ponle nombre a cada grupo de modificadores.";
    if (m.opciones.filter((o) => o.nombre.trim()).length === 0) {
      return `El grupo "${m.nombre}" no tiene opciones. Agrega al menos una.`;
    }
  }
  return null;
}

// ─── Serializers ───
export function serializarOpciones(opciones: OpcionEdit[]) {
  return opciones
    .filter((op) => op.nombre.trim())
    .map((op, i) => ({
      id: op.id,
      nombre: op.nombre.trim(),
      orden: i,
      valores: op.valores
        .filter((v) => v.valor.trim())
        .map((v, j) => ({
          id: v.id,
          valor: v.valor.trim(),
          precio_extra: v.precio_extra ? Number(v.precio_extra) : 0,
          orden: j,
        })),
    }));
}

export function serializarModificadores(modificadores: ModificadorEdit[]) {
  return modificadores
    .filter((m) => m.nombre.trim())
    .map((m, i) => ({
      nombre: m.nombre.trim(),
      obligatorio: m.obligatorio,
      multiple: m.multiple,
      maximo: m.maximo ? Number(m.maximo) : null,
      minimo: m.minimo ? Number(m.minimo) : null,
      orden: i,
      opciones: m.opciones
        .filter((o) => o.nombre.trim())
        .map((o, j) => ({
          nombre: o.nombre.trim(),
          precio_extra: o.precio_extra ? Number(o.precio_extra) : 0,
          orden: j,
        })),
    }));
}

export function deserializarOpciones(
  opciones: { id: string; nombre: string; valores: { id: string; valor: string; precio_extra?: number | string | null }[] }[] | undefined
): OpcionEdit[] {
  return (opciones ?? []).map((op) => ({
    id: op.id,
    nombre: op.nombre,
    valores: op.valores.map((v) => ({
      id: v.id,
      valor: v.valor,
      precio_extra: v.precio_extra != null && Number(v.precio_extra) !== 0 ? String(v.precio_extra) : "",
    })),
  }));
}

export function deserializarModificadores(
  modificadores: {
    id: string;
    nombre: string;
    obligatorio: boolean;
    multiple: boolean;
    maximo: number | null;
    minimo?: number | null;
    opciones: { id: string; nombre: string; precio_extra: number }[];
  }[] | undefined
): ModificadorEdit[] {
  return (modificadores ?? []).map((m) => ({
    id: m.id,
    nombre: m.nombre,
    obligatorio: m.obligatorio,
    multiple: m.multiple,
    maximo: m.maximo != null ? String(m.maximo) : "",
    minimo: m.minimo != null ? String(m.minimo) : "",
    opciones: m.opciones.map((o) => ({
      id: o.id,
      nombre: o.nombre,
      precio_extra: o.precio_extra ? String(o.precio_extra) : "",
    })),
  }));
}

const s = StyleSheet.create({
  section: { marginTop: 16 },
  sectionTitulo: { fontSize: 17, fontWeight: "700", color: "#1F2937" },
  sectionHint: { fontSize: 12, color: "#6B7280", marginTop: 2, marginBottom: 10 },
  plantillaChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#fff", borderWidth: 2, borderColor: "#FF7A2B", borderStyle: "dashed",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
  },
  plantillaIcon: { fontSize: 14 },
  plantillaTxt: { color: "#C2410C", fontSize: 12, fontWeight: "600" },
  card: {
    backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: "#F3F4F6",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardTituloInput: {
    flex: 1, fontSize: 16, fontWeight: "700", color: "#1F2937",
    borderBottomWidth: 2, borderBottomColor: "#E5E7EB", paddingVertical: 4,
  },
  eliminarBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: "#FEE2E2",
    alignItems: "center", justifyContent: "center",
  },
  toggles: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#F3F4F6", marginBottom: 12 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  toggleLabel: { fontSize: 14, fontWeight: "500", color: "#374151" },
  toggleHint: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  maxInput: {
    width: 96, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, textAlign: "right",
  },
  filaValorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  filaInputNombre: {
    flex: 1, minWidth: 0, backgroundColor: "#F9FAFB",
    borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#1F2937",
  },
  filaPrecioWrap: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB",
    borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, width: 78, paddingLeft: 10,
  },
  filaPrecioSymbol: { color: "#9CA3AF", fontSize: 14 },
  filaPrecioInput: { flex: 1, paddingHorizontal: 4, paddingVertical: 10, fontSize: 14, color: "#1F2937" },
  filaQuitarBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  filaHint: { fontSize: 11, color: "#6B7280", marginTop: 4, marginLeft: 2 },
  agregarValorBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 2, borderColor: "#D1D5DB", borderStyle: "dashed", borderRadius: 10,
    paddingVertical: 10, marginTop: 4,
  },
  agregarValorTxt: { color: "#6B7280", fontSize: 13, fontWeight: "500" },
  agregarGrupoBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#fff", borderWidth: 2, borderColor: "#FF7A2B", borderStyle: "dashed",
    borderRadius: 16, paddingVertical: 14,
  },
  agregarGrupoTxt: { color: "#C2410C", fontSize: 14, fontWeight: "600" },
});
