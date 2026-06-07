import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// POST /api/puestos/activar-reservas
// Habilita el módulo de Reservas para cualquier negocio (restaurante, café, etc.).
// El modelo ya es agnóstico: basta con que el puesto sea tipo 'servicios' o 'ambos'.
// Un negocio de catálogo ('mercado') pasa a 'ambos' (mantiene su catálogo + gana
// reservas). Se le da prueba de 30 días si no tiene suscripción vigente, y se
// auto-crea un servicio "Reservar mesa" para que quede usable de inmediato.
export async function POST() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "tienda" || !usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const puesto = await queryOne<{ tipo: string; suscripcion_hasta: string | null; categoria_servicio: string | null }>(
    "SELECT tipo, suscripcion_hasta, categoria_servicio FROM puestos WHERE id = $1",
    [usuario.puesto_id]
  );
  if (!puesto) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

  // 'mercado' → 'ambos' (catálogo + reservas). 'servicios'/'ambos' ya están activos.
  const nuevoTipo = puesto.tipo === "mercado" ? "ambos" : puesto.tipo;
  // Trial de 30 días sólo si no hay suscripción vigente todavía.
  const darTrial = !puesto.suscripcion_hasta || new Date(puesto.suscripcion_hasta) < new Date();
  // Si no tiene categoría de servicio, asumimos restaurante/café → en el directorio
  // de reservas sale como "Reservar mesa" 🍽️ (en vez de "Otros servicios").
  const ponerCategoria = !puesto.categoria_servicio;

  await query(
    `UPDATE puestos SET tipo = $1${darTrial ? ", suscripcion_hasta = NOW() + INTERVAL '30 days'" : ""}${ponerCategoria ? ", categoria_servicio = 'restaurante'" : ""}
     WHERE id = $2`,
    [nuevoTipo, usuario.puesto_id]
  );

  // Si no tiene ningún servicio, sembrar uno por defecto para que pueda recibir
  // reservas sin configurar nada. El negocio lo edita/renombra después.
  const tiene = await queryOne<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM servicios WHERE puesto_id = $1",
    [usuario.puesto_id]
  );
  if (tiene && Number(tiene.n) === 0) {
    await query(
      `INSERT INTO servicios (id, puesto_id, nombre, descripcion, duracion_min, buffer_min, precio, orden)
       VALUES ($1, $2, 'Reservar mesa', 'Reserva tu lugar. El negocio confirmará disponibilidad.', 90, 0, NULL, 0)`,
      [`serv-${uuidv4().slice(0, 8)}`, usuario.puesto_id]
    );
  }

  return NextResponse.json({ ok: true, tipo: nuevoTipo, trial: darTrial });
}
