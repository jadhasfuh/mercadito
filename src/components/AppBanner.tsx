"use client";

import { useEffect, useState } from "react";

// Banner "abrir en la app / seguir en web". Aparece en móvil (iOS/Android) cuando
// el usuario navega el sitio en el navegador — útil al abrir un link de menú
// compartido. Se oculta si: es escritorio, ya está como PWA instalada, o el
// usuario lo cerró (recordado en localStorage).
const DISMISS_KEY = "mercadito_app_banner_dismissed";
const APP_STORE = "https://apps.apple.com/app/id6771926373";
const PLAY_STORE = "https://play.google.com/store/apps/details?id=mx.mercadito.cx";
const PAQUETE_ANDROID = "mx.mercadito.cx";

// Navegadores embebidos (Messenger, Facebook, Instagram, TikTok…). Bloquean
// los esquemas que no son http(s): intentar `mercadito://` ahí termina en
// "ERR_UNKNOWN_URL_SCHEME" a pantalla completa. Como los links de menú se
// comparten justo por esos chats, es el caso más común, no el raro.
const NAVEGADOR_EMBEBIDO = /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|TikTok|Snapchat|WhatsApp|MicroMessenger/i;

export default function AppBanner() {
  const [tienda, setTienda] = useState<"ios" | "android" | null>(null);
  const [embebido, setEmbebido] = useState(false);

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
    setEmbebido(NAVEGADOR_EMBEBIDO.test(ua));
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
  // Abrir la app instalada. El camino cambia según dónde estemos:
  //  - webview de Messenger/Instagram: el scheme está bloqueado, así que
  //    mandamos a la tienda (esa sí abre nativa y dice "Abrir" si ya la tiene).
  //  - Android: intent:// deja que el sistema haga el fallback solo, sin
  //    temporizadores ni página de error si la app no está.
  //  - iOS: scheme + fallback a la App Store si nada pasó en 1.4s.
  const abrirApp = () => {
    if (embebido) {
      window.location.href = store;
      return;
    }
    if (tienda === "android") {
      const fallback = encodeURIComponent(store);
      window.location.href =
        `intent://#Intent;scheme=mercadito;package=${PAQUETE_ANDROID};S.browser_fallback_url=${fallback};end`;
      return;
    }
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
          <p className="text-xs text-gray-500 leading-tight">
            {embebido
              ? "Para abrir la app, ábrelo en tu navegador"
              : "Más rápido y con notificaciones en la app"}
          </p>
        </div>
        <button
          onClick={abrirApp}
          className="flex-shrink-0 text-sm font-bold text-white px-3.5 py-2 rounded-full"
          style={{ backgroundColor: "#ED8E3C" }}
        >
          {embebido ? "Ver app" : "Abrir app"}
        </button>
        <button onClick={cerrar} aria-label="Seguir en web" className="flex-shrink-0 text-gray-400 px-1 text-lg leading-none">✕</button>
      </div>
    </div>
  );
}
