import { query, withTransaction } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { turnoAbierto } from "@/lib/caja";
import { registrarVentasMenu } from "@/lib/menu";
import { SERVICIOS, normalizarPagos, metodoPrincipal, type Servicio } from "@/lib/mostrador";
import { siguienteFolio } from "@/lib/folio";
import { precioVigenteSQL } from "@/lib/precioPromo";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// POST /api/tienda/mostrador — venta rápida en caja.
//
// El cliente que llega al mostrador, el que pide para llevar y el que llama por
// teléfono. Se cobra de una y se cierra la cuenta en el mismo movimiento; el
// pedido va a cocina si el negocio lo manda.
//
// La venta se guarda como una `cuenta` SIN mesa para que entre sola al corte de
// caja, al tablero de comandas y al resumen. Los precios se recalculan aquí:
// del cliente sólo se aceptan ids y cantidades.

interface ItemMostrador {
  producto_id: string;
  cantidad: number;
  notas?: string | null;
}

export async function POST(req: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || !usuario.puesto_id || (usuario.rol !== "tienda" && usuario.rol !== "admin" && usuario.rol !== "mesero")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const puestoId = usuario.puesto_id;

  const body = await req.json().catch(() => ({}));
  const items: ItemMostrador[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) return NextResponse.json({ error: "Agrega al menos un producto" }, { status: 400 });
  if (items.length > 60) return NextResponse.json({ error: "Demasiados productos en una sola venta" }, { status: 400 });

  const servicio: Servicio = SERVICIOS.includes(body?.servicio) ? body.servicio : "local";

  // Precio autoritativo desde `precios` — nunca el que manda el cliente.
  const precios = await query<{ producto_id: string; precio: string; nombre: string }>(
    `SELECT pr.producto_id, ${precioVigenteSQL("pr")} AS precio, p.nombre
     FROM precios pr JOIN productos p ON p.id = pr.producto_id
     WHERE pr.puesto_id = $1 AND pr.activo = true AND pr.producto_id = ANY($2)`,
    [puestoId, items.map((i) => i.producto_id)]
  );
  const infoDe = new Map(precios.map((p) => [p.producto_id, { precio: Number(p.precio), nombre: p.nombre }]));

  let total = 0;
  const filas: { id: string; producto_id: string; nombre: string; cantidad: number; precio: number; subtotal: number; notas: string | null }[] = [];
  for (const it of items) {
    const info = infoDe.get(it.producto_id);
    if (!info) return NextResponse.json({ error: "Un producto ya no está disponible en tu tienda" }, { status: 409 });
    const cant = Math.max(1, Math.floor(Number(it.cantidad) || 1));
    const sub = Math.round(info.precio * cant * 100) / 100;
    total += sub;
    filas.push({
      id: uuidv4(), producto_id: it.producto_id, nombre: info.nombre,
      cantidad: cant, precio: info.precio, subtotal: sub,
      // La nota va derecho a la pantalla de cocina: se recorta para que nadie
      // pueda empujar un párrafo y tapar la comanda.
      notas: typeof it.notas === "string" && it.notas.trim() ? it.notas.trim().slice(0, 120) : null,
    });
  }
  total = Math.round(total * 100) / 100;

  const propina = Math.max(0, Math.min(100_000, Number(body?.propina) || 0));

  // Los pagos se validan contra lo que el cliente ENTREGA —productos más
  // propina—, no contra el total de productos. Validarlo contra `total` hacía
  // que cualquier venta con propina se rechazara: la caja manda el cobro
  // completo, que es lo correcto.
  const pagos = normalizarPagos(body?.pagos, Math.round((total + propina) * 100) / 100);
  if (!pagos) {
    return NextResponse.json(
      { error: "Los pagos no suman el total del ticket. Revisa los montos." },
      { status: 400 }
    );
  }
  const metodo = metodoPrincipal(pagos);

  const cliente = {
    nombre: String(body?.cliente_nombre || "").trim().slice(0, 80) || null,
    telefono: String(body?.cliente_telefono || "").replace(/\D/g, "").slice(0, 15) || null,
    direccion: String(body?.cliente_direccion || "").trim().slice(0, 200) || null,
  };
  // A domicilio sin a dónde llevarlo no es un pedido, es un problema.
  if (servicio === "domicilio" && !cliente.direccion) {
    return NextResponse.json({ error: "Escribe la dirección de entrega" }, { status: 400 });
  }

  // Si mandas a cocina, las líneas entran 'pendiente' y aparecen en el tablero.
  // Si no (una venta de refrescos, un pan), entran ya servidas y no ensucian.
  const aCocina = body?.a_cocina !== false;
  const estadoCocina = aCocina ? "pendiente" : "servido";

  const turno = await turnoAbierto(puestoId);
  const folio = await siguienteFolio(puestoId);
  const cuentaId = uuidv4();
  const pedidoId = uuidv4();

  try {
    await withTransaction(async (q) => {
      await q(
        `INSERT INTO cuentas (id, puesto_id, mesa_id, estado, metodo_pago, pagos, propina,
                              servicio, cliente_nombre, cliente_telefono, cliente_direccion,
                              folio, turno_id, abierta_at, cerrada_at)
         VALUES ($1, $2, NULL, 'cerrada', $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
        [cuentaId, puestoId, metodo, JSON.stringify(pagos), propina, servicio,
         cliente.nombre, cliente.telefono, cliente.direccion, folio, turno?.id ?? null]
      );
      await q(
        `INSERT INTO pedidos (id, tipo, cuenta_id, cliente_nombre, cliente_telefono, zona_id,
                              direccion_entrega, subtotal, costo_envio, total, estado, metodo_pago, entregado_at)
         VALUES ($1, 'mostrador', $2, $3, $4, 'mostrador', $5, $6, 0, $6, 'entregado', $7, NOW())`,
        [pedidoId, cuentaId, cliente.nombre || "Mostrador", cliente.telefono || "",
         cliente.direccion || "Mostrador", total, metodo]
      );
      for (const f of filas) {
        await q(
          `INSERT INTO pedido_items (id, pedido_id, producto_id, puesto_id, cantidad, precio_unitario,
                                     subtotal, comision, producto_nombre, notas, estado_cocina)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10)`,
          [f.id, pedidoId, f.producto_id, puestoId, f.cantidad, f.precio, f.subtotal, f.nombre, f.notas, estadoCocina]
        );
      }
    });
  } catch (e) {
    console.error("[mostrador] fallo", e);
    return NextResponse.json({ error: "No se pudo registrar la venta. Intenta de nuevo." }, { status: 500 });
  }

  // "Más vendidos": la venta de mostrador es un pedido real del negocio.
  registrarVentasMenu(puestoId, filas.map((f) => ({ producto_id: f.producto_id, cantidad: f.cantidad }))).catch(() => {});

  return NextResponse.json(
    {
      ok: true,
      venta: {
        cuenta_id: cuentaId, folio, servicio, total, propina, pagos,
        items: filas.map((f) => ({
          nombre: f.nombre, cantidad: f.cantidad, precio: f.precio, subtotal: f.subtotal, notas: f.notas,
        })),
        cliente,
        a_cocina: aCocina,
        // Para que la caja avise si la venta no va a entrar a ningún corte.
        en_turno: !!turno,
      },
    },
    { status: 201 }
  );
}
