import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { enviarPush } from "@/lib/push";
import { infoPlan } from "@/lib/plan";
import { throttle, ipDe } from "@/lib/ratelimit";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// DELETE /api/citas — limpieza masiva del historial de la tienda: borra todas
// las citas canceladas y no_show de su puesto (no toca completadas porque
// cuentan en ventas, ni activas). Solo tienda/admin.
export async function DELETE() {
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (usuario.rol !== "tienda" && usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (!usuario.puesto_id) return NextResponse.json({ error: "Sin puesto" }, { status: 400 });

  const borradas = await query<{ id: string }>(
    "DELETE FROM citas WHERE puesto_id = $1 AND estado IN ('cancelada','no_show') RETURNING id",
    [usuario.puesto_id]
  );
  return NextResponse.json({ ok: true, borradas: borradas.length });
}

// GET /api/citas — lista de citas según el rol:
//   cliente → sus propias citas
//   tienda  → citas de su puesto (filtros opcionales ?estado, ?desde)
//   admin   → ?puesto_id requerido
export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const estado = searchParams.get("estado");

  const cols = `c.id, c.puesto_id, c.cliente_id, c.cliente_nombre, c.cliente_telefono,
     c.servicio_id, c.servicio_nombre, c.precio, c.monto_cobrado, c.personas, c.propuesta_inicio,
     c.inicio, c.fin, c.estado, c.notas,
     c.creada_por, c.created_at, p.nombre as puesto_nombre`;

  let where = "";
  const valores: unknown[] = [];
  if (usuario.rol === "tienda") {
    if (!usuario.puesto_id) return NextResponse.json([]);
    valores.push(usuario.puesto_id);
    where = `c.puesto_id = $1`;
  } else if (usuario.rol === "admin") {
    const puestoId = searchParams.get("puesto_id");
    if (!puestoId) return NextResponse.json({ error: "Falta puesto_id" }, { status: 400 });
    valores.push(puestoId);
    where = `c.puesto_id = $1`;
  } else {
    // cliente
    valores.push(usuario.id, usuario.telefono);
    where = `(c.cliente_id = $1 OR c.cliente_telefono = $2)`;
  }
  if (estado) {
    valores.push(estado);
    where += ` AND c.estado = $${valores.length}`;
  }

  const citas = await query(
    `SELECT ${cols} FROM citas c
     JOIN puestos p ON p.id = c.puesto_id
     WHERE ${where}
     ORDER BY c.inicio DESC`,
    valores
  );
  return NextResponse.json(citas);
}

