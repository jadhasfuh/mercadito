import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { esTelefonoValido, esPinValido, TELEFONO_MENSAJE, PIN_MENSAJE } from "@/lib/validators";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";

// Sub-cuentas de mesero de una tienda. Un mesero es un usuario rol='mesero'
// ligado al puesto. Entra con teléfono + PIN y puede tomar pedidos en mesa,
// ver comandas y cerrar cuentas (no gestiona mesas). Solo la tienda/admin
// dueña del puesto los administra.

async function puestoDe(): Promise<{ puestoId: string } | NextResponse> {
  const u = await getUsuarioFromSession();
  if (!u || (u.rol !== "tienda" && u.rol !== "admin") || !u.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  return { puestoId: u.puesto_id };
}

// GET — lista de meseros de la tienda.
export async function GET() {
  const ctx = await puestoDe();
  if (ctx instanceof NextResponse) return ctx;
  const meseros = await query(
    "SELECT id, nombre, telefono FROM usuarios WHERE puesto_id = $1 AND rol = 'mesero' AND activo = true ORDER BY nombre",
    [ctx.puestoId]
  );
  return NextResponse.json(meseros);
}

// POST — crea un mesero { nombre, telefono, pin }.
export async function POST(req: Request) {
  const ctx = await puestoDe();
  if (ctx instanceof NextResponse) return ctx;
  const { nombre, telefono, pin } = await req.json().catch(() => ({}));
  if (!nombre || !String(nombre).trim()) {
    return NextResponse.json({ error: "Falta el nombre del mesero" }, { status: 400 });
  }
  const tel = String(telefono || "").replace(/\D/g, "");
  if (!esTelefonoValido(tel)) return NextResponse.json({ error: TELEFONO_MENSAJE }, { status: 400 });
  if (!esPinValido(String(pin || ""))) return NextResponse.json({ error: PIN_MENSAJE }, { status: 400 });

  // Un teléfono solo puede ser mesero una vez (constraint UNIQUE(telefono, rol)).
  const existe = await queryOne<{ id: string; puesto_id: string | null; activo: boolean }>(
    "SELECT id, puesto_id, activo FROM usuarios WHERE telefono = $1 AND rol = 'mesero'",
    [tel]
  );
  if (existe && existe.puesto_id !== ctx.puestoId) {
    return NextResponse.json({ error: "Ese teléfono ya está registrado como mesero en otro negocio" }, { status: 409 });
  }
  if (existe?.activo) {
    return NextResponse.json({ error: "Ese mesero ya está en tu lista" }, { status: 409 });
  }
  if (existe) {
    // Quitar a un mesero solo lo desactiva (para conservar su historial de
    // comandas), pero la fila sigue ocupando el teléfono. Sin esto, volver a
    // darlo de alta era imposible desde el panel: decía "ya está registrado"
    // y no había forma de recuperarlo.
    await query(
      "UPDATE usuarios SET nombre = $1, pin = $2, activo = true WHERE id = $3",
      [String(nombre).trim(), await bcrypt.hash(String(pin), 10), existe.id]
    );
    return NextResponse.json({ ok: true, id: existe.id, reactivado: true }, { status: 201 });
  }

  const id = `mesero-${uuidv4().slice(0, 8)}`;
  const pinHash = await bcrypt.hash(String(pin), 10);
  await query(
    "INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id, activo) VALUES ($1, $2, $3, $4, 'mesero', $5, true)",
    [id, String(nombre).trim(), tel, pinHash, ctx.puestoId]
  );
  return NextResponse.json({ ok: true, id }, { status: 201 });
}

// PATCH — cambia el nombre o el PIN de un mesero { id, nombre?, pin? }.
// El negocio administra a su propia gente: antes, un mesero que olvidaba su
// PIN dependía de que un admin de Mercadito se lo reseteara.
export async function PATCH(req: Request) {
  const ctx = await puestoDe();
  if (ctx instanceof NextResponse) return ctx;
  const { id, nombre, pin } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (nombre !== undefined) {
    const n = String(nombre).trim();
    if (!n) return NextResponse.json({ error: "Falta el nombre del mesero" }, { status: 400 });
    sets.push(`nombre = $${i++}`); vals.push(n);
  }
  if (pin !== undefined) {
    if (!esPinValido(String(pin))) return NextResponse.json({ error: PIN_MENSAJE }, { status: 400 });
    sets.push(`pin = $${i++}`); vals.push(await bcrypt.hash(String(pin), 10));
  }
  if (sets.length === 0) return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });

  vals.push(id, ctx.puestoId);
  const filas = await query<{ id: string }>(
    `UPDATE usuarios SET ${sets.join(", ")}
      WHERE id = $${i++} AND puesto_id = $${i++} AND rol = 'mesero' AND activo = true
      RETURNING id`,
    vals
  );
  if (filas.length === 0) return NextResponse.json({ error: "Mesero no encontrado" }, { status: 404 });

  // Al cambiar el PIN se cierran sus sesiones: normalmente se resetea porque
  // se le olvidó o porque alguien más lo sabía, y dejar la sesión viva
  // anularía las dos razones.
  if (pin !== undefined) await query("DELETE FROM sesiones WHERE usuario_id = $1", [id]);

  return NextResponse.json({ ok: true });
}

// DELETE — quita un mesero { id } (desactiva, conserva historial).
export async function DELETE(req: Request) {
  const ctx = await puestoDe();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await query("DELETE FROM sesiones WHERE usuario_id = $1", [id]);
  await query(
    "UPDATE usuarios SET activo = false WHERE id = $1 AND puesto_id = $2 AND rol = 'mesero'",
    [id, ctx.puestoId]
  );
  return NextResponse.json({ ok: true });
}
