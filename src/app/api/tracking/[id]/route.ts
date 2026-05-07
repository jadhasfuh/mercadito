import { queryOne } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * GET /api/tracking/[id]
 *
 * Endpoint PÚBLICO (sin auth) para que el cliente final de un pedido
 * B2B (solicitado por tienda) vea el tracking de su entrega sin
 * necesitar cuenta en Mercadito. La tienda solo le manda el link
 * tipo mercadito.cx/p/abc12345 por WhatsApp.
 *
 * Solo expone lo mínimo:
 *   - estado, hora del pedido
 *   - lat/lng del repartidor (si reportado en últimos 15 min)
 *   - lat/lng del destino (extraído de direccion_entrega)
 *   - nombre del repartidor (para confianza)
 *   - primer nombre del cliente (para personalizar saludo)
 *   - foto de entrega si ya está entregado
 *
 * NO expone: teléfonos, dirección completa en texto, montos, items,
 * comprobantes, datos de pago. Solo lo necesario para el tracking.
 *
 * Solo aplica a pedidos B2B (solicitado_por_tienda_id != null) — los
 * pedidos del catálogo cliente ya tienen tracking dentro de su sesión
 * autenticada en /cliente.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length < 4) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const row = await queryOne<{
    id: string;
    estado: string;
    tipo: string | null;
    solicitado_por_tienda_id: string | null;
    cliente_nombre: string;
    direccion_entrega: string;
    repartidor_lat: number | null;
    repartidor_lng: number | null;
    repartidor_ubicacion_at: string | null;
    repartidor_nombre: string | null;
    foto_entrega: string | null;
    created_at: string;
    recogida_nombre: string | null;
  }>(
    `SELECT p.id, p.estado, p.tipo, p.solicitado_por_tienda_id, p.cliente_nombre,
            p.direccion_entrega, p.repartidor_lat, p.repartidor_lng,
            p.repartidor_ubicacion_at, p.foto_entrega, p.created_at,
            p.recogida_nombre,
            r.nombre AS repartidor_nombre
     FROM pedidos p
     LEFT JOIN usuarios r ON r.id = p.repartidor_id
     WHERE p.id = $1`,
    [id]
  );

  if (!row) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  // Solo dejamos consultar pedidos B2B (que tienen origen en una tienda
  // que SÍ se atrevió a compartir el link). Pedidos del catálogo cliente
  // tienen su propio tracking en /cliente; no abrimos sus datos al público.
  if (row.tipo !== "envio" || !row.solicitado_por_tienda_id) {
    return NextResponse.json({ error: "Tracking no disponible para este pedido" }, { status: 404 });
  }

  // Extraer lat/lng del destino del campo direccion_entrega.
  // Formato: "texto libre [lat,lng]". Si no tiene coords (cliente sin
  // GPS marcado), no podemos pintar pin de destino — mostramos solo
  // pin del repartidor.
  let destLat: number | null = null;
  let destLng: number | null = null;
  const m = row.direccion_entrega.match(/\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]/);
  if (m) {
    destLat = parseFloat(m[1]);
    destLng = parseFloat(m[2]);
  }

  // GPS del repartidor solo si es reciente (≤15 min). Más viejo no
  // aporta y confunde al cliente.
  const ahora = Date.now();
  const ubicReciente = row.repartidor_ubicacion_at &&
    (ahora - new Date(row.repartidor_ubicacion_at).getTime()) < 15 * 60 * 1000;

  return NextResponse.json({
    estado: row.estado,
    creado_at: row.created_at,
    cliente_primer_nombre: (row.cliente_nombre || "").split(" ")[0] || "",
    recogida_nombre: row.recogida_nombre,
    repartidor_nombre: row.repartidor_nombre ? row.repartidor_nombre.split(" ")[0] : null,
    repartidor_lat: ubicReciente ? row.repartidor_lat : null,
    repartidor_lng: ubicReciente ? row.repartidor_lng : null,
    repartidor_ubicacion_at: ubicReciente ? row.repartidor_ubicacion_at : null,
    destino_lat: destLat,
    destino_lng: destLng,
    foto_entrega: row.estado === "entregado" ? row.foto_entrega : null,
  });
}
