import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/tienda/comandas — cuentas abiertas de la tienda con sus ítems
// (board de cocina + cierre de cuenta). Agrupado por mesa.
export async function GET() {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "admin" && usuario.rol !== "mesero") || !usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const rows = await query<{
    cuenta_id: string; cuenta_estado: string; mesa_id: string; etiqueta: string;
    item_id: string; producto_nombre: string; cantidad: string; subtotal: string;
    estado_cocina: string; variante_nombre: string | null; modificadores: unknown;
    notas: string | null; created_at: string;
  }>(
    `SELECT c.id AS cuenta_id, c.estado AS cuenta_estado, m.id AS mesa_id,
            -- Sin mesa es una venta de mostrador: la comanda se rotula con su
            -- tipo de servicio y su folio para que cocina sepa qué empacar.
            COALESCE(m.etiqueta,
              CASE c.servicio
                WHEN 'llevar' THEN 'Para llevar'
                WHEN 'domicilio' THEN 'A domicilio'
                ELSE 'Mostrador'
              END || COALESCE(' #' || c.folio, '')
            ) AS etiqueta,
            pi.id AS item_id, COALESCE(pr.nombre, pi.producto_nombre, 'Producto') AS producto_nombre,
            pi.cantidad, pi.subtotal, pi.estado_cocina, pi.variante_nombre, pi.modificadores,
            pi.notas, p.created_at
     FROM cuentas c
     LEFT JOIN mesas m ON m.id = c.mesa_id
     LEFT JOIN pedidos p ON p.cuenta_id = c.id
     LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
     LEFT JOIN productos pr ON pr.id = pi.producto_id
     -- Las de mostrador nacen cerradas (se cobran de una), así que se
     -- incluyen mientras les quede algo sin servir en cocina.
     WHERE c.puesto_id = $1
       AND (c.estado <> 'cerrada' OR EXISTS (
         SELECT 1 FROM pedidos p2 JOIN pedido_items pi2 ON pi2.pedido_id = p2.id
         WHERE p2.cuenta_id = c.id AND pi2.estado_cocina <> 'servido'
       ))
     ORDER BY p.created_at, pi.id`,
    [usuario.puesto_id]
  );

  // Agrupar por cuenta/mesa.
  interface Grupo {
    cuenta_id: string; estado: string; mesa_id: string; etiqueta: string;
    total: number; items: unknown[];
    /** Momento en que entró el ítem sin servir más viejo de la cuenta. Es el
     *  reloj de la mesa: de aquí sale el "lleva 12 min esperando" y el orden
     *  del board. null = no hay nada pendiente en cocina. */
    espera_desde: string | null;
  }
  const mapa = new Map<string, Grupo>();
  for (const r of rows) {
    let g = mapa.get(r.cuenta_id);
    if (!g) {
      g = {
        cuenta_id: r.cuenta_id, estado: r.cuenta_estado, mesa_id: r.mesa_id,
        etiqueta: r.etiqueta, total: 0, items: [], espera_desde: null,
      };
      mapa.set(r.cuenta_id, g);
    }
    if (r.item_id) {
      g.total += Number(r.subtotal);
      g.items.push({
        id: r.item_id, producto_nombre: r.producto_nombre, cantidad: Number(r.cantidad),
        subtotal: Number(r.subtotal), estado_cocina: r.estado_cocina,
        variante_nombre: r.variante_nombre, modificadores: r.modificadores,
        // "sin cebolla", "bien cocido": lo que cocina NO puede pasar por alto.
        notas: r.notas,
        // La hora es del PEDIDO, no del ítem: lo que cocina necesita saber es
        // hace cuánto se mandó la comanda.
        creado_at: r.created_at,
      });
      const pendiente = r.estado_cocina !== "servido";
      if (pendiente && r.created_at && (!g.espera_desde || r.created_at < g.espera_desde)) {
        g.espera_desde = r.created_at;
      }
    }
  }

  // Lo que lleva más tiempo esperando, primero — es el orden que necesita
  // cocina. Las mesas sin nada pendiente caen abajo, alfabéticas, porque ahí
  // el panel se usa para cobrar y no para preparar.
  const grupos = Array.from(mapa.values()).sort((a, b) => {
    if (a.espera_desde && b.espera_desde) return a.espera_desde < b.espera_desde ? -1 : 1;
    if (a.espera_desde) return -1;
    if (b.espera_desde) return 1;
    return a.etiqueta.localeCompare(b.etiqueta);
  });
  return NextResponse.json(grupos);
}

// PATCH /api/tienda/comandas { item_id, estado_cocina } — marca un ítem en cocina.
export async function PATCH(req: Request) {
  const usuario = await getUsuarioFromSession();
  if (!usuario || (usuario.rol !== "tienda" && usuario.rol !== "admin" && usuario.rol !== "mesero") || !usuario.puesto_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const estados = ["pendiente", "preparando", "listo", "servido"];
  if (!body.item_id || !estados.includes(body.estado_cocina)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  // Sólo ítems de la propia tienda.
  await query(
    "UPDATE pedido_items SET estado_cocina = $1 WHERE id = $2 AND puesto_id = $3",
    [body.estado_cocina, body.item_id, usuario.puesto_id]
  );
  return NextResponse.json({ ok: true });
}
