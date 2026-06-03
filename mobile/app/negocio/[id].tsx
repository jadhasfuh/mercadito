import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { theme } from "../../src/lib/theme";
import { listarNegocios, listarServicios, type Negocio, type Servicio } from "../../src/api/citas";
import { resolverImagen, esLogoPlaceholder } from "../../src/lib/imgUrl";

// Ficha de un negocio de servicios. Usa el header nativo del Stack (igual que
// "Mandar paquete"), tintado en índigo. El cuerpo muestra info + servicios.
export default function NegocioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([listarNegocios(), listarServicios(id)])
      .then(([negs, servs]) => {
        setNegocio(negs.find((n) => n.id === id) ?? null);
        setServicios(servs.filter((s) => s.activo));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const logo = negocio?.logo && !esLogoPlaceholder(negocio.logo) ? resolverImagen(negocio.logo) : null;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: negocio?.nombre ?? "Negocio",
          headerStyle: { backgroundColor: theme.colors.serv },
          headerTintColor: "#fff",
          headerTitleStyle: { color: "#fff", fontFamily: theme.fontFamily.bold },
        }}
      />

      {loading ? (
        <ActivityIndicator color={theme.colors.serv} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          {/* Info del negocio */}
          <View style={[styles.infoCard, theme.shadow.sm]}>
            <View style={styles.logoBox}>
              {logo ? <Image source={{ uri: logo }} style={styles.logoImg} /> : <Ionicons name="cut" size={28} color={theme.colors.serv} />}
            </View>
            <View style={{ flex: 1 }}>
              {!!negocio?.ubicacion && (
                <Text style={styles.ubic} numberOfLines={2}>
                  <Ionicons name="location-outline" size={13} color={theme.colors.gray500} /> {negocio.ubicacion}
                </Text>
              )}
              {!!negocio?.descripcion && <Text style={styles.desc}>{negocio.descripcion}</Text>}
            </View>
          </View>

          {/* Un solo botón Agendar: el flujo deja elegir cuántas personas y el
              servicio de cada una. */}
          {servicios.length > 0 && (
            <TouchableOpacity
              style={styles.agendarGrande}
              onPress={() => router.push(`/agendar/${id}`)}
              activeOpacity={0.85}
            >
              <Ionicons name="calendar" size={18} color="#fff" />
              <Text style={styles.agendarGrandeTxt}>Agendar cita</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionTitle}>Servicios</Text>
          {servicios.length === 0 ? (
            <Text style={styles.empty}>Este negocio aún no publicó servicios.</Text>
          ) : (
            servicios.map((s) => (
              <View key={s.id} style={[styles.servCard, theme.shadow.sm]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.servNombre}>{s.nombre}</Text>
                  {!!s.descripcion && (
                    <Text style={styles.servDesc} numberOfLines={3}>
                      {s.descripcion}
                    </Text>
                  )}
                  <View style={styles.servMeta}>
                    <Ionicons name="time-outline" size={13} color={theme.colors.gray500} />
                    <Text style={styles.servMetaTxt}>{s.duracion_min} min</Text>
                    {s.precio != null ? (
                      <Text style={styles.servPrecio}>${Number(s.precio)}</Text>
                    ) : (
                      <Text style={styles.servMetaTxt}>· a consultar</Text>
                    )}
                  </View>
                </View>
              </View>
            ))
          )}

          {negocio?.tipo === "ambos" && (
            <View style={styles.ambosNota}>
              <Ionicons name="basket-outline" size={16} color={theme.colors.brand} />
              <Text style={styles.ambosNotaTxt}>Este negocio también vende productos. Encuéntralos en el modo Mercado.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  infoCard: { flexDirection: "row", gap: 14, backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 16, marginBottom: 20 },
  logoBox: { width: 64, height: 64, borderRadius: 16, backgroundColor: theme.colors.servLight, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImg: { width: 64, height: 64 },
  ubic: { ...theme.typography.bodySmall, color: theme.colors.gray500 },
  desc: { ...theme.typography.body, color: theme.colors.gray600, marginTop: 6 },
  llamarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: theme.colors.serv,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: theme.radius.pill,
    marginTop: 12,
  },
  llamarTxt: { ...theme.typography.buttonSmall, color: "#fff" },
  agendarGrande: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.serv,
    borderRadius: theme.radius.lg,
    paddingVertical: 15,
    marginBottom: 20,
  },
  agendarGrandeTxt: { ...theme.typography.button, color: "#fff" },
  sectionTitle: { ...theme.typography.h3, color: theme.colors.gray800, marginBottom: 12 },
  empty: { ...theme.typography.body, color: theme.colors.gray500, paddingVertical: 16 },
  servCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 14, marginBottom: 10 },
  servNombre: { ...theme.typography.title, color: theme.colors.gray900 },
  servDesc: { ...theme.typography.bodySmall, color: theme.colors.gray500, marginTop: 2 },
  servMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  servMetaTxt: { ...theme.typography.caption, color: theme.colors.gray500 },
  servPrecio: { ...theme.typography.title, color: theme.colors.serv, marginLeft: 4 },
  agendarBtn: { backgroundColor: theme.colors.serv, paddingVertical: 10, paddingHorizontal: 16, borderRadius: theme.radius.md },
  agendarTxt: { ...theme.typography.buttonSmall, color: "#fff" },
  ambosNota: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.brandBg, borderRadius: theme.radius.md, padding: 12, marginTop: 16 },
  ambosNotaTxt: { ...theme.typography.bodySmall, color: theme.colors.navy, flex: 1 },
});
