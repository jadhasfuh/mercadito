import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { theme } from "../lib/theme";
import { useSession } from "../contexts/SessionContext";
import { listarThreads, limpiarChats, eliminarChatThread, type ThreadCliente, type ThreadTienda } from "../api/citas";
import { resolverImagen, esLogoPlaceholder } from "../lib/imgUrl";
import { fmtCitaCorta } from "../lib/citasFmt";

// Cuerpo reutilizable de la lista de conversaciones. Lo usan app/chats.tsx
// (apilada, con back) y (tabs)/mensajes.tsx (tab).
export default function ChatsView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { usuario } = useSession();
  const esTienda = usuario?.rol === "tienda" || usuario?.rol === "admin";
  const [threads, setThreads] = useState<(ThreadCliente | ThreadTienda)[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    listarThreads()
      .then(setThreads)
      .catch(() => setThreads([]))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function tituloDe(t: ThreadCliente | ThreadTienda): string {
    return (
      (t as ThreadTienda).cliente_nombre ||
      (t as ThreadTienda).cliente_telefono ||
      (t as ThreadCliente).puesto_nombre ||
      ""
    );
  }
  const filtrados = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return threads;
    return threads.filter((t) => tituloDe(t).toLowerCase().includes(n));
  }, [threads, q]);

  function borrarThread(t: ThreadCliente | ThreadTienda) {
    const titulo = tituloDe(t);
    Alert.alert("Borrar conversación", `¿Borrar la conversación con ${titulo}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          try {
            const tt = t as ThreadTienda;
            const tc = t as ThreadCliente;
            await eliminarChatThread(esTienda ? { cliente_telefono: tt.cliente_telefono } : { puesto_id: tc.puesto_id });
            load();
          } catch {
            Alert.alert("Ups", "No se pudo borrar.");
          }
        },
      },
    ]);
  }

  function limpiar() {
    Alert.alert("Limpiar mensajes", "¿Borrar todas tus conversaciones? No se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Limpiar",
        style: "destructive",
        onPress: async () => {
          try {
            await limpiarChats();
            load();
          } catch {
            Alert.alert("Ups", "No se pudo limpiar.");
          }
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator color={theme.colors.serv} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
      {threads.length > 0 && (
        <View style={styles.toolbar}>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={theme.colors.gray400} />
            <TextInput style={styles.search} placeholder="Buscar conversación…" placeholderTextColor={theme.colors.gray400} value={q} onChangeText={setQ} />
          </View>
          <TouchableOpacity style={styles.limpiar} onPress={limpiar}>
            <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      )}
      {threads.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.gray300} />
          <Text style={styles.emptyTxt}>No tienes conversaciones todavía.</Text>
        </View>
      ) : (
        filtrados.map((t, i) => {
        const noLeidos = Number(t.no_leidos) || 0;
        if (esTienda) {
          const tt = t as ThreadTienda;
          return (
            <Fila
              key={tt.cliente_telefono || i}
              inicial={(tt.cliente_nombre || "?").charAt(0)}
              titulo={tt.cliente_nombre || tt.cliente_telefono}
              ultimo={tt.ultimo_texto}
              fecha={tt.created_at}
              noLeidos={noLeidos}
              onPress={() =>
                router.push(
                  `/chat/${usuario?.puesto_id}?clienteTelefono=${encodeURIComponent(
                    tt.cliente_telefono
                  )}&titulo=${encodeURIComponent(tt.cliente_nombre || tt.cliente_telefono)}`
                )
              }
              onDelete={() => borrarThread(t)}
            />
          );
        }
        const tc = t as ThreadCliente;
        const logo = tc.logo && !esLogoPlaceholder(tc.logo) ? resolverImagen(tc.logo) : null;
        return (
          <Fila
            key={tc.puesto_id || i}
            logo={logo}
            inicial={(tc.puesto_nombre || "?").charAt(0)}
            titulo={tc.puesto_nombre}
            ultimo={tc.ultimo_texto}
            fecha={tc.created_at}
            noLeidos={noLeidos}
            onPress={() => router.push(`/chat/${tc.puesto_id}?titulo=${encodeURIComponent(tc.puesto_nombre)}`)}
            onDelete={() => borrarThread(t)}
          />
        );
        })
      )}
    </ScrollView>
  );
}

function Fila({
  logo,
  inicial,
  titulo,
  ultimo,
  fecha,
  noLeidos,
  onPress,
  onDelete,
}: {
  logo?: string | null;
  inicial: string;
  titulo: string;
  ultimo: string;
  fecha: string;
  noLeidos: number;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.fila, theme.shadow.sm]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.avatar}>
        {logo ? <Image source={{ uri: logo }} style={styles.avatarImg} /> : <Text style={styles.avatarTxt}>{inicial.toUpperCase()}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.filaTop}>
          <Text style={styles.filaTitulo} numberOfLines={1}>
            {titulo}
          </Text>
          <Text style={styles.filaFecha}>{fmtCitaCorta(fecha)}</Text>
        </View>
        <Text
          style={[styles.filaUltimo, noLeidos > 0 && { color: theme.colors.gray900, fontFamily: theme.fontFamily.semibold }]}
          numberOfLines={1}
        >
          {ultimo}
        </Text>
      </View>
      {noLeidos > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>{noLeidos}</Text>
        </View>
      )}
      <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.filaTrash}>
        <Ionicons name="trash-outline" size={18} color={theme.colors.gray400} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyTxt: { ...theme.typography.body, color: theme.colors.gray500 },
  filaTrash: { padding: 4, marginLeft: 2 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  searchWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.white, borderRadius: theme.radius.md, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.gray200 },
  search: { flex: 1, paddingVertical: 10, ...theme.typography.body, color: theme.colors.gray900 },
  limpiar: { width: 40, height: 40, borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.colors.danger, alignItems: "center", justifyContent: "center" },
  fila: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.white, borderRadius: theme.radius.lg, padding: 12, marginBottom: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.servLight, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 48, height: 48 },
  avatarTxt: { ...theme.typography.h3, color: theme.colors.serv },
  filaTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  filaTitulo: { ...theme.typography.title, color: theme.colors.gray900, flex: 1 },
  filaFecha: { ...theme.typography.caption, color: theme.colors.gray400 },
  filaUltimo: { ...theme.typography.bodySmall, color: theme.colors.gray500, marginTop: 2 },
  badge: { backgroundColor: theme.colors.serv, borderRadius: 999, minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeTxt: { ...theme.typography.caption, color: "#fff", fontFamily: theme.fontFamily.bold },
});
