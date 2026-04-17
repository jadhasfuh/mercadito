import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { verificarListaNegra } from "@/lib/lista-negra";
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
  const { nombre_tienda, nombre_dueno, telefono, pin, descripcion, direccion, lat, lng, categorias } = body;

  if (!nombre_tienda || !nombre_dueno || !telefono || !pin) {
    return NextResponse.json({ error: "Todos los campos son requeridos" }, { status: 400 });
  }

  const bloqueado = verificarListaNegra(nombre_tienda) || verificarListaNegra(descripcion || "");
  if (bloqueado) {
    return NextResponse.json({ error: "El nombre o descripción contiene contenido no permitido" }, { status: 400 });
  }

  const tel = telefono.replace(/\D/g, "");

  // Check if phone is already registered as tienda
  const existing = await query("SELECT id FROM usuarios WHERE telefono = $1 AND rol = 'tienda'", [tel]);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Este teléfono ya tiene una tienda registrada" }, { status: 409 });
  }

  const puestoId = `puesto-${uuidv4().slice(0, 8)}`;
  const usuarioId = `tienda-${uuidv4().slice(0, 8)}`;

  // Create the store (unapproved)
  await query(
    "INSERT INTO puestos (id, nombre, descripcion, ubicacion, aprobado, telefono_contacto, lat, lng) VALUES ($1, $2, $3, $4, false, $5, $6, $7)",
    [puestoId, nombre_tienda, descripcion || null, direccion || null, tel, lat || null, lng || null]
  );

  // Create the store user
  await query(
    "INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id) VALUES ($1, $2, $3, $4, 'tienda', $5)",
    [usuarioId, nombre_dueno, tel, pin, puestoId]
  );

  // Save store categories if provided
  if (Array.isArray(categorias) && categorias.length > 0) {
    for (const catId of categorias.slice(0, 5)) {
      await query(
        "INSERT INTO puesto_categorias (puesto_id, categoria_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [puestoId, catId]
      );
    }
  }

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

  await query("UPDATE puestos SET aprobado = $1, activo = $1 WHERE id = $2", [aprobado, puesto_id]);
  // Also toggle store users — only 'tienda' role (repartidores keep their access)
  await query("UPDATE usuarios SET activo = $1 WHERE puesto_id = $2 AND rol = 'tienda'", [aprobado, puesto_id]);

  return NextResponse.json({ ok: true });
}
