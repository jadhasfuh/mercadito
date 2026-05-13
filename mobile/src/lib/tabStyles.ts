import { Platform } from "react-native";

/**
 * screenOptions para <Tabs/> respetando safe-area inferior.
 *
 * En Samsung con navegación por gestos `insets.bottom` puede ser pequeño
 * pero la barrita visual sigue ahí, comiéndose la mitad del label si el
 * paddingBottom es exacto al inset. Por eso ponemos un piso generoso
 * (16 px Android, 12 px iOS) AÑADIDO al inset, no como reemplazo.
 *
 * El alto total = padding inferior + label + ícono + padding superior,
 * para que el label nunca quede flush con el borde del sistema.
 */
export function getTabScreenOptions(bottomInset: number) {
  const minPad = Platform.OS === "ios" ? 8 : 12;
  const bottomPad = bottomInset + minPad;
  const contentHeight = 56; // un poquito más alto para que el label respire
  return {
    tabBarActiveTintColor: "#F2A65A",
    tabBarInactiveTintColor: "#8B7B69",
    tabBarStyle: {
      backgroundColor: "#fff",
      borderTopWidth: 0,
      elevation: 8,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: -2 },
      paddingTop: 8,
      paddingBottom: bottomPad,
      height: contentHeight + bottomPad,
    },
    tabBarLabelStyle: { fontSize: 11, fontWeight: "600" as const, marginBottom: 4, paddingBottom: 2 },
    tabBarIconStyle: { marginTop: 0 },
    // Sin header default — la barra inferior ya indica en qué pantalla
    // estás. Cada tab que necesite un header lo arma como bloque dentro
    // del componente (ej. home con logo + búsqueda).
    headerShown: false,
  };
}
