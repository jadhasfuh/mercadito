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
  latest: "1.0.56",
  minimo: "1.0.0",
  apkUrl: "https://mercadito.cx/mercadito.apk",
  notas: "🚀 Paridad web ↔ app — todo lo que se hacía solo en la web ya está en la app:\n\n• Admin: ventas manuales recientes por repartidor + cobrar cuentas B2B con un tap.\n• Admin: anuncios con imagen y link, igual que la web.\n• Admin: desde cada tienda — cambiar PIN, enviar mensaje al dueño, pausar.\n• Tiendas: bandeja de mensajes 🔔 con badge + banner de anuncios + bloqueo cuando la tienda fue desactivada.",
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
