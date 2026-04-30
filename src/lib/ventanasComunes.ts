// Cálculo de ventanas de tiempo en las que TODAS las tiendas de un carrito
// están abiertas. Sirve para ofrecerle al cliente solo opciones de entrega
// realistas (sin permitir "mañana 9 am" si una tienda no abre a esa hora).

import { query } from "@/lib/db";
import type { HorarioAtencionRow } from "@/lib/proximaApertura";

const MX_TZ = "America/Mexico_City";
const MX_OFFSET = "-06:00";

function mins(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function partsMx(d: Date): { y: string; m: string; day: string; dow: number; hhmm: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: MX_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  const wk = parts.find((p) => p.type === "weekday")!.value.toLowerCase();
  const hh = parts.find((p) => p.type === "hour")!.value;
  const mm = parts.find((p) => p.type === "minute")!.value;
  const dowMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return { y, m, day, dow: dowMap[wk] ?? 0, hhmm: `${hh}:${mm}` };
}

function fechaMx(year: string, month: string, day: string, hhmm: string): Date {
  return new Date(`${year}-${month}-${day}T${hhmm}:00${MX_OFFSET}`);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 3600 * 1000);
}

/** Ventanas en minutos desde medianoche en que un puesto está abierto el DOW dado. */
function ventanasPuestoEnDia(rows: HorarioAtencionRow[], dow: number): Array<[number, number]> {
  // Sin filas para este puesto → 24/7 → ventana completa.
  // Sin filas para este DOW → cerrado ese día → []. (Solo aplica si HAY filas en otros días.)
  const filasDelPuesto = rows;
  if (filasDelPuesto.length === 0) return [[0, 24 * 60]];
  const filasDow = filasDelPuesto.filter((r) => r.dia_semana === dow && r.abre && r.cierra);
  if (filasDow.length === 0) return [];

  const ventanas: Array<[number, number]> = [];
  for (const r of filasDow) {
    const a = mins(r.abre!);
    let c = mins(r.cierra!);
    // Cruce de medianoche: tratamos como hasta 24:00 ese día (no extendemos al
    // día siguiente para mantener la lógica simple — la cubre el DOW siguiente).
    if (a >= c) c = 24 * 60;
    if (r.descanso_desde && r.descanso_hasta) {
      const dd = mins(r.descanso_desde);
      const dh = mins(r.descanso_hasta);
      if (dd > a && dh < c && dd < dh) {
        ventanas.push([a, dd]);
        ventanas.push([dh, c]);
        continue;
      }
    }
    ventanas.push([a, c]);
  }
  // Merge
  ventanas.sort((x, y) => x[0] - y[0]);
  const merged: Array<[number, number]> = [];
  for (const v of ventanas) {
    const last = merged[merged.length - 1];
    if (last && v[0] <= last[1]) last[1] = Math.max(last[1], v[1]);
    else merged.push([v[0], v[1]]);
  }
  return merged;
}

function interseccion(a: Array<[number, number]>, b: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]);
    const hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return out;
}

export interface VentanaSugerida {
  inicio: string; // ISO UTC
  fin: string;    // ISO UTC
  /** Ej. "Hoy 16:00–19:00", "Mañana 09:00–13:00". */
  label: string;
}

export interface VentanasComunesResp {
  /** ¿Todas las tiendas están abiertas justo en el momento `now`? */
  ahora_disponible: boolean;
  /** Lista de ventanas futuras (no incluye "ahora"). Tope ~6 ventanas. */
  ventanas: VentanaSugerida[];
}

/** Calcula ventanas comunes a varios puestos en los próximos N días (default 7).
 *  7 días cubre toda la semana, así nunca devolvemos vacío para un puesto que
 *  abre algún día — antes con 4 días se perdían tiendas que abren solo
 *  jueves/viernes/sábado si el cliente entraba domingo después de cierre.
 *
 *  Si alguno de los puestos tiene `lead_time_horas > 0` (tienda por encargo),
 *  las ventanas se recortan a partir de `now + maxLead` — el cliente no puede
 *  agendar más cerca que el lead time mayor del carrito. */
