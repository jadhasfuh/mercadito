import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "../../src/api/client";
import { theme } from "../../src/lib/theme";

const BASE_URL = "https://mercadito.cx";

interface Resp {
  producto: { id: string; nombre: string; descripcion: string | null; unidad: string | null; tiene_foto: boolean };
  ofertas: { puesto_id: string; puesto_nombre: string; precio: number }[];
}

/**
 * Pantalla de producto compartible (target de los universal links
 * https://mercadito.cx/producto/<id> y del esquema mercadito://producto/<id>).
 * Muestra el producto + tiendas que lo venden, con CTA para entrar al
 * catálogo. El endpoint /api/productos/[id] es público (sin sesión).
 */
export default function ProductoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Resp | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");

  useEffect(() => {
    if (!id) return;
    apiFetch<Resp>(`/api/productos/${id}`)
      .then((r) => { setData(r); setEstado("ok"); })
      .catch(() => setEstado("error"));
  }, [id]);

  const irAlCatalogo = () => router.replace("/(tabs)/home" as never);

  if (estado === "cargando") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.brand} />
      </View>
    );
  }

  if (estado === "error" || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.emoji}>😕</Text>
        <Text style={styles.errorTxt}>Este producto ya no está disponible.</Text>
        <TouchableOpacity onPress={irAlCatalogo} style={styles.cta}>
          <Text style={styles.ctaTxt}>Ver el catálogo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { producto, ofertas } = data;
  const precioMin = Math.min(...ofertas.map((o) => o.precio));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {producto.tiene_foto ? (
        <Image
          source={{ uri: `${BASE_URL}/api/productos/${producto.id}/imagen` }}
          style={styles.imagen}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.imagen, styles.imagenPlaceholder]}>
          <Ionicons name="image-outline" size={48} color="#D4C9B8" />
        </View>
      )}

      <Text style={styles.nombre}>{producto.nombre}</Text>
      <Text style={styles.precio}>
        Desde ${precioMin}
        {producto.unidad ? <Text style={styles.unidad}> / {producto.unidad}</Text> : null}
      </Text>
      {producto.descripcion ? <Text style={styles.descripcion}>{producto.descripcion}</Text> : null}

      <View style={styles.tiendasBox}>
        <Text style={styles.tiendasTitulo}>
          {ofertas.length === 1 ? "Disponible en" : `Disponible en ${ofertas.length} tiendas`}
        </Text>
        {ofertas.map((o) => (
          <View key={o.puesto_id} style={styles.tiendaRow}>
            <Text style={styles.tiendaNombre}>🏪 {o.puesto_nombre}</Text>
            <Text style={styles.tiendaPrecio}>${o.precio}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity onPress={irAlCatalogo} style={styles.cta}>
        <Text style={styles.ctaTxt}>Pedir en Mercadito 🛵</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream ?? "#FAF6F0" },
  content: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: theme.colors.cream ?? "#FAF6F0" },
  emoji: { fontSize: 40 },
  errorTxt: { color: "#4B5563", textAlign: "center" },
  imagen: { width: "100%", height: 260, borderRadius: 16, backgroundColor: "#fff" },
  imagenPlaceholder: { alignItems: "center", justifyContent: "center" },
  nombre: { fontSize: 22, fontWeight: "800", color: "#1F2937", marginTop: 4 },
  precio: { fontSize: 18, fontWeight: "800", color: theme.colors.brandDark ?? "#C2410C" },
  unidad: { fontSize: 13, fontWeight: "400", color: "#9CA3AF" },
  descripcion: { fontSize: 14, color: "#4B5563", lineHeight: 20 },
  tiendasBox: { backgroundColor: "#fff", borderRadius: 16, padding: 14, marginTop: 6 },
  tiendasTitulo: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  tiendaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F3F4F6" },
  tiendaNombre: { fontSize: 14, color: "#374151" },
  tiendaPrecio: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  cta: { backgroundColor: theme.colors.brand, paddingVertical: 15, borderRadius: 14, alignItems: "center", marginTop: 10 },
  ctaTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
