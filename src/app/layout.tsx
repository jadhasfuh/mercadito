import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { SessionProvider } from "@/components/SessionProvider";
import "./globals.css";

// Inter — fuente principal del design system. `next/font` la auto-hostea
// (evita request a fonts.googleapis.com) y genera una CSS var que se
// consume desde Tailwind a través de `font-sans`. Pesos cargados: 400,
// 500, 600, 700 — los que usa el theme. `display: swap` evita que el
// texto se quede invisible mientras carga (CLS bajo).
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f28c28",
};

export const metadata: Metadata = {
  title: "Mercadito - Tu mercado local a domicilio",
  description: "Haz tu lista de compras del mercado y recíbela en tu puerta. Sahuayo, Jiquilpan y Venustiano Carranza.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mercadito",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // El nonce viene del middleware (CSP por request). Sirve para autorizar
  // los scripts inline de Next y los nuestros sin necesidad de
  // 'unsafe-inline' en el script-src.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="es" className={`h-full ${inter.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="min-h-full bg-cream font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){});}`,
          }}
        />
      </body>
    </html>
  );
}
