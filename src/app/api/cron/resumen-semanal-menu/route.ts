import { query } from "@/lib/db";
import { enviarPush } from "@/lib/push";
import { enviarWebPushAUsuarios } from "@/lib/webpush";
import { NextResponse } from "next/server";

/**
 * Cron — resumen semanal al negocio: cuánto se vio su menú y cuántos pedidos
 * generó. Es lo que hace visible el valor de Mercadito: sin esto el negocio
 * paga su mensualidad sin saber qué le está dando.
 *
 * Delta, no acumulado: `menu_vistas`/`menu_pedidos` cuentan desde siempre, así
 * que se compara contra la foto de lo ya reportado (`resumen_vistas`/
 * `resumen_pedidos`) y se manda solo lo de esta semana.
 *
 * Filtros:
 *   - tienda activa, aprobada, con menú público y con push_token
 *   - al menos una vista nueva: sin movimiento no hay nada que presumir, y un
 *     "0 vistas" semanal solo desanima
 *   - no reportada en los últimos 6 días (idempotente si el cron se repite)
 *
 * La foto se actualiza SIEMPRE que se manda, aunque el push falle: si no, un
 * token muerto haría que la próxima semana se reporte el doble.
 *
 * Auth: header X-Cron-Secret. Pensado para correr 1 vez por semana.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Un puesto puede tener varios usuarios de tienda, y cada uno puede estar en
  // la app (push_token), en el panel web (web_push_subs) o en ambos. Se juntan
  // por puesto para que el delta se calcule y se marque una sola vez.
  const filas = await query<{
    puesto_id: string; nombre: string;
    usuario_ids: string[]; tokens: string[];
    vistas: number; pedidos: number; total_vistas: number; total_pedidos: number;
  }>(
    `SELECT p.id AS puesto_id, p.nombre,
            array_agg(u.id) AS usuario_ids,
            array_remove(array_agg(u.push_token), NULL) AS tokens,
            (p.menu_vistas - p.resumen_vistas)   AS vistas,
            (p.menu_pedidos - p.resumen_pedidos) AS pedidos,
            p.menu_vistas  AS total_vistas,
            p.menu_pedidos AS total_pedidos
     FROM puestos p
     JOIN usuarios u ON u.puesto_id = p.id AND u.rol = 'tienda' AND u.activo = true
     WHERE p.activo = true AND p.aprobado = true AND p.menu_publico = true
       AND (p.menu_vistas - p.resumen_vistas) > 0
       AND (p.resumen_at IS NULL OR p.resumen_at < NOW() - INTERVAL '6 days')
     GROUP BY p.id, p.nombre, p.menu_vistas, p.menu_pedidos, p.resumen_vistas, p.resumen_pedidos`
  );

  if (filas.length === 0) return NextResponse.json({ ok: true, enviados: 0 });

  let enviados = 0;
  for (const f of filas) {
    const vistas = Number(f.vistas) || 0;
    const pedidos = Number(f.pedidos) || 0;
    const cuerpo = pedidos > 0
      ? `${vistas} ${vistas === 1 ? "persona vio" : "personas vieron"} tu menú y te mandaron ${pedidos} ${pedidos === 1 ? "pedido" : "pedidos"}.`
      : `${vistas} ${vistas === 1 ? "persona vio" : "personas vieron"} tu menú esta semana. Compártelo para que lleguen más.`;

    const titulo = "📈 Tu menú esta semana";
    const datos = { tipo: "resumen_menu", puesto_id: f.puesto_id };
    try {
      await Promise.all([
        enviarPush(f.tokens ?? [], titulo, cuerpo, datos),
        enviarWebPushAUsuarios(f.usuario_ids ?? [], titulo, cuerpo, datos),
      ]);
      enviados++;
    } catch (e) {
      console.error("[resumen-menu] push falló", f.puesto_id, (e as Error).message);
    }
    // Se marca aunque el push falle: si no, la próxima semana se reportaría
    // acumulado y el negocio vería números inflados.
    await query(
      "UPDATE puestos SET resumen_vistas = $1, resumen_pedidos = $2, resumen_at = NOW() WHERE id = $3",
      [f.total_vistas, f.total_pedidos, f.puesto_id]
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, enviados, candidatos: filas.length });
}
