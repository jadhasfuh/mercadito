import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/contexts/SessionContext";
import { CartProvider } from "../src/contexts/CartContext";
import { configurarHandlerNotificaciones } from "../src/api/push";

export default function RootLayout() {
  useEffect(() => {
    configurarHandlerNotificaciones();
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
            <Stack.Screen name="checkout" options={{ title: "Confirmar pedido", presentation: "modal" }} />
            <Stack.Screen name="(tienda)/agregar-producto" options={{ title: "Nuevo producto", presentation: "modal" }} />
          </Stack>
        </CartProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
