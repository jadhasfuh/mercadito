// Generación de slots de cita disponibles.
//
// Patrón (estilo Timeslottr / Nylas): NO guardamos slots en DB. Se calculan
// en runtime a partir del horario laboral del negocio (puesto_horario_atencion)
// menos las citas ya ocupadas (+ buffer), para la fecha y servicio pedidos.
//
// Todo se guarda y compara en UTC; los horarios laborales son hora de pared
// (wall-clock "HH:MM") en la timezone del negocio. La conversión wall→UTC es
// DST-safe vía Intl (no construimos offsets a mano).

export interface HorarioDia {
  dia_semana: number; // 0=domingo ... 6=sábado
  abre: string | null; // "HH:MM" hora local del negocio
  cierra: string | null;
  descanso_desde: string | null;
  descanso_hasta: string | null;
}

export interface CitaOcupada {
  inicio: string | Date; // ISO/Date UTC
  fin: string | Date;
}

export interface Slot {
  inicio: string; // ISO UTC
  fin: string; // ISO UTC
  label: string; // "HH:MM" hora local del negocio
}

// Negocio sin horario configurado: sigue siendo agendable con una ventana
// por defecto, para no bloquear el alta de un negocio nuevo.
const DEFAULT_ABRE = "09:00";
const DEFAULT_CIERRA = "18:00";

function parseHM(s: string): number {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  return h * 60 + (m || 0);
}

function fmtHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Offset (ms) entre la timezone y UTC para un instante dado. DST-safe.
function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") map[p.type] = parseInt(p.value, 10);
  }
  const asUTC = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return asUTC - instant.getTime();
}

// Convierte una hora de pared (y/m/d hh:mm) en `timeZone` al instante UTC real.
function wallTimeToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string
): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

interface Ventana {
  desde: number; // minutos del día
  hasta: number;
}

// Construye las ventanas laborales del día (restando el descanso si existe).
function ventanasDelDia(horarios: HorarioDia[], weekday: number): Ventana[] {
  if (horarios.length === 0) {
    return [{ desde: parseHM(DEFAULT_ABRE), hasta: parseHM(DEFAULT_CIERRA) }];
  }
  const row = horarios.find((h) => h.dia_semana === weekday);
  if (!row || !row.abre || !row.cierra) return []; // cerrado ese día
  const abre = parseHM(row.abre);
  const cierra = parseHM(row.cierra);
  if (cierra <= abre) return [];
  if (row.descanso_desde && row.descanso_hasta) {
    const dDesde = parseHM(row.descanso_desde);
    const dHasta = parseHM(row.descanso_hasta);
    if (dDesde > abre && dHasta < cierra && dHasta > dDesde) {
      return [
        { desde: abre, hasta: dDesde },
        { desde: dHasta, hasta: cierra },
      ];
    }
  }
  return [{ desde: abre, hasta: cierra }];
}

export function generarSlots(opts: {
  fecha: string; // "YYYY-MM-DD" (fecha local del negocio)
  timezone: string;
  duracionMin: number;
  bufferMin?: number;
  horarios: HorarioDia[];
  ocupadas: CitaOcupada[];
  ahora?: Date;
  intervaloMin?: number; // paso entre inicios de slot; default = duración
  leadMin?: number; // anticipación mínima desde ahora (minutos)
  capacidad?: number; // citas simultáneas que el negocio puede atender (default 1)
}): Slot[] {
  const {
    fecha,
    timezone,
    duracionMin,
    bufferMin = 0,
    horarios,
    ocupadas,
    ahora = new Date(),
    leadMin = 0,
    capacidad = 1,
  } = opts;
  const intervalo = opts.intervaloMin && opts.intervaloMin > 0 ? opts.intervaloMin : duracionMin;
  if (duracionMin <= 0) return [];

  const [y, m, d] = fecha.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return [];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  const ventanas = ventanasDelDia(horarios, weekday);
  if (ventanas.length === 0) return [];

  const bufferMs = bufferMin * 60_000;
  const minInicio = ahora.getTime() + leadMin * 60_000;

  // Normaliza citas ocupadas a [inicioMs, finMs].
  const busy = ocupadas.map((c) => ({
    inicio: new Date(c.inicio).getTime(),
    fin: new Date(c.fin).getTime(),
  }));

  const slots: Slot[] = [];
  for (const v of ventanas) {
    for (let start = v.desde; start + duracionMin <= v.hasta; start += intervalo) {
      const hh = Math.floor(start / 60);
      const mm = start % 60;
      const inicioUtc = wallTimeToUtc(y, m, d, hh, mm, timezone);
      const inicioMs = inicioUtc.getTime();
      const finMs = inicioMs + duracionMin * 60_000;

      if (inicioMs < minInicio) continue; // pasado / sin anticipación

      // Capacidad concurrente: cuántas citas se traslapan (con buffer) este
      // slot. Se ofrece mientras haya MENOS que la capacidad del negocio (un
      // salón con 3 sillas puede tener 3 citas a la vez). capacidad=1 = viejo
      // comportamiento (una a la vez).
      const traslapes = busy.filter(
        (b) => inicioMs - bufferMs < b.fin && b.inicio < finMs + bufferMs
      ).length;
      if (traslapes >= Math.max(1, capacidad)) continue;

      slots.push({
        inicio: inicioUtc.toISOString(),
        fin: new Date(finMs).toISOString(),
        label: fmtHM(start),
      });
    }
  }
  return slots;
}

