import { View, Text, Image, StyleSheet, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import SearchBar from "./SearchBar";
import { useBusqueda } from "../contexts/BusquedaContext";

interface Props {
  /** Si se pasa, se muestra como título en lugar de la barra de búsqueda.
   *  Útil para pantallas auxiliares (registro-tienda, checkout, etc.) donde
   *  buscar productos no aplica. */
  title?: string;
}

// Header naranja brand consistente en todas las pantallas (paridad con
// src/components/Header.tsx en web). Por defecto: logo + searchbar global
// — escribir desde cualquier tab navega a home con el query.
export default function AppHeader({ title }: Props = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { query, setQuery } = useBusqueda();

  function handleChange(v: string) {
    setQuery(v);
    if (v.length > 0 && pathname !== "/home" && !pathname.endsWith("/home")) {
      router.push("/(tabs)/home");
    }
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="light" />
      <Image source={require("../../assets/icon.png")} style={styles.logo} resizeMode="contain" />
      {title ? (
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      ) : (
        <View style={{ flex: 1 }}>
          <SearchBar value={query} onChange={handleChange} placeholder="Buscar producto, tienda…" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: "#ED8E3C",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 3 },
    }),
  },
  logo: { width: 36, height: 36, borderRadius: 8 },
  title: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "700", letterSpacing: -0.2 },
});
