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
