/**
 * Datos de la ficha del negocio, formateados para mostrar.
 *
 * ESPEJO de src/lib/fichaNegocio.ts (web). Todo esto es lo que el cliente
 * preguntaba por WhatsApp antes de pedir ("¿están abiertos?", "¿dónde están?",
 * "¿aceptan tarjeta?"). Si cambia allá, cambia aquí.
 */

export interface HorarioDia {
  dia_semana: number;
  abre: string | null;
  cierra: string | null;
  descanso_desde?: string | null;
  descanso_hasta?: string | null;
}

export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export const LABEL_PAGO: Record<string, string> = {
  efectivo: "💵 Efectivo",
  tarjeta: "💳 Tarjeta",
  transferencia: "🏦 Transferencia",
};

export const LABEL_SERVICIO: Record<string, string> = {
  local: "🍽️ Comer aquí",
  llevar: "🥡 Para llevar",
  domicilio: "🛵 A domicilio",
};

export interface FilaHorario { dias: string; horas: string; hoy: boolean }

const rango = (h: HorarioDia | undefined): string => {
  if (!h || !h.abre || !h.cierra) return "Cerrado";
  // El descanso ("la hora de la siesta") es la diferencia entre un horario
  // corrido y uno partido, y es justo cuando la gente llega y no hay nadie.
  return h.descanso_desde && h.descanso_hasta
    ? `${h.abre} – ${h.descanso_desde} · ${h.descanso_hasta} – ${h.cierra}`
    : `${h.abre} – ${h.cierra}`;
};

/** Agrupa días consecutivos con el mismo horario: "Lunes a viernes 08:00 –
 *  22:00" en vez de cinco renglones idénticos. Arranca en lunes porque así lee
 *  la gente una semana, aunque la DB numere desde el domingo. */
export function filasHorario(horario: HorarioDia[], diaHoy: number): FilaHorario[] {
  if (!horario || horario.length === 0) return [];
  const porDia = new Map(horario.map((h) => [Number(h.dia_semana), h]));
  const orden = [1, 2, 3, 4, 5, 6, 0];

  const filas: FilaHorario[] = [];
  let i = 0;
  while (i < orden.length) {
    const texto = rango(porDia.get(orden[i]));
    let j = i;
    while (j + 1 < orden.length && rango(porDia.get(orden[j + 1])) === texto) j++;
    const hoy = orden.slice(i, j + 1).includes(diaHoy);
    const dias =
      i === j
        ? DIAS[orden[i]]
        : j === i + 1
          ? `${DIAS_CORTO[orden[i]]} y ${DIAS_CORTO[orden[j]]}`
          : `${DIAS[orden[i]]} a ${DIAS[orden[j]].toLowerCase()}`;
    filas.push({ dias, horas: texto, hoy });
    i = j + 1;
  }
  return filas;
}

/** Día de la semana en hora de México (0 = domingo), que es el huso con el que
 *  el servidor calcula si está abierto. */
export function diaSemanaMX(ahora: Date = new Date()): number {
  const enMx = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
  return enMx.getDay();
}

/** Link a la app de mapas. Con coordenadas va al punto exacto; sin ellas, a la
 *  búsqueda por dirección, que es mejor que nada. */
export function linkMapa(lat: number | null | undefined, lng: number | null | undefined, direccion: string | null | undefined): string | null {
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (direccion && direccion.trim()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion.trim())}`;
  return null;
}
