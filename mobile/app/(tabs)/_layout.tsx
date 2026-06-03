import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../../src/contexts/CartContext";
import { getTabScreenOptions } from "../../src/lib/tabStyles";
import { useModo } from "../../src/contexts/ModoContext";
import { useModoUI } from "../../src/lib/modoUI";

export default function TabsLayout() {
  // Permitimos browsing sin sesión (paridad con web, requerido por Apple
  // Guideline 5.1.1(v)). Las pantallas que sí requieren cuenta (pedidos,
  // perfil, checkout) muestran su propio CTA de login cuando aplica.
  const { items } = useCart();
  const insets = useSafeAreaInsets();
  const { modo } = useModo();
  const ui = useModoUI();
  const serv = modo === "servicios";

  const itemCount = items.reduce((s, i) => s + i.cantidad, 0);

  // El switch del home intercambia la barra inferior:
  //   mercado   → Inicio · Carrito · Pedidos · Perfil
  //   servicios → Inicio · Citas · Mensajes · Perfil
  // Las pantallas no aplicables al modo se ocultan con href:null (siguen
  // existiendo como ruta pero no aparecen en la barra). El orden de la barra
  // = orden de declaración, así que carrito/citas comparten posición 2 y
  // pedidos/mensajes la posición 3.
  const oculto = (cond: boolean): { href?: null } => (cond ? { href: null } : {});

  return (
    <Tabs screenOptions={getTabScreenOptions(insets.bottom, { active: ui.tabActive, inactive: ui.tabInactive })}>
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
          tabBarBadgeStyle: { backgroundColor: ui.tabActive },
          ...oculto(serv),
        }}
      />
      <Tabs.Screen
        name="citas"
        options={{
          title: "Citas",
          tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={22} color={color} />,
          ...oculto(!serv),
        }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{
          title: "Pedidos",
          tabBarIcon: ({ color }) => <Ionicons name="receipt-outline" size={22} color={color} />,
          ...oculto(serv),
        }}
      />
      <Tabs.Screen
        name="mensajes"
        options={{
          title: "Mensajes",
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles-outline" size={22} color={color} />,
          ...oculto(!serv),
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
