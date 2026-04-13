import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { getHorarioInfo } from "@/lib/horario";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// Helper to convert NUMERIC fields
function parsePedido(pedido: Record<string, unknown>, items: Record<string, unknown>[]) {
  return {
    ...pedido,
    subtotal: parseFloat(pedido.subtotal as string),
    costo_envio: parseFloat(pedido.costo_envio as string),
    total: parseFloat(pedido.total as string),
    items: items.map((item) => ({
      ...item,
      cantidad: parseFloat(item.cantidad as string),
      precio_unitario: parseFloat(item.precio_unitario as string),
      subtotal: parseFloat(item.subtotal as string),
    })),
  };
}

export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const estado = searchParams.get("estado");

  // Role-based filtering
  let whereClause = "";
  const params: unknown[] = [];

  if (usuario.rol === "cliente") {
    // Clients only see their own orders
    params.push(usuario.id, usuario.telefono);
    whereClause = ` AND (p.cliente_id = $${params.length - 1} OR p.cliente_telefono = $${params.length})`;
  } else if (usuario.rol === "tienda") {
    // Tienda users only see orders containing their products
    params.push(usuario.puesto_id);
    whereClause = ` AND EXISTS (SELECT 1 FROM pedido_items pi WHERE pi.pedido_id = p.id AND pi.puesto_id = $${params.length})`;
  }
  // repartidor and admin see all orders

  if (estado) {
    params.push(estado);
    whereClause += ` AND p.estado = $${params.length}`;
  }

  const pedidos = await query(
    `SELECT p.*, COALESCE(z.nombre, 'Ubicación en mapa') as zona_nombre,
            r.nombre as repartidor_nombre
     FROM pedidos p
     LEFT JOIN zonas_entrega z ON z.id = p.zona_id
     LEFT JOIN usuarios r ON r.id = p.repartidor_id
     WHERE 1=1${whereClause}
     ORDER BY p.created_at ${usuario.rol === "repartidor" ? "ASC" : "DESC"}`,
    params
  );

  const result = await Promise.all(
    pedidos.map(async (pedido) => {
      const items = await query(
        `SELECT pi.*, pr.nombre as producto_nombre, pu.nombre as puesto_nombre, pr.unidad
         FROM pedido_items pi
         JOIN productos pr ON pr.id = pi.producto_id
         JOIN puestos pu ON pu.id = pi.puesto_id
         WHERE pi.pedido_id = $1`,
        [pedido.id]
      );
      return parsePedido(pedido, items);
    })
  );

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { cliente_nombre, cliente_telefono, zona_id, direccion_entrega, items, notas, costo_envio_override } = body;

  if (!cliente_nombre || !cliente_telefono || !direccion_entrega || !items?.length) {
    return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 });
  }

  // Check business hours
  const horario = getHorarioInfo();
  if (!horario.abierto) {
    return NextResponse.json({ error: horario.mensaje }, { status: 400 });
  }

  const usuario = await getUsuarioFromSession();
  const clienteId = usuario?.rol === "cliente" ? usuario.id : null;

  let costoEnvio: number;
  if (costo_envio_override != null) {
    costoEnvio = costo_envio_override + horario.recargoNocturno;
  } else if (zona_id) {
    const zona = await queryOne(
      "SELECT costo_envio FROM zonas_entrega WHERE id = $1 AND activa = true",
      [zona_id]
    );
    if (!zona) {
      return NextResponse.json({ error: "Zona de entrega no válida" }, { status: 400 });
    }
    costoEnvio = parseFloat(zona.costo_envio);
  } else {
    return NextResponse.json({ error: "Falta zona o costo de envío" }, { status: 400 });
  }

  const pedidoId = uuidv4();
  let subtotal = 0;

  for (const item of items) {
    subtotal += item.cantidad * item.precio_unitario;
  }

  const total = subtotal + costoEnvio;

  await query(
    `INSERT INTO pedidos (id, cliente_id, cliente_nombre, cliente_telefono, zona_id, direccion_entrega, subtotal, costo_envio, total, notas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [pedidoId, clienteId, cliente_nombre, cliente_telefono, zona_id || "mapa", direccion_entrega, subtotal, costoEnvio, total, notas || null]
  );

  for (const item of items) {
    const itemSubtotal = item.cantidad * item.precio_unitario;
    await query(
      `INSERT INTO pedido_items (id, pedido_id, producto_id, puesto_id, cantidad, precio_unitario, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuidv4(), pedidoId, item.producto_id, item.puesto_id, item.cantidad, item.precio_unitario, itemSubtotal]
    );
  }

  return NextResponse.json({ id: pedidoId, subtotal, costo_envio: costoEnvio, total }, { status: 201 });
}
