import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { listarPuestos } from "../../src/api/catalogo";
import Loader from "../../src/components/Loader";
import { theme } from "../../src/lib/theme";

const BASE_URL = "https://mercadito.cx";

/**
 * Destino de los links de menú compartidos: https://mercadito.cx/m/<slug>
 * (universal link en iOS, app link en Android) y mercadito://m/<slug>.
 *
 * La web usa el slug bonito en la URL y la app navega por id de puesto, así
 * que esta pantalla solo traduce uno en otro y redirige al menú nativo. Si la
 * tienda no existe o ya no es pública, ofrecemos abrirla en el navegador en
 * lugar de dejar al usuario en una pantalla muerta.
 */
export default function MenuPorSlugScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let vivo = true;
    listarPuestos()
      .then((puestos) => {
        if (!vivo) return;
        const p = puestos.find((x) => x.menu_slug === slug || x.id === slug);
        if (p) router.replace(`/menu/${p.id}`);
        else setError(true);
      })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [slug, router]);

  if (!error) {
    return (
      <>
        <Stack.Screen options={{ title: "Menú" }} />
        <Loader fullScreen texto="Abriendo el menú…" />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Menú" }} />
      <View style={styles.center}>
        <Text style={styles.titulo}>No encontramos ese menú</Text>
        <Text style={styles.texto}>Puede que la tienda ya no esté disponible en la app.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => Linking.openURL(`${BASE_URL}/m/${slug}`)}>
          <Text style={styles.btnTxt}>Abrir en el navegador</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace("/(tabs)/home")}>
          <Text style={styles.link}>Ir al inicio</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: theme.colors.cream },
  titulo: { fontSize: 17, fontWeight: "800", color: "#1F2937", textAlign: "center" },
  texto: { fontSize: 13, color: "#6B7280", textAlign: "center", marginTop: 8 },
  btn: { marginTop: 20, backgroundColor: theme.colors.brand, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12 },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  link: { marginTop: 16, color: "#6B7280", fontSize: 13, textDecorationLine: "underline" },
});
