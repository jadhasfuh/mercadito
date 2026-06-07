"use client";

import { useEffect, useState } from "react";

// Banner "abrir en la app / seguir en web". Aparece en móvil (iOS/Android) cuando
// el usuario navega el sitio en el navegador — útil al abrir un link de menú
// compartido. Se oculta si: es escritorio, ya está como PWA instalada, o el
// usuario lo cerró (recordado en localStorage).
const DISMISS_KEY = "mercadito_app_banner_dismissed";
const APP_STORE = "https://apps.apple.com/app/id6771926373";
const PLAY_STORE = "https://play.google.com/store/apps/details?id=mx.mercadito.cx";

export default function AppBanner() {
  const [tienda, setTienda] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch { /* localStorage bloqueado — seguimos */ }
    // PWA instalada (standalone) → no molestar; ya "está en la app".
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari guarda esto en navigator.standalone
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) setTienda("ios");
    else if (/Android/i.test(ua)) setTienda("android");
    // Escritorio u otros → no se muestra.
  }, []);

  if (!tienda) return null;
  const store = tienda === "ios" ? APP_STORE : PLAY_STORE;
  const cerrar = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* noop */ }
    setTienda(null);
  };
  // Intenta abrir la app instalada vía su scheme (mercadito://); si no abre
  // (app no instalada), cae a la tienda. Si la app abre, la pestaña se oculta
  // y cancelamos el fallback. (En Expo Go no funciona el scheme; ahí va a store.)
  const abrirApp = () => {
    let abrio = false;
    const onHide = () => { if (document.hidden) { abrio = true; } };
    document.addEventListener("visibilitychange", onHide, { once: true });
    const t = setTimeout(() => {
      document.removeEventListener("visibilitychange", onHide);
      if (!abrio) window.location.href = store;
    }, 1400);
    try {
      window.location.href = "mercadito://";
    } catch {
      clearTimeout(t);
      window.location.href = store;
    }
  };

  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-white border-b border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
      <div className="max-w-lg mx-auto px-3 py-2.5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="Mercadito" className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 leading-tight">Mercadito</p>
          <p className="text-xs text-gray-500 leading-tight">Más rápido y con notificaciones en la app</p>
        </div>
        <button
          onClick={abrirApp}
          className="flex-shrink-0 text-sm font-bold text-white px-3.5 py-2 rounded-full"
          style={{ backgroundColor: "#ED8E3C" }}
        >
          Abrir app
        </button>
        <button onClick={cerrar} aria-label="Seguir en web" className="flex-shrink-0 text-gray-400 px-1 text-lg leading-none">✕</button>
      </div>
    </div>
  );
}
