import { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking, TextInput, Pressable,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import {
  listarProductosCliente, listarPuestos, masVendidosMenu,
  type Producto, type Puesto, type PrecioInfo,
} from "../../src/api/catalogo";
import { useCart } from "../../src/contexts/CartContext";
import { claveItemCarrito, type SeleccionModificador } from "../../src/lib/variantes";
import type { ProductoVariante } from "../../src/lib/variantes";
import { resolverImagen } from "../../src/lib/imgUrl";
import { labelCiudad } from "../../src/lib/ciudades";
import { CATEGORIAS } from "../../src/lib/categorias";
import { paletaDeMarca, conAlfa, type PaletaMarca } from "../../src/lib/paletaMarca";
import { useFavoritos } from "../../src/lib/favoritos";
import Boton3D from "../../src/components/Boton3D";
import FichaNegocio from "../../src/components/FichaNegocio";
import ProductoVarianteModal from "../../src/components/ProductoVarianteModal";
import ProductoDetalleClienteModal from "../../src/components/ProductoDetalleClienteModal";
import Loader from "../../src/components/Loader";
import { DELIVERY_ACTIVO } from "../../src/lib/flags";
import { linkPedidoWhatsApp, linkLlamada } from "../../src/lib/pedidoWhatsApp";
import { apiFetch } from "../../src/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface Oferta { producto: Producto; precio: PrecioInfo; vendidos: number }
interface Cat {
  id: string;
  nombre: string;
  ofertas: Oferta[];
  /** Sección sintética (más vendidos / favoritos): se muestra completa. */
  completa?: boolean;
}

// Espejo de src/components/MenuPublico.tsx (web): mismo preview corto, mismas
// secciones sintéticas, mismo tope del top. Si cambia allá, cambia aquí.
const PREVIEW = 3;
const CAT_TOP = "__top";
const CAT_FAV = "__fav";
const TOP_MAX = 6;

// "Ya vi cómo se pide aquí", por negocio. Espejo de GUIA_KEY en web: quien
// llega al QR de una taquería nueva no tiene por qué saber que ya usó
// Mercadito en otra.
const GUIA_KEY = "mercadito_guia_menu";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Menú nativo de una tienda — el destino de /menus y de los links /m/<slug>.
 *
 * Es el ESPEJO del menú web (src/components/MenuPublico.tsx): header de marca
 * con la portada del negocio, buscador con tachita, chips de categoría,
 * secciones "Más vendidos" y "Favoritos" arriba, tarjetas con corazón y
 * botones con la sombra dura del look de Mercadito. Lo que cambia es de dónde
 * salen los datos —aquí del catálogo, para poder usar el carrito nativo con
 * variantes, fracción y "por dinero"— y a dónde va el pedido: con delivery al
 * carrito de siempre, sin él al WhatsApp del negocio.
 */
export default function MenuTiendaScreen() {
  const { puestoId } = useLocalSearchParams<{ puestoId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, agregar, cambiarCantidad, total } = useCart();
  const { esFavorito, alternar } = useFavoritos();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [puesto, setPuesto] = useState<Puesto | null>(null);
  const [vendidos, setVendidos] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [varianteModal, setVarianteModal] = useState<{ producto: Producto; puestoId: string } | null>(null);
  const [detalleModal, setDetalleModal] = useState<Oferta | null>(null);

  const [q, setQ] = useState("");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [catActiva, setCatActiva] = useState<string | null>(null);
  const [descAbierta, setDescAbierta] = useState(false);
  const [verFicha, setVerFicha] = useState(false);
  // null = todavía no sabemos si ya la vio; hasta entonces no se pinta nada
  // (mejor que parpadear la guía y quitarla).
  const [verGuia, setVerGuia] = useState<boolean | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const chipsRef = useRef<ScrollView>(null);
  // Y de cada sección para que los chips naveguen. onLayout da la Y RELATIVA
  // al padre, así que guardamos también dónde empieza el bloque de secciones
  // y sumamos: sin eso los chips saltaban al header.
  const posiciones = useRef<Record<string, number>>({});
  const mainY = useRef(0);

  const pal = useMemo<PaletaMarca>(() => paletaDeMarca(puesto?.color_marca), [puesto?.color_marca]);

  useEffect(() => {
    if (!puestoId) return;
    Promise.all([listarProductosCliente(), listarPuestos()])
      .then(([prods, puestos]) => {
        setProductos(prods);
        setPuesto(puestos.find((p) => p.id === puestoId) ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    masVendidosMenu(puestoId).then((filas) => {
      setVendidos(Object.fromEntries(filas.map((f) => [f.producto_id, f.pedidos])));
    });
  }, [puestoId]);

  // Atribución: una vista del menú, igual que en web.
  useEffect(() => {
    if (!puestoId) return;
    apiFetch(`/api/menu/${puestoId}/evento`, {
      method: "POST",
      body: JSON.stringify({ tipo: "vista" }),
    }).catch(() => {});
  }, [puestoId]);

  // Guía de primer uso.
  useEffect(() => {
    if (!puestoId) return;
    let vivo = true;
    AsyncStorage.getItem(GUIA_KEY)
      .then((raw) => {
        if (!vivo) return;
        const vistos = raw ? JSON.parse(raw) : [];
        setVerGuia(!(Array.isArray(vistos) && vistos.includes(puestoId)));
      })
      .catch(() => { if (vivo) setVerGuia(true); });
    return () => { vivo = false; };
  }, [puestoId]);

  const cerrarGuia = () => {
    setVerGuia(false);
    AsyncStorage.getItem(GUIA_KEY)
      .then((raw) => {
        const vistos = raw ? JSON.parse(raw) : [];
        const lista = Array.isArray(vistos) ? vistos : [];
        // Tope: la lista vive para siempre en el dispositivo y no vale la pena
        // que crezca sin límite por alguien que abre muchos menús.
        return AsyncStorage.setItem(GUIA_KEY, JSON.stringify([...lista.slice(-40), puestoId]));
      })
      .catch(() => {});
  };

  // Ofertas de ESTA tienda, en el mismo orden que la web: por categoría
  // (subsección, o el nombre de la categoría si el negocio no la puso), luego
  // por sección chica y nombre.
  const ofertas = useMemo<Oferta[]>(() => {
    const out: Oferta[] = [];
    for (const producto of productos) {
      const precio = producto.precios.find((pr) => pr.puesto_id === puestoId);
      if (!precio) continue;
      out.push({ producto, precio, vendidos: vendidos[producto.id] ?? 0 });
    }
    return out.sort((a, b) =>
      (a.producto.seccion ?? "").localeCompare(b.producto.seccion ?? "") ||
      a.producto.nombre.localeCompare(b.producto.nombre)
    );
  }, [productos, puestoId, vendidos]);

  const propias = useMemo<Cat[]>(() => {
    const nombreCat = (p: Producto) =>
      p.subseccion?.trim() || CATEGORIAS[p.categoria_id]?.nombre || "Menú";
    const mapa = new Map<string, Oferta[]>();
    for (const of of ofertas) {
      const cat = nombreCat(of.producto);
      if (!mapa.has(cat)) mapa.set(cat, []);
      mapa.get(cat)!.push(of);
    }
    return [...mapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nombre, ofs]) => ({ id: nombre, nombre, ofertas: ofs }));
  }, [ofertas]);

  const masVendidos = useMemo(
    () => ofertas.filter((o) => o.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos).slice(0, TOP_MAX),
    [ofertas]
  );
  const favoritas = useMemo(
    () => ofertas.filter((o) => esFavorito("producto", o.producto.id)),
    [ofertas, esFavorito]
  );

  const categorias = useMemo<Cat[]>(() => {
    const extra: Cat[] = [];
    if (masVendidos.length > 0) extra.push({ id: CAT_TOP, nombre: "🔥 Más vendidos", ofertas: masVendidos, completa: true });
    if (favoritas.length > 0) extra.push({ id: CAT_FAV, nombre: "❤️ Favoritos", ofertas: favoritas, completa: true });
    return [...extra, ...propias];
  }, [masVendidos, favoritas, propias]);

  const nq = norm(q.trim());
  const buscando = nq.length > 0;
  const filtradas = useMemo<Cat[]>(() => {
    if (!nq) return categorias;
    // Al buscar se filtran SOLO las categorías reales: si no, un platillo que
    // además es top o favorito saldría tres veces en la misma lista.
    return propias
      .map((c) => ({
        ...c,
        ofertas: c.ofertas.filter((o) =>
          norm(o.producto.nombre).includes(nq) ||
          (o.producto.descripcion ? norm(o.producto.descripcion).includes(nq) : false)
        ),
      }))
      .filter((c) => c.ofertas.length > 0);
  }, [categorias, propias, nq]);

  const logo = puesto?.logo ? resolverImagen(puesto.logo) ?? puesto.logo : null;
  const portada = puesto?.portada ? resolverImagen(puesto.portada) ?? puesto.portada : null;
  const enCarritoCount = items.reduce((s, i) => s + (i.monto_solicitado != null ? 1 : i.cantidad), 0);

  // Pedido por WhatsApp: solo las líneas DE ESTA tienda. El carrito puede
  // traer cosas de varios negocios (herencia del catálogo con delivery) y
  // sería un error mandarle a uno lo que el cliente le pidió a otro.
  const itemsPuesto = items.filter((i) => i.puesto_id === puestoId);
  const totalPuesto = itemsPuesto.reduce(
    (s, i) => s + (i.monto_solicitado ?? i.precio_unitario * i.cantidad), 0
  );
  const waPedido = DELIVERY_ACTIVO || itemsPuesto.length === 0
    ? null
    : linkPedidoWhatsApp({
        telefono: puesto?.telefono_contacto,
        negocio: puesto?.nombre ?? "el negocio",
        lineas: itemsPuesto.map((i) => ({
          nombre: i.producto_nombre,
          cantidad: i.cantidad,
          precioUnit: i.precio_unitario,
          detalle: [i.variante_nombre, ...i.modificadores.map((m) => m.opcion_nombre)]
            .filter(Boolean).join(" · ") || undefined,
        })),
        total: totalPuesto,
        urlMenu: `mercadito.cx/m/${puesto?.menu_slug || puestoId}`,
      });

  const telLlamada = DELIVERY_ACTIVO ? null : linkLlamada(puesto?.telefono_contacto);
  const hayBarra = DELIVERY_ACTIVO ? items.length > 0 : !!waPedido;

  const pedirPorWhatsApp = () => {
    if (!waPedido) return;
    // Atribución + "más vendidos": las líneas del pedido son la única señal de
    // qué se pide que nos queda (el pedido se va a WhatsApp y no vuelve).
    apiFetch(`/api/menu/${puestoId}/evento`, {
      method: "POST",
      body: JSON.stringify({
        tipo: "pedido",
        items: itemsPuesto.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
      }),
    }).catch(() => {});
    Linking.openURL(waPedido);
  };

  function manejarAgregar({ producto, precio }: Oferta) {
    // Agregar algo ES haber entendido cómo se pide: la guía ya cumplió.
    if (verGuia) cerrarGuia();
    const tieneExtras = (producto.variantes && producto.variantes.length > 0) || (producto.modificadores && producto.modificadores.length > 0);
    const requiereModal = tieneExtras || !!producto.permite_fraccion || !!producto.permite_por_dinero;
    if (requiereModal) setVarianteModal({ producto, puestoId: precio.puesto_id });
    else agregar(producto, precio.puesto_id);
  }

  const alternarCat = (id: string) =>
    setExpandidas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const irA = (id: string) => {
    setCatActiva(id);
    const y = posiciones.current[id];
    // -8 para que el título no quede pegado bajo el buscador sticky.
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, mainY.current + y - 8), animated: true });
  };

  return (
    <>
      {/* Sin header nativo: el hero de marca ES el header, igual que en web.
          El de Stack venía en crema y rompía el look del negocio. */}
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <View style={styles.safe}>
        {loading ? (
          <Loader />
        ) : (
          <ScrollView
            ref={scrollRef}
            stickyHeaderIndices={[1]}
            contentContainerStyle={{
              // El sistema dibuja los botones (atrás/home) ENCIMA de la app:
              // sin el inset la última tarjeta quedaba debajo de ellos.
              paddingBottom: insets.bottom + (hayBarra ? 132 : 32),
            }}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => {
              // Scroll-spy de los chips: la sección activa es la última cuya
              // Y ya pasamos. Barato y suficiente (no hay IntersectionObserver).
              const y = e.nativeEvent.contentOffset.y + 140 - mainY.current;
              let activa: string | null = null;
              for (const c of filtradas) {
                const py = posiciones.current[c.id];
                if (py != null && py <= y) activa = c.id;
              }
              if (activa && activa !== catActiva) setCatActiva(activa);
            }}
            scrollEventThrottle={64}
          >
            {/* ── 1. Hero de marca + guía ─────────────────────────────────
                Van envueltos en UN solo hijo del ScrollView: el buscador se
                queda pegado arriba por índice (stickyHeaderIndices), así que
                meter un hermano suelto lo correría al elemento equivocado. */}
            <View>
            <View style={[styles.hero, { backgroundColor: pal.accent, paddingTop: insets.top + 8 }]}>
              {portada ? (
                <>
                  <Image source={{ uri: portada }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  {/* Degradado a mano: RN no trae linear-gradient y no vale meter
                      una dependencia nativa por un overlay. Capas ancladas abajo
                      y cada vez más cortas: el alfa se acumula hacia el pie del
                      hero, que es donde va el texto blanco. En puntos y no en %
                      porque el alto del hero lo decide el contenido. */}
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: conAlfa(pal.accentDark, 0.2) }]} />
                  {[210, 160, 115, 75, 40].map((h) => (
                    <View key={h} style={[styles.banda, { height: h, backgroundColor: conAlfa(pal.accentDark, 0.2) }]} />
                  ))}
                </>
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: pal.accentDark, opacity: 0.35 }]} />
              )}

              <TouchableOpacity
                onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))}
                style={styles.backBtn}
                hitSlop={10}
                accessibilityLabel="Volver"
              >
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>

              <View style={[styles.heroFila, portada ? { marginTop: 48 } : { marginTop: 12 }]}>
                <View style={styles.logoBox}>
                  {logo ? (
                    <Image source={{ uri: logo }} style={styles.logo} />
                  ) : (
                    <Text style={styles.logoInicial}>{(puesto?.nombre ?? "M").charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/* Toda la info del negocio vive AQUÍ, como en la web: antes
                      iba en una tarjeta blanca debajo y el header no decía
                      nada. */}
                  <Text style={styles.nombre} numberOfLines={2}>{puesto?.nombre ?? "Menú"}</Text>
                  <Text style={styles.ubicacion} numberOfLines={1}>
                    📍 {puesto?.ubicacion?.trim() || labelCiudad(puesto?.ciudad)}
                  </Text>
                  {puesto?.descripcion ? (
                    <>
                      <Text style={styles.desc} numberOfLines={descAbierta ? undefined : 2}>
                        {puesto.descripcion}
                      </Text>
                      {puesto.descripcion.length > 80 && (
                        <TouchableOpacity onPress={() => setDescAbierta((v) => !v)} hitSlop={8}>
                          <Text style={styles.descMas}>{descAbierta ? "Ver menos" : "Ver más"}</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  ) : null}
                </View>
                {puesto && (
                  <TouchableOpacity
                    onPress={() => alternar("puesto", puesto.id)}
                    style={styles.favNegocio}
                    hitSlop={8}
                    accessibilityLabel={esFavorito("puesto", puesto.id) ? "Quitar de favoritos" : "Guardar en favoritos"}
                  >
                    <Ionicons
                      name={esFavorito("puesto", puesto.id) ? "heart" : "heart-outline"}
                      size={20}
                      color={esFavorito("puesto", puesto.id) ? "#E1306C" : "#fff"}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Chips de estado: se quedan (la info se lee de un vistazo),
                  pero ahora conviven con el header, no lo sustituyen. */}
              <View style={styles.chipsInfo}>
                <View style={[styles.chipInfo, puesto?.abierto_ahora ? styles.chipAbierto : styles.chipCerrado]}>
                  <Text style={[styles.chipInfoTxt, puesto?.abierto_ahora ? styles.chipAbiertoTxt : styles.chipCerradoTxt]}>
                    {puesto?.abierto_ahora ? "● Abierto ahora" : "● Cerrado ahora"}
                  </Text>
                </View>
                {!DELIVERY_ACTIVO && !!puesto?.telefono_contacto && (
                  <View style={[styles.chipInfo, styles.chipWa]}>
                    <Text style={[styles.chipInfoTxt, styles.chipWaTxt]}>💬 Pide por WhatsApp</Text>
                  </View>
                )}
                {/* "¿Están abiertos?", "¿dónde están?", "¿aceptan tarjeta?": las
                    tres preguntas que hoy llegan al WhatsApp del negocio antes
                    de cada pedido. Todas se responden aquí. */}
                <TouchableOpacity
                  onPress={() => setVerFicha(true)}
                  style={[styles.chipInfo, { backgroundColor: "rgba(255,255,255,0.92)" }]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipInfoTxt, { color: pal.accentDark }]}>ℹ️ Horario, ubicación y pagos</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Cómo pedir: tres renglones, sólo la primera vez que alguien abre
                el menú de este negocio. Se va sola al primer producto. */}
            {verGuia === true && (
              <View style={[styles.guia, { backgroundColor: pal.soft, borderColor: pal.accent + "33" }]}>
                <View style={styles.guiaHead}>
                  <Text style={[styles.guiaTitulo, { color: pal.accentDark }]}>Cómo pedir aquí</Text>
                  <TouchableOpacity onPress={cerrarGuia} hitSlop={10} accessibilityLabel="Cerrar la guía">
                    <Text style={styles.guiaCerrar}>×</Text>
                  </TouchableOpacity>
                </View>
                {[
                  "Toca Agregar en lo que se te antoje.",
                  "Revisa tu total abajo, en la barra de color.",
                  DELIVERY_ACTIVO
                    ? "Confirma tu pedido y te llega a domicilio."
                    : "Mándalo por WhatsApp. El negocio te confirma y te dice cuánto tarda.",
                ].map((txt, i) => (
                  <View key={txt} style={styles.guiaPaso}>
                    <View style={[styles.guiaNum, { backgroundColor: pal.accent }]}>
                      <Text style={[styles.guiaNumTxt, { color: pal.on }]}>{i + 1}</Text>
                    </View>
                    <Text style={styles.guiaTxt}>{txt}</Text>
                  </View>
                ))}
                <Text style={styles.guiaPie}>
                  {DELIVERY_ACTIVO ? "Cuenta rápida con teléfono + PIN." : "Sin registro · sin comisiones."}
                </Text>
              </View>
            )}

            </View>

            {/* ── 2. Buscador sticky + chips de categoría ─────────────────── */}
            <View style={styles.stickyWrap}>
              <View style={styles.buscador}>
                <Text style={styles.lupa}>🔍</Text>
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="¿Qué se te antoja?"
                  placeholderTextColor="#9CA3AF"
                  style={styles.buscadorInput}
                  returnKeyType="search"
                />
                {/* Tachita: borrar letra por letra en el celular es la
                    fricción más tonta que puede tener un buscador. */}
                {q.length > 0 && (
                  <TouchableOpacity onPress={() => setQ("")} style={styles.clear} hitSlop={8} accessibilityLabel="Limpiar búsqueda">
                    <Text style={styles.clearTxt}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
              {!buscando && categorias.length > 1 && (
                <ScrollView
                  ref={chipsRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {categorias.map((c) => {
                    const on = catActiva === c.id;
                    return (
                      <Boton3D
                        key={c.id}
                        onPress={() => irA(c.id)}
                        color={on ? pal.accent : "#ffffff"}
                        shadow={on ? pal.shadow : "rgba(0,0,0,0.10)"}
                        style={styles.chipCat}
                      >
                        <Text style={[styles.chipCatTxt, { color: on ? pal.on : "#4B5563" }]}>
                          {c.nombre} <Text style={{ opacity: 0.5 }}>{c.ofertas.length}</Text>
                        </Text>
                      </Boton3D>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* ── 3. Secciones ───────────────────────────────────────────── */}
            <View style={styles.main} onLayout={(e) => { mainY.current = e.nativeEvent.layout.y; }}>
              {categorias.length === 0 && (
                <Text style={styles.vacio}>Este negocio aún no tiene productos en su menú.</Text>
              )}
              {buscando && filtradas.length === 0 && (
                <Text style={styles.vacio}>Sin resultados para “{q}”.</Text>
              )}

              {filtradas.map((c) => {
                const abierta = buscando || c.completa || expandidas.has(c.id);
                const visibles = abierta ? c.ofertas : c.ofertas.slice(0, PREVIEW);
                return (
                  <View
                    key={c.id}
                    style={styles.seccion}
                    onLayout={(e) => { posiciones.current[c.id] = e.nativeEvent.layout.y; }}
                  >
                    <Text style={styles.seccionTitulo}>{c.nombre}</Text>
                    <View style={[styles.seccionRaya, { backgroundColor: pal.accent }]} />

                    {visibles.map((of) => {
                      const { producto, precio } = of;
                      const tieneExtras = (producto.variantes && producto.variantes.length > 0) || (producto.modificadores && producto.modificadores.length > 0);
                      const requiereModal = tieneExtras || !!producto.permite_fraccion || !!producto.permite_por_dinero;
                      const itemSimple = !requiereModal
                        ? items.find((i) => i.producto_id === producto.id && i.puesto_id === precio.puesto_id && !i.variante_id && i.modificadores.length === 0)
                        : null;
                      const claveSimple = !requiereModal ? claveItemCarrito(producto.id, precio.puesto_id, null, []) : null;
                      return (
                        <MenuProductoCard
                          key={`${c.id}:${producto.id}`}
                          oferta={of}
                          pal={pal}
                          enCarrito={itemSimple?.cantidad ?? 0}
                          requiereModal={requiereModal}
                          favorito={esFavorito("producto", producto.id)}
                          onFavorito={() => alternar("producto", producto.id)}
                          onAgregar={() => manejarAgregar(of)}
                          onCambiarCantidad={claveSimple ? (delta) => cambiarCantidad(claveSimple, delta) : undefined}
                          onVerDetalle={() => setDetalleModal(of)}
                        />
                      );
                    })}

                    {/* "Mostrar todo (12)" en vez de "Ver 9 más": el número que
                        le importa al cliente es cuántos platillos hay, no
                        cuántos le estamos escondiendo. */}
                    {!buscando && !c.completa && c.ofertas.length > PREVIEW && (
                      <Boton3D
                        onPress={() => alternarCat(c.id)}
                        color={pal.accent}
                        shadow={pal.shadow}
                        style={styles.verTodo}
                      >
                        <Text style={[styles.verTodoTxt, { color: pal.on }]}>
                          {abierta ? "Mostrar menos ▲" : `Mostrar todo (${c.ofertas.length}) ▾`}
                        </Text>
                      </Boton3D>
                    )}
                  </View>
                );
              })}

              <Text style={styles.pie}>Menú digital gratis · Mercadito 🛵</Text>
            </View>
          </ScrollView>
        )}

        {/* Barra fija. Con delivery, al carrito y checkout normal; sin él, el
            pedido sale por WhatsApp al negocio, que confirma y entrega. */}
        {hayBarra && (
          <View style={[styles.barraWrap, { bottom: insets.bottom + 12 }]}>
            {DELIVERY_ACTIVO ? (
              <Boton3D
                onPress={() => router.push("/(tabs)/carrito")}
                color={pal.accent}
                shadow={pal.shadow}
                alto={3}
                style={styles.barra}
              >
                <View style={styles.barraFila}>
                  <Text style={styles.barraTxt}>🛒 Ver carrito ({enCarritoCount})</Text>
                  <Text style={styles.barraTxt}>${total.toFixed(2)}</Text>
                </View>
              </Boton3D>
            ) : (
              <>
                <Boton3D onPress={pedirPorWhatsApp} color="#25D366" shadow="#128C7E" alto={3} style={styles.barra}>
                  <View style={styles.barraFila}>
                    <View style={styles.barraIzq}>
                      <View style={styles.barraNum}>
                        <Text style={styles.barraNumTxt}>
                          {itemsPuesto.reduce((s, i) => s + (i.monto_solicitado != null ? 1 : i.cantidad), 0)}
                        </Text>
                      </View>
                      <Text style={styles.barraTotal}>${totalPuesto.toFixed(2)}</Text>
                    </View>
                    <Text style={styles.barraTxt}>Pedir por WhatsApp →</Text>
                  </View>
                </Boton3D>
                {/* Salida por llamada: no hay forma de saber si el número tiene
                    WhatsApp, así que damos las dos vías en vez de adivinar. */}
                {telLlamada && (
                  <TouchableOpacity onPress={() => Linking.openURL(telLlamada)} activeOpacity={0.7}>
                    <Text style={styles.barraLlamar}>¿No te abre WhatsApp? Llama al negocio</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}
      </View>

      <FichaNegocio visible={verFicha} puesto={puesto} pal={pal} onClose={() => setVerFicha(false)} />

      <ProductoVarianteModal
        visible={!!varianteModal}
        producto={varianteModal?.producto ?? null}
        puestoId={varianteModal?.puestoId ?? null}
        onClose={() => setVarianteModal(null)}
        onAgregar={({ variante, modificadores, cantidadInicial, montoSolicitado }: {
          variante: ProductoVariante | null;
          modificadores: SeleccionModificador[];
          cantidadInicial?: number;
          montoSolicitado?: number | null;
        }) => {
          if (!varianteModal) return;
          agregar(varianteModal.producto, varianteModal.puestoId, { variante, modificadores, cantidadInicial, montoSolicitado });
        }}
      />

      {(() => {
        const prod = detalleModal?.producto ?? null;
        const precio = detalleModal?.precio ?? null;
        const tieneExtras = !!prod && ((prod.variantes && prod.variantes.length > 0) || (prod.modificadores && prod.modificadores.length > 0));
        const requiereModal = tieneExtras || !!prod?.permite_fraccion || !!prod?.permite_por_dinero;
        const enCarrito = prod && precio && !requiereModal
          ? items.find((i) => i.producto_id === prod.id && i.puesto_id === precio.puesto_id && !i.variante_id && i.modificadores.length === 0)
          : null;
        const claveSimple = prod && precio && !requiereModal ? claveItemCarrito(prod.id, precio.puesto_id, null, []) : null;
        return (
          <ProductoDetalleClienteModal
            visible={!!detalleModal}
            producto={prod}
            precio={precio}
            enCarrito={enCarrito?.cantidad ?? 0}
            requiereModal={requiereModal}
            onClose={() => setDetalleModal(null)}
            onAgregar={() => {
              if (!prod || !precio) return;
              if (requiereModal) {
                setDetalleModal(null);
                setVarianteModal({ producto: prod, puestoId: precio.puesto_id });
              } else {
                agregar(prod, precio.puesto_id);
              }
            }}
            onCambiarCantidad={claveSimple ? (delta) => cambiarCantidad(claveSimple, delta) : undefined}
          />
        );
      })()}
    </>
  );
}

/** Tarjeta de platillo del menú — misma anatomía que la web: foto cuadrada a
 *  la izquierda con el corazón encima, nombre + precio, descripción a dos
 *  líneas, chips y el botón de agregar con sombra dura. */
function MenuProductoCard({
  oferta, pal, enCarrito, requiereModal, favorito, onFavorito, onAgregar, onCambiarCantidad, onVerDetalle,
}: {
  oferta: Oferta;
  pal: PaletaMarca;
  enCarrito: number;
  requiereModal: boolean;
  favorito: boolean;
  onFavorito: () => void;
  onAgregar: () => void;
  onCambiarCantidad?: (delta: number) => void;
  onVerDetalle: () => void;
}) {
  const { producto, precio, vendidos } = oferta;
  const esEmoji = !!producto.imagen && producto.imagen.startsWith("emoji:");
  const imagen = producto.imagen && !esEmoji ? (resolverImagen(producto.imagen) ?? producto.imagen) : null;
  const variaPrecio = (producto.variantes?.length ?? 0) > 0 || (producto.modificadores?.length ?? 0) > 0;

  return (
    <Pressable onPress={onVerDetalle} style={styles.card}>
      <View style={styles.fotoWrap}>
        <View style={[styles.foto, !imagen && !esEmoji ? { backgroundColor: pal.soft } : null]}>
          {imagen ? (
            <Image source={{ uri: imagen }} style={styles.fotoImg} />
          ) : esEmoji ? (
            <Text style={styles.fotoEmoji}>{producto.imagen!.slice(6)}</Text>
          ) : (
            <Text style={[styles.fotoInicial, { color: pal.accent }]}>{producto.nombre.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        {/* Favorito: se guarda en el dispositivo y, con sesión, en la cuenta.
            Sobre la foto y no junto al precio para que no compita con el CTA. */}
        <TouchableOpacity
          onPress={onFavorito}
          style={styles.favBtn}
          hitSlop={8}
          accessibilityLabel={favorito ? `Quitar ${producto.nombre} de favoritos` : `Guardar ${producto.nombre} en favoritos`}
        >
          <Ionicons name={favorito ? "heart" : "heart-outline"} size={16} color={favorito ? "#E1306C" : "#9CA3AF"} />
        </TouchableOpacity>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTitulo}>
          <Text style={styles.cardNombre} numberOfLines={2}>{producto.nombre}</Text>
          <View style={{ alignItems: "flex-end" }}>
            {variaPrecio && <Text style={styles.desde}>Desde</Text>}
            {/* Con promo activa se tacha el de lista: sin el "antes", un precio
                bajo no se lee como oferta, sólo como precio. */}
            {precio.precio_antes != null && (
              <Text style={styles.precioAntes}>${Number(precio.precio_antes).toFixed(0)}</Text>
            )}
            <Text style={[styles.cardPrecio, precio.precio_antes != null && styles.cardPrecioPromo]}>
              ${precio.precio.toFixed(0)}
            </Text>
          </View>
        </View>

        {producto.descripcion ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{producto.descripcion}</Text>
        ) : null}

        <View style={styles.cardChips}>
          {/* Prueba social del propio menú. Desde 3 para que un solo pedido no
              corone a nadie. */}
          {precio.promo_etiqueta ? (
            <View style={styles.chipPromo}><Text style={styles.chipPromoTxt}>🔥 {precio.promo_etiqueta}</Text></View>
          ) : null}
          {vendidos >= 3 && (
            <View style={styles.chipTop}><Text style={styles.chipTopTxt}>🔥 De los más pedidos</Text></View>
          )}
          {precio.precio_mayoreo != null && precio.mayoreo_desde != null && (
            <View style={styles.chipMayoreo}>
              <Text style={styles.chipMayoreoTxt}>
                🏷️ {precio.mayoreo_desde} o más a ${Number(precio.precio_mayoreo).toFixed(0)} c/u
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardAccion}>
          {!requiereModal && enCarrito > 0 && onCambiarCantidad ? (
            <View style={[styles.stepper, { backgroundColor: pal.accent, borderColor: pal.shadow }]}>
              <TouchableOpacity onPress={() => onCambiarCantidad(-1)} style={styles.stepBtn} hitSlop={4} accessibilityLabel="Quitar uno">
                <Text style={[styles.stepTxt, { color: pal.on }]}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.stepNum, { color: pal.on }]}>{enCarrito}</Text>
              <TouchableOpacity onPress={() => onCambiarCantidad(1)} style={styles.stepBtn} hitSlop={4} accessibilityLabel="Agregar uno">
                <Text style={[styles.stepTxt, { color: pal.on }]}>+</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Boton3D
              onPress={onAgregar}
              color={pal.accent}
              shadow={pal.shadow}
              style={styles.addBtn}
              accessibilityLabel={`Agregar ${producto.nombre}`}
            >
              <Text style={[styles.addBtnTxt, { color: pal.on }]}>
                {requiereModal ? "Personalizar +" : "Agregar +"}
              </Text>
            </Boton3D>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f7f8" },

  // ── hero ────────────────────────────────────────────────────────────
  hero: { paddingHorizontal: 16, paddingBottom: 14, overflow: "hidden" },
  banda: { position: "absolute", left: 0, right: 0, bottom: 0 },
  backBtn: {
    width: 34, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  heroFila: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  logoBox: {
    width: 72, height: 72, borderRadius: 20, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.35)",
  },
  logo: { width: 72, height: 72, resizeMode: "cover" },
  logoInicial: { fontSize: 30, fontWeight: "800", color: "#fff" },
  nombre: { fontSize: 24, fontWeight: "800", color: "#fff", letterSpacing: -0.4, lineHeight: 27 },
  ubicacion: { fontSize: 12.5, color: "rgba(255,255,255,0.92)", marginTop: 4 },
  desc: { fontSize: 12.5, color: "rgba(255,255,255,0.88)", marginTop: 3, lineHeight: 17 },
  descMas: { fontSize: 12, color: "#fff", fontWeight: "700", textDecorationLine: "underline", marginTop: 2 },
  favNegocio: {
    width: 34, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  chipsInfo: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  chipInfo: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chipInfoTxt: { fontSize: 11.5, fontWeight: "700" },
  chipAbierto: { backgroundColor: "#DCFCE7" },
  chipAbiertoTxt: { color: "#15803D" },
  chipCerrado: { backgroundColor: "#FEE2E2" },
  chipCerradoTxt: { color: "#B91C1C" },
  chipWa: { backgroundColor: "#E7F9EF" },
  chipWaTxt: { color: "#128C7E" },

  guia: { marginHorizontal: 14, marginTop: 12, borderRadius: 16, borderWidth: 1, padding: 13 },
  guiaHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
  guiaTitulo: { fontSize: 13, fontWeight: "800" },
  guiaCerrar: { fontSize: 20, color: "#9CA3AF", lineHeight: 20 },
  guiaPaso: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginBottom: 6 },
  guiaNum: { width: 18, height: 18, borderRadius: 999, alignItems: "center", justifyContent: "center", marginTop: 1 },
  guiaNumTxt: { fontSize: 10, fontWeight: "800" },
  guiaTxt: { flex: 1, fontSize: 12.5, color: "#374151", lineHeight: 17 },
  guiaPie: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },

  // ── buscador sticky + chips ─────────────────────────────────────────
  stickyWrap: {
    backgroundColor: "#f7f7f8", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.08)",
  },
  buscador: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fff", borderRadius: 999, borderWidth: 1, borderColor: "rgba(0,0,0,0.10)",
    paddingHorizontal: 14, paddingVertical: 4,
  },
  lupa: { fontSize: 13 },
  buscadorInput: { flex: 1, fontSize: 14, color: "#1F2937", paddingVertical: 7 },
  clear: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  clearTxt: { fontSize: 17, color: "#6B7280", fontWeight: "700", lineHeight: 19 },
  chipsRow: { gap: 8, paddingTop: 10, paddingRight: 4 },
  chipCat: { paddingHorizontal: 14, paddingVertical: 7 },
  chipCatTxt: { fontSize: 12, fontWeight: "700" },

  // ── secciones ───────────────────────────────────────────────────────
  main: { paddingHorizontal: 14, paddingTop: 16 },
  seccion: { marginBottom: 22 },
  seccionTitulo: { fontSize: 21, fontWeight: "800", color: "#1F2937", letterSpacing: -0.4 },
  seccionRaya: { height: 5, width: 40, borderRadius: 999, marginTop: 7, marginBottom: 12 },
  vacio: { textAlign: "center", color: "#9CA3AF", paddingVertical: 44 },
  verTodo: { marginTop: 10, paddingVertical: 12, alignItems: "center" },
  verTodoTxt: { fontSize: 13.5, fontWeight: "800" },
  pie: { textAlign: "center", color: "#9CA3AF", fontSize: 11.5, paddingBottom: 8 },

  // ── tarjeta ─────────────────────────────────────────────────────────
  card: {
    flexDirection: "row", gap: 12, backgroundColor: "#fff", borderRadius: 22, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.04)",
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  fotoWrap: { width: 92, height: 92 },
  foto: { width: 92, height: 92, borderRadius: 18, overflow: "hidden", backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  fotoImg: { width: 92, height: 92, resizeMode: "cover" },
  fotoEmoji: { fontSize: 40 },
  fotoInicial: { fontSize: 30, fontWeight: "800", opacity: 0.55 },
  favBtn: {
    position: "absolute", top: -6, left: -6, width: 30, height: 30, borderRadius: 999,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitulo: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  cardNombre: { flex: 1, fontSize: 15.5, fontWeight: "700", color: "#1F2937", lineHeight: 20 },
  desde: { fontSize: 10, color: "#9CA3AF", fontWeight: "500" },
  cardPrecio: { fontSize: 15, fontWeight: "700", color: "#1F2937", fontVariant: ["tabular-nums"] },
  cardDesc: { fontSize: 12.5, color: "#6B7280", lineHeight: 17, marginTop: 5 },
  cardChips: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 7 },
  precioAntes: { fontSize: 11, color: "#9CA3AF", textDecorationLine: "line-through", fontVariant: ["tabular-nums"] },
  cardPrecioPromo: { color: "#B91C1C" },
  chipPromo: { backgroundColor: "#FEF2F2", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  chipPromoTxt: { fontSize: 10.5, fontWeight: "800", color: "#B91C1C" },
  chipTop: { backgroundColor: "#FFFBEB", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  chipTopTxt: { fontSize: 10.5, fontWeight: "800", color: "#B45309" },
  chipMayoreo: { backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  chipMayoreoTxt: { fontSize: 10.5, fontWeight: "800", color: "#047857" },
  cardAccion: { flexDirection: "row", justifyContent: "flex-end", marginTop: 9 },
  addBtn: { paddingHorizontal: 15, paddingVertical: 8 },
  addBtnTxt: { fontSize: 13, fontWeight: "800" },
  stepper: { flexDirection: "row", alignItems: "center", borderRadius: 999, borderBottomWidth: 2, borderRightWidth: 2 },
  stepBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  stepTxt: { fontSize: 19, fontWeight: "800", lineHeight: 22 },
  stepNum: { minWidth: 22, textAlign: "center", fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },

  // ── barra fija ──────────────────────────────────────────────────────
  barraWrap: { position: "absolute", left: 14, right: 14 },
  barra: { paddingVertical: 13, paddingHorizontal: 18 },
  barraFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  barraIzq: { flexDirection: "row", alignItems: "center", gap: 9 },
  barraNum: { minWidth: 28, height: 28, paddingHorizontal: 7, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  barraNumTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  barraTxt: { color: "#fff", fontWeight: "800", fontSize: 14.5 },
  barraTotal: { color: "#fff", fontWeight: "800", fontSize: 16, fontVariant: ["tabular-nums"] },
  barraLlamar: { textAlign: "center", color: "#4B5563", fontSize: 12, fontWeight: "600", marginTop: 8, textDecorationLine: "underline" },
});
