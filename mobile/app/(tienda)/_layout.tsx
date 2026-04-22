import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../src/contexts/SessionContext";
import { tabScreenOptions } from "../../src/lib/tabStyles";

export default function TiendaLayout() {
  const { usuario, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!usuario) router.replace("/login");
    else if (usuario.rol !== "tienda" && usuario.rol !== "repartidor") router.replace("/(tabs)/home");
  }, [usuario, loading, router]);

  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen
        name="pedidos"
        options={{
          title: "Pedidos",
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
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
