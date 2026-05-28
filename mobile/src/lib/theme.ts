/**
 * Mercadito Design System — tokens compartidos por todos los componentes.
 *
 * Convención: importar como `theme` y usar `theme.colors.brand`,
 * `theme.typography.h1`, etc. Si necesitas un valor calculado (ej. shadow
 * con elevación), usa los helpers exportados al final.
 *
 * Espejo del web: los colores brand/navy/cream coinciden con el
 * `@theme` en `src/app/globals.css`. Si cambia uno, cambia el otro.
 */

/* ─────────────────────────── Colores ─────────────────────────── */

export const colors = {
  // Brand — naranja cálido del logo. brand es el primario, brandDark
  // para hover/active, brandLight para tints y backgrounds sutiles.
  brand: "#ED8E3C",
  brandDark: "#D97F2E",
  brandLight: "#FEF5EA",
  brandBg: "#FFF7EB",

  // Navy/cobre — para tipografía sobre fondo crema (más cálido que black)
  // y para hovers de elementos secundarios.
  navy: "#92400E",
  navyLight: "#B45309",
  navy50: "#FEF3E2",

  // Accent — teal/verde-azulado para éxito, "Confirmar", precios mayoreo.
  // Pickeado para contrastar con el brand sin pelearse: el naranja vive
  // del lado cálido, el teal del frío. Funciona bien con AA en ambos.
  accent: "#0EA5A4",
  accentDark: "#0C8987",
  accentLight: "#E6F8F7",

  // Danger — rojo suavizado para alertas y "Eliminar". El #DC2626 puro se
  // siente agresivo en una app de delivery; bajamos saturación a #E15555.
  danger: "#E15555",
  dangerDark: "#C13F3F",
  dangerLight: "#FDECEC",

  // Warning — amarillo para "pendiente", "abrirá en 30 min", etc.
  warning: "#F2A65A",
  warningDark: "#D97F2E",
  warningLight: "#FEF5EA",

  // Neutrales — para fondos, bordes, tipografía secundaria.
  white: "#FFFFFF",
  cream: "#FAF6F1",      // fondo principal de la app
  creamDark: "#F0E9DF",  // separadores, fondos de chips
  gray50: "#F9FAFB",
  gray100: "#F3F4F6",
  gray200: "#E5E7EB",
  gray300: "#D1D5DB",
  gray400: "#9CA3AF",
  gray500: "#6B7280",
  gray600: "#4B5563",
  gray700: "#374151",
  gray800: "#1F2937",
  gray900: "#111827",

  // Específicos del catálogo
  closed: "rgba(0, 0, 0, 0.45)",  // overlay sobre productos de tienda cerrada
  closedBadge: "#374151",
} as const;

/* ─────────────────────────── Tipografía ─────────────────────────── */

// Inter — cargada con @expo-google-fonts/inter en `mobile/app/_layout.tsx`.
// Si la fuente no terminó de cargar, RN cae a sans-serif del sistema (San
// Francisco en iOS, Roboto en Android) — ambas legibles.
const fontFamily = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export const typography = {
  // Jerarquías — usar como `style={[theme.typography.h1, { color: ... }]}`.
  // El color NO se incluye aquí para que cada lugar elija el suyo según
  // el fondo.
  h1: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
  },
  h2: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  h3: {
    fontFamily: fontFamily.semibold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 22,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyMedium: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
  // Para precios, totales, números grandes — tabular para que cuadren
  // verticalmente en listas.
  number: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 24,
    fontVariant: ["tabular-nums" as const],
  },
  // CTA — botones principales
  button: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  buttonSmall: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    lineHeight: 18,
  },
} as const;

/* ─────────────────────────── Espaciado ─────────────────────────── */

// Escala 4-base. Múltiplos de 4 mantienen ritmo visual y son fáciles de
// mantener mentalmente: "sm" siempre será 8, "md" siempre 16, etc.
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

/* ─────────────────────────── Border radius ─────────────────────────── */

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,   // estándar para cards
  xl: 20,
  pill: 999,
} as const;

/* ─────────────────────────── Sombras ─────────────────────────── */

// Sombras pre-calculadas para iOS (shadow*) + Android (elevation).
// Usar con spread: `style={[card, theme.shadow.md]}`.
export const shadow = {
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

/* ─────────────────────────── Theme agregado ─────────────────────────── */

export const theme = {
  colors,
  typography,
  spacing,
  radius,
  shadow,
  fontFamily,
} as const;

export type Theme = typeof theme;
export default theme;
