import { useEffect } from "react";
import { Alert, Linking } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/contexts/SessionContext";
import { CartProvider } from "../src/contexts/CartContext";
import { configurarHandlerNotificaciones } from "../src/api/push";
import { checkForUpdate } from "../src/api/version";

export default function RootLayout() {
  useEffect(() => {
    configurarHandlerNotificaciones();
    // Check de versión al arrancar — si hay una más nueva, alertamos.
    // Si falla la red, no molestamos (checkForUpdate devuelve null).
    checkForUpdate().then((status) => {
      if (!status || !status.needsUpdate) return;
      const titulo = status.blocking ? "Versión obsoleta" : "Nueva versión disponible";
      const cuerpo = status.blocking
        ? `Tu versión ya no es compatible. Descarga la ${status.info.latest} para seguir usando la app.`
        : `Mercadito ${status.info.latest} ya está disponible${status.info.notas ? `: ${status.info.notas}.` : "."} Descárgala cuando quieras.`;
      Alert.alert(
        titulo,
        cuerpo,
        status.blocking
          ? [{ text: "Descargar", onPress: () => Linking.openURL(status.info.apkUrl) }]
          : [
              { text: "Después", style: "cancel" },
              { text: "Descargar", onPress: () => Linking.openURL(status.info.apkUrl) },
            ],
        { cancelable: !status.blocking }
      );
    }).catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <CartProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: "#FFF7EB" },
              headerTitleStyle: { fontWeight: "700" },
            }}
          >
            <Stack.Screen name="index" options={{ title: "Mercadito" }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(repartidor)" options={{ headerShown: false }} />
            <Stack.Screen name="(tienda)" options={{ headerShown: false }} />
            <Stack.Screen name="(admin)" options={{ headerShown: false }} />
            <Stack.Screen name="checkout" options={{ title: "Confirmar pedido", presentation: "modal" }} />
            <Stack.Screen name="agregar-producto" options={{ title: "Nuevo producto", presentation: "modal" }} />
          </Stack>
        </CartProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