// ─────────────────── Vista de cuadrícula (estilo Cinépolis) ───────────────────
// Devuelve TODOS los bloques de 15 min del horario laboral, con su estado:
//   "ocupado" (otra cita), "actual" (la cita que se está moviendo) o "libre".
// `seleccionable` indica si una reserva de `duracionMin` puede ARRANCAR ahí
// (cabe en el horario y no choca con otras citas + buffer). Sirve para reagendar
// visualmente: gris = apartado, azul = la cita actual, libre = se puede mover ahí.
export interface GridSlot {
  inicio: string; // ISO UTC del bloque
  label: string; // "HH:MM"
  estado: "libre" | "ocupado" | "actual";
  seleccionable: boolean;
}

export function generarGrid(opts: {
  fecha: string;
  timezone: string;
  duracionMin: number;
  bufferMin?: number;
  horarios: HorarioDia[];
  ocupadas: CitaOcupada[]; // YA excluyendo la cita editada
  editada?: CitaOcupada | null; // la cita que se mueve
  ahora?: Date;
  leadMin?: number;
}): GridSlot[] {
  const { fecha, timezone, duracionMin, bufferMin = 0, horarios, ocupadas, editada = null, ahora = new Date(), leadMin = 0 } = opts;
  const intervalo = 15;
  if (duracionMin <= 0) return [];
  const [y, m, d] = fecha.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return [];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const ventanas = ventanasDelDia(horarios, weekday);
  if (ventanas.length === 0) return [];

  const bufferMs = bufferMin * 60_000;
  const minInicio = ahora.getTime() + leadMin * 60_000;
  const busy = ocupadas.map((c) => ({ inicio: new Date(c.inicio).getTime(), fin: new Date(c.fin).getTime() }));
  const edit = editada ? { inicio: new Date(editada.inicio).getTime(), fin: new Date(editada.fin).getTime() } : null;

  const grid: GridSlot[] = [];
  for (const v of ventanas) {
    for (let start = v.desde; start + intervalo <= v.hasta; start += intervalo) {
      const hh = Math.floor(start / 60);
      const mm = start % 60;
      const inicioUtc = wallTimeToUtc(y, m, d, hh, mm, timezone);
      const inicioMs = inicioUtc.getTime();
      const blockEnd = inicioMs + intervalo * 60_000;
      const overlap = (aIni: number, aFin: number) => inicioMs < aFin && aIni < blockEnd;

      let estado: GridSlot["estado"] = "libre";
      if (edit && overlap(edit.inicio, edit.fin)) estado = "actual";
      else if (busy.some((b) => overlap(b.inicio, b.fin))) estado = "ocupado";

      const finResMs = inicioMs + duracionMin * 60_000;
      const cabe = start + duracionMin <= v.hasta;
      const noPasado = inicioMs >= minInicio;
      const chocaOtra = busy.some((b) => inicioMs - bufferMs < b.fin && b.inicio < finResMs + bufferMs);
      const seleccionable = estado !== "ocupado" && cabe && noPasado && !chocaOtra;

      grid.push({ inicio: inicioUtc.toISOString(), label: fmtHM(start), estado, seleccionable });
    }
  }
  return grid;
}
