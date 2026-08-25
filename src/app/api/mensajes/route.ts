import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { enviarPush } from "@/lib/push";
import { enviarWebPushAUsuarios } from "@/lib/webpush";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// GET — list messages for a store
export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  if (usuario.rol === "admin") {
    // Admin can see messages for any store
    const puestoId = searchParams.get("puesto_id");
    if (puestoId) {
      const mensajes = await query(
        `SELECT m.*, u.nombre as de_nombre
         FROM mensajes m
         LEFT JOIN usuarios u ON u.id = m.de_usuario_id
         WHERE m.para_puesto_id = $1
         ORDER BY m.created_at DESC`,
        [puestoId]
      );
      return NextResponse.json(mensajes);
    }
    // All messages
    const mensajes = await query(
      `SELECT m.*, u.nombre as de_nombre, p.nombre as puesto_nombre
       FROM mensajes m
       LEFT JOIN usuarios u ON u.id = m.de_usuario_id
       LEFT JOIN puestos p ON p.id = m.para_puesto_id
       ORDER BY m.created_at DESC`
    );
    return NextResponse.json(mensajes);
  }

  // Store owner sees their own messages
  if (!usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const mensajes = await query(
    `SELECT m.*, u.nombre as de_nombre
     FROM mensajes m
     LEFT JOIN usuarios u ON u.id = m.de_usuario_id
     WHERE m.para_puesto_id = $1
     ORDER BY m.created_at DESC`,
    [usuario.puesto_id]
  );
  return NextResponse.json(mensajes);
}

// POST — enviar mensaje. Admin → negocio, o negocio → soporte.
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "admin" && usuario.rol !== "tienda")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const mensaje = String(body?.mensaje ?? "").trim();
  // El negocio siempre escribe a su propio hilo: no puede elegir destinatario,
  // o podría escribirle a nombre de otra tienda.
  const paraPuestoId = usuario.rol === "admin" ? body?.para_puesto_id : usuario.puesto_id;

  if (!paraPuestoId || !mensaje) {
    return NextResponse.json({ error: "Falta puesto_id o mensaje" }, { status: 400 });
  }
  if (mensaje.length > 2000) {
    return NextResponse.json({ error: "El mensaje es muy largo" }, { status: 400 });
  }

  const de = usuario.rol === "admin" ? "admin" : "tienda";
  const id = uuidv4();
  await query(
    "INSERT INTO mensajes (id, de_usuario_id, para_puesto_id, mensaje, de) VALUES ($1, $2, $3, $4, $5)",
    [id, usuario.id, paraPuestoId, mensaje, de]
  );

  // Avisar al otro lado por push (fire-and-forget). Sin esto el mensaje solo
  // se ve si el destinatario recarga y toca la campana — que era justo el
  // síntoma reportado (Fernando no veía los mensajes).
  if (de === "admin") {
    query<{ push_token: string }>(
      `SELECT push_token FROM usuarios
       WHERE push_token IS NOT NULL AND activo = true
         AND rol = 'tienda' AND puesto_id = $1`,
      [paraPuestoId]
    ).then((rows) => {
      enviarPush(rows.map((r) => r.push_token), "💬 Mensaje de Mercadito", mensaje, { tipo: "mensaje", mensajeId: id });
    }).catch((e) => console.error("[push] mensaje a tienda failed", e));
    enviarWebPushAUsuarios(
      (await query<{ id: string }>("SELECT id FROM usuarios WHERE rol = 'tienda' AND activo = true AND puesto_id = $1", [paraPuestoId])).map((u) => u.id),
      "💬 Mensaje de Mercadito", mensaje, { tipo: "mensaje" }
    ).catch(() => {});
  } else {
    // Negocio → soporte: avisar a TODOS los admins, que si no nadie se entera
    // de que alguien pidió ayuda.
    const negocio = await query<{ nombre: string }>("SELECT nombre FROM puestos WHERE id = $1", [paraPuestoId]);
    const titulo = `💬 ${negocio[0]?.nombre ?? "Un negocio"} pide soporte`;
    query<{ id: string; push_token: string | null }>(
      "SELECT id, push_token FROM usuarios WHERE rol = 'admin' AND activo = true"
    ).then((admins) => {
      enviarPush(
        admins.map((a) => a.push_token).filter((t): t is string => !!t),
        titulo, mensaje, { tipo: "soporte_tienda", puesto_id: paraPuestoId }
      );
      enviarWebPushAUsuarios(admins.map((a) => a.id), titulo, mensaje, { tipo: "soporte_tienda", puesto_id: paraPuestoId });
    }).catch((e) => console.error("[push] soporte a admin failed", e));
  }

  return NextResponse.json({ ok: true, id }, { status: 201 });
}

// PATCH — mark as read (store owner / admin)
export async function PATCH(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Los mensajes son admin→tienda; solo la tienda dueña (o admin) los marca
  // leídos. Antes CUALQUIER usuario autenticado (incl. cliente) podía marcar
  // leído/no-leído cualquier mensaje por id (cross-tenant).
  if (usuario.rol !== "tienda" && usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id, leido, puesto_id: puestoIdBody } = await request.json();

  if (id === "all") {
    // Cada lado marca solo lo que le llegó del otro: si el admin marcara todo
    // el hilo, borraría el pendiente del negocio sin que este lo hubiera visto.
    if (usuario.rol === "admin") {
      if (puestoIdBody) {
        await query("UPDATE mensajes SET leido = true WHERE para_puesto_id = $1 AND de = 'tienda'", [puestoIdBody]);
      } else {
        await query("UPDATE mensajes SET leido = true WHERE de = 'tienda'");
      }
      return NextResponse.json({ ok: true });
    }
    if (!usuario.puesto_id) {
      return NextResponse.json({ error: "Tu cuenta no tiene puesto asignado" }, { status: 403 });
    }
    await query(
      "UPDATE mensajes SET leido = true WHERE para_puesto_id = $1 AND de = 'admin'",
      [usuario.puesto_id]
    );
    return NextResponse.json({ ok: true });
  }

  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  // Scope al puesto del usuario; admin puede tocar cualquiera.
  if (usuario.rol === "admin") {
    await query("UPDATE mensajes SET leido = $1 WHERE id = $2", [leido ?? true, id]);
  } else {
    await query(
      "UPDATE mensajes SET leido = $1 WHERE id = $2 AND para_puesto_id = $3",
      [leido ?? true, id, usuario.puesto_id]
    );
  }
  return NextResponse.json({ ok: true });
}
