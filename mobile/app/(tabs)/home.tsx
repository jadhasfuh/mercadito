import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listarProductosCliente, listarPuestos, type Producto, type Puesto } from "../../src/api/catalogo";
import { useCart } from "../../src/contexts/CartContext";
import { catInfo } from "../../src/lib/categorias";
import { resolverImagen } from "../../src/lib/imgUrl";

export default function HomeScreen() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [tiendaFiltro, setTiendaFiltro] = useState<string | null>(null);
  const [seccionFiltro, setSeccionFiltro] = useState<string | null>(null);
  const [subseccionFiltro, setSubseccionFiltro] = useState<string | null>(null);
  const { agregar, items, cambiarCantidad } = useCart();

  async function load() {
    setError(null);
    try {
      const data = await listarProductosCliente();
      setProductos(data);
    } catch (e) {
      setError((e as { error?: string })?.error ?? "Error al cargar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Cuando cambia la categoría, cargar las tiendas de esa categoría
  useEffect(() => {
    if (!categoriaFiltro) { setPuestos([]); return; }
    listarPuestos(categoriaFiltro).then(setPuestos).catch(() => setPuestos([]));
  }, [categoriaFiltro]);

  const categoriasDisponibles = useMemo(() => {
    return Array.from(new Set(productos.map((p) => p.categoria_id)));
  }, [productos]);

  // Productos base filtrados por categoría
  const baseProductos = useMemo(() => {
    return categoriaFiltro
      ? productos.filter((p) => p.categoria_id === categoriaFiltro)
      : productos;
  }, [productos, categoriaFiltro]);

  // Productos después de aplicar filtro de tienda (filtrando las precios también)
  const productosConTienda = useMemo(() => {
    if (!tiendaFiltro) return baseProductos.filter((p) => p.precios.length > 0);
    return baseProductos
      .map((p) => ({ ...p, precios: p.precios.filter((pr) => pr.puesto_id === tiendaFiltro) }))
      .filter((p) => p.precios.length > 0);
  }, [baseProductos, tiendaFiltro]);

  const seccionesDisponibles = useMemo(() => {
    return Array.from(new Set(productosConTienda.map((p) => p.seccion).filter(Boolean))) as string[];
  }, [productosConTienda]);

  const subseccionesDisponibles = useMemo(() => {
    const base = seccionFiltro ? productosConTienda.filter((p) => p.seccion === seccionFiltro) : productosConTienda;
    return Array.from(new Set(base.map((p) => p.subseccion).filter(Boolean))) as string[];
  }, [productosConTienda, seccionFiltro]);

  const productosFiltrados = useMemo(() => {
    return productosConTienda.filter((p) => {
      if (seccionFiltro && p.seccion !== seccionFiltro) return false;
      if (subseccionFiltro && p.subseccion !== subseccionFiltro) return false;
      return true;
    });
  }, [productosConTienda, seccionFiltro, subseccionFiltro]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#FF7A2B" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Categorías */}
      {categoriasDisponibles.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slider} contentContainerStyle={styles.chipRow}>
          <CategoryChip
            label="Todo"
            icon="apps-outline"
            active={categoriaFiltro === null}
            onPress={() => { setCategoriaFiltro(null); setTiendaFiltro(null); setSeccionFiltro(null); setSubseccionFiltro(null); }}
          />
          {categoriasDisponibles.map((cat) => {
            const info = catInfo(cat);
            return (
              <CategoryChip
                key={cat}
                label={info.nombre}
                icon={info.icon}
                active={categoriaFiltro === cat}
                onPress={() => {
                  setCategoriaFiltro(categoriaFiltro === cat ? null : cat);
                  setTiendaFiltro(null);
                  setSeccionFiltro(null);
                  setSubseccionFiltro(null);
                }}
              />
            );
          })}
        </ScrollView>
      )}

      {/* Tiendas (solo cuando hay categoría seleccionada) */}
      {categoriaFiltro && puestos.length > 0 && (
        <View style={styles.tiendasWrap}>
          <Text style={styles.tiendasLabel}>Tiendas</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tiendasSlider} contentContainerStyle={styles.tiendasRow}>
            <TiendaChip
              nombre="Todas"
              logo={null}
              cerrada={false}
              active={!tiendaFiltro}
              onPress={() => { setTiendaFiltro(null); setSeccionFiltro(null); setSubseccionFiltro(null); }}
              fallbackIcon="cart-outline"
            />
            {puestos.map((p) => (
              <TiendaChip
                key={p.id}
                nombre={p.nombre}
                logo={p.logo}
                cerrada={p.abierto_ahora === false}
                active={tiendaFiltro === p.id}
                onPress={() => { setTiendaFiltro(p.id === tiendaFiltro ? null : p.id); setSeccionFiltro(null); setSubseccionFiltro(null); }}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Secciones */}
      {seccionesDisponibles.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sliderSmall} contentContainerStyle={styles.chipsRowSmall}>
          <ChipSmall label="Todo" active={!seccionFiltro} onPress={() => { setSeccionFiltro(null); setSubseccionFiltro(null); }} />
          {seccionesDisponibles.map((s) => (
            <ChipSmall key={s} label={s} active={seccionFiltro === s} onPress={() => { setSeccionFiltro(s === seccionFiltro ? null : s); setSubseccionFiltro(null); }} />
          ))}
        </ScrollView>
      )}

      {/* Subsecciones */}
      {subseccionesDisponibles.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sliderTiny} contentContainerStyle={styles.chipsRowTiny}>
          <ChipTiny label="Todo" active={!subseccionFiltro} onPress={() => setSubseccionFiltro(null)} />
          {subseccionesDisponibles.map((s) => (
            <ChipTiny key={s} label={s} active={subseccionFiltro === s} onPress={() => setSubseccionFiltro(s === subseccionFiltro ? null : s)} />
          ))}
        </ScrollView>
      )}

      <FlatList
        data={productosFiltrados}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="basket-outline" size={48} color="#D4C9B8" />
            <Text style={styles.empty}>{error ?? "No hay productos con estos filtros"}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              {item.imagen ? (
                <Image source={{ uri: resolverImagen(item.imagen) ?? item.imagen }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Ionicons name="image-outline" size={22} color="#D4C9B8" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>{item.nombre}</Text>
                {item.descripcion ? <Text style={styles.descripcion} numberOfLines={2}>{item.descripcion}</Text> : null}
              </View>
            </View>
            <View style={styles.preciosRow}>
              {item.precios.map((precio) => {
                const enCarrito = items.find((i) => i.producto_id === item.id && i.puesto_id === precio.puesto_id);
                return (
                  <View key={precio.puesto_id} style={styles.precioItem}>
                    <View style={styles.precioInfo}>
                      <Text style={styles.precio}>${precio.precio.toFixed(2)}</Text>
                      <Text style={styles.tiendaNombre} numberOfLines={1}>{precio.puesto_nombre}</Text>
                      {precio.precio_mayoreo != null && precio.mayoreo_desde != null && (
                        <Text style={styles.mayoreoHint} numberOfLines={2}>
                          💰 Mayoreo ${Number(precio.precio_mayoreo).toFixed(2)}/{item.unidad} desde {Number(precio.mayoreo_desde)} {item.unidad}
                        </Text>
                      )}
                    </View>
                    {enCarrito ? (
                      <View style={styles.qtyRow}>
                        <TouchableOpacity style={[styles.qtyButton, styles.qtyMinus]} onPress={() => cambiarCantidad(item.id, precio.puesto_id, -1)}>
                          <Ionicons name="remove" size={18} color="#DC2626" />
                        </TouchableOpacity>
                        <Text style={styles.qtyCount}>{enCarrito.cantidad}</Text>
                        <TouchableOpacity style={[styles.qtyButton, styles.qtyPlus]} onPress={() => cambiarCantidad(item.id, precio.puesto_id, 1)}>
                          <Ionicons name="add" size={18} color="#059669" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.addButton} onPress={() => agregar(item, precio.puesto_id)}>
                        <Ionicons name="add" size={18} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      />
    </View>
  );
}

function CategoryChip({ label, icon, active, onPress }: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={active ? "#fff" : "#8B7B69"} />
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TiendaChip({ nombre, logo, cerrada, active, onPress, fallbackIcon }: {
  nombre: string;
  logo: string | null;
  cerrada: boolean;
  active: boolean;
  onPress: () => void;
  fallbackIcon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const logoUri = resolverImagen(logo);
  return (
    <TouchableOpacity style={[styles.tiendaChip, active && styles.tiendaChipActive, cerrada && styles.tiendaChipCerrada]} onPress={onPress}>
      {logoUri ? (
        <Image source={{ uri: logoUri }} style={styles.tiendaLogo} />
      ) : (
        <View style={[styles.tiendaLogo, styles.tiendaLogoPlaceholder]}>
          <Ionicons name={fallbackIcon ?? "storefront-outline"} size={18} color="#8B7B69" />
        </View>
      )}
      <Text style={styles.tiendaNombreChip} numberOfLines={1}>{nombre}</Text>
      {cerrada && (
        <View style={styles.cerradaBadge}>
          <Text style={styles.cerradaBadgeText}>Cerrada</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function ChipSmall({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chipSmall, active && styles.chipSmallActive]} onPress={onPress}>
      <Text style={[styles.chipSmallText, active && styles.chipSmallTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ChipTiny({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chipTiny, active && styles.chipTinyActive]} onPress={onPress}>
      <Text style={[styles.chipTinyText, active && styles.chipTinyTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  // Altura explícita en cada slider para que Android no recorte los chips.
  slider: { flexGrow: 0, flexShrink: 0 },
  chipRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  chipActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  chipText: { fontSize: 13, color: "#8B7B69", fontWeight: "500", lineHeight: 17, includeFontPadding: false },
  chipTextActive: { color: "#fff" },
  tiendasWrap: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  tiendasLabel: { fontSize: 11, color: "#8B7B69", fontWeight: "600", marginBottom: 4 },
  tiendasSlider: { flexGrow: 0, flexShrink: 0 },
  tiendasRow: { gap: 6, paddingVertical: 6, paddingHorizontal: 2 },
  tiendaChip: { alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, backgroundColor: "#fff", borderWidth: 2, borderColor: "#F3EFE7", minWidth: 74 },
  tiendaChipActive: { backgroundColor: "#FFF2E5", borderColor: "#FF7A2B" },
  tiendaChipCerrada: { opacity: 0.55 },
  tiendaLogo: { width: 36, height: 36, borderRadius: 10 },
  tiendaLogoPlaceholder: { backgroundColor: "#F3EFE7", alignItems: "center", justifyContent: "center" },
  tiendaNombreChip: { fontSize: 10, color: "#1F2937", maxWidth: 70, fontWeight: "500", textAlign: "center", lineHeight: 13, includeFontPadding: false },
  cerradaBadge: { position: "absolute", top: 2, right: 2, backgroundColor: "#DC2626", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999 },
  cerradaBadgeText: { fontSize: 8, color: "#fff", fontWeight: "700" },
  sliderSmall: { flexGrow: 0, flexShrink: 0 },
  chipsRowSmall: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  chipSmall: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  chipSmallActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  chipSmallText: { fontSize: 12, color: "#8B7B69", fontWeight: "500", lineHeight: 15, includeFontPadding: false },
  chipSmallTextActive: { color: "#fff", fontWeight: "700" },
  sliderTiny: { flexGrow: 0, flexShrink: 0 },
  chipsRowTiny: { paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
  chipTiny: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#F3EFE7" },
  chipTinyActive: { backgroundColor: "#1F2937" },
  chipTinyText: { fontSize: 11, color: "#8B7B69", fontWeight: "500", lineHeight: 14, includeFontPadding: false },
  chipTinyTextActive: { color: "#fff" },
  list: { padding: 12, paddingTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 },
  cardHeader: { flexDirection: "row", gap: 10, alignItems: "center" },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  thumbPlaceholder: { backgroundColor: "#F3EFE7", alignItems: "center", justifyContent: "center" },
  nombre: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  descripcion: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  preciosRow: { marginTop: 10, gap: 6 },
  precioItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFF7EB", borderRadius: 10, padding: 10 },
  precioInfo: { flex: 1, paddingRight: 10 },
  precio: { fontSize: 16, fontWeight: "700", color: "#FF7A2B" },
  tiendaNombre: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  mayoreoHint: { fontSize: 10, color: "#92400E", backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 4, alignSelf: "flex-start" },
  addButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FF7A2B", alignItems: "center", justifyContent: "center" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  qtyMinus: { backgroundColor: "#FEE2E2" },
  qtyPlus: { backgroundColor: "#DCFCE7" },
  qtyCount: { width: 22, textAlign: "center", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { color: "#8B7B69", textAlign: "center", marginTop: 10 },
});
