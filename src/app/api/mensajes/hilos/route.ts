import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/mensajes/hilos — bandeja de soporte del admin.
 *
 * Un renglón por negocio que haya escrito o recibido algo, con su último
 * mensaje y cuántos están sin leer. Sin esto el admin tendría que abrir
 * negocio por negocio para saber quién pidió ayuda.
 */
export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const hilos = await query<{
    puesto_id: string; puesto_nombre: string; telefono_contacto: string | null;
    ultimo: string; ultimo_de: string; ultimo_at: string; sin_leer: number;
  }>(
    `SELECT m.para_puesto_id AS puesto_id,
            p.nombre         AS puesto_nombre,
            p.telefono_contacto,
            (array_agg(m.mensaje    ORDER BY m.created_at DESC))[1] AS ultimo,
            (array_agg(m.de         ORDER BY m.created_at DESC))[1] AS ultimo_de,
            MAX(m.created_at) AS ultimo_at,
            -- Pendientes del ADMIN: lo que mandó el negocio y nadie ha leído.
            COUNT(*) FILTER (WHERE m.de = 'tienda' AND m.leido = false)::int AS sin_leer
     FROM mensajes m
     JOIN puestos p ON p.id = m.para_puesto_id
     GROUP BY m.para_puesto_id, p.nombre, p.telefono_contacto
     ORDER BY COUNT(*) FILTER (WHERE m.de = 'tienda' AND m.leido = false) DESC,
              MAX(m.created_at) DESC
     LIMIT 100`
  );

  return NextResponse.json({
    hilos,
    sin_leer_total: hilos.reduce((s, h) => s + Number(h.sin_leer || 0), 0),
  });
}
