"use client";

import { useState, useEffect } from "react";
import { registerSW, notificationsGranted, notificationsDefault, requestNotificationPermission } from "@/lib/notifications";

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
    } else if (notificationsDefault()) {
      setMostrar(true);
    }
  }, []);

  async function handleActivar() {
    const granted = await requestNotificationPermission();
    if (granted) {
      setPermiso(true);
      setMostrar(false);
    } else {
      setMostrar(false);
    }
  }

  if (permiso || !mostrar) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
      <span className="text-2xl flex-shrink-0">🔔</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800">
          {mensaje || "Activa las notificaciones para enterarte de novedades"}
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleActivar}
            className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-full font-bold active:scale-95 transition-transform"
          >
            Activar
          </button>
          <button
            onClick={() => setMostrar(false)}
            className="text-xs text-amber-500 px-3 py-1.5"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
