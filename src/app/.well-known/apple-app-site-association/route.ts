import { NextResponse } from "next/server";

// Apple App Site Association (AASA) — habilita los universal links de iOS:
// al tocar https://mercadito.cx/producto/<id>, iOS abre la app directo (si
// está instalada) en lugar de Safari.
//
// appID = <AppleTeamID>.<bundleIdentifier>. TeamID viene de eas.json
// (submit.production.ios.appleTeamId = K4DZRU68R3); bundle = mx.mercadito.cx.
//
// Debe servirse en https://mercadito.cx/.well-known/apple-app-site-association
// con Content-Type application/json y SIN extensión — NextResponse.json lo
// resuelve. Requiere `ios.associatedDomains: ["applinks:mercadito.cx"]` en
// app.json (ya configurado) y un build nuevo.
export function GET() {
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "K4DZRU68R3.mx.mercadito.cx",
          // /m/* = menú digital de una tienda; es el link que se comparte por
          // WhatsApp y el que llevan los QR de las publicaciones.
          paths: ["/producto/*", "/m/*"],
        },
      ],
    },
  });
}
