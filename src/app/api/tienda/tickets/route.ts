import { query } from "@/lib/db";
import { getUsuarioFromSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/tienda/tickets — últimos tickets cobrados, para reimprimir.
//
// "Se cortó el papel", "el cliente quiere su copia", "¿qué llevaba el folio
// 214?". Sin historial, un ticket impreso mal se perdía para siempre: la venta
// quedaba registrada pero no había forma de volver a sacarla en papel.
//
// Incluye ventas de mostrador y cuentas de mesa cerradas — para el negocio son
// lo mismo: un ticket que ya cobró.
export async function GET(req: Request) {
  const u = await getUsuarioFromSession();
  if (!u || !u.puesto_id || (u.rol !== "tienda" && u.rol !== "admin" && u.rol !== "mesero")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const buscado = (searchParams.get("q") || "").trim();
  // Buscar por folio es lo que pide la gente en el mostrador ("el 214"), así
  // que un número se trata como folio y no como texto libre.
  const folio = /^\d{1,9}$/.test(buscado) ? Number(buscado) : null;

  const filas = await query<{
    id: string; folio: number | null; servicio: string | null; etiqueta: string | null;
    metodo_pago: string | null; propina: string; cerrada_at: string;
    cliente_nombre: string | null; total: string;
    items: { nombre: string; cantidad: number; subtotal: number; notas: string | null; variante: string | null }[] | null;
  }>(
    `SELECT c.id, c.folio, c.servicio, m.etiqueta, c.metodo_pago,
            COALESCE(c.propina, 0) AS propina, c.cerrada_at, c.cliente_nombre,
            COALESCE((
              SELECT SUM(pe.total) FROM pedidos pe
              WHERE pe.cuenta_id = c.id AND pe.estado <> 'cancelado'
            ), 0) AS total,
            (
              SELECT json_agg(jsonb_build_object(
                'nombre', COALESCE(pr.nombre, pi.producto_nombre, 'Producto'),
                'cantidad', pi.cantidad,
                'subtotal', pi.subtotal,
                'notas', pi.notas,
                'variante', pi.variante_nombre
              ) ORDER BY pi.id)
              FROM pedidos pe2
              JOIN pedido_items pi ON pi.pedido_id = pe2.id
              LEFT JOIN productos pr ON pr.id = pi.producto_id
              WHERE pe2.cuenta_id = c.id AND pe2.estado <> 'cancelado'
            ) AS items
     FROM cuentas c
     LEFT JOIN mesas m ON m.id = c.mesa_id
     WHERE c.puesto_id = $1 AND c.estado = 'cerrada'
       ${folio != null ? "AND c.folio = $2" : ""}
     ORDER BY c.cerrada_at DESC
     LIMIT 40`,
    folio != null ? [u.puesto_id, folio] : [u.puesto_id]
  ).catch(() => []);

  return NextResponse.json(
    filas.map((f) => ({
      id: f.id,
      folio: f.folio,
      // Cómo se rotula el ticket: la mesa si la tuvo, si no el tipo de servicio.
      titulo: f.etiqueta || (f.servicio === "llevar" ? "Para llevar" : f.servicio === "domicilio" ? "A domicilio" : "Mostrador"),
      metodo_pago: f.metodo_pago,
      propina: Number(f.propina),
      total: Number(f.total),
      cerrada_at: f.cerrada_at,
      cliente_nombre: f.cliente_nombre,
      items: (f.items ?? []).map((i) => ({
        nombre: i.nombre, cantidad: Number(i.cantidad), subtotal: Number(i.subtotal),
        notas: i.notas, variante: i.variante,
      })),
    }))
  );
}
