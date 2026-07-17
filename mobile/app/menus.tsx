import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Image } from "react-native";
import { Stack, useRouter } from "expo-router";
import { listarPuestos, type Puesto } from "../src/api/catalogo";
import { CIUDADES, labelCiudad } from "../src/lib/ciudades";
import { resolverImagen } from "../src/lib/imgUrl";
import Loader from "../src/components/Loader";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Directorio de menús — espejo de /menus en web. Lista las tiendas con menú
 * público; al picar una abre /menu/[puestoId] (menú nativo agrupado por
 * sección, agrega al carrito de siempre).
 */
export default function MenusScreen() {
  const router = useRouter();
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [ciudad, setCiudad] = useState<string | null>(null);

  useEffect(() => {
    listarPuestos()
      .then((data) => setPuestos(data.filter((p) => p.aprobado !== false && p.menu_publico !== false)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visibles = useMemo(() => {
    let lista = puestos;
    if (ciudad) lista = lista.filter((p) => (p.ciudad || "sahuayo") === ciudad);
    if (busqueda.trim()) {
      const q = norm(busqueda);
      lista = lista.filter((p) => norm(`${p.nombre} ${p.descripcion ?? ""}`).includes(q));
    }
    // Abiertas primero, luego alfabético.
    return [...lista].sort(
      (a, b) => Number(b.abierto_ahora) - Number(a.abierto_ahora) || a.nombre.localeCompare(b.nombre)
    );
  }, [puestos, ciudad, busqueda]);

  return (
    <>
      <Stack.Screen options={{ title: "Menús" }} />
      <View style={styles.safe}>
        <View style={styles.filtros}>
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="🔍 Busca un negocio…"
            placeholderTextColor="#9C8B72"
            style={styles.buscador}
          />
          <View style={styles.chipsRow}>
            <TouchableOpacity
              onPress={() => setCiudad(null)}
              style={[styles.chip, ciudad === null && styles.chipActive]}
            >
              <Text style={[styles.chipTxt, ciudad === null && styles.chipTxtActive]}>Todas</Text>
            </TouchableOpacity>
            {CIUDADES.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setCiudad((prev) => (prev === c.id ? null : c.id))}
                style={[styles.chip, ciudad === c.id && styles.chipActive]}
              >
                <Text style={[styles.chipTxt, ciudad === c.id && styles.chipTxtActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <Loader />
        ) : (
          <FlatList
            data={visibles}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
            ListEmptyComponent={<Text style={styles.vacio}>No encontramos negocios con ese nombre.</Text>}
            renderItem={({ item: p }) => {
              const logo = p.logo ? resolverImagen(p.logo) ?? p.logo : null;
              return (
                <TouchableOpacity style={styles.card} onPress={() => router.push(`/menu/${p.id}`)} activeOpacity={0.85}>
                  <View style={styles.logoBox}>
                    {logo ? <Image source={{ uri: logo }} style={styles.logo} /> : <Text style={{ fontSize: 24 }}>🍽️</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.nombre} numberOfLines={1}>{p.nombre}</Text>
                    {p.descripcion ? <Text style={styles.desc} numberOfLines={1}>{p.descripcion}</Text> : null}
                    <Text style={styles.ciudad}>📍 {labelCiudad(p.ciudad)}</Text>
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
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: "#E5E7EB", backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#FFF1E5", borderColor: "#ED8E3C" },
  chipTxt: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  chipTxtActive: { color: "#9A4A12" },
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
