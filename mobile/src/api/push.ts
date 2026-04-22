import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiFetch } from "./client";

/**
 * Pide permiso de notificaciones, obtiene el Expo push token y lo registra en el backend.
 * Retorna el token (o null si no se pudo).
 *
 * Nota: en iOS + Expo Go hay que aceptar el prompt; en Android 13+ también se pide permiso.
 */
export async function registrarPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    // Los simuladores no reciben pushes.
    return null;
  }

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

  try {
    // En Expo Go no hace falta projectId; en un build EAS sí.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: any = {};
    const tokenResp = await Notifications.getExpoPushTokenAsync(opts);
    const token = tokenResp.data;
    await apiFetch("/api/push/register", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    return token;
  } catch (e) {
    console.warn("[push] registration failed", e);
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
