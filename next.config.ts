import type { NextConfig } from "next";

// Cabeceras de seguridad globales. Aplicadas a TODAS las rutas. Notas:
//   - script-src incluye 'unsafe-inline' porque Next.js inyecta JSON de
//     hidratación inline; sin nonce/strict-dynamic es la única vía
//     compatible. El bundle real igual viene de '/_next/static/chunks/'
//     que cae bajo 'self'.
//   - img-src https: permite fotos que cargan tiendas desde CDNs
//     externos (Chedraui, Mapbox tiles, etc.). data: y blob: para
//     previews de cámara y base64 inline.
//   - connect-src lista los hosts a los que el browser hace fetch:
//     mapbox (rutas), OSM (tiles+geocoding), Expo push.
//   - frame-ancestors 'none' bloquea iframe embebido (clickjacking).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Cross-Origin: aísla nuestra window de attackers y limita quién puede
  // pedir nuestros recursos.
  //   COOP same-origin: ventana del sitio queda aislada de pop-ups/iframes
  //   COEP no lo activamos: require-corp rompería imágenes externas y
  //     mapas; credentialless aún tiene soporte irregular.
  //   CORP same-site: nuestros assets no pueden ser cargados por sitios
  //     ajenos (no afecta los recursos externos que NOSOTROS cargamos).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=(self)",
      "microphone=()",
      "geolocation=(self)",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "accelerometer=()",
      "gyroscope=()",
      "fullscreen=(self)",
    ].join(", "),
  },
  // CSP NO va aquí: lo emite src/middleware.ts con un nonce por request,
  // así Next.js puede inyectar sus scripts inline de hidratación sin
  // necesidad de 'unsafe-inline'.
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
