import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView, Image, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { listarProductosCliente, listarPuestos, type Producto, type Puesto } from "../../src/api/catalogo";
import { useCart } from "../../src/contexts/CartContext";
import { catInfo } from "../../src/lib/categorias";
import { unidadFormato } from "../../src/lib/unidades";
import { resolverImagen } from "../../src/lib/imgUrl";
import { claveItemCarrito } from "../../src/lib/variantes";
import ProductoVarianteModal from "../../src/components/ProductoVarianteModal";
import ProductCardCompacta from "../../src/components/ProductCardCompacta";
import BottomSheet from "../../src/components/BottomSheet";
import SearchBar, { matchProducto } from "../../src/components/SearchBar";
import BannerAnunciate from "../../src/components/BannerAnunciate";
import BannerProductoDestacado from "../../src/components/BannerProductoDestacado";
import { useSession } from "../../src/contexts/SessionContext";
import { misPedidos, type Pedido } from "../../src/api/pedidos";
import { apiFetch } from "../../src/api/client";

interface Anuncio {
  id: string;
  titulo: string;
  mensaje: string;
  imagen?: string | null;
  link?: string | null;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [tiendaFiltro, setTiendaFiltro] = useState<string | null>(null);
  const [seccionFiltro, setSeccionFiltro] = useState<string | null>(null);
  const [subseccionFiltro, setSubseccionFiltro] = useState<string | null>(null);
  // Orden/precio. Persiste cuando se cambia de tienda, categoría o sección
  // — mismo comportamiento que la web.
  const [ordenFiltro, setOrdenFiltro] = useState<"default" | "menor" | "mayor" | "mayoreo">("default");
  const [soloAbiertas, setSoloAbiertas] = useState(false);
  const [soloInmediato, setSoloInmediato] = useState(false);
  const [sheetOrdenar, setSheetOrdenar] = useState(false);
  const [sheetFiltros, setSheetFiltros] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const { agregar, items, cambiarCantidad } = useCart();
  const { usuario } = useSession();
  const [varianteModal, setVarianteModal] = useState<{ producto: Producto; puestoId: string } | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  // Reset del scroll del slider de tiendas al cambiar categoría/sección.
  const sliderTiendasRef = useRef<ScrollView>(null);
  useEffect(() => {
    sliderTiendasRef.current?.scrollTo({ x: 0, animated: true });
  }, [categoriaFiltro, seccionFiltro]);

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

  // Anuncios — el admin sube banners promocionales con imagen sin redeploy.
  useEffect(() => {
    apiFetch<Anuncio[]>("/api/anuncios?tipo=clientes").then(setAnuncios).catch(() => {});
  }, []);

  // Pedidos del cliente — para 'Vuelve a pedir' y personalización pasiva
  // de categorías. Solo si está logueado.
  useEffect(() => {
    if (!usuario) { setPedidos([]); return; }
    misPedidos().then(setPedidos).catch(() => {});
  }, [usuario]);

  // Cuando cambia la categoría, cargar las tiendas de esa categoría
  useEffect(() => {
    if (!categoriaFiltro) { setPuestos([]); return; }
    listarPuestos(categoriaFiltro).then(setPuestos).catch(() => setPuestos([]));
  }, [categoriaFiltro]);

  const categoriasDisponibles = useMemo(() => {
    const todas = Array.from(new Set(productos.map((p) => p.categoria_id)));
    // Personalización pasiva: ordenar por frecuencia de compra del cliente.
    // Las que ya pidió antes salen primero.
    const frecuencia = new Map<string, number>();
    for (const pedido of pedidos) {
      if (pedido.estado !== "entregado") continue;
      for (const item of pedido.items) {
        const prod = productos.find((p) => p.id === item.producto_id);
        if (!prod) continue;
        frecuencia.set(prod.categoria_id, (frecuencia.get(prod.categoria_id) ?? 0) + 1);
      }
    }
    return [...todas].sort((a, b) => (frecuencia.get(b) ?? 0) - (frecuencia.get(a) ?? 0));
  }, [productos, pedidos]);

  // Productos base filtrados por categoría
  const baseProductos = useMemo(() => {
    return categoriaFiltro
      ? productos.filter((p) => p.categoria_id === categoriaFiltro)
      : productos;
  }, [productos, categoriaFiltro]);

