import { query, queryOne } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { getHorarioInfo } from "@/lib/horario";
import { calcularComision } from "@/lib/comision";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// Helper to convert NUMERIC fields
function parsePedido(pedido: Record<string, unknown>, items: Record<string, unknown>[]) {
  return {
    ...pedido,
    subtotal: parseFloat(pedido.subtotal as string),
    costo_envio: parseFloat(pedido.costo_envio as string),
    total: parseFloat(pedido.total as string),
    recargo_tarjeta: parseFloat((pedido.recargo_tarjeta as string) || "0"),
    items: items.map((item) => ({
      ...item,
      cantidad: parseFloat(item.cantidad as string),
      precio_unitario: parseFloat(item.precio_unitario as string),
      subtotal: parseFloat(item.subtotal as string),
      comision: parseFloat((item.comision as string) || "0"),
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

  // Fetch all items for all orders in one query (avoids N+1)
  const pedidoIds = pedidos.map((p) => p.id as string);
  let allItems: Record<string, unknown>[] = [];
  if (pedidoIds.length > 0) {
    const placeholders = pedidoIds.map((_, i) => `$${i + 1}`).join(", ");
    allItems = await query(
      `SELECT pi.*, pr.nombre as producto_nombre, pu.nombre as puesto_nombre, pr.unidad,
              pu.telefono_contacto as puesto_telefono, pu.ubicacion as puesto_ubicacion
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
       JOIN puestos pu ON pu.id = pi.puesto_id
       WHERE pi.pedido_id IN (${placeholders})`,
      pedidoIds
    );
  }

  // Group items by pedido_id
  const itemsByPedido = new Map<string, Record<string, unknown>[]>();
  for (const item of allItems) {
    const pid = item.pedido_id as string;
    if (!itemsByPedido.has(pid)) {
      itemsByPedido.set(pid, []);
    }
    itemsByPedido.get(pid)!.push(item);
  }

  const result = pedidos.map((pedido) => {
    const items = itemsByPedido.get(pedido.id as string) || [];
    return parsePedido(pedido, items);
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { cliente_nombre, cliente_telefono, zona_id, direccion_entrega, items, notas, costo_envio_override, metodo_pago, recargo_tarjeta } = body;

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

  // Validate all stores are active
  const puestoIds = [...new Set(items.map((i: { puesto_id: string }) => i.puesto_id))];
  for (const pid of puestoIds) {
    const puesto = await queryOne("SELECT id FROM puestos WHERE id = $1 AND activo = true AND aprobado = true", [pid]);
    if (!puesto) {
      return NextResponse.json({ error: "Una tienda de tu pedido ya no esta disponible. Revisa tu carrito." }, { status: 400 });
    }
  }

  const pedidoId = uuidv4();
  // precio_unitario en el body es el precio REAL (sin comision). La comision viene
  // como campo aparte y se guarda tambien en pedido_items.comision.
  let subtotalProductos = 0;
  let totalComision = 0;
  for (const item of items) {
    const com = typeof item.comision === "number" ? item.comision : calcularComision(item.precio_unitario);
    subtotalProductos += item.cantidad * item.precio_unitario;
    totalComision += item.cantidad * com;
  }

  const recargoTarjetaVal = metodo_pago === "tarjeta"
    ? Math.round((subtotalProductos + totalComision + costoEnvio) * 0.0406)
    : 0;
  const total = subtotalProductos + totalComision + costoEnvio + recargoTarjetaVal;

  await query(
    `INSERT INTO pedidos (id, cliente_id, cliente_nombre, cliente_telefono, zona_id, direccion_entrega, subtotal, costo_envio, total, notas, metodo_pago, recargo_tarjeta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [pedidoId, clienteId, cliente_nombre, cliente_telefono, zona_id || "mapa", direccion_entrega, subtotalProductos, costoEnvio, total, notas || null, metodo_pago || "efectivo", recargoTarjetaVal]
  );

  for (const item of items) {
    const com = typeof item.comision === "number" ? item.comision : calcularComision(item.precio_unitario);
    const itemSubtotal = item.cantidad * item.precio_unitario;
    await query(
      `INSERT INTO pedido_items (id, pedido_id, producto_id, puesto_id, cantidad, precio_unitario, subtotal, comision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [uuidv4(), pedidoId, item.producto_id, item.puesto_id, item.cantidad, item.precio_unitario, itemSubtotal, com]
    );
  }

  // Notificar (fire-and-forget) a:
  //  1. todos los repartidores activos
  //  2. dueños de las tiendas cuyos productos están en este pedido
  const puestoIdsItems = Array.from(new Set(items.map((i: { puesto_id: string }) => i.puesto_id)));
  query<{ push_token: string }>(
    `SELECT push_token FROM usuarios
     WHERE push_token IS NOT NULL AND activo = true
       AND (
         rol = 'repartidor'
         OR (rol = 'tienda' AND puesto_id = ANY($1))
       )`,
    [puestoIdsItems]
  ).then((rows) => {
    const tokens = rows.map((r) => r.push_token);
    enviarPush(
      tokens,
      "Nuevo pedido en Mercadito",
      `${cliente_nombre} — $${total.toFixed(0)}`,
      { pedidoId, tipo: "nuevo_pedido" }
    );
  }).catch((e) => console.error("[push] fetch destinatarios failed", e));

  return NextResponse.json({ id: pedidoId, subtotal: subtotalProductos, servicio_mercadito: totalComision, costo_envio: costoEnvio, total }, { status: 201 });
}
