import { Platform } from "react-native";

/**
 * screenOptions para <Tabs/> respetando safe-area inferior.
 * Solo el safe-area se suma a la altura; el contenido del tab queda con
 * ~50px constantes independiente del dispositivo.
 */
export function getTabScreenOptions(bottomInset: number) {
  const bottomPad = Math.max(bottomInset, Platform.OS === "ios" ? 12 : 6);
  const contentHeight = 50;
  return {
    tabBarActiveTintColor: "#FF7A2B",
    tabBarInactiveTintColor: "#8B7B69",
    tabBarStyle: {
      backgroundColor: "#fff",
      borderTopWidth: 0,
      elevation: 8,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: -2 },
      paddingTop: 6,
      paddingBottom: bottomPad,
      height: contentHeight + bottomPad,
    },
    tabBarLabelStyle: { fontSize: 11, fontWeight: "600" as const, marginBottom: 2 },
    tabBarIconStyle: { marginTop: 0 },
    headerStyle: { backgroundColor: "#FFF7EB" },
    headerTitleStyle: { fontWeight: "700" as const, fontSize: 17 },
    headerShadowVisible: false,
  };
}
