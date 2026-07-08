import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { enviarPush } from "@/lib/push";
import { enviarWebPushAUsuarios } from "@/lib/webpush";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// DELETE /api/chat — limpia conversaciones.
//   Sin params: borra TODAS las del usuario (cliente: las suyas; tienda: las
//   de su puesto). Con thread (puesto_id/cliente_telefono): borra solo esa.
export async function DELETE(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const esNegocio = usuario.rol === "tienda" || usuario.rol === "admin";

  if (esNegocio) {
    const puestoId = usuario.rol === "admin" ? searchParams.get("puesto_id") : usuario.puesto_id;
    if (!puestoId) return NextResponse.json({ error: "Sin puesto" }, { status: 400 });
    const tel = searchParams.get("cliente_telefono");
    const r = tel
      ? await query<{ id: string }>("DELETE FROM chat_mensajes WHERE puesto_id = $1 AND cliente_telefono = $2 RETURNING id", [puestoId, tel])
      : await query<{ id: string }>("DELETE FROM chat_mensajes WHERE puesto_id = $1 RETURNING id", [puestoId]);
    return NextResponse.json({ ok: true, borrados: r.length });
  }

  // Cliente
  const puestoId = searchParams.get("puesto_id");
  const r = puestoId
    ? await query<{ id: string }>(
        "DELETE FROM chat_mensajes WHERE puesto_id = $1 AND (cliente_id = $2 OR cliente_telefono = $3) RETURNING id",
        [puestoId, usuario.id, usuario.telefono]
      )
    : await query<{ id: string }>(
        "DELETE FROM chat_mensajes WHERE cliente_id = $1 OR cliente_telefono = $2 RETURNING id",
        [usuario.id, usuario.telefono]
      );
  return NextResponse.json({ ok: true, borrados: r.length });
}

// GET /api/chat?puesto_id=X[&cliente_telefono=Y]
//   cliente → su hilo con el negocio X (marca como leídos los del negocio)
//   tienda  → hilo con el cliente (cliente_telefono requerido)
export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);

  if (usuario.rol === "tienda" || usuario.rol === "admin") {
    const puestoId = usuario.rol === "admin" ? searchParams.get("puesto_id") : usuario.puesto_id;
    const clienteTel = searchParams.get("cliente_telefono");
    if (!puestoId || !clienteTel) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
    }
    await query(
      "UPDATE chat_mensajes SET leido = true WHERE puesto_id = $1 AND cliente_telefono = $2 AND de = 'cliente'",
      [puestoId, clienteTel]
    );
    const mensajes = await query(
      `SELECT id, de, texto, leido, created_at FROM chat_mensajes
       WHERE puesto_id = $1 AND cliente_telefono = $2 ORDER BY created_at ASC`,
      [puestoId, clienteTel]
    );
    return NextResponse.json(mensajes);
  }

  // Cliente
  const puestoId = searchParams.get("puesto_id");
  if (!puestoId) return NextResponse.json({ error: "Falta puesto_id" }, { status: 400 });
  await query(
    `UPDATE chat_mensajes SET leido = true
     WHERE puesto_id = $1 AND de = 'negocio' AND (cliente_id = $2 OR cliente_telefono = $3)`,
    [puestoId, usuario.id, usuario.telefono]
  );
  const mensajes = await query(
    `SELECT id, de, texto, leido, created_at FROM chat_mensajes
     WHERE puesto_id = $1 AND (cliente_id = $2 OR cliente_telefono = $3)
     ORDER BY created_at ASC`,
    [puestoId, usuario.id, usuario.telefono]
  );
  return NextResponse.json(mensajes);
}

// POST /api/chat — envía un mensaje.
//   cliente: { puesto_id, texto }
//   tienda:  { cliente_telefono, cliente_nombre?, texto }
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json();
  const texto = (body.texto || "").trim();
  if (!texto) return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });

  const esNegocio = usuario.rol === "tienda" || usuario.rol === "admin";
  const id = uuidv4();

  if (esNegocio) {
    const puestoId = usuario.rol === "admin" ? body.puesto_id : usuario.puesto_id;
    const clienteTel = (body.cliente_telefono || "").replace(/\D/g, "");
    if (!puestoId || !clienteTel) {
      return NextResponse.json({ error: "Falta cliente_telefono" }, { status: 400 });
    }
    const cli = await queryOne<{ id: string; nombre: string }>(
      "SELECT id, nombre FROM usuarios WHERE telefono = $1 AND rol = 'cliente' LIMIT 1",
      [clienteTel]
    );
    await query(
      `INSERT INTO chat_mensajes (id, puesto_id, cliente_id, cliente_telefono, cliente_nombre, de, texto)
       VALUES ($1, $2, $3, $4, $5, 'negocio', $6)`,
      [id, puestoId, cli?.id ?? null, clienteTel, body.cliente_nombre || cli?.nombre || null, texto]
    );
    notificarChat("cliente", { clienteId: cli?.id ?? null, clienteTel, puestoId }, texto).catch(() => {});
    return NextResponse.json({ ok: true, id }, { status: 201 });
  }

  // Cliente → negocio
  const puestoId = body.puesto_id;
  if (!puestoId) return NextResponse.json({ error: "Falta puesto_id" }, { status: 400 });
  await query(
    `INSERT INTO chat_mensajes (id, puesto_id, cliente_id, cliente_telefono, cliente_nombre, de, texto)
     VALUES ($1, $2, $3, $4, $5, 'cliente', $6)`,
    [id, puestoId, usuario.id, usuario.telefono, usuario.nombre, texto]
  );
  notificarChat("negocio", { puestoId, clienteNombre: usuario.nombre }, texto).catch(() => {});
  return NextResponse.json({ ok: true, id }, { status: 201 });
}

// Push a la otra parte de la conversación (fire-and-forget).
async function notificarChat(
  destino: "cliente" | "negocio",
  ctx: { puestoId: string; clienteId?: string | null; clienteTel?: string; clienteNombre?: string },
  texto: string
) {
  if (destino === "negocio") {
    // Sin filtro push_token IS NOT NULL: las tiendas web reciben por web push.
    const rows = await query<{ id: string; push_token: string | null }>(
      `SELECT id, push_token FROM usuarios
       WHERE activo = true AND rol = 'tienda' AND puesto_id = $1`,
      [ctx.puestoId]
    );
    const title = `💬 ${ctx.clienteNombre ?? "Cliente"}`;
    const data = { tipo: "chat_negocio", puesto_id: ctx.puestoId };
    enviarPush(rows.map((r) => r.push_token).filter((t): t is string => !!t), title, texto, data);
    enviarWebPushAUsuarios(rows.map((r) => r.id), title, texto, data);
  } else {
    const rows = await query<{ id: string; push_token: string | null }>(
      `SELECT u.id, u.push_token FROM usuarios u
       WHERE u.activo = true AND u.rol = 'cliente'
         AND (u.id = $1 OR u.telefono = $2)`,
      [ctx.clienteId, ctx.clienteTel]
    );
    const negocio = await queryOne<{ nombre: string }>("SELECT nombre FROM puestos WHERE id = $1", [ctx.puestoId]);
    const title = `💬 ${negocio?.nombre ?? "Mensaje"}`;
    const data = { tipo: "chat_cliente", puesto_id: ctx.puestoId };
    enviarPush(rows.map((r) => r.push_token).filter((t): t is string => !!t), title, texto, data);
    enviarWebPushAUsuarios(rows.map((r) => r.id), title, texto, data);
  }
}
