import { query } from "@/lib/db";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";

/**
 * Cron — push promocional semanal a TODOS los clientes activos con
 * push_token. Diseñado para correr los lunes (cuando la gente arma su
 * compra de la semana) — el crontab del VPS hace el scheduling.
 *
 * Idempotencia: marcamos `push_promo_at` por usuario para no enviar más
 * de una vez por semana si el cron se llama dos veces el mismo día.
 *
 * Mensaje: rotamos entre 4 ganchos cortos para no saturar con el mismo
 * texto cada semana. La elección se hace por la semana del año (módulo 4)
 * — determinístico, sin estado extra que mantener.
 *
 * Auth: header X-Cron-Secret debe coincidir con CRON_SECRET en .env.
 */
const GANCHOS = [
  { title: "👋 Lunes en Mercadito", body: "Empezamos la semana con todo el catálogo abierto. Echa un ojo a las novedades." },
  { title: "🛵 Pídelo hoy", body: "Las tiendas están listas. Tú dale clic y nosotros lo llevamos." },
  { title: "🍽️ ¿Antojo?", body: "Mira lo que está disponible cerca de ti. Tu repartidor ya está calentando motores." },
  { title: "🛒 Tu canasta te espera", body: "Mercadito tiene mandado, mercado y comida hoy mismo. Arma tu lista en 30 segundos." },
];

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Columna idempotencia. Si ya existe, no-op.
  await query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS push_promo_at TIMESTAMPTZ");

  // Filtrar a clientes activos con token que NO recibieron promo en los
  // últimos 6 días — protección anti-doble disparo del cron.
  const filas = await query<{ id: string; push_token: string }>(
    `SELECT u.id, u.push_token FROM usuarios u
     WHERE u.rol = 'cliente'
       AND u.activo = true
       AND u.push_token IS NOT NULL
       AND (u.push_promo_at IS NULL OR u.push_promo_at < NOW() - INTERVAL '6 days')`
  );

  if (filas.length === 0) {
    return NextResponse.json({ enviadas: 0, mensaje: "Nadie cumple criterio" });
  }

  const semana = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const gancho = GANCHOS[semana % GANCHOS.length];

  const tokens = filas.map((u) => u.push_token);
  await enviarPush(tokens, gancho.title, gancho.body, { tipo: "promo_semanal" });

  const ids = filas.map((u) => u.id);
  await query("UPDATE usuarios SET push_promo_at = NOW() WHERE id = ANY($1)", [ids]);

  return NextResponse.json({ enviadas: filas.length, gancho: gancho.title });
}
