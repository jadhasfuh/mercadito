import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../src/contexts/SessionContext";
import { getTabScreenOptions } from "../../src/lib/tabStyles";

export default function AdminLayout() {
  const { usuario, loading } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (loading) return;
    // Grace period — el redirect se difiere ~250ms para evitar race con
    // el `setUsuario` del login (en React 18, el state update post-await
    // puede no estar committed cuando este layout monta tras router.replace).
    // Si dentro de la ventana el usuario llega correctamente, el cleanup
    // cancela el redirect y el siguiente render sigue normal.
    const t = setTimeout(() => {
      if (!usuario) router.replace("/login");
      else if (usuario.rol !== "admin") router.replace("/(tabs)/home");
    }, 250);
    return () => clearTimeout(t);
  }, [usuario, loading, router]);

  return (
    <Tabs screenOptions={getTabScreenOptions(insets.bottom)}>
      <Tabs.Screen
        name="resumen"
        options={{
          title: "Resumen",
          tabBarIcon: ({ color }) => <Ionicons name="stats-chart-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pagos"
        options={{
          title: "Pagos",
          tabBarIcon: ({ color }) => <Ionicons name="cash-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{
          title: "Pedidos",
          tabBarIcon: ({ color }) => <Ionicons name="receipt-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tiendas"
        options={{
          title: "Tiendas",
          tabBarIcon: ({ color }) => <Ionicons name="storefront-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="usuarios"
        options={{
          title: "Usuarios",
          tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="anuncios"
        options={{
          title: "Anuncios",
          tabBarIcon: ({ color }) => <Ionicons name="megaphone-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color }) => <Ionicons name="person-circle-outline" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
