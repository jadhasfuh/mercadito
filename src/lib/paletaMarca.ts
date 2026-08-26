// ── Paleta derivada del color del restaurante ──────────────────────────────
// El acento SIEMPRE lleva texto blanco. Para que el blanco se lea con cualquier
// color (incluso amarillos claros), oscurecemos el acento lo justo si el color
// elegido es demasiado claro. Así no hay que alternar negro/blanco (que se
// perdería en fondos oscuros o claros): blanco + fondo garantizado oscuro.
//
// Espejo de mobile/src/lib/paletaMarca.ts — el menú de la app tiene que salir
// EXACTAMENTE del mismo color que el de la web. Si cambia uno, cambia el otro.

/** Naranja de Mercadito: el default cuando el negocio no eligió color. */
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

/** Paleta completa a partir del color de marca del negocio (o el naranja de
 *  Mercadito si no configuró ninguno). */
export function paletaDeMarca(colorMarca?: string | null): PaletaMarca {
  const base = colorMarca || COLOR_MARCA_DEFAULT;
  const accent = paraTextoBlanco(base);
  // La sombra dura tiene que verse SIEMPRE. Si el acento ya es muy oscuro
  // (p.ej. negro), oscurecerlo no crearía contraste → la aclaramos; si no, la
  // oscurecemos bien para que el borde del botón marque.
  const oscuro = lum(accent) < 0.22;
  return {
    accent,
    accentDark: mix(accent, "#000000", 0.18),
    shadow: oscuro ? mix(accent, "#ffffff", 0.4) : mix(accent, "#000000", 0.34),
    soft: mix(base, "#ffffff", 0.9),
    on: "#ffffff",
  };
}
