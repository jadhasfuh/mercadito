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
  const existe = await queryOne<{ id: string }>(
    "SELECT id FROM usuarios WHERE telefono = $1 AND rol = 'mesero'",
    [tel]
  );
  if (existe) return NextResponse.json({ error: "Ese teléfono ya está registrado como mesero" }, { status: 409 });

  const id = `mesero-${uuidv4().slice(0, 8)}`;
  const pinHash = await bcrypt.hash(String(pin), 10);
  await query(
    "INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id, activo) VALUES ($1, $2, $3, $4, 'mesero', $5, true)",
    [id, String(nombre).trim(), tel, pinHash, ctx.puestoId]
  );
  return NextResponse.json({ ok: true, id }, { status: 201 });
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