// POST /api/citas — agenda una cita.
//   cliente: usa su propia identidad, estado 'pendiente' (el negocio confirma).
//   tienda/admin: agenda manual con cliente_nombre/telefono, estado 'confirmada'.
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  const body = await request.json();
  const esTienda = !!usuario && (usuario.rol === "tienda" || usuario.rol === "admin");
  const esInvitado = !usuario; // reserva sin cuenta (solo nombre + teléfono)

  // Reserva de invitado: sin muro de login (antes exigía cuenta, mataba la
  // conversión). Rate-limit por IP contra spam; el choque de horario evita
  // doble-booking y el negocio siempre puede cancelar.
  if (esInvitado) {
    const rl = throttle(`cita:${ipDe(request)}`, 12, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Demasiadas solicitudes, intenta en un momento." }, { status: 429 });
    }
  }

  const puestoId = esTienda
    ? (usuario!.rol === "admin" ? body.puesto_id : usuario!.puesto_id)
    : body.puesto_id;
  if (!puestoId || !body.inicio) {
    return NextResponse.json({ error: "Faltan datos (puesto, inicio)" }, { status: 400 });
  }

  // Gate de plan: un negocio de servicios cuya prueba/suscripción venció no
  // puede recibir nuevas citas hasta reactivar (pago por WhatsApp → admin).
  const puestoPlan = await queryOne<{ tipo: string; plan: string; suscripcion_hasta: string | null; citas_auto_confirmar: boolean }>(
    "SELECT tipo, plan, suscripcion_hasta, citas_auto_confirmar FROM puestos WHERE id = $1",
    [puestoId]
  );
  // Si el negocio prendió auto-confirmar, las citas de cliente/invitado entran
  // ya como 'confirmada' (sin el paso manual que dejaba pendientes pudriéndose).
  const autoConfirmada = !esTienda && !!puestoPlan?.citas_auto_confirmar;
  if (puestoPlan && (puestoPlan.tipo === "servicios" || puestoPlan.tipo === "ambos")) {
    const info = infoPlan(puestoPlan.plan, puestoPlan.suscripcion_hasta);
    if (!info.acceso) {
      return NextResponse.json(
        {
          error: esTienda
            ? "Tu prueba/suscripción terminó. Reactiva tu plan para seguir agendando — contáctanos por WhatsApp."
            : "Este negocio no está recibiendo reservas en línea por ahora.",
          code: "PLAN_VENCIDO",
        },
        { status: 402 }
      );
    }
  }

  // Personas: lista de servicios (uno por persona). Compat: un servicio_id
  // suelto = cita de 1 persona.
  const personasInput: { servicio_id: string; nombre?: string }[] =
    Array.isArray(body.personas) && body.personas.length
      ? body.personas
      : body.servicio_id
      ? [{ servicio_id: body.servicio_id }]
      : [];
  if (personasInput.length === 0) {
    return NextResponse.json({ error: "Falta el servicio" }, { status: 400 });
  }

  const resueltos: {
    servicio_id: string;
    nombre: string;
    duracion_min: number;
    buffer_min: number;
    precio: number | null;
    persona?: string;
  }[] = [];
  for (const p of personasInput) {
    const s = await queryOne<{ nombre: string; duracion_min: number; buffer_min: number; precio: number | null }>(
      "SELECT nombre, duracion_min, buffer_min, precio FROM servicios WHERE id = $1 AND puesto_id = $2 AND activo = true",
      [p.servicio_id, puestoId]
    );
    if (!s) return NextResponse.json({ error: "Servicio no existe" }, { status: 404 });
    resueltos.push({
      servicio_id: p.servicio_id,
      nombre: s.nombre,
      duracion_min: s.duracion_min,
      buffer_min: s.buffer_min,
      precio: s.precio,
      persona: p.nombre?.trim() || undefined,
    });
  }

  const totalDuracion = resueltos.reduce((a, r) => a + r.duracion_min, 0);
  const precios = resueltos.map((r) => (r.precio != null ? Number(r.precio) : null));
  const totalPrecio = precios.some((x) => x != null) ? precios.reduce<number>((a, x) => a + (x ?? 0), 0) : null;
  const resumenNombre =
    resueltos.length === 1 ? resueltos[0].nombre : `${resueltos[0].nombre} +${resueltos.length - 1} más`;
  const personasJson = JSON.stringify(
    resueltos.map((r) => ({ servicio_id: r.servicio_id, servicio_nombre: r.nombre, precio: r.precio, nombre: r.persona ?? null }))
  );

  const inicio = new Date(body.inicio);
  if (isNaN(inicio.getTime())) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }
  const fin = new Date(inicio.getTime() + totalDuracion * 60_000);
  if (inicio.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "No se puede agendar en el pasado" }, { status: 400 });
  }

  // Re-chequeo de solape (evita doble-booking por carrera). Expande con el
  // buffer del último servicio a ambos lados.
  const bufferMs = resueltos[resueltos.length - 1].buffer_min * 60_000;
  const ocupada = await queryOne<{ id: string }>(
    `SELECT id FROM citas
     WHERE puesto_id = $1 AND estado IN ('pendiente','confirmada')
       AND inicio < $2 AND fin > $3
     LIMIT 1`,
    [
      puestoId,
      new Date(fin.getTime() + bufferMs).toISOString(),
      new Date(inicio.getTime() - bufferMs).toISOString(),
    ]
  );
  if (ocupada) {
    return NextResponse.json({ error: "Ese horario ya fue tomado" }, { status: 409 });
  }

  // Identidad del cliente.
  let clienteId: string | null;
  let clienteNombre: string;
  let clienteTelefono: string;
  if (esTienda) {
    clienteNombre = (body.cliente_nombre || "").trim();
    clienteTelefono = (body.cliente_telefono || "").replace(/\D/g, "");
    if (!clienteNombre || !clienteTelefono) {
      return NextResponse.json({ error: "Nombre y teléfono del cliente requeridos" }, { status: 400 });
    }
    // Liga al cliente existente si su teléfono ya está registrado.
    const cli = await queryOne<{ id: string }>(
      "SELECT id FROM usuarios WHERE telefono = $1 AND rol = 'cliente' LIMIT 1",
      [clienteTelefono]
    );
    clienteId = cli?.id ?? null;
  } else if (esInvitado) {
    // Reserva de invitado (sin cuenta): nombre + teléfono obligatorios. Si el
    // teléfono ya es un cliente registrado, la ligamos para que le aparezca en
    // "Mis reservas"; si no, queda como cita sin cuenta (cliente_id null).
    clienteNombre = (body.cliente_nombre || "").trim();
    clienteTelefono = (body.cliente_telefono || "").replace(/\D/g, "");
    if (!clienteNombre || clienteTelefono.length < 10) {
      return NextResponse.json({ error: "Escribe tu nombre y un teléfono de 10 dígitos" }, { status: 400 });
    }
    const cli = await queryOne<{ id: string }>(
      "SELECT id FROM usuarios WHERE telefono = $1 AND rol = 'cliente' LIMIT 1",
      [clienteTelefono]
    );
    clienteId = cli?.id ?? null;
  } else {
    // Cliente logueado: la cita queda ligada a su cuenta (aparece en "Mis
    // citas"), pero el nombre/teléfono de CONTACTO son editables — por si
    // agenda para alguien más. Si no manda nada, usa los suyos.
    clienteId = usuario!.id;
    clienteNombre = (body.cliente_nombre || "").trim() || usuario!.nombre;
    const telOverride = (body.cliente_telefono || "").replace(/\D/g, "");
    if (telOverride && telOverride.length < 10) {
      return NextResponse.json({ error: "Teléfono inválido (10 dígitos)" }, { status: 400 });
    }
    clienteTelefono = telOverride || usuario!.telefono;
  }

  const estado = esTienda || autoConfirmada ? "confirmada" : "pendiente";
  const id = `cita-${uuidv4().slice(0, 8)}`;
  await query(
    `INSERT INTO citas
       (id, puesto_id, cliente_id, cliente_nombre, cliente_telefono,
        servicio_id, servicio_nombre, precio, personas, inicio, fin, estado, notas, creada_por, confirmada_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id,
      puestoId,
      clienteId,
      clienteNombre,
      clienteTelefono,
      resueltos[0].servicio_id,
      resumenNombre,
      totalPrecio,
      personasJson,
      inicio.toISOString(),
      fin.toISOString(),
      estado,
      body.notas?.trim() || null,
      esTienda ? "tienda" : "cliente",
      (esTienda || autoConfirmada) ? new Date().toISOString() : null,
    ]
  );

  // Notificaciones (fire-and-forget).
  if (!esTienda) {
    // Cliente/invitado agendó → avisar al negocio.
    notificarNegocioNuevaCita(puestoId, clienteNombre, resumenNombre, inicio).catch((e) =>
      console.error("[push] nueva cita a negocio", e)
    );
    // Si el negocio auto-confirma, avisamos también al cliente registrado.
    if (autoConfirmada && clienteId) {
      notificarClienteCita(clienteId, clienteTelefono, "Mercadito 💈", `Tu reserva de ${resumenNombre} quedó confirmada.`, id).catch(
        (e) => console.error("[push] cita auto-confirmada a cliente", e)
      );
    }
  } else if (clienteId) {
    // Negocio agendó manual → confirmar al cliente.
    notificarClienteCita(clienteId, clienteTelefono, "Mercadito 💈", `Tu reserva de ${resumenNombre} quedó agendada.`, id).catch(
      (e) => console.error("[push] cita manual a cliente", e)
    );
  }

  return NextResponse.json({ ok: true, id }, { status: 201 });
}

async function notificarNegocioNuevaCita(
  puestoId: string,
  clienteNombre: string,
  servicioNombre: string,
  inicio: Date
) {
  const rows = await query<{ push_token: string }>(
    `SELECT push_token FROM usuarios
     WHERE push_token IS NOT NULL AND activo = true AND rol = 'tienda' AND puesto_id = $1`,
    [puestoId]
  );
  enviarPush(
    rows.map((r) => r.push_token),
    "📅 Nueva reserva",
    `${clienteNombre} agendó ${servicioNombre}`,
    { tipo: "cita_nueva", puesto_id: puestoId }
  );
}

async function notificarClienteCita(
  clienteId: string | null,
  clienteTelefono: string,
  title: string,
  body: string,
  citaId: string
) {
  const rows = await query<{ push_token: string }>(
    `SELECT push_token FROM usuarios
     WHERE push_token IS NOT NULL AND activo = true AND rol = 'cliente'
       AND (id = $1 OR telefono = $2)`,
    [clienteId, clienteTelefono]
  );
  enviarPush(
    rows.map((r) => r.push_token),
    title,
    body,
    { tipo: "cita", cita_id: citaId }
  );
}
