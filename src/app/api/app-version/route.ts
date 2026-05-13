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
  latest: "1.0.52",
  minimo: "1.0.0",
  apkUrl: "https://mercadito.cx/mercadito.apk",
  notas: "⚡ Carga 20× más rápida: el catálogo ya no descarga las fotos de los 849 productos al abrir; cada imagen llega cuando entra a la vista. Antes pesaba 31 MB, ahora 1.5 MB.\n\nTambién: registro arreglado — al crear cuenta el botón dice 'Crear cuenta' (no 'Entrar') y si algo falla el mensaje dice qué pasó en vez del genérico de login. Versión visible en la pantalla de inicio para reportar errores.",
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
