import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { turnoAbierto, totalesTurno, movimientosTurno, montoValido } from "@/lib/caja";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// Corte de caja a ciegas.
//
//   GET                       → turno abierto + movimientos (SIN el esperado)
//   GET ?historial=1          → últimos cortes cerrados (solo dueño/admin)
//   POST { action: "abrir" }  → abre turno con fondo inicial
//   POST { action: "movimiento" } → entrada o retiro de efectivo
//   POST { action: "cerrar" } → declara el conteo y devuelve la comparación
//
// Regla del "a ciegas": mientras el turno está ABIERTO, ninguna respuesta
// incluye el efectivo esperado ni las ventas en efectivo. Si el cajero puede
// consultarlo antes de contar, ajusta el conteo y el corte deja de detectar
// nada. Se revela sólo al cerrar, después de declarar.

async function ctx() {
  const u = await getUsuarioFromSession();
  // El cajero puede ser el dueño o un mesero: los dos operan la caja. El
  // historial de cortes es otra cosa y se gatea aparte.
  if (!u || !u.puesto_id || (u.rol !== "tienda" && u.rol !== "admin" && u.rol !== "mesero")) return null;
  return u;
}
const esDueno = (rol: string) => rol === "tienda" || rol === "admin";

export async function GET(req: Request) {
  const u = await ctx();
  if (!u?.puesto_id) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(req.url);

  if (searchParams.get("historial")) {
    // "Solo administradores ven los cortes históricos": un cajero que puede
    // revisar los cortes pasados sabe exactamente cuánto puede faltar sin que
    // se note.
    if (!esDueno(u.rol)) return NextResponse.json({ error: "Solo el dueño ve los cortes" }, { status: 403 });
    const cortes = await query<{
      id: string; caja: string; fondo_inicial: string; abierto_at: string; cerrado_at: string;
      abierto_por_nombre: string | null; cerrado_por_nombre: string | null;
      declarado: string | null; esperado: string | null; diferencia: string | null; nota: string | null;
    }>(
      `SELECT id, caja, fondo_inicial, abierto_at, cerrado_at, abierto_por_nombre, cerrado_por_nombre,
              declarado, esperado, diferencia, nota
       FROM caja_turnos
       WHERE puesto_id = $1 AND cerrado_at IS NOT NULL
       ORDER BY cerrado_at DESC LIMIT 40`,
      [u.puesto_id]
    );
    return NextResponse.json(cortes.map((c) => ({
      ...c,
      fondo_inicial: Number(c.fondo_inicial),
      declarado: c.declarado != null ? Number(c.declarado) : null,
      esperado: c.esperado != null ? Number(c.esperado) : null,
      diferencia: c.diferencia != null ? Number(c.diferencia) : null,
    })));
  }

  const turno = await turnoAbierto(u.puesto_id);
  if (!turno) return NextResponse.json({ turno: null });

  const totales = await totalesTurno(turno.id, turno.fondo_inicial);
  return NextResponse.json({
    turno,
    movimientos: await movimientosTurno(turno.id),
    // A ciegas: se manda lo que el cajero YA sabe porque lo capturó él
    // (fondo, entradas, retiros) y lo que no toca el cajón (tarjeta y
    // transferencia). El efectivo esperado se queda del lado del servidor.
    entradas: totales.entradas,
    retiros: totales.retiros,
    cuentas: totales.cuentas,
    ventas_tarjeta: totales.ventas_tarjeta,
    ventas_transferencia: totales.ventas_transferencia,
  });
}

