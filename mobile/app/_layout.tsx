import { useEffect } from "react";
import { Alert, AppState, Linking, TextInput } from "react-native";

// Default placeholder color: MIUI/HyperOS (Poco/Xiaomi) renderiza el placeholder
// nativo casi blanco contra fondo claro, invisible en login/forms. Setear el
// default acá lo arregla para los 80+ TextInput de la app sin tener que tocar
// cada uno. `defaultProps` sigue funcionando en React Native 0.81.
const RNTextInput = TextInput as unknown as { defaultProps?: Record<string, unknown> };
RNTextInput.defaultProps = RNTextInput.defaultProps || {};
RNTextInput.defaultProps.placeholderTextColor = "#9C8B72";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/contexts/SessionContext";
import { CartProvider } from "../src/contexts/CartContext";
import { BusquedaProvider } from "../src/contexts/BusquedaContext";
import { configurarHandlerNotificaciones, limpiarBadgeYNotificaciones } from "../src/api/push";
import { checkForUpdate } from "../src/api/version";

export default function RootLayout() {
  useEffect(() => {
    configurarHandlerNotificaciones();
    // Limpia el badge y notifs colgadas al abrir la app (boot) y cada vez
    // que vuelva al foreground. Sin esto, el ícono se quedaba con "3" sin
    // forma de marcarlas como leídas.
    limpiarBadgeYNotificaciones();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") limpiarBadgeYNotificaciones();
    });
    // Check de versión: ahora que distribuimos por Play Store, los updates
    // son automáticos y no hace falta avisar al usuario por cada release.
    // Solo mostramos el alert si la versión instalada es MENOR a `minimo`
    // — escenario crítico (bug grave que rompe la app o cambio de schema).
    // Para esos casos Adrian sube `minimo` en /api/app-version.
    checkForUpdate().then((status) => {
      if (!status || !status.blocking) return;
      Alert.alert(
        "Versión obsoleta",
        `Tu versión ya no es compatible. Actualiza desde Play Store para seguir usando la app.`,
        [{ text: "Abrir Play Store", onPress: () => Linking.openURL(status.info.apkUrl) }],
        { cancelable: false }
      );
    }).catch(() => {});
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <CartProvider>
          <BusquedaProvider>
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
            <Stack.Screen name="solicitar-repartidor" options={{ title: "Solicitar repartidor" }} />
          </Stack>
          </BusquedaProvider>
        </CartProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
