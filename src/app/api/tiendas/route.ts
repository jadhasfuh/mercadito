import { query, withTransaction } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { verificarListaNegra } from "@/lib/lista-negra";
import { esTelefonoValido, esPinValido, TELEFONO_MENSAJE, PIN_MENSAJE } from "@/lib/validators";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";

// GET — list stores (admin only, or public approved ones)
export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (usuario?.rol === "admin") {
    // Admin sees all stores including unapproved
    const puestos = await query(
      `SELECT p.*, u.id as usuario_id, u.telefono as telefono_dueno, u.nombre as nombre_dueno
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
  const { nombre_tienda, nombre_dueno, telefono, pin, descripcion, direccion, lat, lng, ciudad } = body;
  const ciudadValida = ["sahuayo", "jiquilpan", "venustiano"].includes(ciudad) ? ciudad : "sahuayo";

  if (!nombre_tienda || !nombre_dueno || !telefono || !pin) {
    return NextResponse.json({ error: "Todos los campos son requeridos" }, { status: 400 });
  }

  const bloqueado = verificarListaNegra(nombre_tienda) || verificarListaNegra(descripcion || "");
  if (bloqueado) {
    return NextResponse.json({ error: "El nombre o descripción contiene contenido no permitido" }, { status: 400 });
  }

  const tel = String(telefono).replace(/\D/g, "");
  if (!esTelefonoValido(tel)) {
    return NextResponse.json({ error: TELEFONO_MENSAJE }, { status: 400 });
  }
  if (!esPinValido(String(pin))) {
    return NextResponse.json({ error: PIN_MENSAJE }, { status: 400 });
  }

  // Check if phone is already registered as tienda
  const existing = await query("SELECT id FROM usuarios WHERE telefono = $1 AND rol = 'tienda'", [tel]);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Este teléfono ya tiene una tienda registrada" }, { status: 409 });
  }

  const puestoId = `puesto-${uuidv4().slice(0, 8)}`;
  const usuarioId = `tienda-${uuidv4().slice(0, 8)}`;

  // Create the store (unapproved). Arranca con 90 días de prueba gratis
  // (suscripcion_hasta): si activa el modo citas, el gating empieza al vencer.
  await query(
    "INSERT INTO puestos (id, nombre, descripcion, ubicacion, aprobado, telefono_contacto, lat, lng, ciudad, suscripcion_hasta) VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, NOW() + INTERVAL '90 days')",
    [puestoId, nombre_tienda, descripcion || null, direccion || null, tel, lat || null, lng || null, ciudadValida]
  );

  // Create the store user — PIN guardado como hash bcrypt.
  const pinHash = await bcrypt.hash(String(pin), 10);
  await query(
    "INSERT INTO usuarios (id, nombre, telefono, pin, rol, puesto_id) VALUES ($1, $2, $3, $4, 'tienda', $5)",
    [usuarioId, nombre_dueno, tel, pinHash, puestoId]
  );

  // Avisar al admin (fire-and-forget) para que apruebe la tienda sin
  // tener que entrar a revisar manualmente. Mismo patrón que pago_por_validar.
  query<{ push_token: string }>(
    `SELECT push_token FROM usuarios
     WHERE push_token IS NOT NULL AND activo = true AND rol = 'admin'`
  ).then((rows) => {
    const tokens = rows.map((r) => r.push_token);
    enviarPush(
      tokens,
      "🏪 Nueva tienda por aprobar",
      `${nombre_tienda} — ${nombre_dueno}`,
      { tipo: "tienda_registrada", puesto_id: puestoId }
    );
  }).catch((e) => console.error("[push] admin tienda_registrada failed", e));

  return NextResponse.json({ ok: true, message: "Registro enviado. Te notificaremos cuando sea aprobado." }, { status: 201 });
}

// PATCH — approve/reject store (admin only)
export async function PATCH(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { puesto_id, aprobado, ciudad } = await request.json();
  if (!puesto_id) {
    return NextResponse.json({ error: "Falta puesto_id" }, { status: 400 });
  }

  // Corregir la ciudad de la tienda (admin). No toca aprobación.
  if (ciudad !== undefined) {
    const ciudadValida = ["sahuayo", "jiquilpan", "venustiano"].includes(ciudad) ? ciudad : "sahuayo";
    await query("UPDATE puestos SET ciudad = $1 WHERE id = $2", [ciudadValida, puesto_id]);
    if (aprobado === undefined) return NextResponse.json({ ok: true });
  }

  await query("UPDATE puestos SET aprobado = $1, activo = $1 WHERE id = $2", [aprobado, puesto_id]);
  // Also toggle store users — only 'tienda' role (repartidores keep their access)
  await query("UPDATE usuarios SET activo = $1 WHERE puesto_id = $2 AND rol = 'tienda'", [aprobado, puesto_id]);

  return NextResponse.json({ ok: true });
}

// DELETE — rechaza y borra la tienda completa (admin). Usado para registros
// de prueba / datos inválidos. Borra productos, precios, usuarios de la tienda
// y el puesto. Bloquea si la tienda tiene pedidos activos (no entregados/
// cancelados) para no perder historia contable.
export async function DELETE(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { puesto_id } = await request.json();
  if (!puesto_id) return NextResponse.json({ error: "Falta puesto_id" }, { status: 400 });

  // Bloquear si la tienda tiene pedidos activos — evita perder data viva.
  const activos = await query(
    `SELECT 1 FROM pedido_items pi
     JOIN pedidos p ON p.id = pi.pedido_id
     WHERE pi.puesto_id = $1 AND p.estado NOT IN ('entregado', 'cancelado') LIMIT 1`,
    [puesto_id]
  );
  if (activos.length > 0) {
    return NextResponse.json(
      { error: "La tienda tiene pedidos activos. Cancela o entrega primero esos pedidos." },
      { status: 400 }
    );
  }

  try {
    await withTransaction(async (q) => {
      // Hijos de productos primero (variantes/opciones/modificadores caen por CASCADE)
      await q("DELETE FROM pedido_items WHERE puesto_id = $1", [puesto_id]);
      await q("DELETE FROM precios WHERE puesto_id = $1", [puesto_id]);
      // Productos huérfanos sin más precios (los que solo vendía esta tienda)
      await q(
        `DELETE FROM productos WHERE id IN (
           SELECT pr.id FROM productos pr
           LEFT JOIN precios p ON p.producto_id = pr.id
           WHERE p.id IS NULL
         )`
      );
      // Horarios del menú y relación producto_horarios (CASCADE los maneja)
      await q("DELETE FROM puesto_horarios WHERE puesto_id = $1", [puesto_id]);
      await q("DELETE FROM puesto_horario_atencion WHERE puesto_id = $1", [puesto_id]);
      await q("DELETE FROM puesto_categorias WHERE puesto_id = $1", [puesto_id]);
      // Usuarios de la tienda — primero sus sesiones
      await q(
        "DELETE FROM sesiones WHERE usuario_id IN (SELECT id FROM usuarios WHERE puesto_id = $1 AND rol = 'tienda')",
        [puesto_id]
      );
      await q("DELETE FROM usuarios WHERE puesto_id = $1 AND rol = 'tienda'", [puesto_id]);
      await q("DELETE FROM puestos WHERE id = $1", [puesto_id]);
    });
  } catch (e) {
    console.error("[tiendas DELETE]", e);
    return NextResponse.json({ error: "No se pudo eliminar la tienda" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
