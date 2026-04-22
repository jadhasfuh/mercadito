import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../src/contexts/SessionContext";
import { getTabScreenOptions } from "../../src/lib/tabStyles";

export default function RepartidorLayout() {
  const { usuario, loading } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (loading) return;
    if (!usuario) router.replace("/login");
    else if (usuario.rol !== "repartidor") router.replace("/(tabs)/home");
  }, [usuario, loading, router]);

  return (
    <Tabs screenOptions={getTabScreenOptions(insets.bottom)}>
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
