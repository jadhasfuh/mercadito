import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/contexts/SessionContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
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
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
