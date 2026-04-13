import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// GET — list stores (admin only, or public approved ones)
export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (usuario?.rol === "admin") {
    // Admin sees all stores including unapproved
    const puestos = await query(
      `SELECT p.*, u.telefono as telefono_dueno, u.nombre as nombre_dueno
       FROM puestos p
       LEFT JOIN usuarios u ON u.puesto_id = p.id AND u.rol = 'tienda'
       ORDER BY p.aprobado ASC, p.nombre`
    );
    return NextResponse.json(puestos);
  }
  // Public: only approved
  const puestos = await query("SELECT id, nombre, descripcion FROM puestos WHERE activo = true AND aprobado = true ORDER BY nombre");
  return NextResponse.json(puestos);
}

// POST — register a new store
export async function POST(request: Request) {
  const body = await request.json();
  const { nombre_tienda, nombre_dueno, telefono, pin, descripcion } = body;

  if (!nombre_tienda || !nombre_dueno || !telefono || !pin) {
    return NextResponse.json({ error: "Todos los campos son requeridos" }, { status: 400 });
  }

  const tel = telefono.replace(/\D/g, "");

  // Check if phone is already registered
  const existing = await query("SELECT id FROM usuarios WHERE telefono = $1", [tel]);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Este teléfono ya está registrado" }, { status: 409 });
  }

  const puestoId = `puesto-${uuidv4().slice(0, 8)}`;
  const usuarioId = `tienda-${uuidv4().slice(0, 8)}`;

  // Create the store (unapproved)
  await query(
    "INSERT INTO puestos (id, nombre, descripcion, aprobado, telefono_contacto) VALUES ($1, $2, $3, false, $4)",
    [puestoId, nombre_tienda, descripcion || null, tel]
  );

  // Create the store user
  await query(
    "INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id) VALUES ($1, $2, $3, $4, 'tienda', $5)",
    [usuarioId, nombre_dueno, tel, pin, puestoId]
  );

  return NextResponse.json({ ok: true, message: "Registro enviado. Te notificaremos cuando sea aprobado." }, { status: 201 });
}

// PATCH — approve/reject store (admin only)
export async function PATCH(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { puesto_id, aprobado } = await request.json();
  if (!puesto_id) {
    return NextResponse.json({ error: "Falta puesto_id" }, { status: 400 });
  }

  await query("UPDATE puestos SET aprobado = $1 WHERE id = $2", [aprobado, puesto_id]);
  // Also toggle the store's active status
  await query("UPDATE puestos SET activo = $1 WHERE id = $2", [aprobado, puesto_id]);

  return NextResponse.json({ ok: true });
}
