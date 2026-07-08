// Notification utilities for Mercadito PWA
// Handles: service worker registration, permission requests, sending notifications

let swRegistration: ServiceWorkerRegistration | null = null;

/** Register the service worker (call once on app load) */
export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    swRegistration = await navigator.serviceWorker.register("/sw.js");
    return swRegistration;
  } catch {
    return null;
  }
}

/** Check if notification permission is granted */
export function notificationsGranted(): boolean {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
}

/** Check if permission hasn't been asked yet */
export function notificationsDefault(): boolean {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "default";
}

/** Request notification permission */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * Show a notification via the service worker (works in background)
 * Falls back to regular Notification if SW not available
 */
export function showNotification(title: string, body: string, url?: string) {
  if (!notificationsGranted()) return;

  // Try service worker first (works in background)
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SHOW_NOTIFICATION",
      title,
      body,
      icon: "/icon-192.png",
      url: url || "/",
    });
    return;
  }

  // Fallback to regular notification
  try {
    new Notification(title, {
      body,
      icon: "/icon-192.png",
    });
  } catch {
    // Not available
  }
}

// ─────────────────────── Web Push (servidor → navegador) ───────────────────
// A diferencia de showNotification (local, solo con la pestaña abierta), esto
// suscribe el navegador para recibir push del servidor aunque esté cerrado.

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Suscribe el navegador al web push y guarda la suscripción en el backend.
 * Idempotente: si ya está suscrito, reusa la suscripción existente. Requiere
 * permiso concedido y sesión iniciada (la cookie viaja en el fetch).
 * No-op silencioso si el navegador no soporta push o el server no tiene VAPID.
 */
export async function subscribeWebPush(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (!notificationsGranted()) return false;

    const res = await fetch("/api/push/vapid-public-key");
    const { publicKey } = await res.json();
    if (!publicKey) return false; // server sin web push configurado

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const r = await fetch("/api/push/web-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Cancela la suscripción web y la borra del backend (al desactivar o logout). */
export async function unsubscribeWebPush(): Promise<void> {
  try {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch("/api/push/web-register", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // no-op
  }
}

/** Play a beep sound for alerts */
export function playBeep(frequency = 800, duration = 0.3) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio not available
  }
}

/** Double beep for urgent alerts */
export function playDoubleBeep() {
  playBeep(800, 0.3);
  setTimeout(() => playBeep(1000, 0.3), 350);
}
