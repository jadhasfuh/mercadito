"use client";

import { useState, useEffect } from "react";
import { registerSW, notificationsGranted, notificationsDefault, requestNotificationPermission, subscribeWebPush } from "@/lib/notifications";

interface Props {
  mensaje?: string;
}

export default function NotificationBanner({ mensaje }: Props) {
  const [mostrar, setMostrar] = useState(false);
  const [permiso, setPermiso] = useState(false);

  useEffect(() => {
    // Register service worker
    registerSW();

    // Check if we should show the banner
    if (notificationsGranted()) {
      setPermiso(true);
      // Ya concedió el permiso: asegura la suscripción de web push en el
      // backend (cubre a usuarios que aceptaron ANTES de que existiera web push).
      subscribeWebPush();
    } else if (notificationsDefault()) {
      setMostrar(true);
    }
  }, []);

  async function handleActivar() {
    const granted = await requestNotificationPermission();
    if (granted) {
      setPermiso(true);
      setMostrar(false);
      // Suscribe al web push del servidor tras conceder el permiso.
      subscribeWebPush();
    } else {
      setMostrar(false);
    }
  }

  if (permiso || !mostrar) return null;

  return (
    <div className="bg-brand-light border border-brand/30 rounded-xl p-3 flex items-start gap-3">
      <span className="text-2xl flex-shrink-0">🔔</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-navy">
          {mensaje || "Activa las notificaciones para enterarte de novedades"}
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleActivar}
            className="text-xs bg-brand text-white px-3 py-1.5 rounded-full font-bold active:scale-95 transition-transform"
          >
            Activar
          </button>
          <button
            onClick={() => setMostrar(false)}
            className="text-xs text-gray-400 px-3 py-1.5"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
