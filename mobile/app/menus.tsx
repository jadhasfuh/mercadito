import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Image, Alert } from "react-native";
import { Stack, useRouter } from "expo-router";
import { listarPuestos, type Puesto } from "../src/api/catalogo";
import { labelCiudad } from "../src/lib/ciudades";
import { porCercania, pedirUbicacion, formatKm, ORIGEN_DEFAULT, RADIO_KM, type Origen } from "../src/lib/cercania";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolverImagen } from "../src/lib/imgUrl";
import Loader from "../src/components/Loader";
import { apiFetch } from "../src/api/client";

type PuestoDir = Puesto;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Directorio de menús — espejo de /menus en web. Lista las tiendas con menú
 * público; al picar una abre /menu/[puestoId] (menú nativo agrupado por
 * sección, agrega al carrito de siempre).
 */
/** Pantalla completa (ruta suelta, con su header nativo). */
export default function MenusScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Menús" }} />
      <MenusView />
    </>
  );
}

/** El directorio sin su cabecera de Stack, para poder incrustarlo. Sin
 *  delivery, el Inicio de la app lo reusa: encontrar un negocio ES la
 *  primera acción del producto, y el catálogo de productos que había antes
 *  llevaba a un carrito sin checkout. */
export function MenusView({ busquedaExterna }: { busquedaExterna?: string } = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [loading, setLoading] = useState(true);
  // Cuando se incrusta en el Inicio, el buscador vive en el header naranja y
  // el texto llega por prop: si no, quedaban DOS cajas de búsqueda apiladas.
  const [busquedaLocal, setBusquedaLocal] = useState("");
  const enHeader = busquedaExterna !== undefined;
  const busqueda = enHeader ? busquedaExterna : busquedaLocal;
  const setBusqueda = setBusquedaLocal;
  // Desde dónde medimos. Arranca en Sahuayo y se afina con el GPS si lo dan.
  const [origen, setOrigen] = useState<Origen>(ORIGEN_DEFAULT);
  const [pidiendoGps, setPidiendoGps] = useState(false);
  const [verLejanos, setVerLejanos] = useState(false);
  // Negocios que venden algo que coincide con la búsqueda: { puestoId: [
  // "Hamburguesa doble", …] }. Se consulta al servidor porque el nombre del
  // producto no viene en el listado de negocios.
  const [porProducto, setPorProducto] = useState<Record<string, string[]>>({});

  useEffect(() => {
    listarPuestos()
      // Sin categorías = sin ningún producto activo → no hay menú que mostrar.
      .then((data) => setPuestos(data.filter((p) =>
        p.aprobado !== false && p.menu_publico !== false && (p.categorias?.length ?? 0) > 0
      )))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Se pregunta una vez al entrar. Negar el permiso no bloquea nada: seguimos
  // con Sahuayo y el usuario puede ver el resto con "más lejos".
  useEffect(() => {
    let vivo = true;
    pedirUbicacion().then((o) => { if (vivo && o) setOrigen(o); });
    return () => { vivo = false; };
  }, []);

  // Búsqueda por producto, con debounce para no pegarle al servidor en cada
  // tecla. Si falla, la búsqueda por nombre sigue funcionando sola.
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) { setPorProducto({}); return; }
    let vivo = true;
    const t = setTimeout(() => {
      apiFetch<{ id: string; coincidencias: string[] }[]>(`/api/menus/buscar?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (!vivo) return;
          setPorProducto(Object.fromEntries(r.map((x) => [x.id, x.coincidencias])));
        })
        .catch(() => { if (vivo) setPorProducto({}); });
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [busqueda]);

  async function usarGps() {
    setPidiendoGps(true);
    const o = await pedirUbicacion();
    setPidiendoGps(false);
    if (o) setOrigen(o);
    else Alert.alert("Sin ubicación", "Activa el permiso de ubicación para ver los negocios más cercanos a ti.");
  }

  const { visibles, lejos } = useMemo(() => {
    const ordenar = (xs: { item: PuestoDir; km: number | null; cerca: boolean }[]) =>
      [...xs].sort((a, b) => Number(b.item.abierto_ahora) - Number(a.item.abierto_ahora));

    // Buscar ignora la distancia: quien escribe algo concreto lo quiere,
    // esté donde esté. Al nombre del negocio se suman los que VENDEN eso —
    // la gente busca "hamburguesa", no el nombre de la taquería.
    if (busqueda.trim()) {
      const q = norm(busqueda);
      const filtrados = puestos.filter(
        (p) => norm(`${p.nombre} ${p.descripcion ?? ""}`).includes(q) || porProducto[p.id] !== undefined
      );
      return { visibles: ordenar(porCercania(origen, filtrados)), lejos: [] as ReturnType<typeof porCercania<PuestoDir>> };
    }
    const todos = porCercania(origen, puestos);
    return {
      visibles: ordenar(todos.filter((x) => x.cerca)),
      lejos: ordenar(todos.filter((x) => !x.cerca)),
    };
  }, [puestos, origen, busqueda, porProducto]);

  const lista = verLejanos && !busqueda.trim() ? [...visibles, ...lejos] : visibles;

  return (
    <>
      <View style={styles.safe}>
        <View style={styles.filtros}>
          {!enHeader && (
            <TextInput
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="🔍 Busca un negocio…"
              placeholderTextColor="#9C8B72"
              style={styles.buscador}
            />
          )}
          {/* Dónde estás. Reemplaza a los chips de ciudad: sin entregas lo que
              importa es la distancia, no el municipio. */}
          <View style={styles.ubicRow}>
            <Text style={{ fontSize: 15 }}>📍</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.ubicTitulo}>
                {origen.fuente === "gps" ? "Cerca de ti" : "Cerca de Sahuayo"}
              </Text>
              <Text style={styles.ubicSub}>Negocios a menos de {RADIO_KM} km</Text>
            </View>
            {origen.fuente !== "gps" && (
              <TouchableOpacity onPress={usarGps} disabled={pidiendoGps} style={styles.ubicBtn}>
                <Text style={styles.ubicBtnTxt}>{pidiendoGps ? "…" : "Usar mi GPS"}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading ? (
          <Loader />
        ) : (
          <FlatList
            data={lista}
            keyExtractor={({ item: p }) => p.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 40 + insets.bottom }}
            ListEmptyComponent={
              <Text style={styles.vacio}>
                {busqueda.trim()
                  ? "No encontramos negocios ni productos con esa palabra."
                  : `Todavía no hay negocios a menos de ${RADIO_KM} km de aquí.`}
              </Text>
            }
            // Los de fuera del radio no se esconden: se ofrecen aparte, para
            // que nadie pierda un negocio que ya conoce por 2 km de más.
            ListFooterComponent={
              !busqueda.trim() && lejos.length > 0 && !verLejanos ? (
                <TouchableOpacity onPress={() => setVerLejanos(true)} style={{ paddingVertical: 14 }}>
                  <Text style={styles.verMas}>Ver {lejos.length} negocios más lejos</Text>
                </TouchableOpacity>
              ) : null
            }
            renderItem={({ item: { item: p, km } }) => {
              const logo = p.logo ? resolverImagen(p.logo) ?? p.logo : null;
              return (
                <TouchableOpacity style={styles.card} onPress={() => router.push(`/menu/${p.id}`)} activeOpacity={0.85}>
                  <View style={styles.logoBox}>
                    {logo ? <Image source={{ uri: logo }} style={styles.logo} /> : <Text style={{ fontSize: 24 }}>🍽️</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.nombre} numberOfLines={1}>{p.nombre}</Text>
                    {/* Al buscar por producto, decir QUÉ hizo match: si no, el
                        negocio aparece y no se entiende por qué. */}
                    {porProducto[p.id]?.length ? (
                      <Text style={styles.match} numberOfLines={1}>
                        Vende: {porProducto[p.id].join(", ")}
                      </Text>
                    ) : p.descripcion ? (
                      <Text style={styles.desc} numberOfLines={1}>{p.descripcion}</Text>
                    ) : null}
                    <Text style={styles.ciudad}>
                      📍 {labelCiudad(p.ciudad)}
                      {formatKm(km) ? <Text style={styles.km}> · a {formatKm(km)}</Text> : null}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View style={[styles.badge, p.abierto_ahora ? styles.badgeAbierta : styles.badgeCerrada]}>
                      <Text style={[styles.badgeTxt, p.abierto_ahora ? styles.badgeTxtAbierta : styles.badgeTxtCerrada]}>
                        {p.abierto_ahora ? "Abierta" : "Cerrada"}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FCFBFA" },
  filtros: { padding: 12, paddingBottom: 4, gap: 8 },
  buscador: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14 },
  ubicRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  ubicTitulo: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  ubicSub: { fontSize: 11, color: "#9CA3AF" },
  ubicBtn: { backgroundColor: "#FFF1E5", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  ubicBtnTxt: { fontSize: 11, fontWeight: "800", color: "#9A4A12" },
  km: { color: "#9A4A12", fontWeight: "700" },
  match: { fontSize: 12, color: "#047857", fontWeight: "600", marginTop: 2 },
  verMas: { textAlign: "center", color: "#9A4A12", fontWeight: "800", fontSize: 13, textDecorationLine: "underline" },
  vacio: { textAlign: "center", color: "#9CA3AF", paddingVertical: 48 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 16, padding: 12, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  logoBox: { width: 56, height: 56, borderRadius: 12, backgroundColor: "#FFF1E5", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logo: { width: 56, height: 56, resizeMode: "cover" },
  nombre: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  desc: { fontSize: 12, color: "#6B7280", marginTop: 1 },
  ciudad: { fontSize: 11, color: "#9CA3AF", marginTop: 3 },
  badge: { paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 999 },
  badgeAbierta: { backgroundColor: "#ECFDF5" },
  badgeCerrada: { backgroundColor: "#F3F4F6" },
  badgeTxt: { fontSize: 10, fontWeight: "700" },
  badgeTxtAbierta: { color: "#047857" },
  badgeTxtCerrada: { color: "#6B7280" },
  chevron: { fontSize: 18, color: "#D1D5DB", lineHeight: 20 },
});
