import type { MenuHorarioDia } from "@/lib/menu";

/**
 * Datos de la ficha del negocio, formateados para mostrar.
 *
 * Todo esto es lo que el cliente preguntaba por WhatsApp antes de pedir
 * ("¿están abiertos?", "¿dónde están?", "¿aceptan tarjeta?"). Ya estaba en la
 * base de datos; lo que faltaba era decirlo.
 *
 * Espejo de mobile/src/lib/fichaNegocio.ts.
 */

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

export interface FilaHorario {
  /** "Lunes a viernes", "Sábado" — días consecutivos con el mismo horario. */
  dias: string;
  /** "08:00 – 22:00" o "Cerrado". */
  horas: string;
  /** ¿Cae hoy dentro de este renglón? Para resaltarlo. */
  hoy: boolean;
}

const rango = (h: MenuHorarioDia | undefined): string => {
  if (!h || !h.abre || !h.cierra) return "Cerrado";
  const base = `${h.abre} – ${h.cierra}`;
  // El descanso ("la hora de la siesta") es la diferencia entre un horario
  // corrido y uno partido, y es exactamente cuando la gente llega y no hay nadie.
  return h.descanso_desde && h.descanso_hasta
    ? `${h.abre} – ${h.descanso_desde} · ${h.descanso_hasta} – ${h.cierra}`
    : base;
};

/**
 * Convierte las 7 filas sueltas en renglones legibles, agrupando días
 * consecutivos con el mismo horario: "Lunes a viernes 08:00 – 22:00" en vez de
 * cinco renglones idénticos. Arranca en lunes porque así lee la gente una
 * semana, aunque la DB numere desde el domingo.
 */
export function filasHorario(horario: MenuHorarioDia[], diaHoy: number): FilaHorario[] {
  if (horario.length === 0) return [];
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
 *  se calcula `abierto` en el servidor. Usar la hora local del visitante daría
 *  otro día para quien abra el menú desde otro país. */
export function diaSemanaMX(ahora: Date = new Date()): number {
  const enMx = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
  return enMx.getDay();
}

/** Link a la app de mapas. Con coordenadas va al punto exacto; sin ellas,
 *  a la búsqueda por dirección, que es mejor que nada. */
export function linkMapa(lat: number | null, lng: number | null, direccion: string | null): string | null {
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (direccion?.trim()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion.trim())}`;
  return null;
}
