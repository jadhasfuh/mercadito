import { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCart, type CartItem } from "../../src/contexts/CartContext";
import { unidadFormato } from "../../src/lib/unidades";
import { claveItemCarrito } from "../../src/lib/variantes";
import AppHeader from "../../src/components/AppHeader";
import ProductoVarianteModal from "../../src/components/ProductoVarianteModal";
import ContactoFAB from "../../src/components/ContactoFAB";
import type { Producto } from "../../src/api/catalogo";
import { useAndroidBack } from "../../src/lib/useAndroidBack";

// Construye un Producto sintético desde un CartItem para reabrir el modal
// en modo edición. Solo necesitamos los campos que el modal lee: nombre,
// unidad, flags, opciones (vacío en items libres) y precios[0].
function productoDesdeItem(item: CartItem): Producto {
  return {
    id: item.producto_id,
    nombre: item.producto_nombre,
    categoria_id: "",
    unidad: item.unidad,
    imagen: null,
    descripcion: null,
    seccion: null,
    subseccion: null,
    disponible: true,
    dias_semana: [],
    permite_fraccion: item.permite_fraccion,
    permite_por_dinero: item.permite_por_dinero,
    precios: [
      {
        precio_id: "",
        puesto_id: item.puesto_id,
        puesto_nombre: item.puesto_nombre,
        precio: item.precio_base,
        precio_mayoreo: item.precio_mayoreo,
        mayoreo_desde: item.mayoreo_desde,
        fecha: "",
      },
    ],
    horarios: [],
    opciones: [],
    variantes: [],
    modificadores: [],
  };
}

