import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { listarProductosCliente, listarPuestos, type Producto, type Puesto, type PrecioInfo } from "../../src/api/catalogo";
import { useCart } from "../../src/contexts/CartContext";
import { claveItemCarrito, type SeleccionModificador } from "../../src/lib/variantes";
import type { ProductoVariante } from "../../src/lib/variantes";
import { resolverImagen } from "../../src/lib/imgUrl";
import { labelCiudad } from "../../src/lib/ciudades";
import ProductCardCompacta from "../../src/components/ProductCardCompacta";
import ProductoVarianteModal from "../../src/components/ProductoVarianteModal";
import ProductoDetalleClienteModal from "../../src/components/ProductoDetalleClienteModal";
import Loader from "../../src/components/Loader";
import { DELIVERY_ACTIVO } from "../../src/lib/flags";
import { linkPedidoWhatsApp, linkLlamada } from "../../src/lib/pedidoWhatsApp";
import { apiFetch } from "../../src/api/client";

interface Oferta { producto: Producto; precio: PrecioInfo }
// Modelo del menú (mismo que src/lib/menu.ts en web): `subseccion` es el
// grupo GRANDE ("Desayunos") y `seccion` el chico ("Chilaquiles"). El mapa
// va grupo grande → grupo chico → ofertas; la clave "" = sin valor.
type Agrupado = Map<string, Map<string, Oferta[]>>;

/**
 * Menú nativo de una tienda — el destino de /menus. Productos de la tienda
 * agrupados por sección → subsección (estilo carta de restaurante), agregando
 * al carrito de siempre. "Ver carrito" manda al tab Carrito → checkout normal;
 * no hay handoff como en web porque aquí el carrito ya es nativo.
 */
