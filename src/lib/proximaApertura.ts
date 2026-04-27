// Cálculo de próxima fecha/hora en que un puesto estará abierto, considerando
// `puesto_horario_atencion` (días + horarios + ventana de siesta) y la zona
// horaria America/Mexico_City. México no aplica DST → offset fijo -06:00.

import { query } from "@/lib/db";

export interface HorarioAtencionRow {
  puesto_id: string;
  dia_semana: number;
  abre: string | null;
  cierra: string | null;
  descanso_desde: string | null;
  descanso_hasta: string | null;
}

const MX_TZ = "America/Mexico_City";

// Offset fijo -06:00. Si algún día México vuelve al DST, esto necesita revisión.
const MX_OFFSET = "-06:00";

function partsMx(d: Date): { y: string; m: string; day: string; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: MX_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  const wk = parts.find((p) => p.type === "weekday")!.value.toLowerCase();
  const dowMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return { y, m, day, dow: dowMap[wk] ?? 0 };
}

function fechaMx(year: string, month: string, day: string, hhmm: string): Date {
  return new Date(`${year}-${month}-${day}T${hhmm}:00${MX_OFFSET}`);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 3600 * 1000);
}

/**
 * Dada una colección de horarios de atención de un puesto, devuelve el
 * timestamp más cercano (>= ref) en que el puesto está abierto. Si está
 * abierto AHORA o en el momento `ref`, devuelve `ref`. Si nunca abre en
 * los próximos 14 días devuelve null.
 *
 * - Sin filas en horarios → puesto 24/7 → devuelve `ref`.
 * - Si en `ref` hay descanso, devuelve el final del descanso (cuando reabre).
 */
export function proximaAperturaCalc(
  horarios: HorarioAtencionRow[],
  ref: Date = new Date()
): Date | null {
  if (horarios.length === 0) return ref;

  // Agrupar por dia_semana
  const porDia = new Map<number, HorarioAtencionRow[]>();
  for (const h of horarios) {
    if (!h.abre || !h.cierra) continue;
    if (!porDia.has(h.dia_semana)) porDia.set(h.dia_semana, []);
    porDia.get(h.dia_semana)!.push(h);
  }
  if (porDia.size === 0) return null;

  for (let i = 0; i < 14; i++) {
    const d = addDays(ref, i);
    const { y, m, day, dow } = partsMx(d);
    const filas = porDia.get(dow);
    if (!filas) continue;
    for (const h of filas) {
      const abre = fechaMx(y, m, day, h.abre!);
      // Manejo simple de cruce de medianoche (abre > cierra): la ventana se
      // extiende al día siguiente. Aproximación: tratamos cierra como hh:mm
      // del DÍA SIGUIENTE si abre > cierra.
      let cierra: Date;
      if (h.abre! <= h.cierra!) {
        cierra = fechaMx(y, m, day, h.cierra!);
      } else {
        const dPlus1 = addDays(d, 1);
        const next = partsMx(dPlus1);
        cierra = fechaMx(next.y, next.m, next.day, h.cierra!);
      }

      // Estamos antes del abre? → próximo abre
      if (ref.getTime() <= abre.getTime() && abre.getTime() <= cierra.getTime()) {
        // Estamos antes de abrir hoy
        if (ref.getTime() < abre.getTime()) return abre;
      }

      // Estamos dentro del horario de atención
      if (ref.getTime() >= abre.getTime() && ref.getTime() <= cierra.getTime()) {
        // Hay siesta?
        if (h.descanso_desde && h.descanso_hasta) {
          const dDesde = fechaMx(y, m, day, h.descanso_desde);
          const dHasta = fechaMx(y, m, day, h.descanso_hasta);
          if (ref.getTime() >= dDesde.getTime() && ref.getTime() < dHasta.getTime()) {
            return dHasta;
          }
        }
        return ref; // Está abierto AHORA
      }
    }
  }
  return null;
}

/** Trae horarios de los puestos pedidos y calcula su próxima apertura. */
export async function proximasAperturas(
  puestoIds: string[],
  ref: Date = new Date()
): Promise<Record<string, string | null>> {
  if (puestoIds.length === 0) return {};
  const rows = await query<HorarioAtencionRow>(
    `SELECT puesto_id, dia_semana, abre, cierra, descanso_desde, descanso_hasta
     FROM puesto_horario_atencion
     WHERE puesto_id = ANY($1)`,
    [puestoIds]
  );
  const porPuesto = new Map<string, HorarioAtencionRow[]>();
  for (const id of puestoIds) porPuesto.set(id, []);
  for (const r of rows) porPuesto.get(r.puesto_id)?.push(r);

  const out: Record<string, string | null> = {};
  for (const id of puestoIds) {
    const horarios = porPuesto.get(id) || [];
    const fecha = proximaAperturaCalc(horarios, ref);
    out[id] = fecha ? fecha.toISOString() : null;
  }
  return out;
}
