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
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://unpkg.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.mapbox.com https://*.tile.openstreetmap.org https://nominatim.openstreetmap.org https://exp.host https://*.expo.dev",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
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
