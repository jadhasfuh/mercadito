import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../../src/contexts/CartContext";
import { getTabScreenOptions } from "../../src/lib/tabStyles";

export default function TabsLayout() {
  // Permitimos browsing sin sesión (paridad con web, requerido por Apple
  // Guideline 5.1.1(v)). Las pantallas que sí requieren cuenta (pedidos,
  // perfil, checkout) muestran su propio CTA de login cuando aplica.
  const { items } = useCart();
  const insets = useSafeAreaInsets();

  const itemCount = items.reduce((s, i) => s + i.cantidad, 0);

  return (
    <Tabs screenOptions={getTabScreenOptions(insets.bottom)}>
      <Tabs.Screen
        name="home"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color }) => <Ionicons name="storefront-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="carrito"
        options={{
          title: "Carrito",
          tabBarIcon: ({ color }) => <Ionicons name="cart-outline" size={22} color={color} />,
          tabBarBadge: itemCount > 0 ? itemCount : undefined,
          tabBarBadgeStyle: { backgroundColor: "#F2A65A" },
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
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color }) => <Ionicons name="person-circle-outline" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