export default function MenuTiendaScreen() {
  const { puestoId } = useLocalSearchParams<{ puestoId: string }>();
  const router = useRouter();
  const { items, agregar, cambiarCantidad, total } = useCart();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [puesto, setPuesto] = useState<Puesto | null>(null);
  const [loading, setLoading] = useState(true);
  const [varianteModal, setVarianteModal] = useState<{ producto: Producto; puestoId: string } | null>(null);
  const [detalleModal, setDetalleModal] = useState<Oferta | null>(null);

  useEffect(() => {
    if (!puestoId) return;
    Promise.all([listarProductosCliente(), listarPuestos()])
      .then(([prods, puestos]) => {
        setProductos(prods);
        setPuesto(puestos.find((p) => p.id === puestoId) ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [puestoId]);

  const grupos: Agrupado = useMemo(() => {
    const g: Agrupado = new Map();
    for (const producto of productos) {
      const precio = producto.precios.find((pr) => pr.puesto_id === puestoId);
      if (!precio) continue;
      const sec = producto.subseccion?.trim() || "";
      const sub = producto.seccion?.trim() || "";
      if (!g.has(sec)) g.set(sec, new Map());
      const subMap = g.get(sec)!;
      if (!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub)!.push({ producto, precio });
    }
    // Secciones con nombre primero (orden alfabético), lo sin sección al final.
    return new Map(
      [...g.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    );
  }, [productos, puestoId]);

  const totalProductos = useMemo(
    () => [...grupos.values()].reduce((s, sub) => s + [...sub.values()].reduce((x, o) => x + o.length, 0), 0),
    [grupos]
  );

  const logo = puesto?.logo ? resolverImagen(puesto.logo) ?? puesto.logo : null;
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

  const pedirPorWhatsApp = () => {
    if (!waPedido) return;
    // Atribución: el negocio ve cuántos pedidos le generó su menú.
    apiFetch(`/api/menu/${puestoId}/evento`, {
      method: "POST",
      body: JSON.stringify({ tipo: "pedido" }),
    }).catch(() => {});
    Linking.openURL(waPedido);
  };

  function manejarAgregar({ producto, precio }: Oferta) {
    const tieneExtras = (producto.variantes && producto.variantes.length > 0) || (producto.modificadores && producto.modificadores.length > 0);
    const requiereModal = tieneExtras || !!producto.permite_fraccion || !!producto.permite_por_dinero;
    if (requiereModal) setVarianteModal({ producto, puestoId: precio.puesto_id });
    else agregar(producto, precio.puesto_id);
  }

  return (
    <>
      <Stack.Screen options={{ title: puesto?.nombre ?? "Menú" }} />
      <View style={styles.safe}>
        {loading ? (
          <Loader />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>
            {/* Encabezado del negocio */}
            <View style={styles.header}>
              <View style={styles.logoBox}>
                {logo ? <Image source={{ uri: logo }} style={styles.logo} /> : <Text style={{ fontSize: 28 }}>🍽️</Text>}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.nombre}>{puesto?.nombre ?? "Menú"}</Text>
                {puesto?.descripcion ? <Text style={styles.desc} numberOfLines={2}>{puesto.descripcion}</Text> : null}
                <Text style={styles.meta}>
                  📍 {labelCiudad(puesto?.ciudad)}{puesto ? (puesto.abierto_ahora ? " · 🟢 Abierta" : " · ⚪ Cerrada") : ""}
                </Text>
              </View>
            </View>

            {totalProductos === 0 && (
              <Text style={styles.vacio}>Este negocio aún no tiene productos en su menú.</Text>
            )}

            {[...grupos.entries()].map(([sec, subMap]) => (
              <View key={sec || "_sin"}>
                <Text style={styles.seccion}>{sec || (grupos.size > 1 ? "Otros" : "Menú")}</Text>
                {[...subMap.entries()].map(([sub, ofertas]) => (
                  <View key={sub || "_sin"}>
                    {sub ? <Text style={styles.subseccion}>{sub}</Text> : null}
                    {ofertas.map((of) => {
                      const { producto, precio } = of;
                      const tieneExtras = (producto.variantes && producto.variantes.length > 0) || (producto.modificadores && producto.modificadores.length > 0);
                      const requiereModal = tieneExtras || !!producto.permite_fraccion || !!producto.permite_por_dinero;
                      const itemSimple = !requiereModal
                        ? items.find((i) => i.producto_id === producto.id && i.puesto_id === precio.puesto_id && !i.variante_id && i.modificadores.length === 0)
                        : null;
                      const claveSimple = !requiereModal ? claveItemCarrito(producto.id, precio.puesto_id, null, []) : null;
                      return (
                        <View key={`${producto.id}:${precio.puesto_id}`} style={{ marginBottom: 8 }}>
                          <ProductCardCompacta
                            producto={producto}
                            precio={precio}
                            enCarrito={itemSimple?.cantidad ?? 0}
                            tieneExtras={!!tieneExtras}
                            onAgregar={() => manejarAgregar(of)}
                            onCambiarCantidad={claveSimple ? (delta) => cambiarCantidad(claveSimple, delta) : undefined}
                            onVerDetalle={() => setDetalleModal(of)}
                          />
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        )}

        {/* Barra flotante. Con delivery, al carrito y checkout normal; sin él,
            el pedido sale por WhatsApp al negocio, que confirma y entrega. */}
        {items.length > 0 && (DELIVERY_ACTIVO ? (
          <TouchableOpacity style={styles.barraCarrito} onPress={() => router.push("/(tabs)/carrito")} activeOpacity={0.9}>
            <Text style={styles.barraTxt}>🛒 Ver carrito ({enCarritoCount})</Text>
            <Text style={styles.barraTotal}>${total.toFixed(2)}</Text>
          </TouchableOpacity>
        ) : waPedido ? (
          <View style={styles.barraWrap}>
            <TouchableOpacity style={[styles.barraCarrito, styles.barraWa, styles.barraRel]} onPress={pedirPorWhatsApp} activeOpacity={0.9}>
              <Text style={styles.barraTxt}>💬 Pedir por WhatsApp ({enCarritoCount})</Text>
              <Text style={styles.barraTotal}>${totalPuesto.toFixed(2)}</Text>
            </TouchableOpacity>
            {/* Salida por llamada: no hay forma de saber si el número tiene
                WhatsApp, así que damos las dos vías en vez de adivinar. */}
            {telLlamada && (
              <TouchableOpacity onPress={() => Linking.openURL(telLlamada)} activeOpacity={0.7}>
                <Text style={styles.barraLlamar}>¿No te abre WhatsApp? Llama al negocio</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null)}
      </View>

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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FCFBFA" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 14, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  logoBox: { width: 64, height: 64, borderRadius: 14, backgroundColor: "#FFF1E5", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logo: { width: 64, height: 64, resizeMode: "cover" },
  nombre: { fontSize: 17, fontWeight: "800", color: "#1F2937" },
  desc: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  meta: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  vacio: { textAlign: "center", color: "#9CA3AF", paddingVertical: 40 },
  seccion: { fontSize: 16, fontWeight: "800", color: "#1F2937", marginTop: 10, marginBottom: 8 },
  subseccion: { fontSize: 13, fontWeight: "700", color: "#8B7B69", marginBottom: 6, marginTop: 2 },
  barraCarrito: { position: "absolute", left: 12, right: 12, bottom: 20, backgroundColor: "#ED8E3C", borderRadius: 999, paddingVertical: 14, paddingHorizontal: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  // Verde de WhatsApp: el botón lleva a otra app, y el color lo anuncia.
  barraWa: { backgroundColor: "#25D366" },
  // Con la salida por llamada debajo, el botón deja de posicionarse solo:
  // lo hace el contenedor, y el botón vuelve a flujo normal.
  barraWrap: { position: "absolute", left: 12, right: 12, bottom: 20 },
  barraRel: { position: "relative", left: 0, right: 0, bottom: 0 },
  barraLlamar: { textAlign: "center", color: "#4B5563", fontSize: 12, fontWeight: "600", marginTop: 8, textDecorationLine: "underline" },
  barraTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  barraTotal: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
