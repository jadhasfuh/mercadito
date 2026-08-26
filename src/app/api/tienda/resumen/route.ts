import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/tienda/resumen?dias=7 — el negocio visto por sus propios números.
//
// Todo esto ya estaba guardado y no se le mostraba a nadie: los reportes de
// ventas vivían en /api/admin/stats (solo Adrian) y el negocio únicamente veía
// el contador de vistas de su menú. Aquí se junta lo suyo, y nada más lo suyo.
//
// Fuentes:
//   · menú     → puestos.menu_vistas / menu_pedidos (acumulado desde siempre)
//   · top      → menu_ventas (pedidos del menú + comandas de mesa)
//   · ventas   → cuentas cerradas en el periodo, con sus pedidos
// Sin delivery, las ventas que pasan por la plataforma son las de mesa: lo que
// sale por WhatsApp lo cobra el negocio por su cuenta y no lo podemos ver.

const DIAS_VALIDOS = [7, 15, 30, 90];

export async function GET(req: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "admin") || !usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const puestoId = usuario.puesto_id;

  const pedido = Number(new URL(req.url).searchParams.get("dias"));
  const dias = DIAS_VALIDOS.includes(pedido) ? pedido : 7;

  // ── Menú digital ────────────────────────────────────────────────────
  const menu = await queryOne<{ vistas: number; pedidos: number }>(
    "SELECT COALESCE(menu_vistas, 0)::int AS vistas, COALESCE(menu_pedidos, 0)::int AS pedidos FROM puestos WHERE id = $1",
    [puestoId]
  );

  // ── Más vendidos ────────────────────────────────────────────────────
  // El nombre se lee de `productos` en vivo: si el negocio lo renombró, el
  // resumen debe decir el nombre de hoy, no el de cuando se vendió.
  const masVendidos = await query<{ producto_id: string; nombre: string; pedidos: number; cantidad: string }>(
    `SELECT mv.producto_id, COALESCE(p.nombre, 'Producto') AS nombre, mv.pedidos, mv.cantidad
     FROM menu_ventas mv
     LEFT JOIN productos p ON p.id = mv.producto_id
     WHERE mv.puesto_id = $1 AND mv.pedidos > 0
     ORDER BY mv.pedidos DESC, mv.cantidad DESC
     LIMIT 8`,
    [puestoId]
  ).catch(() => []);

  // ── Ventas de mesa en el periodo ────────────────────────────────────
  // Una cuenta puede tener varios pedidos (el comensal manda a cocina varias
  // veces): el total de la cuenta es la suma de los suyos, sin cancelados.
  const totalCuenta = `(
    SELECT COALESCE(SUM(pe.total), 0) FROM pedidos pe
    WHERE pe.cuenta_id = c.id AND pe.estado <> 'cancelado'
  )`;

  const resumen = await queryOne<{ cuentas: number; total: string; propinas: string }>(
    `SELECT COUNT(*)::int AS cuentas,
            COALESCE(SUM(${totalCuenta}), 0) AS total,
            COALESCE(SUM(c.propina), 0) AS propinas
     FROM cuentas c
     WHERE c.puesto_id = $1 AND c.estado = 'cerrada'
       AND c.cerrada_at > NOW() - make_interval(days => $2)`,
    [puestoId, dias]
  ).catch(() => null);

  const porDia = await query<{ fecha: string; total: string; cuentas: number }>(
    `SELECT to_char(c.cerrada_at AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') AS fecha,
            COALESCE(SUM(${totalCuenta}), 0) AS total,
            COUNT(*)::int AS cuentas
     FROM cuentas c
     WHERE c.puesto_id = $1 AND c.estado = 'cerrada'
       AND c.cerrada_at > NOW() - make_interval(days => $2)
     GROUP BY fecha
     ORDER BY fecha`,
    [puestoId, dias]
  ).catch(() => []);

  // Hora pico: en qué hora del día se cierran más cuentas. Es la respuesta a
  // "¿a qué hora necesito más gente?", que hoy se contesta de memoria.
  const porHora = await query<{ hora: number; cuentas: number; total: string }>(
    `SELECT EXTRACT(HOUR FROM c.cerrada_at AT TIME ZONE 'America/Mexico_City')::int AS hora,
            COUNT(*)::int AS cuentas,
            COALESCE(SUM(${totalCuenta}), 0) AS total
     FROM cuentas c
     WHERE c.puesto_id = $1 AND c.estado = 'cerrada'
       AND c.cerrada_at > NOW() - make_interval(days => $2)
     GROUP BY hora
     ORDER BY cuentas DESC
     LIMIT 3`,
    [puestoId, dias]
  ).catch(() => []);

  const cuentas = resumen?.cuentas ?? 0;
  const total = Number(resumen?.total ?? 0);

  return NextResponse.json({
    dias,
    menu: {
      vistas: menu?.vistas ?? 0,
      pedidos: menu?.pedidos ?? 0,
      // Conversión del menú: de cada 100 que lo abren, cuántos mandaron el
      // pedido. Es LA métrica del menú digital y no se mostraba en ningún lado.
      conversion: menu && menu.vistas > 0 ? Math.round((menu.pedidos / menu.vistas) * 1000) / 10 : null,
    },
    mas_vendidos: masVendidos.map((m) => ({
      producto_id: m.producto_id, nombre: m.nombre,
      pedidos: Number(m.pedidos), cantidad: Number(m.cantidad),
    })),
    mesas: {
      cuentas,
      total,
      propinas: Number(resumen?.propinas ?? 0),
      ticket_promedio: cuentas > 0 ? Math.round((total / cuentas) * 100) / 100 : 0,
      por_dia: porDia.map((d) => ({ fecha: d.fecha, total: Number(d.total), cuentas: Number(d.cuentas) })),
      horas_pico: porHora.map((h) => ({ hora: Number(h.hora), cuentas: Number(h.cuentas), total: Number(h.total) })),
    },
  });
}
