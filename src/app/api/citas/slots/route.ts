import { query, queryOne } from "@/lib/db";
import { generarSlots, generarGrid, type HorarioDia, type CitaOcupada } from "@/lib/slots";
import { NextResponse } from "next/server";

// GET /api/citas/slots?puesto_id=X&servicio_id=Y&fecha=YYYY-MM-DD
// Devuelve los slots libres para agendar ese servicio en esa fecha.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const puestoId = searchParams.get("puesto_id");
  const servicioId = searchParams.get("servicio_id");
  const fecha = searchParams.get("fecha"); // fecha local del negocio
  if (!puestoId || !servicioId || !fecha) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  // Día bloqueado por el negocio (vacaciones / día libre) → sin disponibilidad.
  const bloqueado = await queryOne<{ x: number }>(
    "SELECT 1 AS x FROM puesto_dias_bloqueados WHERE puesto_id = $1 AND fecha = $2::date",
    [puestoId, fecha]
  );
  if (bloqueado) {
    return NextResponse.json({ slots: [], grid: [], bloqueado: true });
  }

  const servicio = await queryOne<{ duracion_min: number; buffer_min: number }>(
    "SELECT duracion_min, buffer_min FROM servicios WHERE id = $1 AND puesto_id = $2 AND activo = true",
    [servicioId, puestoId]
  );
  if (!servicio) {
    return NextResponse.json({ error: "Servicio no existe" }, { status: 404 });
  }

  // Duración total a reservar. Para cita multi-persona el cliente envía la suma
  // de las duraciones en `duracion`; si no, se usa la del servicio.
  const duracionParam = parseInt(searchParams.get("duracion") || "", 10);
  const duracionMin = duracionParam > 0 ? duracionParam : servicio.duracion_min;

  const puesto = await queryOne<{ timezone: string; citas_capacidad: number | null }>(
    "SELECT timezone, citas_capacidad FROM puestos WHERE id = $1",
    [puestoId]
  );
  const timezone = puesto?.timezone || "America/Mexico_City";
  const capacidad = Math.max(1, puesto?.citas_capacidad ?? 1);

  const horarios = await query<HorarioDia>(
    `SELECT dia_semana, abre, cierra, descanso_desde, descanso_hasta
     FROM puesto_horario_atencion WHERE puesto_id = $1`,
    [puestoId]
  );

  // Al reagendar, se excluye la cita que se está moviendo (su lugar debe
  // poder reusarse / liberarse).
  const excluir = searchParams.get("excluir");
  const vista = searchParams.get("vista"); // "grid" para la cuadrícula visual

  // Citas activas alrededor de la fecha (±1 día cubre cualquier desfase de
  // timezone). Excluimos la cita editada si se pidió.
  const ocupadas = await query<CitaOcupada>(
    `SELECT inicio, fin FROM citas
     WHERE puesto_id = $1
       AND estado IN ('pendiente','confirmada')
       AND inicio >= ($2::date - 1) AND inicio < ($2::date + 2)
       ${excluir ? "AND id <> $3" : ""}`,
    excluir ? [puestoId, fecha, excluir] : [puestoId, fecha]
  );

  const bufferMin = duracionParam > 0 ? 0 : servicio.buffer_min;

  if (vista === "grid") {
    // La cita que se mueve (para pintarla de azul en la cuadrícula).
    const editada = excluir
      ? await queryOne<CitaOcupada>("SELECT inicio, fin FROM citas WHERE id = $1", [excluir])
      : null;
    const grid = generarGrid({ fecha, timezone, duracionMin, bufferMin, horarios, ocupadas, editada, leadMin: 0 });
    return NextResponse.json({ grid, timezone });
  }

  const slots = generarSlots({
    fecha,
    timezone,
    duracionMin,
    bufferMin,
    intervaloMin: 15, // los slots empiezan cada 15 min; la disponibilidad
    // ya verifica que la duración completa quepa sin chocar con citas ocupadas.
    horarios,
    ocupadas,
    leadMin: 0,
    capacidad,
  });

  return NextResponse.json({ slots, timezone });
}
