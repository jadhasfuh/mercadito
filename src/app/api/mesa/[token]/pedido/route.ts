import { query, queryOne, withTransaction } from "@/lib/db";
import { resolverMesa, dineInDisponible } from "@/lib/mesa";
import { validarDisponibilidadItems, mensajeBloqueo } from "@/lib/disponibilidad";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

interface ItemMesa {
  producto_id: string;
  cantidad: number;
  variante_nombre?: string | null;
  modificadores?: { nombre: string; precio_extra: number }[];
  notas?: string | null;
}

// POST /api/mesa/[token]/pedido — el comensal envía ítems a la cocina; se suman
// a la cuenta abierta. Precio recalculado server-side (no se confía en el cliente).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await resolverMesa(token);
  if (!r) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 });
  if (!dineInDisponible(r)) {
    return NextResponse.json({ error: "Esta tienda no está recibiendo pedidos en mesa.", code: "PLAN_VENCIDO" }, { status: 402 });
  }

  const body = await req.json();
  const cuentaId: string = body.cuenta_id;
  const items: ItemMesa[] = Array.isArray(body.items) ? body.items : [];
  if (!cuentaId || items.length === 0) {
    return NextResponse.json({ error: "Faltan datos del pedido" }, { status: 400 });
  }
  if (items.length > 40) {
    return NextResponse.json({ error: "Demasiados productos en un solo envío" }, { status: 400 });
  }

  // La cuenta debe estar abierta y ser de esta mesa.
  const cuenta = await queryOne<{ id: string }>(
    "SELECT id FROM cuentas WHERE id = $1 AND mesa_id = $2 AND estado <> 'cerrada'",
    [cuentaId, r.mesa.id]
  );
  if (!cuenta) return NextResponse.json({ error: "La cuenta ya no está abierta" }, { status: 409 });

  // Validar disponibilidad real (tienda abierta, producto disponible).
  const bloqueos = await validarDisponibilidadItems(
    items.map((i) => ({ producto_id: i.producto_id, puesto_id: r.puesto.id })),
    null
  );
  if (bloqueos.length > 0) {
    return NextResponse.json({ error: mensajeBloqueo(bloqueos), bloqueos }, { status: 409 });
  }

  // Precio autoritativo desde `precios` (activo) para esta tienda.
  const precios = await query<{ producto_id: string; precio: string }>(
    "SELECT producto_id, precio FROM precios WHERE puesto_id = $1 AND activo = true AND producto_id = ANY($2)",
    [r.puesto.id, items.map((i) => i.producto_id)]
  );
  const precioDe = new Map(precios.map((p) => [p.producto_id, Number(p.precio)]));

  const pedidoId = uuidv4();
  let total = 0;
  const filas: { id: string; producto_id: string; cantidad: number; precio_unitario: number; subtotal: number; variante: string | null; mods: string | null; notas: string | null }[] = [];
  for (const it of items) {
    const base = precioDe.get(it.producto_id);
    if (base == null) return NextResponse.json({ error: "Producto no disponible en esta tienda" }, { status: 409 });
    const cant = Math.max(1, Math.floor(Number(it.cantidad) || 1));
    const extras = Array.isArray(it.modificadores) ? it.modificadores.reduce((s, m) => s + (Number(m.precio_extra) || 0), 0) : 0;
    const precioUnit = Math.round((base + extras) * 100) / 100;
    const sub = Math.round(precioUnit * cant * 100) / 100;
    total += sub;
    filas.push({
      id: uuidv4(), producto_id: it.producto_id, cantidad: cant, precio_unitario: precioUnit, subtotal: sub,
      variante: it.variante_nombre ?? null,
      mods: Array.isArray(it.modificadores) && it.modificadores.length ? JSON.stringify(it.modificadores) : null,
      notas: it.notas ?? null,
    });
  }

  try {
    await withTransaction(async (q) => {
      await q(
        `INSERT INTO pedidos (id, tipo, mesa_id, cuenta_id, cliente_nombre, cliente_telefono, zona_id, direccion_entrega, subtotal, costo_envio, total, estado)
         VALUES ($1, 'mesa', $2, $3, $4, '', 'mesa', $5, $6, 0, $6, 'pendiente')`,
        [pedidoId, r.mesa.id, cuentaId, `Mesa: ${r.mesa.etiqueta}`, `Mesa ${r.mesa.etiqueta}`, total]
      );
      for (const f of filas) {
        await q(
          `INSERT INTO pedido_items (id, pedido_id, producto_id, puesto_id, cantidad, precio_unitario, subtotal, comision, variante_nombre, modificadores, estado_cocina)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, 'pendiente')`,
          [f.id, pedidoId, f.producto_id, r.puesto.id, f.cantidad, f.precio_unitario, f.subtotal, f.variante, f.mods]
        );
      }
    });
  } catch (e) {
    console.error("[mesa pedido] fallo", e);
    return NextResponse.json({ error: "No se pudo enviar el pedido. Intenta de nuevo." }, { status: 500 });
  }

  // Avisar a la tienda (fire-and-forget).
  query<{ push_token: string }>(
    `SELECT push_token FROM usuarios WHERE push_token IS NOT NULL AND activo = true AND rol = 'tienda' AND puesto_id = $1`,
    [r.puesto.id]
  ).then((rows) => {
    enviarPush(rows.map((x) => x.push_token), "🍽️ Pedido en mesa", `${r.mesa.etiqueta} — $${total.toFixed(0)}`, { tipo: "pedido_mesa", mesa: r.mesa.etiqueta });
  }).catch(() => {});

  return NextResponse.json({ ok: true, pedido_id: pedidoId, total }, { status: 201 });
}