export async function POST(req: Request) {
  const u = await ctx();
  if (!u?.puesto_id) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const puestoId = u.puesto_id;

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === "abrir") {
    const fondo = montoValido(body?.fondo_inicial ?? 0);
    if (fondo == null) return NextResponse.json({ error: "El fondo de caja no es un monto válido" }, { status: 400 });
    const caja = String(body?.caja || "Caja principal").trim().slice(0, 40) || "Caja principal";

    if (await turnoAbierto(puestoId, caja)) {
      return NextResponse.json({ error: `${caja} ya tiene un turno abierto` }, { status: 409 });
    }
    const id = uuidv4();
    try {
      await query(
        `INSERT INTO caja_turnos (id, puesto_id, caja, abierto_por, abierto_por_nombre, fondo_inicial)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, puestoId, caja, u.id, u.nombre, fondo]
      );
    } catch {
      // El índice único es la última palabra: dos toques al mismo tiempo no
      // pueden dejar dos turnos abiertos aunque el check de arriba pase.
      return NextResponse.json({ error: "Ya hay un turno abierto en esa caja" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, turno_id: id }, { status: 201 });
  }

  if (action === "movimiento") {
    const turno = await turnoAbierto(puestoId, body?.caja ? String(body.caja) : undefined);
    if (!turno) return NextResponse.json({ error: "Abre la caja antes de registrar movimientos" }, { status: 409 });

    const tipo = body?.tipo === "entrada" ? "entrada" : body?.tipo === "retiro" ? "retiro" : null;
    if (!tipo) return NextResponse.json({ error: "El movimiento debe ser entrada o retiro" }, { status: 400 });
    const monto = montoValido(body?.monto);
    if (monto == null || monto === 0) return NextResponse.json({ error: "Escribe cuánto dinero entró o salió" }, { status: 400 });
    const motivo = String(body?.motivo || "").trim().slice(0, 120) || null;
    // El motivo es el punto del registro de gastos: un retiro sin motivo es
    // exactamente el agujero que este módulo viene a tapar.
    if (tipo === "retiro" && !motivo) {
      return NextResponse.json({ error: "Escribe en qué se gastó el dinero" }, { status: 400 });
    }

    await query(
      `INSERT INTO caja_movimientos (id, turno_id, tipo, monto, motivo, usuario_id, usuario_nombre)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuidv4(), turno.id, tipo, monto, motivo, u.id, u.nombre]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  if (action === "cerrar") {
    const turno = await turnoAbierto(puestoId, body?.caja ? String(body.caja) : undefined);
    if (!turno) return NextResponse.json({ error: "No hay ningún turno abierto" }, { status: 409 });

    const declarado = montoValido(body?.declarado);
    if (declarado == null) return NextResponse.json({ error: "Escribe cuánto efectivo contaste" }, { status: 400 });
    const fondoSiguiente = montoValido(body?.fondo_siguiente ?? 0) ?? 0;
    const nota = String(body?.nota || "").trim().slice(0, 200) || null;

    const totales = await totalesTurno(turno.id, turno.fondo_inicial);
    const diferencia = Math.round((declarado - totales.esperado) * 100) / 100;

    // Se cierra con la condición de que siga abierto: dos cierres simultáneos
    // no pueden pisarse ni recalcular sobre un turno ya firmado.
    const cerrado = await queryOne<{ id: string }>(
      `UPDATE caja_turnos
       SET cerrado_at = NOW(), cerrado_por = $2, cerrado_por_nombre = $3,
           declarado = $4, esperado = $5, diferencia = $6, fondo_siguiente = $7, nota = $8
       WHERE id = $1 AND cerrado_at IS NULL
       RETURNING id`,
      [turno.id, u.id, u.nombre, declarado, totales.esperado, diferencia, fondoSiguiente, nota]
    );
    if (!cerrado) return NextResponse.json({ error: "Ese turno ya fue cerrado" }, { status: 409 });

    return NextResponse.json({
      ok: true,
      corte: {
        id: turno.id, caja: turno.caja,
        fondo_inicial: turno.fondo_inicial,
        abierto_at: turno.abierto_at,
        cerrado_por_nombre: u.nombre,
        ...totales,
        declarado, diferencia, fondo_siguiente: fondoSiguiente, nota,
      },
    });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
