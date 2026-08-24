import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DELIVERY_ACTIVO, esRutaDelivery } from "@/lib/flags";

/**
 * CSP con nonce por request. Next.js inyecta scripts inline para hidratar el
 * árbol de RSC; sin un nonce válido el browser los bloquea. Con `strict-
 * dynamic`, los scripts cargados por esos inline confiables (chunks
 * /_next/static/...) también ejecutan sin necesidad de listarlos en el CSP.
 *
 * El nonce se hace llegar al render por header `x-nonce`; el layout lo lee
 * con `headers()` y lo aplica a sus <script> propios. Next.js usa
 * automáticamente el mismo nonce para sus scripts internos.
 */
export function middleware(request: NextRequest) {
  // Delivery apagado: catálogo, carrito, checkout, mandados y la app de
  // repartidor no tienen operación detrás. Se mandan al directorio de menús
  // en vez de dejarlos accesibles por URL directa. Ver lib/flags.
  if (!DELIVERY_ACTIVO && esRutaDelivery(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/menus", request.url));
  }

  const nonce = btoa(crypto.randomUUID());

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdnjs.cloudflare.com https://unpkg.com`,
    `style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://unpkg.com`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://api.mapbox.com https://*.tile.openstreetmap.org https://nominatim.openstreetmap.org https://exp.host https://*.expo.dev`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Pasar el CSP también como request header — Next.js lo lee para inyectar
  // el nonce en los <script> de hidratación.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Excluimos rutas estáticas y de API (las APIs no renderizan HTML, no
    // necesitan nonce). El header CSP general lo seguimos enviando desde
    // next.config.ts para esas rutas.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js)).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
