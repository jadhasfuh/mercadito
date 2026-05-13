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
  latest: "1.0.53",
  minimo: "1.0.0",
  apkUrl: "https://mercadito.cx/mercadito.apk",
  notas: "💰 Tarifa de envíos ajustada en Sahuayo (1-7 km): el precio sube un poco para pagar mejor el tiempo del repartidor. 1 km sigue en $10, pero 7 km ahora son $60 en vez de $50. Los intermedios suben entre $1 y $9. De 8 km en adelante todo igual.",
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
