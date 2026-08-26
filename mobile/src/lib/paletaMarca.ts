// Paleta derivada del color de marca del negocio.
//
// ESPEJO EXACTO de src/lib/paletaMarca.ts (web). El menú de la app y el de la
// web tienen que salir del mismo color: si cambia uno, cambia el otro. No se
// importa del web porque son dos bundles distintos (Next vs Expo).

export const COLOR_MARCA_DEFAULT = "#ED8E3C";

export interface PaletaMarca {
  accent: string;
  /** Fin del degradado del header. */
  accentDark: string;
  /** Sombra dura del efecto "pepe" (botones 3D). */
  shadow: string;
  /** Tinte claro para fondos. */
  soft: string;
  /** Texto sobre acentos: siempre blanco. */
  on: string;
}

export function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}

export function mix(hex: string, target: string, amt: number) {
  const a = hexToRgb(hex), b = hexToRgb(target);
  return toHex(a.r + (b.r - a.r) * amt, a.g + (b.g - a.g) * amt, a.b + (b.b - a.b) * amt);
}

export function lum(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Oscurece el color hasta que el texto blanco se lea bien encima. */
export function paraTextoBlanco(hex: string) {
  let c = hex, guard = 0;
  while (lum(c) > 0.6 && guard < 14) { c = mix(c, "#000000", 0.1); guard++; }
  return c;
}

export function paletaDeMarca(colorMarca?: string | null): PaletaMarca {
  const base = colorMarca || COLOR_MARCA_DEFAULT;
  const accent = paraTextoBlanco(base);
  const oscuro = lum(accent) < 0.22;
  return {
    accent,
    accentDark: mix(accent, "#000000", 0.18),
    shadow: oscuro ? mix(accent, "#ffffff", 0.4) : mix(accent, "#000000", 0.34),
    soft: mix(base, "#ffffff", 0.9),
    on: "#ffffff",
  };
}

/** Color con alfa para overlays (RN no acepta "#RRGGBBAA" en todas partes). */
export function conAlfa(hex: string, alfa: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alfa))})`;
}
