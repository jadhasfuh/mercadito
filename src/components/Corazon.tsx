/**
 * Corazón de favorito. SVG y no emoji: el 🤍 desaparece sobre fondo blanco en
 * Android y el ❤️ se pinta distinto en cada plataforma (y en algunas ni
 * siquiera respeta el tamaño de fuente).
 *
 * `color` para cuando el corazón vive sobre un fondo de color (chip activo):
 * el rosa de favorito se pierde sobre naranja.
 */
export default function Corazon({ activo, size = 17, color }: { activo: boolean; size?: number; color?: string }) {
  const c = color ?? (activo ? "#E1306C" : "#9CA3AF");
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={activo ? c : "none"} stroke={c}
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4l8.8 8.8 8.8-8.8a5.2 5.2 0 0 0 0-7.4z" />
    </svg>
  );
}
