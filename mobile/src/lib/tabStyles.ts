import { Platform } from "react-native";

export const tabScreenOptions = {
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
    paddingBottom: Platform.OS === "ios" ? 20 : 8,
    height: Platform.OS === "ios" ? 80 : 60,
  },
  tabBarLabelStyle: { fontSize: 11, fontWeight: "600" as const, marginBottom: Platform.OS === "ios" ? 0 : 4 },
  tabBarItemStyle: { paddingVertical: 2 },
  headerStyle: { backgroundColor: "#FFF7EB" },
  headerTitleStyle: { fontWeight: "700" as const, fontSize: 17 },
  headerShadowVisible: false,
};
