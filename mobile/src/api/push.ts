import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiFetch } from "./client";

/**
 * Registra el Expo push token del dispositivo en el backend.
 *
 * expo-notifications se importa dinámicamente SOLO cuando no estamos en Expo Go
 * y estamos en un dispositivo real. Así evitamos el ERROR ruidoso de Expo Go
 * que dice que el push remoto fue removido desde SDK 53.
 *
 * Para que funcione de verdad hay que:
 *   1. `eas build` (genera el projectId automaticamente en app.json).
 *   2. Instalar ese build (en vez de Expo Go).
 */
export async function registrarPushToken(): Promise<string | null> {
  // Expo Go no soporta push remoto desde SDK 53 — salimos sin tocar el módulo.
  if (Constants.executionEnvironment === "storeClient") return null;

  try {
    const Device = await import("expo-device");
    if (!Device.isDevice) return null;

    const Notifications = await import("expo-notifications");

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Pedidos",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF7A2B",
        sound: "default",
      });
    }

    const { status: current } = await Notifications.getPermissionsAsync();
    let finalStatus = current;
    if (current !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
    if (!projectId) return null;

    const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResp.data;
    await apiFetch("/api/push/register", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    return token;
  } catch {
    return null;
  }
}

export async function desregistrarPushToken(): Promise<void> {
  try {
    await apiFetch("/api/push/register", { method: "DELETE" });
  } catch {
    // logout debe proceder aunque falle
  }
}

/**
 * Handler de notificaciones en foreground. Se llama una vez al boot;
 * es seguro en Expo Go porque hacemos import dinámico y swallow de errores.
 */
export async function configurarHandlerNotificaciones(): Promise<void> {
  if (Constants.executionEnvironment === "storeClient") return;
  try {
    const Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch {
    // no-op
  }
}