export default function CarritoScreen() {
  const insets = useSafeAreaInsets();
  const { items, cambiarCantidad, actualizarItem, vaciar, subtotal, servicioMercadito, promocionMayoreo, total } = useCart();
  const router = useRouter();
  const [editar, setEditar] = useState<{ item: CartItem; clave: string } | null>(null);

  // Back de Android — vuelve a home en vez de salir de la app.
  useAndroidBack([() => { router.replace("/(tabs)/home"); return true; }], { skipExit: true });

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <AppHeader />
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={72} color="#D4C9B8" />
          <Text style={styles.emptyText}>Tu carrito está vacío</Text>
          <Text style={styles.emptyHint}>Encuentra lo que necesitas en tiendas cercanas.</Text>
          <TouchableOpacity style={styles.emptyCta} onPress={() => router.replace("/(tabs)/home")}>
            <Ionicons name="storefront-outline" size={18} color="#fff" />
            <Text style={styles.emptyCtaTxt}>Explorar tiendas</Text>
          </TouchableOpacity>
        </View>
        <ContactoFAB />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader />
      <FlatList
        data={items}
        keyExtractor={(i) => claveItemCarrito(i.producto_id, i.puesto_id, i.variante_id, i.modificadores)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        renderItem={({ item }) => {
          const mayoreoAplicado = item.precio_mayoreo != null && item.mayoreo_desde != null && item.cantidad >= item.mayoreo_desde;
          const mayoreoCerca = item.precio_mayoreo != null && item.mayoreo_desde != null && item.cantidad < item.mayoreo_desde;
          const clave = claveItemCarrito(item.producto_id, item.puesto_id, item.variante_id, item.modificadores);
          const resumenExtras = [item.variante_nombre, ...item.modificadores.map((m) => `${m.modificador_nombre}: ${m.opcion_nombre}`)].filter(Boolean).join(" · ");
          return (
          <View style={styles.card}>
            {/* Bloque info: nombre toma fila completa, ✕ a la derecha. */}
            <View style={styles.topRow}>
              <View style={styles.info}>
                <Text style={styles.nombre}>{item.producto_nombre}</Text>
                {!!resumenExtras && <Text style={styles.extras}>{resumenExtras}</Text>}
                <Text style={styles.meta}>
                  {item.puesto_nombre} · ${item.precio_unitario.toFixed(2)}/{unidadFormato(item.unidad, 1)}
                </Text>
                {mayoreoAplicado && (
                  <Text style={styles.mayoreoBadge}>✓ Mayoreo aplicado</Text>
                )}
                {mayoreoCerca && item.mayoreo_desde != null && item.precio_mayoreo != null && (
                  <Text style={styles.mayoreoHint}>
                    Agrega {item.mayoreo_desde - item.cantidad} {unidadFormato(item.unidad, item.mayoreo_desde - item.cantidad)} para mayoreo (${item.precio_mayoreo.toFixed(2)}/{unidadFormato(item.unidad, 1)})
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => cambiarCantidad(clave, -item.cantidad)}
                accessibilityLabel="Quitar del carrito"
              >
                <Ionicons name="close" size={16} color="#DC2626" />
              </TouchableOpacity>
            </View>
            {/* Bloque acción: qty controls a la izquierda, subtotal a la
                derecha. Items con cantidad libre (fracción/monto) muestran
                un botón "Editar" que reabre el modal con valores actuales. */}
            <View style={styles.actionRow}>
              {item.permite_fraccion || item.permite_por_dinero ? (
                <TouchableOpacity
                  style={styles.editarBtn}
                  onPress={() => setEditar({ item, clave })}
                >
                  {item.monto_solicitado != null ? (
                    <Text style={styles.editarBtnText}>
                      ${item.monto_solicitado.toFixed(2)}
                      <Text style={styles.editarBtnHint}>  ≈ {item.cantidad.toFixed(item.cantidad % 1 === 0 ? 0 : 2)} {unidadFormato(item.unidad, item.cantidad)}</Text>
                    </Text>
                  ) : (
                    <Text style={styles.editarBtnText}>
                      {item.cantidad.toFixed(item.cantidad % 1 === 0 ? 0 : 2)} {unidadFormato(item.unidad, item.cantidad)}
                    </Text>
                  )}
                  <Text style={styles.editarBtnIcon}>✏️</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={[styles.qtyButton, styles.qtyMinus]}
                    onPress={() => cambiarCantidad(clave, -1)}
                  >
                    <Ionicons name="remove" size={18} color="#DC2626" />
                  </TouchableOpacity>
                  <Text style={styles.qtyCount}>{item.cantidad}</Text>
                  <TouchableOpacity
                    style={[styles.qtyButton, styles.qtyPlus]}
                    onPress={() => cambiarCantidad(clave, 1)}
                  >
                    <Ionicons name="add" size={18} color="#059669" />
                  </TouchableOpacity>
                </View>
              )}
              <Text style={styles.lineTotal}>${(item.cantidad * item.precio_unitario).toFixed(2)}</Text>
            </View>
          </View>
          );
        }}
      />

      {/* Modal de edición: precarga la cantidad/monto del item seleccionado. */}
      <ProductoVarianteModal
        visible={!!editar}
        producto={editar ? productoDesdeItem(editar.item) : null}
        puestoId={editar?.item.puesto_id ?? null}
        inicial={editar ? { cantidad: editar.item.cantidad, monto: editar.item.monto_solicitado ?? null } : null}
        onClose={() => setEditar(null)}
        onEliminar={editar ? () => {
          // Borrar reusando cambiarCantidad con delta = -cantidad actual
          // (lo que ya hace el botón × de cada card).
          cambiarCantidad(editar.clave, -editar.item.cantidad);
        } : undefined}
        onAgregar={({ cantidadInicial, montoSolicitado }) => {
          if (!editar) return;
          actualizarItem(editar.clave, { cantidad: cantidadInicial, montoSolicitado: montoSolicitado ?? null });
        }}
      />

      <View style={styles.totals}>
        {promocionMayoreo > 0 ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Productos ({items.length})</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={styles.precioTachado}>${(subtotal + promocionMayoreo).toFixed(2)}</Text>
              <Text style={styles.rowValue}>${subtotal.toFixed(2)}</Text>
            </View>
          </View>
        ) : (
          <Row label={`Productos (${items.length})`} value={subtotal} />
        )}
        {promocionMayoreo > 0 && (
          <View style={styles.promoRow}>
            <Text style={styles.promoLabel}>🎉 Ahorro por mayoreo</Text>
            <Text style={styles.promoValue}>-${promocionMayoreo.toFixed(2)}</Text>
          </View>
        )}
        {servicioMercadito > 0 && <Row label="Servicio Mercadito" value={servicioMercadito} />}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        </View>
        <Text style={styles.hint}>El envío se calcula en el siguiente paso.</Text>

        <TouchableOpacity style={styles.checkoutButton} onPress={() => router.push("/checkout")}>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
          <Text style={styles.checkoutText}>Continuar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={vaciar} style={styles.clearButton}>
          <Ionicons name="trash-outline" size={16} color="#DC2626" />
          <Text style={styles.clearText}>Vaciar carrito</Text>
        </TouchableOpacity>
      </View>
      <ContactoFAB />
    </View>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>${value.toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  list: { padding: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  info: { flex: 1, minWidth: 0 },
  nombre: { fontSize: 15, fontWeight: "700", color: "#1F2937", lineHeight: 20 },
  extras: { fontSize: 11, color: "#B45309", marginTop: 2 },
  meta: { fontSize: 12, color: "#8B7B69", marginTop: 2 },
  mayoreoBadge: { fontSize: 10, color: "#92400E", backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 4, alignSelf: "flex-start", fontWeight: "600" },
  mayoreoHint: { fontSize: 10, color: "#92400E", marginTop: 4 },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  qtyMinus: { backgroundColor: "#FEE2E2" },
  qtyPlus: { backgroundColor: "#DCFCE7" },
  qtyCount: { width: 22, textAlign: "center", fontWeight: "700" },
  editarBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#FEF5EA", borderRadius: 999 },
  editarBtnText: { fontSize: 13, fontWeight: "700", color: "#C2680E" },
  editarBtnHint: { fontSize: 11, fontWeight: "400", color: "#9A3412" },
  editarBtnIcon: { fontSize: 12, opacity: 0.7 },
  lineTotal: { fontSize: 17, fontWeight: "800", color: "#92400E" },
  removeButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },
  totals: { backgroundColor: "#fff", padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, elevation: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  rowLabel: { color: "#4B5563" },
  rowValue: { color: "#4B5563", fontWeight: "500" },
  precioTachado: { color: "#9CA3AF", textDecorationLine: "line-through", marginRight: 6, fontSize: 13 },
  promoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  promoLabel: { color: "#059669", fontWeight: "600" },
  promoValue: { color: "#059669", fontWeight: "700" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  totalLabel: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  totalValue: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  hint: { fontSize: 11, color: "#8B7B69", textAlign: "center", marginTop: 6 },
  checkoutButton: { flexDirection: "row", gap: 6, backgroundColor: "#F2A65A", paddingVertical: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", marginTop: 12 },
  checkoutText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  clearButton: { flexDirection: "row", gap: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  clearText: { color: "#DC2626", fontWeight: "500" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { fontSize: 18, color: "#1F2937", fontWeight: "700", marginTop: 16 },
  emptyHint: { color: "#8B7B69", marginTop: 6, textAlign: "center", fontSize: 14, lineHeight: 20 },
  emptyCta: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F2A65A", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, marginTop: 24 },
  emptyCtaTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
