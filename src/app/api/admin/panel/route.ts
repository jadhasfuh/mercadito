import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { PRECIO_MENSUAL } from "@/lib/plan";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/panel — resumen del negocio SIN delivery.
 *
 * El endpoint viejo (/api/admin/stats) mide comisiones, envíos y ventas por
 * repartidor: todo eso dejó de existir. Lo que importa ahora es cuántos
 * negocios pagan, cuántos están por vencer y cuánto entra al mes.
 *
 * Se deja aparte en vez de reescribir `stats` para que el panel de delivery
 * siga intacto si se vuelve a prender el flag.
 */
export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Suscripciones. `suscripcion_hasta` marca hasta cuándo tiene acceso, tanto
  // en prueba como pagando; `plan` solo distingue cómo llegó ahí.
  const susc = await queryOne<{
    pagando: number; prueba: number; vencidos: number; por_vencer: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE plan = 'pro'    AND suscripcion_hasta > NOW())::int AS pagando,
       COUNT(*) FILTER (WHERE plan <> 'pro'   AND suscripcion_hasta > NOW())::int AS prueba,
       COUNT(*) FILTER (WHERE suscripcion_hasta IS NULL OR suscripcion_hasta <= NOW())::int AS vencidos,
       COUNT(*) FILTER (WHERE suscripcion_hasta > NOW()
                          AND suscripcion_hasta <= NOW() + INTERVAL '15 days')::int AS por_vencer
     FROM puestos WHERE activo = true AND aprobado = true`
  );

  const negocios = await queryOne<{ total: number; con_menu: number; sin_whatsapp: number }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE menu_publico = true AND EXISTS (
         SELECT 1 FROM precios pr WHERE pr.puesto_id = p.id AND pr.activo = true))::int AS con_menu,
       COUNT(*) FILTER (WHERE menu_publico = true
         AND (telefono_contacto IS NULL
              OR length(regexp_replace(telefono_contacto, '\\D', '', 'g')) < 10))::int AS sin_whatsapp
     FROM puestos p WHERE activo = true AND aprobado = true`
  );

  const usuarios = await queryOne<{ clientes: number; tiendas: number; nuevos_semana: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE rol = 'cliente')::int AS clientes,
       COUNT(*) FILTER (WHERE rol = 'tienda')::int  AS tiendas,
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS nuevos_semana
     FROM usuarios WHERE activo = true`
  );

  // Actividad de los menús: es la señal de si la plataforma sirve. Sin
  // pedidos propios, esto sustituye a las ventas del panel viejo.
  const actividad = await queryOne<{ vistas: number; pedidos: number }>(
    `SELECT COALESCE(SUM(menu_vistas), 0)::int AS vistas,
            COALESCE(SUM(menu_pedidos), 0)::int AS pedidos
     FROM puestos WHERE activo = true AND aprobado = true`
  );

  // Quiénes vencen pronto: es la lista de a quién hay que cobrarle.
  const porVencer = await query<{ id: string; nombre: string; hasta: string; plan: string; dias: number }>(
    `SELECT id, nombre, suscripcion_hasta AS hasta, plan,
            GREATEST(0, CEIL(EXTRACT(EPOCH FROM (suscripcion_hasta - NOW())) / 86400))::int AS dias
     FROM puestos
     WHERE activo = true AND aprobado = true
       AND suscripcion_hasta > NOW() AND suscripcion_hasta <= NOW() + INTERVAL '15 days'
     ORDER BY suscripcion_hasta
     LIMIT 20`
  );

  // Los que más mueven: reemplaza al "top repartidores" del panel viejo.
  const topMenus = await query<{ id: string; nombre: string; vistas: number; pedidos: number }>(
    `SELECT id, nombre, menu_vistas::int AS vistas, menu_pedidos::int AS pedidos
     FROM puestos
     WHERE activo = true AND aprobado = true AND menu_vistas > 0
     ORDER BY menu_vistas DESC LIMIT 10`
  );

  const pagando = susc?.pagando ?? 0;
  return NextResponse.json({
    suscripciones: susc ?? { pagando: 0, prueba: 0, vencidos: 0, por_vencer: 0 },
    negocios: negocios ?? { total: 0, con_menu: 0, sin_whatsapp: 0 },
    usuarios: usuarios ?? { clientes: 0, tiendas: 0, nuevos_semana: 0 },
    actividad: actividad ?? { vistas: 0, pedidos: 0 },
    // Lo que entra al mes hoy. Las pruebas no cuentan: todavía no pagan.
    ingreso_mensual: pagando * PRECIO_MENSUAL,
    // Lo que entraría si todas las pruebas vigentes se convirtieran.
    ingreso_potencial: (pagando + (susc?.prueba ?? 0)) * PRECIO_MENSUAL,
    precio_mensual: PRECIO_MENSUAL,
    por_vencer: porVencer,
    top_menus: topMenus,
  });
}
