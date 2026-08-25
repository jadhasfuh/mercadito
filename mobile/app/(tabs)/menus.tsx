import MenusScreen from "../menus";

/**
 * "Menús" como tab. Sin delivery, el carrito y los pedidos salieron de la
 * barra y el directorio de menús pasa a ser la acción principal del cliente,
 * así que ocupa ese lugar en vez de quedar escondido tras el home.
 *
 * Reusa la pantalla de app/menus.tsx en vez de duplicarla: la ruta suelta
 * sigue viva porque hay enlaces que apuntan ahí (home, deep links).
 */
export default function MenusTab() {
  return <MenusScreen />;
}
