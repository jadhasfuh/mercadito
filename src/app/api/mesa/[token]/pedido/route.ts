import { query, queryOne, withTransaction } from "@/lib/db";
import { resolverMesa, dineInDisponible } from "@/lib/mesa";
import { registrarVentasMenu } from "@/lib/menu";
import { precioVigenteSQL } from "@/lib/precioPromo";
import { validarDisponibilidadItems, mensajeBloqueo } from "@/lib/disponibilidad";
import { enviarPush } from "@/lib/push";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

interface ItemMesa {
  producto_id: string;
  cantidad: number;
  // Presentación con precio propio (sabor, tamaño, "10 piezas"). El nombre y el
  // precio se resuelven en el servidor; del cliente solo se acepta el id.
  variante_id?: string | null;
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
    // El precio que cobra la mesa tiene que ser EL MISMO que anuncia el menú:
    // por eso resuelve la promo con el mismo SQL compartido.
    `SELECT producto_id, ${precioVigenteSQL("precios")} AS precio
     FROM precios WHERE puesto_id = $1 AND activo = true AND producto_id = ANY($2)`,
    [r.puesto.id, items.map((i) => i.producto_id)]
  );
  const precioDe = new Map(precios.map((p) => [p.producto_id, Number(p.precio)]));

  // Variantes activas de los productos pedidos. El precio de la presentación
  // manda sobre el precio base (misma fórmula que el menú digital).
  const variantes = await query<{ id: string; producto_id: string; nombre: string; precio_override: string | null }>(
    "SELECT id, producto_id, nombre, precio_override FROM producto_variantes WHERE activo = true AND producto_id = ANY($1)",
    [items.map((i) => i.producto_id)]
  );
  const varianteDe = new Map(variantes.map((v) => [v.id, v]));
  const tieneVariantes = new Set(variantes.map((v) => v.producto_id));

  const pedidoId = uuidv4();
  let total = 0;
  const filas: { id: string; producto_id: string; cantidad: number; precio_unitario: number; subtotal: number; variante: string | null; mods: string | null; notas: string | null }[] = [];
  for (const it of items) {
    const precioBase = precioDe.get(it.producto_id);
    if (precioBase == null) return NextResponse.json({ error: "Producto no disponible en esta tienda" }, { status: 409 });
    // Si el producto tiene presentaciones, elegir una es obligatorio: sin esto
    // se cobraría el precio base y el sabor/tamaño llegaría en blanco a cocina.
    const variante = it.variante_id ? varianteDe.get(it.variante_id) : undefined;
    if (it.variante_id && (!variante || variante.producto_id !== it.producto_id)) {
      return NextResponse.json({ error: "Esa presentación ya no está disponible" }, { status: 409 });
    }
    if (!variante && tieneVariantes.has(it.producto_id)) {
      return NextResponse.json({ error: "Elige una presentación del producto" }, { status: 400 });
    }
    const base = variante?.precio_override != null ? Number(variante.precio_override) : precioBase;
    const cant = Math.max(1, Math.floor(Number(it.cantidad) || 1));
    const extras = Array.isArray(it.modificadores) ? it.modificadores.reduce((s, m) => s + (Number(m.precio_extra) || 0), 0) : 0;
    const precioUnit = Math.round((base + extras) * 100) / 100;
    const sub = Math.round(precioUnit * cant * 100) / 100;
    total += sub;
    filas.push({
      id: uuidv4(), producto_id: it.producto_id, cantidad: cant, precio_unitario: precioUnit, subtotal: sub,
      variante: variante?.nombre ?? null,
      mods: Array.isArray(it.modificadores) && it.modificadores.length ? JSON.stringify(it.modificadores) : null,
      // La nota la escribe el comensal y va derecho a la pantalla de cocina:
      // se recorta para que nadie pueda empujar un párrafo y tapar la comanda.
      notas: typeof it.notas === "string" && it.notas.trim() ? it.notas.trim().slice(0, 120) : null,
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
          `INSERT INTO pedido_items (id, pedido_id, producto_id, puesto_id, cantidad, precio_unitario, subtotal, comision, variante_nombre, modificadores, notas, estado_cocina)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, 'pendiente')`,
          [f.id, pedidoId, f.producto_id, r.puesto.id, f.cantidad, f.precio_unitario, f.subtotal, f.variante, f.mods, f.notas]
        );
      }
    });
  } catch (e) {
    console.error("[mesa pedido] fallo", e);
    return NextResponse.json({ error: "No se pudo enviar el pedido. Intenta de nuevo." }, { status: 500 });
  }

  // "Más vendidos" del menú: la comanda de mesa es un pedido real y la señal
  // más limpia que tenemos de qué se pide en el restaurante. Fire-and-forget:
  // el pedido ya está en cocina, esto es telemetría.
  registrarVentasMenu(r.puesto.id, filas.map((f) => ({ producto_id: f.producto_id, cantidad: f.cantidad }))).catch(() => {});

  // Avisar a la tienda (fire-and-forget).
  query<{ push_token: string }>(
    `SELECT push_token FROM usuarios WHERE push_token IS NOT NULL AND activo = true AND rol = 'tienda' AND puesto_id = $1`,
    [r.puesto.id]
  ).then((rows) => {
    enviarPush(rows.map((x) => x.push_token), "🍽️ Pedido en mesa", `${r.mesa.etiqueta} — $${total.toFixed(0)}`, { tipo: "pedido_mesa", mesa: r.mesa.etiqueta });
  }).catch(() => {});

  return NextResponse.json({ ok: true, pedido_id: pedidoId, total }, { status: 201 });
}
