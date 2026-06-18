import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// POST /api/repartidor/ingresos
// Registra una venta manual del repartidor (pedidos por WhatsApp, mandados
// con cobro mental). El monto es la GANANCIA de Mercadito (envío + servicio),
// no el ticket total del cliente.
//
// Body: {
//   tipo: 'tienda' | 'mandado',
//   puesto_id?: string,        // requerido si tipo='tienda'
//   cliente_nombre?: string,   // requerido si tipo='mandado'
//   cliente_telefono?: string, // opcional si tipo='mandado'
//   monto: number,             // > 0
//   metodo_pago?: 'efectivo' | 'transferencia' | 'tarjeta',
//   detalle?: string,
// }
export async function POST(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "repartidor" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { tipo, puesto_id, cliente_nombre, cliente_telefono, monto, metodo_pago, detalle } = body;

  if (tipo !== "tienda" && tipo !== "mandado") {
    return NextResponse.json({ error: "tipo inválido (tienda | mandado)" }, { status: 400 });
  }
  const montoNum = Number(monto);
  if (!isFinite(montoNum) || montoNum <= 0) {
    return NextResponse.json({ error: "Monto debe ser mayor a 0" }, { status: 400 });
  }
  if (tipo === "tienda") {
    if (!puesto_id || typeof puesto_id !== "string") {
      return NextResponse.json({ error: "Tienda requerida" }, { status: 400 });
    }
    const existe = await query("SELECT 1 FROM puestos WHERE id = $1", [puesto_id]);
    if (existe.length === 0) {
      return NextResponse.json({ error: "Tienda no existe" }, { status: 400 });
    }
  } else {
    if (!cliente_nombre || typeof cliente_nombre !== "string" || cliente_nombre.trim().length === 0) {
      return NextResponse.json({ error: "Nombre del cliente requerido" }, { status: 400 });
    }
  }

  const metodo = metodo_pago && ["efectivo", "transferencia", "tarjeta"].includes(metodo_pago)
    ? metodo_pago
    : "efectivo";

  // Idempotencia: el cliente genera un id (clave de idempotencia) una vez por
  // captura y lo reusa en reintentos. Si por doble-tap o reintento de red llega
  // el mismo id dos veces, el ON CONFLICT evita la segunda fila. Si no mandan id
  // (web vieja antes de este deploy), generamos uno en el server.
  const idCliente =
    typeof body.id === "string" && body.id.trim().length >= 8 && body.id.trim().length <= 64
      ? body.id.trim()
      : null;
  const id = idCliente || uuidv4();
  const insertado = await query(
    `INSERT INTO ingresos_manuales
       (id, repartidor_id, tipo, puesto_id, cliente_nombre, cliente_telefono, monto, metodo_pago, detalle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      id,
      usuario.id,
      tipo,
      tipo === "tienda" ? puesto_id : null,
      tipo === "mandado" ? cliente_nombre.trim() : null,
      tipo === "mandado" ? (cliente_telefono?.toString().trim() || null) : null,
      montoNum,
      metodo,
      detalle?.toString().trim() || null,
    ]
  );

  // Conflicto = ya existía esa captura (doble envío). Idempotente: no
  // insertamos otra fila ni volvemos a notificar al admin.
  if (insertado.length === 0) {
    return NextResponse.json({ ok: true, id, duplicado: true }, { status: 200 });
  }

  // Avisar al admin (fire-and-forget) de la venta manual registrada. El
  // monto es la ganancia de Mercadito (envío + servicio).
  const refVenta = tipo === "tienda"
    ? "venta de tienda"
    : `mandado de ${cliente_nombre.trim()}`;
  query<{ push_token: string }>(
    `SELECT push_token FROM usuarios
     WHERE push_token IS NOT NULL AND activo = true AND rol = 'admin'`
  ).then((rows) => {
    const tokens = rows.map((r) => r.push_token);
    enviarPush(
      tokens,
      "💵 Venta manual registrada",
      `${usuario.nombre || "Repartidor"} — $${montoNum.toFixed(0)} (${refVenta})`,
      { tipo: "venta_manual", ingresoId: id }
    );
  }).catch((e) => console.error("[push] admin venta_manual failed", e));

  return NextResponse.json({ ok: true, id }, { status: 201 });
}

// GET /api/repartidor/ingresos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&repartidor_id=...
// Repartidor: ve solo los suyos. Admin: ve todos, puede filtrar por repartidor.
export async function GET(request: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "repartidor" && usuario.rol !== "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const repartidorFiltro = searchParams.get("repartidor_id");

  const filtros: string[] = [];
  const params: unknown[] = [];

  if (usuario.rol === "repartidor") {
    params.push(usuario.id);
    filtros.push(`im.repartidor_id = $${params.length}`);
  } else if (repartidorFiltro) {
    params.push(repartidorFiltro);
    filtros.push(`im.repartidor_id = $${params.length}`);
  }
  // Corte del día en hora local de México, no UTC (reportes al día correctos).
  if (desde) {
    params.push(desde);
    filtros.push(`im.created_at >= ($${params.length}::date)::timestamp AT TIME ZONE 'America/Mexico_City'`);
  }
  if (hasta) {
    params.push(hasta);
    filtros.push(`im.created_at < ($${params.length}::date + interval '1 day')::timestamp AT TIME ZONE 'America/Mexico_City'`);
  }

  const where = filtros.length > 0 ? `WHERE ${filtros.join(" AND ")}` : "";

  const rows = await query(
    `SELECT im.id, im.tipo, im.puesto_id, im.cliente_nombre, im.cliente_telefono,
            im.monto, im.metodo_pago, im.detalle, im.created_at,
            u.nombre AS repartidor_nombre,
            pu.nombre AS puesto_nombre
     FROM ingresos_manuales im
     JOIN usuarios u ON u.id = im.repartidor_id
     LEFT JOIN puestos pu ON pu.id = im.puesto_id
     ${where}
     ORDER BY im.created_at DESC
     LIMIT 200`,
    params
  );

  const total = rows.reduce((s, r) => s + Number(r.monto), 0);

  return NextResponse.json({
    total: Math.round(total * 100) / 100,
    count: rows.length,
    ingresos: rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      puesto_id: r.puesto_id,
      puesto_nombre: r.puesto_nombre,
      cliente_nombre: r.cliente_nombre,
      cliente_telefono: r.cliente_telefono,
      monto: Number(r.monto),
      metodo_pago: r.metodo_pago,
      detalle: r.detalle,
      created_at: r.created_at,
      repartidor_nombre: r.repartidor_nombre,
    })),
  });
}
