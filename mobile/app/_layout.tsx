import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { SessionProvider } from "../src/contexts/SessionContext";
import { CartProvider } from "../src/contexts/CartContext";

// Foreground: mostrar alerta y sonar al recibir push.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    // Si se abre la app desde una notificación con data.pedidoId, en el futuro podemos
    // navegar directo al pedido. Por ahora solo logueamos.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.pedidoId) {
        // TODO: router.push(`/pedido/${data.pedidoId}`)
      }
    });
    return () => sub.remove();
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
            <Stack.Screen name="login" options={{ title: "Entrar" }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(repartidor)" options={{ headerShown: false }} />
            <Stack.Screen name="(tienda)" options={{ headerShown: false }} />
            <Stack.Screen name="checkout" options={{ title: "Confirmar pedido", presentation: "modal" }} />
          </Stack>
        </CartProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
