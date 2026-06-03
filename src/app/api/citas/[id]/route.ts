import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";

type EstadoCita = "pendiente" | "confirmada" | "completada" | "cancelada" | "no_show";
const ESTADOS_VALIDOS: EstadoCita[] = ["pendiente", "confirmada", "completada", "cancelada", "no_show"];

interface CitaRow {
  id: string;
  puesto_id: string;
  cliente_id: string | null;
  cliente_telefono: string;
  servicio_nombre: string;
  inicio: string;
  fin: string;
  estado: EstadoCita;
}

// PATCH /api/citas/[id] — cambia el estado de la cita.
// Permisos: la tienda dueña / admin pueden cualquier transición; el cliente
// dueño solo puede cancelar la suya.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const cita = await queryOne<CitaRow>(
    `SELECT id, puesto_id, cliente_id, cliente_telefono, servicio_nombre, inicio, fin, estado
     FROM citas WHERE id = $1`,
    [id]
  );
  if (!cita) {
    return NextResponse.json({ error: "Cita no existe" }, { status: 404 });
  }

  const esNegocio =
    usuario.rol === "admin" || (usuario.rol === "tienda" && usuario.puesto_id === cita.puesto_id);
  const esClienteDueno =
    usuario.rol === "cliente" &&
    (usuario.id === cita.cliente_id || usuario.telefono === cita.cliente_telefono);

  const body = await request.json();

  // ----- Reagendar / editar (sin cambiar estado): mover la cita a otro
  // horario o servicio. Lo puede hacer la tienda/admin O el cliente dueño. -----
  if (body.estado === undefined && (body.inicio || body.servicio_id || body.notas !== undefined)) {
    if (!esNegocio && !esClienteDueno) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // Si se cambia a un servicio único, recalculamos con su duración. Si solo
    // se mueve la hora, PRESERVAMOS la duración total (importante para citas
    // multi-persona) usando el span actual fin-inicio.
    const servId = body.servicio_id as string | undefined;
    const serv = servId
      ? await queryOne<{ nombre: string; duracion_min: number; buffer_min: number; precio: number | null }>(
          "SELECT nombre, duracion_min, buffer_min, precio FROM servicios WHERE id = $1 AND puesto_id = $2 AND activo = true",
          [servId, cita.puesto_id]
        )
      : null;
    if (servId && !serv) return NextResponse.json({ error: "Servicio no existe" }, { status: 404 });

    const inicio = body.inicio ? new Date(body.inicio) : new Date(cita.inicio);
    if (isNaN(inicio.getTime())) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    const spanMs = serv
      ? serv.duracion_min * 60_000
      : new Date(cita.fin).getTime() - new Date(cita.inicio).getTime();
    const fin = new Date(inicio.getTime() + spanMs);
    const bufferMs = (serv?.buffer_min ?? 0) * 60_000;

    // Overlap excluyendo la propia cita.
    const ocupada = await queryOne<{ id: string }>(
      `SELECT id FROM citas
       WHERE puesto_id = $1 AND id <> $2 AND estado IN ('pendiente','confirmada')
         AND inicio < $3 AND fin > $4 LIMIT 1`,
      [cita.puesto_id, id, new Date(fin.getTime() + bufferMs).toISOString(), new Date(inicio.getTime() - bufferMs).toISOString()]
    );
    if (ocupada) return NextResponse.json({ error: "Ese horario ya fue tomado" }, { status: 409 });

    if (serv) {
      // Cambió a un servicio único: actualiza resumen y limpia personas.
      await query(
        `UPDATE citas SET inicio = $1, fin = $2, servicio_id = $3, servicio_nombre = $4,
           precio = $5, personas = NULL, notas = COALESCE($6, notas),
           recordatorio_24h_enviado = false, recordatorio_2h_enviado = false
         WHERE id = $7`,
        [inicio.toISOString(), fin.toISOString(), servId, serv.nombre, serv.precio, body.notas?.trim() ?? null, id]
      );
    } else {
      // Solo se movió la hora: conserva servicio(s) y precio.
      await query(
        `UPDATE citas SET inicio = $1, fin = $2, notas = COALESCE($3, notas),
           recordatorio_24h_enviado = false, recordatorio_2h_enviado = false
         WHERE id = $4`,
        [inicio.toISOString(), fin.toISOString(), body.notas?.trim() ?? null, id]
      );
    }
    // Notifica a la OTRA parte: si reagendó la tienda → avisa al cliente; si
    // reagendó el cliente → avisa al negocio.
    if (esNegocio) {
      notificarCliente(cita, "📅 Cita reagendada", `Tu cita de ${cita.servicio_nombre} se movió. Revisa la nueva hora.`).catch(() => {});
    } else {
      notificarNegocio(cita, "📅 Cita reagendada", `El cliente movió su cita de ${cita.servicio_nombre}. Revisa la nueva hora.`).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  // ----- Ajustar el monto cobrado (tienda/admin), sin cambiar estado. Sirve
  // para registrar que se cobró un extra en una cita completada. Guarda el
  // override en monto_cobrado; el precio original del servicio se conserva. -----
  if (body.estado === undefined && body.monto_cobrado !== undefined) {
    if (!esNegocio) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const monto = body.monto_cobrado === null ? null : Number(body.monto_cobrado);
    if (monto !== null && (isNaN(monto) || monto < 0)) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
    }
    await query("UPDATE citas SET monto_cobrado = $1 WHERE id = $2", [monto, id]);
    return NextResponse.json({ ok: true });
  }

  const nuevoEstado = body.estado as EstadoCita;
  if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  if (!esNegocio) {
    if (!esClienteDueno || nuevoEstado !== "cancelada") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  // Sello de tiempo según la transición.
  const sello =
    nuevoEstado === "confirmada"
      ? "confirmada_at = NOW()"
      : nuevoEstado === "cancelada"
      ? "cancelada_at = NOW()"
      : nuevoEstado === "completada"
      ? "completada_at = NOW()"
      : null;

  await query(
    `UPDATE citas SET estado = $1${sello ? ", " + sello : ""}${
      nuevoEstado === "cancelada" ? ", motivo_cancelacion = $3" : ""
    } WHERE id = $2`,
    nuevoEstado === "cancelada"
      ? [nuevoEstado, id, body.motivo_cancelacion?.trim() || null]
      : [nuevoEstado, id]
  );

  // Notificaciones (fire-and-forget).
  if (nuevoEstado === "confirmada") {
    notificarCliente(cita, "✅ Cita confirmada", `Tu cita de ${cita.servicio_nombre} fue confirmada.`).catch(
      () => {}
    );
  } else if (nuevoEstado === "cancelada") {
    if (esNegocio) {
      notificarCliente(cita, "Cita cancelada", `Tu cita de ${cita.servicio_nombre} fue cancelada.`).catch(
        () => {}
      );
    } else {
      notificarNegocio(cita, "Cita cancelada", `${cita.servicio_nombre} fue cancelada por el cliente.`).catch(
        () => {}
      );
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/citas/[id] — borra una cita del historial (cancelada/completada/
// no_show). No deja borrar citas activas (pendiente/confirmada): primero se
// cancelan. Solo la tienda dueña o admin.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuarioFromSession();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const cita = await queryOne<{ puesto_id: string; estado: EstadoCita }>(
    "SELECT puesto_id, estado FROM citas WHERE id = $1",
    [id]
  );
  if (!cita) return NextResponse.json({ error: "Cita no existe" }, { status: 404 });

  const esNegocio =
    usuario.rol === "admin" || (usuario.rol === "tienda" && usuario.puesto_id === cita.puesto_id);
  if (!esNegocio) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  if (cita.estado === "pendiente" || cita.estado === "confirmada") {
    return NextResponse.json({ error: "Cancela la cita antes de eliminarla" }, { status: 400 });
  }

  await query("DELETE FROM citas WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}

async function notificarCliente(cita: CitaRow, title: string, body: string) {
  const rows = await query<{ push_token: string }>(
    `SELECT push_token FROM usuarios
     WHERE push_token IS NOT NULL AND activo = true AND rol = 'cliente'
       AND (id = $1 OR telefono = $2)`,
    [cita.cliente_id, cita.cliente_telefono]
  );
  enviarPush(rows.map((r) => r.push_token), title, body, { tipo: "cita", cita_id: cita.id });
}

async function notificarNegocio(cita: CitaRow, title: string, body: string) {
  const rows = await query<{ push_token: string }>(
    `SELECT push_token FROM usuarios
     WHERE push_token IS NOT NULL AND activo = true AND rol = 'tienda' AND puesto_id = $1`,
    [cita.puesto_id]
  );
  enviarPush(rows.map((r) => r.push_token), title, body, { tipo: "cita_nueva", puesto_id: cita.puesto_id });
}
