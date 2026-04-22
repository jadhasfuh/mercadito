import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../src/contexts/SessionContext";
import { useCart } from "../../src/contexts/CartContext";

export default function TabsLayout() {
  const { usuario, loading } = useSession();
  const { items } = useCart();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !usuario) router.replace("/login");
  }, [usuario, loading, router]);

  const itemCount = items.reduce((s, i) => s + i.cantidad, 0);

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
        name="home"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color, size }) => <Ionicons name="storefront-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="carrito"
        options={{
          title: "Carrito",
          tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" size={size} color={color} />,
          tabBarBadge: itemCount > 0 ? itemCount : undefined,
          tabBarBadgeStyle: { backgroundColor: "#FF7A2B" },
        }}
      />
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
