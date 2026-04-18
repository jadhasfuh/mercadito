import type { Metadata, Viewport } from "next";
import { SessionProvider } from "@/components/SessionProvider";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1a2e4a",
};

export const metadata: Metadata = {
  title: "Mercadito - Tu mercado local a domicilio",
  description: "Haz tu lista de compras del mercado y recíbela en tu puerta. Sahuayo, Jiquilpan y Venustiano Carranza.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mercadito",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
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
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){});}`,
          }}
        />
      </body>
    </html>
  );
}
