import { NextResponse } from "next/server";

// Distribución vía Google Play. Bumpear `latest` cada vez que subas una
// nueva build que quieras anunciar a los usuarios existentes.
//   - latest:  versión más reciente disponible. Si la app instalada es
//              menor, mostramos un alert al abrir invitando a actualizar
//              (no bloquea).
//   - minimo:  por debajo de esto, la app debería bloquear el uso hasta
//              que se actualice. Por ahora se muestra como alert
//              regular; si más adelante querés forzar, el mobile ya tiene
//              la información para hacerlo.
//   - apkUrl:  nombre histórico del campo (las builds ya instaladas lo
//              leen así), pero ahora apunta al listado de Play Store. NO
//              renombrar: rompería el botón "Abrir Play Store" en apps
//              viejas que esperan exactamente esta clave.
const APP_VERSION = {
  latest: "1.0.59",
  minimo: "1.0.0",
  apkUrl: "https://play.google.com/store/apps/details?id=mx.mercadito.cx",
  notas: "✨ Ahora puedes tocar la foto de cualquier producto para verla en grande y leer su descripción completa. Además, las fotos nuevas se ven más nítidas. Bienvenida nueva tienda: Chilaquiles Bakery, con sus promos de cada día.",
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
