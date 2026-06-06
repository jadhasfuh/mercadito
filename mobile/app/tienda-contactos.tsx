import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, Stack } from "expo-router";
import { theme } from "../src/lib/theme";
import { listarCitas, type Cita } from "../src/api/citas";
import { fmtCitaCorta } from "../src/lib/citasFmt";

interface Contacto {
  nombre: string;
  telefono: string;
  total: number;
  ultima: string; // ISO de la cita más reciente
}

// Lista de contactos del negocio: todos los clientes que han agendado, con
// botón para llamar. Se deriva de las citas (sin tabla extra).
export default function TiendaContactosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [citas, setCitas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    listarCitas()
      .then(setCitas)
      .catch(() => setCitas([]))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const contactos = useMemo(() => {
    const map = new Map<string, Contacto>();
    for (const c of citas) {
      const key = c.cliente_telefono;
      const prev = map.get(key);
      if (prev) {
        prev.total += 1;
        if (new Date(c.inicio) > new Date(prev.ultima)) prev.ultima = c.inicio;
      } else {
        map.set(key, { nombre: c.cliente_nombre, telefono: key, total: 1, ultima: c.inicio });
      }
    }
    let arr = Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      arr = arr.filter((c) => c.nombre.toLowerCase().includes(needle) || c.telefono.includes(needle));
    }
    return arr;
  }, [citas, q]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ title: "Contactos" }} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.gray800} />
        </TouchableOpacity>
        <Text style={styles.titulo}>Contactos</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={theme.colors.gray400} />
        <TextInput
          style={styles.search}
          placeholder="Buscar cliente…"
          placeholderTextColor={theme.colors.gray400}
          value={q}
          onChangeText={setQ}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.serv} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
          {contactos.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={44} color={theme.colors.gray300} />
              <Text style={styles.emptyTxt}>Aún no tienes contactos. Aparecerán al recibir reservas.</Text>
            </View>
          ) : (
            contactos.map((c) => (
              <View key={c.telefono} style={[styles.card, theme.shadow.sm]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarTxt}>{c.nombre.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{c.nombre}</Text>
                  <Text style={styles.meta}>
                    {c.telefono} · {c.total} {c.total === 1 ? "reserva" : "reservas"} · últ. {fmtCitaCorta(c.ultima)}
                  </Text>
                </View>
                <View style={styles.contactoAcciones}>
                  <TouchableOpacity
                    style={[styles.iconCircle, { backgroundColor: "#25D366" }]}
                    onPress={() => Linking.openURL(`https://wa.me/52${c.telefono}`)}
                  >
                    <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconCircle, { backgroundColor: theme.colors.accent }]}
                    onPress={() => Linking.openURL(`tel:${c.telefono}`)}
                  >
                    <Ionicons name="call" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  titulo: { ...theme.typography.h3, color: theme.colors.gray900 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.gray200,
  },
  search: { flex: 1, paddingVertical: 12, ...theme.typography.body, color: theme.colors.gray900 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 32 },
  emptyTxt: { ...theme.typography.body, color: theme.colors.gray500, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 12, marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.servLight, alignItems: "center", justifyContent: "center" },
  avatarTxt: { ...theme.typography.h3, color: theme.colors.serv },
  nombre: { ...theme.typography.title, color: theme.colors.gray900 },
  meta: { ...theme.typography.bodySmall, color: theme.colors.gray500, marginTop: 2 },
  contactoAcciones: { flexDirection: "row", gap: 8 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
