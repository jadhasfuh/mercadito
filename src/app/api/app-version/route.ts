import { NextResponse } from "next/server";

// Versión actual del APK servido en /mercadito.apk. Bumpear `latest`
// cada vez que subas una nueva build que quieras anunciar a los usuarios
// existentes.
//   - latest:  versión más reciente disponible. Si la app instalada es
//              menor, mostramos un alert al abrir invitando a actualizar
//              (no bloquea).
//   - minimo:  por debajo de esto, la app debería bloquear el uso hasta
//              que se actualice. Por ahora se muestra como alert
//              regular; si más adelante querés forzar, el mobile ya tiene
//              la información para hacerlo.
const APP_VERSION = {
  latest: "1.0.29",
  minimo: "1.0.0",
  apkUrl: "https://mercadito.cx/mercadito.apk",
  notas: "🔔 Notificaciones push activadas · 📸 Foto al entregar (prueba que llegó tu pedido) · 🛵 Tracking en vivo del repartidor con mapa y tiempo estimado · 🎁 Programa de referidos: invita a un amigo y ambos ganan $30 · 🏪 Tiendas pueden solicitar repartidor (B2B) · 📍 Link público de tracking para compartir con clientes",
};

export async function GET() {
  return NextResponse.json(APP_VERSION, {
    headers: {
      // Permitir cache de 5 min en el cliente — no necesitamos respuesta
      // fresca al milisegundo y reduce hits al backend.
      "Cache-Control": "public, max-age=300",
    },
  });
}