export async function ventanasComunes(
  puestoIds: string[],
  dias: number = 7,
  now: Date = new Date()
): Promise<VentanasComunesResp> {
  if (puestoIds.length === 0) return { ahora_disponible: true, ventanas: [] };
  const rows = await query<HorarioAtencionRow>(
    `SELECT puesto_id, dia_semana, abre, cierra, descanso_desde, descanso_hasta
     FROM puesto_horario_atencion
     WHERE puesto_id = ANY($1)`,
    [puestoIds]
  );
  const porPuesto = new Map<string, HorarioAtencionRow[]>();
  for (const id of puestoIds) porPuesto.set(id, []);
  for (const r of rows) porPuesto.get(r.puesto_id)?.push(r);

  // Lead time máximo entre los puestos del carrito (en días calendario MX).
  const leadRows = await query<{ id: string; lead_time_dias: number }>(
    `SELECT id, lead_time_dias FROM puestos WHERE id = ANY($1)`,
    [puestoIds]
  );
  const maxLead = leadRows.reduce((m, r) => Math.max(m, Number(r.lead_time_dias) || 0), 0);
  // Si hay lead, "now efectivo" se desplaza al inicio del día calendario MX
  // que cumple el lead. Ej: encargas el 29 a las 9 PM con lead=1 día →
  // efectivo = 30 abril 00:00 MX, así puedes recibir cualquier momento del
  // 30 abril (no exige 24h estrictas).
  let nowEfectivo = now;
  if (maxLead > 0) {
    const p = partsMx(now);
    // Construir la "medianoche del día actual" en MX y sumar maxLead días.
    const startToday = fechaMx(p.y, p.m, p.day, "00:00");
    nowEfectivo = new Date(startToday.getTime() + maxLead * 24 * 3600 * 1000);
  }

  // Para cada día, intersectar ventanas de todos los puestos.
  const todas: VentanaSugerida[] = [];
  let ahoraOk = true;

  for (let i = 0; i < dias; i++) {
    const dia = addDays(now, i);
    const { y, m, day, dow } = partsMx(dia);
    let comun: Array<[number, number]> | null = null;
    for (const id of puestoIds) {
      const v = ventanasPuestoEnDia(porPuesto.get(id) ?? [], dow);
      if (comun == null) comun = v;
      else comun = interseccion(comun, v);
      if (comun.length === 0) break;
    }
    if (!comun || comun.length === 0) continue;

    // Convertir cada ventana a Date inicio/fin. Si es hoy, recortar al >= now
    // (o >= nowEfectivo si hay lead time, para no permitir agendar antes de
    // que se cumpla la anticipación).
    for (const [a, c] of comun) {
      const inicioCand = fechaMx(y, m, day, fmtMin(a));
      const finCand = fechaMx(y, m, day, fmtMin(c));
      // Si la ventana entera termina antes de nowEfectivo, descartamos.
      if (finCand.getTime() <= nowEfectivo.getTime()) continue;
      // Si el inicio queda antes de nowEfectivo, lo movemos.
      const inicio = inicioCand.getTime() < nowEfectivo.getTime() ? nowEfectivo : inicioCand;
      const label = etiquetaVentana(inicio, finCand, now);
      todas.push({ inicio: inicio.toISOString(), fin: finCand.toISOString(), label });
      if (todas.length >= 6) break;
    }
    if (todas.length >= 6) break;
  }

  // ¿Estamos abiertos AHORA? Solo si NO hay lead time y la primera ventana
  // incluye now. Si hay lead time, "Ahora" nunca se ofrece.
  ahoraOk = false;
  if (maxLead === 0 && todas.length > 0) {
    const v0 = todas[0];
    if (new Date(v0.inicio).getTime() <= now.getTime() + 60 * 1000) ahoraOk = true;
  }

  return { ahora_disponible: ahoraOk, ventanas: todas };
}

function fmtMin(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function etiquetaVentana(inicio: Date, fin: Date, now: Date): string {
  const partsIni = partsMx(inicio);
  const partsAhora = partsMx(now);
  const partsFin = partsMx(fin);
  const mismoDia = partsIni.y === partsAhora.y && partsIni.m === partsAhora.m && partsIni.day === partsAhora.day;
  const mañana = (() => {
    const m = addDays(now, 1);
    const p = partsMx(m);
    return partsIni.y === p.y && partsIni.m === p.m && partsIni.day === p.day;
  })();
  const dowEs = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  let prefijo: string;
  if (mismoDia) prefijo = "Hoy";
  else if (mañana) prefijo = "Mañana";
  else {
    const dow = partsIni.dow;
    prefijo = dowEs[dow] + " " + Number(partsIni.day);
  }
  // Tienda 24/7 (00:00 a 24:00 del mismo día calendario): mostrar
  // "(todo el día)" en lugar del rango feo "00:00–24:00".
  const cubreTodoElDia = partsIni.hhmm === "00:00" && (partsFin.hhmm === "24:00" || partsFin.hhmm === "00:00");
  if (cubreTodoElDia) return `${prefijo} (todo el día)`;
  return `${prefijo} ${partsIni.hhmm}–${partsFin.hhmm}`;
}
