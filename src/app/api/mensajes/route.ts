import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { enviarPush } from "@/lib/push";
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

// POST — send message (admin only)
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { para_puesto_id, mensaje } = await request.json();
  if (!para_puesto_id || !mensaje) {
    return NextResponse.json({ error: "Falta puesto_id o mensaje" }, { status: 400 });
  }

  const id = uuidv4();
  await query(
    "INSERT INTO mensajes (id, de_usuario_id, para_puesto_id, mensaje) VALUES ($1, $2, $3, $4)",
    [id, usuario.id, para_puesto_id, mensaje]
  );

  // Avisar a la tienda por push (fire-and-forget). Sin esto el mensaje solo
  // se ve si la tienda recarga la app y toca la campana — que era justo el
  // síntoma reportado (Fernando no veía los mensajes).
  query<{ push_token: string }>(
    `SELECT push_token FROM usuarios
     WHERE push_token IS NOT NULL AND activo = true
       AND rol = 'tienda' AND puesto_id = $1`,
    [para_puesto_id]
  ).then((rows) => {
    const tokens = rows.map((r) => r.push_token);
    enviarPush(tokens, "💬 Mensaje de Mercadito", mensaje, { tipo: "mensaje", mensajeId: id });
  }).catch((e) => console.error("[push] mensaje a tienda failed", e));

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

  const { id, leido } = await request.json();

  if (id === "all") {
    if (!usuario.puesto_id) {
      return NextResponse.json({ error: "Tu cuenta no tiene puesto asignado" }, { status: 403 });
    }
    await query("UPDATE mensajes SET leido = true WHERE para_puesto_id = $1", [usuario.puesto_id]);
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
