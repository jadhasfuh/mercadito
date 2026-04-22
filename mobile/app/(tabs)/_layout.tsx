import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { useSession } from "../../src/contexts/SessionContext";

export default function TabsLayout() {
  const { usuario, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !usuario) router.replace("/login");
  }, [usuario, loading, router]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#FF7A2B",
        headerStyle: { backgroundColor: "#FFF7EB" },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Inicio" }} />
      <Tabs.Screen name="carrito" options={{ title: "Carrito" }} />
      <Tabs.Screen name="pedidos" options={{ title: "Mis pedidos" }} />
      <Tabs.Screen name="perfil" options={{ title: "Perfil" }} />
    </Tabs>
  );
}
