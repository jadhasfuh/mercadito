import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { theme } from "../lib/theme";
import { CATEGORIAS_SERVICIOS } from "../lib/categorias";
import { listarNegocios, type Negocio } from "../api/citas";
import { resolverImagen, esLogoPlaceholder } from "../lib/imgUrl";
import { useBusqueda } from "../contexts/BusquedaContext";
import MapaTiendasRN from "./MapaTiendasRN";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function catInfoServicio(id: string | null) {
  if (id && CATEGORIAS_SERVICIOS[id]) return CATEGORIAS_SERVICIOS[id];
  const nombre = (id ?? "otros").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { nombre, icon: "calendar-outline" as const };
}

// Cache de módulo: persiste mientras la app vive, para no recargar negocios
// cada vez que se alterna a Citas.
let _negociosCache: Negocio[] | null = null;
let _coordsCache: { lat: number; lng: number } | null = null;

export default function ServiciosHome() {
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  // Ícono de categoría proporcional al ancho del tile (≈46% de su lado),
  // centrado y escalando con la pantalla; antes era fijo de 30px (se veía chico).
  const catIconSize = Math.round(Math.min(Math.max(screenW * (screenW >= 768 ? 0.23 : 0.31) * 0.46, 38), 80));
  const { query } = useBusqueda();
  const busqueda = query.trim().toLowerCase();
  // Cache de módulo: al alternar Mercadito↔Citas reusa los negocios y revalida
  // en segundo plano (sin spinner ni recarga).
  const [negocios, setNegocios] = useState<Negocio[]>(_negociosCache ?? []);
  const [loading, setLoading] = useState(!_negociosCache);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [soloAbierto, setSoloAbierto] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(_coordsCache);

  useEffect(() => {
    listarNegocios()
      .then((d) => {
        setNegocios(d);
        _negociosCache = d;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // Ubicación best-effort para ordenar por cercanía (no bloquea si la niega).
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }) : null))
      .then((pos) => {
        if (pos) {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(c);
          _coordsCache = c;
        }
      })
      .catch(() => {});
  }, []);

  // Categorías presentes (solo las que tienen negocios).
  const categorias = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of negocios) {
      const k = n.categoria_servicio || "otros";
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([id, n]) => ({ id, n }));
  }, [negocios]);

  // Lista filtrada (cuando hay búsqueda o categoría elegida).
  const lista = useMemo(() => {
    let arr = negocios.slice();
    if (busqueda) {
      arr = arr.filter(
        (n) =>
          n.nombre.toLowerCase().includes(busqueda) ||
          catInfoServicio(n.categoria_servicio).nombre.toLowerCase().includes(busqueda)
      );
    } else if (categoria) {
      arr = arr.filter((n) => (n.categoria_servicio || "otros") === categoria);
    }
    if (soloAbierto) arr = arr.filter((n) => n.abierto_ahora);
    if (coords) {
      arr.sort((a, b) => {
        const da = a.lat != null && a.lng != null ? haversineKm(coords.lat, coords.lng, a.lat, a.lng) : Infinity;
        const db = b.lat != null && b.lng != null ? haversineKm(coords.lat, coords.lng, b.lat, b.lng) : Infinity;
        return da - db;
      });
    }
    return arr;
  }, [negocios, busqueda, categoria, soloAbierto, coords]);

  if (loading) return <ActivityIndicator color={theme.colors.serv} style={{ marginTop: 24 }} />;

  if (negocios.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="calendar-outline" size={40} color={theme.colors.gray300} />
        <Text style={styles.emptyTxt}>Aún no hay negocios de citas en tu zona.</Text>
      </View>
    );
  }

  const mostrarLista = !!busqueda || !!categoria;

  // ── Vista de categorías (Inicio sin búsqueda ni categoría elegida) ──
  if (!mostrarLista) {
    return (
      <View>
        <Text style={styles.sectionTitle}>¿Qué necesitas?</Text>
        <View style={styles.tilesGrid}>
          {categorias.map(({ id }) => {
            const info = catInfoServicio(id);
            return (
              <TouchableOpacity key={id} style={styles.tile} onPress={() => setCategoria(id)} activeOpacity={0.85}>
                <Ionicons name={info.icon} size={catIconSize} color={theme.colors.serv} />
                <Text style={styles.tileTxt} numberOfLines={2}>
                  {info.nombre}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  // ── Vista de lista (categoría elegida o búsqueda) ──
  return (
    <View>
      <View style={styles.listHeader}>
        {busqueda ? (
          <Text style={styles.listTitle} numberOfLines={1}>
            Resultados
          </Text>
        ) : (
          <TouchableOpacity style={styles.backTitulo} onPress={() => setCategoria(null)} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.gray800} />
            <Text style={styles.listTitle} numberOfLines={1}>
              {catInfoServicio(categoria).nombre}
            </Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[styles.abiertoChip, soloAbierto && styles.abiertoChipOn]}
          onPress={() => setSoloAbierto((v) => !v)}
        >
          <Ionicons name="time-outline" size={14} color={soloAbierto ? "#fff" : theme.colors.serv} />
          <Text style={[styles.abiertoTxt, soloAbierto && { color: "#fff" }]}>Abierto</Text>
        </TouchableOpacity>
      </View>

      {/* Mapa con los negocios (igual que Mercadito al entrar a una categoría) */}
      {lista.some((n) => n.lat != null && n.lng != null) && (
        <View style={styles.mapaWrap}>
          <MapaTiendasRN
            tiendas={lista
              .filter((n) => n.lat != null && n.lng != null)
              .map((n) => ({ id: n.id, nombre: n.nombre, lat: n.lat as number, lng: n.lng as number, abierto: n.abierto_ahora }))}
            onTiendaPress={(id) => router.push(`/negocio/${id}`)}
            altura={200}
          />
        </View>
      )}

      {lista.length === 0 ? (
        <Text style={styles.emptyTxt}>No hay negocios que coincidan.</Text>
      ) : (
        lista.map((n) => {
          const logo = n.logo && !esLogoPlaceholder(n.logo) ? resolverImagen(n.logo) : null;
          const nServ = Number(n.n_servicios) || 0;
          const desde = n.desde_precio != null ? Number(n.desde_precio) : null;
          const km =
            coords && n.lat != null && n.lng != null ? haversineKm(coords.lat, coords.lng, n.lat, n.lng) : null;
          return (
            <TouchableOpacity
              key={n.id}
              style={[styles.card, theme.shadow.sm]}
              onPress={() => router.push(`/negocio/${n.id}`)}
              activeOpacity={0.85}
            >
              <View style={styles.cardLogo}>
                {logo ? <Image source={{ uri: logo }} style={styles.cardLogoImg} /> : <Ionicons name="cut" size={26} color={theme.colors.serv} />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardNombre} numberOfLines={1}>
                    {n.nombre}
                  </Text>
                  <View style={[styles.estadoDot, { backgroundColor: n.abierto_ahora ? theme.colors.accent : theme.colors.gray400 }]} />
                  <Text style={[styles.estadoTxt, { color: n.abierto_ahora ? theme.colors.accentDark : theme.colors.gray500 }]}>
                    {n.abierto_ahora ? "Abierto" : "Cerrado"}
                  </Text>
                </View>
                {!!n.ubicacion && (
                  <Text style={styles.cardUbic} numberOfLines={1}>
                    <Ionicons name="location-outline" size={12} color={theme.colors.gray500} /> {n.ubicacion}
                  </Text>
                )}
                <View style={styles.cardMeta}>
                  <Text style={styles.cardMetaTxt}>
                    {nServ} {nServ === 1 ? "servicio" : "servicios"}
                  </Text>
                  {desde != null && <Text style={styles.cardMetaTxt}>· desde ${desde}</Text>}
                  {km != null && <Text style={styles.cardMetaTxt}>· {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}</Text>}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.gray400} />
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...theme.typography.h3, color: theme.colors.gray800, marginBottom: theme.spacing.sm, marginTop: theme.spacing.xs },
  tilesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "31%",
    minHeight: 104,
    backgroundColor: theme.colors.servBg,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  tileTxt: {
    ...theme.typography.caption,
    color: theme.colors.servDark,
    textAlign: "center",
    width: "100%",
    marginTop: 8,
  },
  mapaWrap: { borderRadius: theme.radius.lg, overflow: "hidden", marginBottom: 12 },
  listHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  backTitulo: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: -6 },
  listTitle: { ...theme.typography.h3, color: theme.colors.gray900 },
  abiertoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.serv,
  },
  abiertoChipOn: { backgroundColor: theme.colors.serv },
  abiertoTxt: { ...theme.typography.caption, color: theme.colors.serv, fontFamily: theme.fontFamily.semibold },
  empty: { alignItems: "center", gap: 10, paddingVertical: 32 },
  emptyTxt: { ...theme.typography.body, color: theme.colors.gray500, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 12, marginBottom: 10 },
  cardLogo: { width: 52, height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.servLight, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  cardLogoImg: { width: 52, height: 52 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardNombre: { ...theme.typography.title, color: theme.colors.gray900, flexShrink: 1 },
  estadoDot: { width: 7, height: 7, borderRadius: 4 },
  estadoTxt: { ...theme.typography.caption },
  cardUbic: { ...theme.typography.bodySmall, color: theme.colors.gray500, marginTop: 2 },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  cardMetaTxt: { ...theme.typography.caption, color: theme.colors.serv },
});
