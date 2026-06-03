import { theme } from "./theme";
import type { EstadoCita } from "../api/citas";

// Formato de fechas de cita SIN depender de Intl (Hermes en Android trae
// soporte parcial). inicio es ISO UTC; new Date() lo pasa a hora local del
// dispositivo, que en MX coincide con la del negocio.

const DOW = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "Lunes 9 junio · 14:30" */
export function fmtCitaLarga(iso: string): string {
  const d = new Date(iso);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "9 jun · 14:30" — compacto para listas densas (panel de tienda). */
export function fmtCitaCorta(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Solo la hora "14:30". */
export function fmtHora(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const ESTADO_CITA: Record<EstadoCita, { label: string; color: string; bg: string }> = {
  pendiente: { label: "Pendiente", color: theme.colors.warningDark, bg: theme.colors.warningLight },
  confirmada: { label: "Confirmada", color: theme.colors.accentDark, bg: theme.colors.accentLight },
  completada: { label: "Completada", color: theme.colors.gray600, bg: theme.colors.gray100 },
  cancelada: { label: "Cancelada", color: theme.colors.dangerDark, bg: theme.colors.dangerLight },
  no_show: { label: "No asistió", color: theme.colors.dangerDark, bg: theme.colors.dangerLight },
};
