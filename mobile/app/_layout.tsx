import { useEffect, useRef } from "react";
import { Alert, AppState, Linking } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { SessionProvider, useSession } from "../src/contexts/SessionContext";
import { CartProvider } from "../src/contexts/CartContext";
import { BusquedaProvider } from "../src/contexts/BusquedaContext";
import { configurarHandlerNotificaciones, configurarTapNotificaciones, limpiarBadgeYNotificaciones } from "../src/api/push";
import { checkForUpdate } from "../src/api/version";
import { theme } from "../src/lib/theme";

/**
 * Al tocar un push, navega a la pantalla relevante según el rol del usuario
 * y el `tipo` del push. El rol se lee por ref para no re-suscribir el
 * listener en cada cambio de sesión. Vive dentro de SessionProvider.
 */
function TapNotificaciones() {
  const { usuario } = useSession();
  const rolRef = useRef(usuario?.rol);
  rolRef.current = usuario?.rol;

  useEffect(() => {
    let cleanup = () => {};
    configurarTapNotificaciones((data) => {
      const tipo = typeof data?.tipo === "string" ? data.tipo : "";
      const rol = rolRef.current;
      let ruta: string | null = null;
      if (rol === "tienda") {
        ruta = tipo === "recordatorio_precios" ? "/(tienda)/productos" : "/(tienda)/pedidos";
      } else if (rol === "repartidor") {
        ruta = "/(repartidor)/pedidos";
      } else if (rol === "admin") {
        ruta = tipo === "pago_por_validar" ? "/(admin)/pagos"
          : tipo === "tienda_registrada" ? "/(admin)/tiendas"
          : "/(admin)/pedidos";
      } else if (rol === "cliente") {
        ruta = "/(tabs)/pedidos";
      }
      if (ruta) router.push(ruta as never);
    }).then((fn) => { cleanup = fn; });
    return () => cleanup();
  }, []);

  return null;
}

export default function RootLayout() {
  // Cargamos Inter en 4 pesos — suficiente para regular/medium/semibold/bold
  // del theme. Si la fuente no termina antes del primer render, RN cae a la
  // sans-serif del sistema (San Francisco / Roboto) — los estilos siguen
  // funcionando, solo cambia la fuente al cargar.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

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
          <TapNotificaciones />
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.colors.brandBg },
              headerTitleStyle: {
                fontFamily: fontsLoaded ? theme.fontFamily.bold : undefined,
                fontWeight: "700",
              },
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
