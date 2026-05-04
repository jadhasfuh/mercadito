import Constants from "expo-constants";

/**
 * Resuelve una URL de imagen que puede venir en tres formatos:
 *   - data:image/...;base64,...   (subida desde mobile/web, usar tal cual)
 *   - https://…                   (absoluta, usar tal cual)
 *   - /logo.png                   (relativa al backend, prefijar con apiBaseUrl)
 *
 * Retorna null si la entrada es null/undefined/"".
 */
export function resolverImagen(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  const base = extra?.apiBaseUrl ?? "https://mercadito.cx";
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

// SVG placeholders autogenerados (fondo + iniciales) miden ~250-500 bytes.
// Un logo SVG real con paths reales pesa mucho más.
export function esLogoPlaceholder(logo: string | null | undefined): boolean {
  return !!logo && logo.startsWith("data:image/svg+xml;base64,") && logo.length < 1000;
}
