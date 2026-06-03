import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/chat/threads — lista de conversaciones del usuario.
//   cliente → un hilo por negocio
//   tienda  → un hilo por cliente
export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (usuario.rol === "tienda" || usuario.rol === "admin") {
    if (!usuario.puesto_id) return NextResponse.json([]);
    const rows = await query(
      `SELECT DISTINCT ON (cm.cliente_telefono)
         cm.cliente_telefono, cm.cliente_nombre,
         cm.texto AS ultimo_texto, cm.de AS ultimo_de, cm.created_at,
         (SELECT COUNT(*) FROM chat_mensajes x
          WHERE x.puesto_id = cm.puesto_id AND x.cliente_telefono = cm.cliente_telefono
            AND x.de = 'cliente' AND x.leido = false) AS no_leidos
       FROM chat_mensajes cm
       WHERE cm.puesto_id = $1
       ORDER BY cm.cliente_telefono, cm.created_at DESC`,
      [usuario.puesto_id]
    );
    rows.sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());
    return NextResponse.json(rows);
  }

  // Cliente
  const rows = await query(
    `SELECT DISTINCT ON (cm.puesto_id)
       cm.puesto_id, p.nombre AS puesto_nombre, p.logo,
       cm.texto AS ultimo_texto, cm.de AS ultimo_de, cm.created_at,
       (SELECT COUNT(*) FROM chat_mensajes x
        WHERE x.puesto_id = cm.puesto_id AND (x.cliente_id = $1 OR x.cliente_telefono = $2)
          AND x.de = 'negocio' AND x.leido = false) AS no_leidos
     FROM chat_mensajes cm
     JOIN puestos p ON p.id = cm.puesto_id
     WHERE (cm.cliente_id = $1 OR cm.cliente_telefono = $2)
     ORDER BY cm.puesto_id, cm.created_at DESC`,
    [usuario.id, usuario.telefono]
  );
  rows.sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());
  return NextResponse.json(rows);
}
