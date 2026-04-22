import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../src/contexts/SessionContext";

export default function RepartidorLayout() {
  const { usuario, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!usuario) router.replace("/login");
    else if (usuario.rol !== "repartidor") router.replace("/(tabs)/home");
  }, [usuario, loading, router]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#FF7A2B",
        tabBarInactiveTintColor: "#8B7B69",
        headerStyle: { backgroundColor: "#FFF7EB" },
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="pedidos"
        options={{
          title: "Pedidos",
          tabBarIcon: ({ color, size }) => <Ionicons name="bicycle-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