  // Productos visibles para listas de filtros (tiendas, secciones).
  // Conserva todos los precios — solo se aplican filtros de producto.
  const productosBase = useMemo(() => baseProductos.filter((p) => p.precios.length > 0), [baseProductos]);

  const seccionesDisponibles = useMemo(() => {
    return Array.from(new Set(productosBase.map((p) => p.seccion).filter(Boolean))) as string[];
  }, [productosBase]);

  const subseccionesDisponibles = useMemo(() => {
    const base = seccionFiltro ? productosBase.filter((p) => p.seccion === seccionFiltro) : productosBase;
    return Array.from(new Set(base.map((p) => p.subseccion).filter(Boolean))) as string[];
  }, [productosBase, seccionFiltro]);

  // Cada oferta = (producto, precio de una tienda). Una card por oferta:
  // así dos tiendas que vendan lo mismo compiten en cards independientes.
  const ofertasFiltradas = useMemo(() => {
    let productos = productosBase.filter((p) => {
      if (seccionFiltro && p.seccion !== seccionFiltro) return false;
      if (subseccionFiltro && p.subseccion !== subseccionFiltro) return false;
      if (busqueda.trim() && !matchProducto(
        busqueda,
        p.nombre,
        p.descripcion,
        p.seccion,
        p.subseccion,
        ...p.precios.map((pr) => pr.puesto_nombre)
      )) return false;
      return true;
    });

    let ofertas = productos.flatMap((producto) =>
      producto.precios.map((precio) => ({ producto, precio }))
    );

    if (tiendaFiltro) {
      ofertas = ofertas.filter((o) => o.precio.puesto_id === tiendaFiltro);
    }
    if (soloAbiertas) {
      ofertas = ofertas.filter((o) => o.precio.cerrada !== true);
    }
    if (soloInmediato) {
      ofertas = ofertas.filter((o) => (o.precio.puesto_lead_time_dias ?? 0) === 0);
    }

    const normNombre = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

    if (ordenFiltro === "mayoreo") {
      ofertas = ofertas.filter((o) => o.precio.precio_mayoreo != null);
      ofertas = [...ofertas].sort((a, b) => {
        const dA = a.precio.precio_mayoreo != null ? a.precio.precio - a.precio.precio_mayoreo : 0;
        const dB = b.precio.precio_mayoreo != null ? b.precio.precio - b.precio.precio_mayoreo : 0;
        return dB - dA;
      });
    } else if (ordenFiltro === "menor") {
      ofertas = [...ofertas].sort((a, b) => a.precio.precio - b.precio.precio);
    } else if (ordenFiltro === "mayor") {
      ofertas = [...ofertas].sort((a, b) => b.precio.precio - a.precio.precio);
    } else {
      // Recomendado: agrupa por nombre, prioriza tiendas mejor calificadas
      // (rating < 3 se demueve), luego por precio.
      const ratingScore = (r?: number | null) => (r == null ? 2.5 : Number(r));
      ofertas = [...ofertas].sort((a, b) => {
        const nA = normNombre(a.producto.nombre);
        const nB = normNombre(b.producto.nombre);
        if (nA !== nB) return nA.localeCompare(nB);
        const rA = ratingScore(a.precio.puesto_rating);
        const rB = ratingScore(b.precio.puesto_rating);
        const penA = rA < 3 ? 100 : 0;
        const penB = rB < 3 ? 100 : 0;
        const effA = a.precio.precio + penA;
        const effB = b.precio.precio + penB;
        if (effA !== effB) return effA - effB;
        return rB - rA;
      });
    }
    return ofertas;
  }, [productosBase, tiendaFiltro, seccionFiltro, subseccionFiltro, ordenFiltro, busqueda, soloAbiertas, soloInmediato]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#FF7A2B" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Búsqueda — persiste igual que el orden al cambiar tienda/sección. */}
      <View style={styles.searchWrap}>
        <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Buscar producto..." />
      </View>

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
          <ScrollView ref={sliderTiendasRef} horizontal showsHorizontalScrollIndicator={false} style={styles.tiendasSlider} contentContainerStyle={styles.tiendasRow}>
            <TiendaChip
              nombre="Todas"
              logo={null}
              cerrada={false}
              active={!tiendaFiltro}
              onPress={() => { setTiendaFiltro(null); setSeccionFiltro(null); setSubseccionFiltro(null); }}
              fallbackIcon="cart-outline"
            />
            {[...puestos].sort((a, b) => {
              // Cerradas al final del slider para que las abiertas se vean
              // primero sin scroll.
              const ca = a.abierto_ahora === false ? 1 : 0;
              const cb = b.abierto_ahora === false ? 1 : 0;
              return ca - cb;
            }).map((p) => (
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

      {/* Barra unificada: 4 chips (Solo abiertas, Inmediato, Ordenar, Filtros).
          Sección y subsección se mueven al sheet "Filtros". */}
      {(() => {
        const filtrosPanelActivos = (seccionFiltro ? 1 : 0) + (subseccionFiltro ? 1 : 0) + (ordenFiltro === "mayoreo" ? 1 : 0);
        const ordenLabel = ordenFiltro === "menor" ? "Menor precio" : ordenFiltro === "mayor" ? "Mayor precio" : "Recomendado";
        return (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sliderSmall} contentContainerStyle={styles.chipsRowSmall}>
            <TouchableOpacity onPress={() => setSoloAbiertas((v) => !v)} style={[styles.chipQuick, soloAbiertas && styles.chipQuickAbiertas]}>
              <Text style={[styles.chipQuickText, soloAbiertas && styles.chipQuickTextActive]}>🟢 Solo abiertas</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSoloInmediato((v) => !v)} style={[styles.chipQuick, soloInmediato && styles.chipQuickActive]}>
              <Text style={[styles.chipQuickText, soloInmediato && styles.chipQuickTextActive]}>⚡ Inmediato</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSheetOrdenar(true)} style={styles.chipQuick}>
              <Text style={styles.chipQuickText}>↑↓ {ordenLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSheetFiltros(true)} style={[styles.chipQuick, filtrosPanelActivos > 0 && styles.chipQuickActive]}>
              <Text style={[styles.chipQuickText, filtrosPanelActivos > 0 && styles.chipQuickTextActive]}>
                ⚙ Filtros{filtrosPanelActivos > 0 ? ` (${filtrosPanelActivos})` : ""}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        );
      })()}

      <FlatList
        data={ofertasFiltradas}
        keyExtractor={(o) => `${o.producto.id}-${o.precio.puesto_id}`}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListHeaderComponent={
          <>
            {/* Anuncio con imagen (admin-managed). Solo el más reciente. */}
            {anuncios.filter((a) => a.imagen).slice(0, 1).map((a) => (
              <TouchableOpacity
                key={a.id}
                onPress={() => { if (a.link) Linking.openURL(a.link); }}
                activeOpacity={a.link ? 0.85 : 1}
                style={{ marginBottom: 10, borderRadius: 12, overflow: "hidden" }}
              >
                <Image source={{ uri: a.imagen! }} style={{ width: "100%", height: 140 }} resizeMode="cover" />
              </TouchableOpacity>
            ))}

            {/* Botón "Mandar paquete" — compacto */}
            <TouchableOpacity
              style={styles.envioBanner}
              onPress={() => router.push("/enviar-paquete")}
              activeOpacity={0.8}
            >
              <Text style={styles.envioEmoji}>📦</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.envioTitle}>Mandar paquete</Text>
                <Text style={styles.envioSub}>Sahuayo · Jiquilpan · V. Carranza · máx 10 kg</Text>
              </View>
              <Text style={styles.envioArrow}>→</Text>
            </TouchableOpacity>

            {ofertasFiltradas.length > 0 && (
              <BannerProductoDestacado
                ofertas={ofertasFiltradas}
                onAgregar={({ producto, precio }) => {
                  const tieneExtras = (producto.variantes && producto.variantes.length > 0) || (producto.modificadores && producto.modificadores.length > 0);
                  if (tieneExtras) {
                    setVarianteModal({ producto, puestoId: precio.puesto_id });
                  } else {
                    agregar(producto, precio.puesto_id);
                  }
                }}
              />
            )}
          </>
        }
        ListEmptyComponent={(() => {
          // Misma lógica de mensajes que web: tienda cerrada > mayoreo
          // sin coincidencias > filtros sin coincidencias > vacío natural.
          if (error) {
            return (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>⚠️</Text>
                <Text style={styles.emptyTitle}>{error}</Text>
              </View>
            );
          }
          const tiendaActual = tiendaFiltro ? puestos.find((p) => p.id === tiendaFiltro) : null;
          const tiendaCerrada = tiendaActual?.abierto_ahora === false;
          const filtrosActivos = !!(tiendaFiltro || seccionFiltro || subseccionFiltro || ordenFiltro !== "default" || soloAbiertas);
          const busquedaActiva = busqueda.trim().length > 0;

          if (soloAbiertas && !busquedaActiva && !tiendaFiltro && !seccionFiltro && !subseccionFiltro && ordenFiltro === "default") {
            return (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🌙</Text>
                <Text style={styles.emptyTitle}>Todas las tiendas cerradas</Text>
                <Text style={styles.emptyHint}>En este momento ninguna tienda de esta categoría está abierta. Quita el filtro para verlas igualmente o vuelve más tarde.</Text>
                <TouchableOpacity style={styles.emptyButton} onPress={() => setSoloAbiertas(false)}>
                  <Text style={styles.emptyButtonText}>Mostrar todas</Text>
                </TouchableOpacity>
              </View>
            );
          }
          if (busquedaActiva) {
            return (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🔎</Text>
                <Text style={styles.emptyTitle}>Sin resultados para &quot;{busqueda}&quot;</Text>
                <Text style={styles.emptyHint}>Prueba otra palabra o quita los filtros para ver más opciones.</Text>
                <TouchableOpacity style={styles.emptyButton} onPress={() => setBusqueda("")}>
                  <Text style={styles.emptyButtonText}>Limpiar búsqueda</Text>
                </TouchableOpacity>
              </View>
            );
          }
          if (tiendaCerrada) {
            return (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🏪💤</Text>
                <Text style={styles.emptyTitle}>Esta tienda ya cerró por hoy</Text>
                <Text style={styles.emptyHint}>{tiendaActual?.nombre.trim()} retomará pedidos en su próximo horario. Mientras, prueba otra tienda.</Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => { setTiendaFiltro(null); setSeccionFiltro(null); setSubseccionFiltro(null); }}
                >
                  <Text style={styles.emptyButtonText}>Ver otras tiendas</Text>
                </TouchableOpacity>
              </View>
            );
          }
          if (ordenFiltro === "mayoreo") {
            return (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>💰</Text>
                <Text style={styles.emptyTitle}>Sin productos en mayoreo</Text>
                <Text style={styles.emptyHint}>No encontramos productos con descuento por volumen aquí. Prueba otra categoría o quita el filtro.</Text>
                <TouchableOpacity style={styles.emptyButton} onPress={() => setOrdenFiltro("default")}>
                  <Text style={styles.emptyButtonText}>Quitar filtro</Text>
                </TouchableOpacity>
              </View>
            );
          }
          if (filtrosActivos) {
            return (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🔍</Text>
                <Text style={styles.emptyTitle}>No encontramos productos</Text>
                <Text style={styles.emptyHint}>Con los filtros que tienes no hay nada que mostrar. Prueba quitando alguno.</Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => { setTiendaFiltro(null); setSeccionFiltro(null); setSubseccionFiltro(null); setOrdenFiltro("default"); setSoloAbiertas(false); }}
                >
                  <Text style={styles.emptyButtonText}>Limpiar filtros</Text>
                </TouchableOpacity>
              </View>
            );
          }
          return (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🛒</Text>
              <Text style={styles.emptyTitle}>Sin productos por ahora</Text>
              <Text style={styles.emptyHint}>Aún no hay productos en esta categoría. Vuelve pronto — estamos sumando tiendas cada semana.</Text>
            </View>
          );
        })()}
        renderItem={({ item: { producto: item, precio } }) => {
          const tieneExtras = (item.variantes && item.variantes.length > 0) || (item.modificadores && item.modificadores.length > 0);
          const enCarrito = !tieneExtras
            ? items.find((i) => i.producto_id === item.id && i.puesto_id === precio.puesto_id && !i.variante_id && i.modificadores.length === 0)
            : null;
          const claveSimple = !tieneExtras ? claveItemCarrito(item.id, precio.puesto_id, null, []) : null;
          return (
            <ProductCardCompacta
              producto={item}
              precio={precio}
              enCarrito={enCarrito?.cantidad ?? 0}
              tieneExtras={tieneExtras}
              onAgregar={() => {
                if (tieneExtras) {
                  setVarianteModal({ producto: item, puestoId: precio.puesto_id });
                } else {
                  agregar(item, precio.puesto_id);
                }
              }}
              onCambiarCantidad={claveSimple ? (delta) => cambiarCantidad(claveSimple, delta) : undefined}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      <ProductoVarianteModal
        visible={!!varianteModal}
        producto={varianteModal?.producto ?? null}
        puestoId={varianteModal?.puestoId ?? null}
        onClose={() => setVarianteModal(null)}
        onAgregar={({ variante, modificadores, cantidadInicial }) => {
          if (!varianteModal) return;
          agregar(varianteModal.producto, varianteModal.puestoId, { variante, modificadores, cantidadInicial });
        }}
      />

      {/* Sheet Ordenar */}
      <BottomSheet abierto={sheetOrdenar} onClose={() => setSheetOrdenar(false)} titulo="Ordenar">
        {(["default", "menor", "mayor", "mayoreo"] as const).map((id) => {
          const labels: Record<typeof id, { label: string; desc: string }> = {
            default: { label: "Recomendado", desc: "Agrupa productos similares y muestra el más barato primero" },
            menor: { label: "Menor precio", desc: "Más baratos arriba" },
            mayor: { label: "Mayor precio", desc: "Más caros arriba" },
            mayoreo: { label: "Solo mayoreo", desc: "Productos con precio especial por cantidad" },
          };
          const sel = ordenFiltro === id;
          return (
            <TouchableOpacity
              key={id}
              onPress={() => { setOrdenFiltro(id); setSheetOrdenar(false); }}
              style={[sheetStyles.opt, sel && sheetStyles.optSel]}
            >
              <Text style={sheetStyles.optLabel}>{labels[id].label}</Text>
              <Text style={sheetStyles.optDesc}>{labels[id].desc}</Text>
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      {/* Sheet Filtros */}
      <BottomSheet
        abierto={sheetFiltros}
        onClose={() => setSheetFiltros(false)}
        titulo="Filtros"
        footer={
          <TouchableOpacity onPress={() => setSheetFiltros(false)} style={sheetStyles.footerBtn}>
            <Text style={sheetStyles.footerBtnTxt}>Ver resultados</Text>
          </TouchableOpacity>
        }
      >
        {seccionesDisponibles.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={sheetStyles.groupTitle}>Sección</Text>
            <View style={sheetStyles.chipsWrap}>
              <TouchableOpacity onPress={() => { setSeccionFiltro(null); setSubseccionFiltro(null); }} style={[sheetStyles.chip, !seccionFiltro && sheetStyles.chipSel]}>
                <Text style={[sheetStyles.chipTxt, !seccionFiltro && sheetStyles.chipTxtSel]}>Todas</Text>
              </TouchableOpacity>
              {seccionesDisponibles.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => { setSeccionFiltro(seccionFiltro === s ? null : s); setSubseccionFiltro(null); }}
                  style={[sheetStyles.chip, seccionFiltro === s && sheetStyles.chipSel]}
                >
                  <Text style={[sheetStyles.chipTxt, seccionFiltro === s && sheetStyles.chipTxtSel]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {subseccionesDisponibles.length > 0 && (
          <View>
            <Text style={sheetStyles.groupTitle}>Subsección</Text>
            <View style={sheetStyles.chipsWrap}>
              <TouchableOpacity onPress={() => setSubseccionFiltro(null)} style={[sheetStyles.chip, !subseccionFiltro && sheetStyles.chipSel]}>
                <Text style={[sheetStyles.chipTxt, !subseccionFiltro && sheetStyles.chipTxtSel]}>Todas</Text>
              </TouchableOpacity>
              {subseccionesDisponibles.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSubseccionFiltro(subseccionFiltro === s ? null : s)}
                  style={[sheetStyles.chip, subseccionFiltro === s && sheetStyles.chipSel]}
                >
                  <Text style={[sheetStyles.chipTxt, subseccionFiltro === s && sheetStyles.chipTxtSel]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {seccionesDisponibles.length === 0 && subseccionesDisponibles.length === 0 && (
          <View style={sheetStyles.empty}>
            <Text style={sheetStyles.emptyEmoji}>🎯</Text>
            <Text style={sheetStyles.emptyTitle}>No hay filtros adicionales</Text>
            <Text style={sheetStyles.emptyDesc}>
              Esta categoría aún no tiene secciones ni subsecciones para refinar la búsqueda. Usa los chips de arriba (Solo abiertas / Inmediato / Ordenar) para acotar los resultados.
            </Text>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  opt: { padding: 12, borderRadius: 12, borderWidth: 2, borderColor: "#F3F4F6", marginBottom: 6 },
  optSel: { borderColor: "#FF7A2B", backgroundColor: "#FFF7EB" },
  optLabel: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  optDesc: { fontSize: 12, color: "#6B7280" },
  groupTitle: { fontSize: 11, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", marginBottom: 8 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  chipSel: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  chipTxt: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  chipTxtSel: { color: "#fff" },
  footerBtn: { backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  footerBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  empty: { alignItems: "center", paddingVertical: 24 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: "#1F2937", marginBottom: 4 },
  emptyDesc: { fontSize: 12, color: "#6B7280", textAlign: "center", lineHeight: 17 },
});

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

// Mismo look que web: pill brand cuando activo, blanco con borde si no.
function ChipOrden({ label, icon, active, onPress }: { label: string; icon?: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chipOrden, active && styles.chipOrdenActive]} onPress={onPress}>
      {icon ? <Text style={[styles.chipOrdenText, active && styles.chipOrdenTextActive, { marginRight: 4 }]}>{icon}</Text> : null}
      <Text style={[styles.chipOrdenText, active && styles.chipOrdenTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF7EB" },
  searchWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  envioBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FF7A2B", borderRadius: 12, padding: 12, marginBottom: 10 },
  repedirWrap: { marginBottom: 12 },
  repedirTitle: { fontSize: 12, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", marginBottom: 8, marginLeft: 2 },
  repedirRow: { gap: 8, paddingRight: 4 },
  repedirCard: { width: 140, backgroundColor: "#fff", borderRadius: 12, overflow: "hidden" },
  repedirImg: { width: "100%", height: 80, backgroundColor: "#FFF7EB" },
  repedirImgPh: { alignItems: "center", justifyContent: "center" },
  repedirTienda: { fontSize: 12, fontWeight: "700", color: "#1F2937" },
  repedirMeta: { fontSize: 10, color: "#6B7280" },
  envioEmoji: { fontSize: 30 },
  envioTitle: { color: "#fff", fontWeight: "700", fontSize: 14 },
  envioSub: { color: "#fff", opacity: 0.9, fontSize: 11 },
  envioArrow: { color: "#fff", fontSize: 20, fontWeight: "700" },
  // Altura explícita en cada slider para que Android no recorte los chips
  // ni los estire cuando la lista de productos está vacía. Los maxHeight
  // deben sumar padding vertical del row + padding vertical del chip +
  // lineHeight del texto + ~4px de holgura para descenders (g, y, p).
  slider: { flexGrow: 0, flexShrink: 0, maxHeight: 64 },
  chipRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  chipActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  chipText: { fontSize: 13, color: "#8B7B69", fontWeight: "500", lineHeight: 17, includeFontPadding: false },
  chipTextActive: { color: "#fff" },
  tiendasWrap: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  tiendasLabel: { fontSize: 11, color: "#8B7B69", fontWeight: "600", marginBottom: 4 },
  tiendasSlider: { flexGrow: 0, flexShrink: 0, maxHeight: 110 },
  tiendasRow: { gap: 6, paddingVertical: 8, paddingHorizontal: 4 },
  tiendaChip: { alignItems: "center", gap: 6, paddingHorizontal: 10, paddingTop: 12, paddingBottom: 10, borderRadius: 12, backgroundColor: "#fff", borderWidth: 2, borderColor: "#F3EFE7", minWidth: 80, minHeight: 92 },
  tiendaChipActive: { backgroundColor: "#FFF2E5", borderColor: "#FF7A2B" },
  tiendaChipCerrada: { opacity: 0.55 },
  tiendaLogo: { width: 40, height: 40, borderRadius: 10 },
  tiendaLogoPlaceholder: { backgroundColor: "#F3EFE7", alignItems: "center", justifyContent: "center" },
  tiendaNombreChip: { fontSize: 10, color: "#1F2937", maxWidth: 74, fontWeight: "500", textAlign: "center", lineHeight: 13, includeFontPadding: false },
  cerradaBadge: { position: "absolute", top: 4, right: 4, backgroundColor: "#DC2626", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999 },
  cerradaBadgeText: { fontSize: 8, color: "#fff", fontWeight: "700" },
  sliderSmall: { flexGrow: 0, flexShrink: 0, maxHeight: 56 },
  chipsRowSmall: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  chipQuick: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  chipQuickActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  chipQuickAbiertas: { backgroundColor: "#059669", borderColor: "#059669" },
  chipQuickText: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  chipQuickTextActive: { color: "#fff" },
  chipSmall: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  chipSmallActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  chipSmallText: { fontSize: 12, color: "#8B7B69", fontWeight: "500", lineHeight: 15, includeFontPadding: false },
  chipSmallTextActive: { color: "#fff", fontWeight: "700" },
  sliderTiny: { flexGrow: 0, flexShrink: 0, maxHeight: 46 },
  chipsRowTiny: { paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
  chipTiny: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#F3EFE7" },
  chipTinyActive: { backgroundColor: "#1F2937" },
  chipTinyText: { fontSize: 11, color: "#8B7B69", fontWeight: "500", lineHeight: 14, includeFontPadding: false },
  chipTinyTextActive: { color: "#fff" },
  // Fila de orden con etiqueta "Ordenar:" + chips estilo brand.
  ordenWrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  ordenLabel: { fontSize: 11, color: "#9CA3AF", fontWeight: "600" },
  ordenSlider: { flexGrow: 0, flexShrink: 1, maxHeight: 40 },
  ordenRow: { gap: 6, paddingVertical: 4 },
  chipOrden: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB" },
  chipOrdenActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  chipAbiertasActive: { backgroundColor: "#059669", borderColor: "#059669" },
  chipOrdenText: { fontSize: 12, color: "#6B7280", fontWeight: "500", lineHeight: 15, includeFontPadding: false },
  chipOrdenTextActive: { color: "#fff", fontWeight: "700" },
  list: { padding: 12, paddingTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 },
  cardHeader: { flexDirection: "row", gap: 10, alignItems: "center" },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  thumbPlaceholder: { backgroundColor: "#F3EFE7", alignItems: "center", justifyContent: "center" },
  nombre: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  descripcion: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  preciosRow: { marginTop: 10, gap: 6 },
  precioItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFF7EB", borderRadius: 10, padding: 10 },
  precioItemCerrada: { backgroundColor: "#F3F4F6", opacity: 0.85 },
  precioCerrada: { color: "#9CA3AF", textDecorationLine: "line-through" },
  cerradaTag: { backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  cerradaTagTxt: { fontSize: 9, fontWeight: "700", color: "#991B1B" },
  cerradaHint: { fontSize: 10, color: "#991B1B", marginTop: 4 },
  addButtonDisabled: { backgroundColor: "#E5E7EB" },
  precioInfo: { flex: 1, paddingRight: 10 },
  precio: { fontSize: 16, fontWeight: "700", color: "#FF7A2B" },
  tiendaNombre: { fontSize: 11, color: "#8B7B69", marginTop: 2 },
  mayoreoHint: { fontSize: 10, color: "#92400E", backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 4, alignSelf: "flex-start" },
  addButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FF7A2B", alignItems: "center", justifyContent: "center" },
  addButtonProgramar: { backgroundColor: "#F59E0B" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  qtyMinus: { backgroundColor: "#FEE2E2" },
  qtyPlus: { backgroundColor: "#DCFCE7" },
  qtyCount: { width: 22, textAlign: "center", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  // Empty state estilo card con dashed border, equivalente al de web.
  empty: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 2, borderColor: "#F3EFE7", borderStyle: "dashed", padding: 32, alignItems: "center", marginTop: 8 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#1F2937", textAlign: "center", marginBottom: 6 },
  emptyHint: { fontSize: 13, color: "#8B7B69", textAlign: "center", lineHeight: 18, marginBottom: 16 },
  emptyButton: { backgroundColor: "#FF7A2B", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
  emptyButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
