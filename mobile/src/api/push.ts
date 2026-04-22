import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiFetch } from "./client";

/**
 * Pide permiso de notificaciones, obtiene el Expo push token y lo registra en el backend.
 * Retorna el token (o null si no se pudo).
 *
 * Notas:
 * - Expo Go dejó de soportar push remoto desde SDK 53. En Expo Go esto retorna null sin error.
 * - En simuladores tampoco hay push.
 * - Para push real hay que generar un build con EAS (eas build) y poner el projectId en app.json.
 */
export async function registrarPushToken(): Promise<string | null> {
  // Expo Go ya no soporta push remoto — no intentamos registrar para evitar ruido.
  if (Constants.executionEnvironment === "storeClient") return null;
  if (!Device.isDevice) return null;

  try {
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

    // projectId viene de app.json → expo.extra.eas.projectId cuando se hace build con EAS.
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
