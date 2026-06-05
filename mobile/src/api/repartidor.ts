import { apiFetch } from "./client";
import type { Pedido, EstadoPedido } from "./pedidos";

export async function listarPedidos(): Promise<Pedido[]> {
  return apiFetch<Pedido[]>("/api/pedidos");
}

export async function tomarPedido(pedidoId: string, repartidorId: string): Promise<void> {
  await apiFetch(`/api/pedidos/${pedidoId}`, {
    method: "PATCH",
    body: JSON.stringify({ repartidor_id: repartidorId, estado: "en_compra" }),
  });
}

export async function cambiarEstado(
  pedidoId: string,
  estado: EstadoPedido,
  opts?: { motivo_cancelacion?: string; entrega_lat?: number; entrega_lng?: number; foto_entrega?: string }
): Promise<{ ok: true; estado: string; costo_envio_actualizado?: number; total_actualizado?: number }> {
  const body: Record<string, unknown> = { estado };
  if (estado === "cancelado" && opts?.motivo_cancelacion) body.motivo_cancelacion = opts.motivo_cancelacion;
  // Para envíos B2B, mandamos la ubicación GPS del repartidor al marcar
  // entregado — el backend la usa para recalcular el costo real.
  if (estado === "entregado" && opts?.entrega_lat != null && opts?.entrega_lng != null) {
    body.entrega_lat = opts.entrega_lat;
    body.entrega_lng = opts.entrega_lng;
  }
  // Foto de prueba de entrega — opcional, mejora confianza del cliente
  // y reduce disputas si reclama "no llegó".
  if (estado === "entregado" && opts?.foto_entrega) {
    body.foto_entrega = opts.foto_entrega;
  }
  return apiFetch<{ ok: true; estado: string; costo_envio_actualizado?: number; total_actualizado?: number }>(
    `/api/pedidos/${pedidoId}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

/** Parsea "Calle #42 [20.12, -102.34]" → { texto, lat, lng } */
export function parseDireccion(raw: string): { texto: string; lat: number | null; lng: number | null } {
  const m = raw.match(/\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]/);
  if (m) {
    return { texto: raw.replace(m[0], "").trim(), lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  return { texto: raw, lat: null, lng: null };
}

/** Reporta posición actual del repartidor para que el cliente la vea live. */
export async function reportarUbicacion(lat: number, lng: number): Promise<void> {
  await apiFetch("/api/repartidor/ubicacion", {
    method: "POST",
    body: JSON.stringify({ lat, lng }),
  });
}

export async function apagarUbicacion(): Promise<void> {
  await apiFetch("/api/repartidor/ubicacion", { method: "DELETE" });
}

// Resumen del repartidor: entregas, envíos cobrados y saldo que debe a Mercadito.
export interface ResumenRepartidor {
  entregados: number;
  envios_cobrados: number;
  pedidos_activos: number;
  saldo: number;
  total_cargos: number;
  total_abonos: number;
  confianza: boolean;
  movimientos: { id: string; tipo: "cargo" | "abono"; monto: number; concepto: string | null; created_at: string; cliente_nombre: string | null }[];
}

export async function obtenerResumen(): Promise<ResumenRepartidor> {
  return apiFetch<ResumenRepartidor>("/api/repartidor/resumen");
}

// Ingresos manuales (ventas por WhatsApp / mandados con cobro mental).
// Mismo endpoint que usa la web; el back acepta repartidor y admin.
export interface IngresoManualBody {
  tipo: "tienda" | "mandado";
  puesto_id?: string;
  cliente_nombre?: string;
  cliente_telefono?: string;
  monto: number;
  metodo_pago?: "efectivo" | "transferencia" | "tarjeta";
  detalle?: string;
}

export async function registrarIngresoManual(body: IngresoManualBody): Promise<{ ok: true; id: string }> {
  return apiFetch<{ ok: true; id: string }>("/api/repartidor/ingresos", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface IngresoHoy {
  total: number;
  count: number;
}

export async function obtenerIngresosHoy(): Promise<IngresoHoy> {
  const hoy = new Date().toISOString().split("T")[0];
  const data = await apiFetch<{ total: number; count: number }>(
    `/api/repartidor/ingresos?desde=${hoy}&hasta=${hoy}`
  );
  return { total: data.total, count: data.count };
}

/** El cliente califica al repartidor (1-5 estrellas + comentario). */
export async function calificarPedido(
  pedidoId: string,
  rating: number | null,
  review: string | null
): Promise<void> {
  await apiFetch(`/api/pedidos/${pedidoId}`, {
    method: "PATCH",
    body: JSON.stringify({ repartidor_rating: rating, repartidor_review: review }),
  });
}

/** Vecino más cercano para ordenar tiendas desde un origen. */
export function ordenarPorCercania<T extends { lat: number; lng: number }>(
  origen: { lat: number; lng: number },
  paradas: T[]
): T[] {
  const restantes = [...paradas];
  const out: T[] = [];
  let actual = { lat: origen.lat, lng: origen.lng };
  while (restantes.length > 0) {
    let minI = 0;
    let minD = haversineKm(actual, restantes[0]);
    for (let i = 1; i < restantes.length; i++) {
      const d = haversineKm(actual, restantes[i]);
      if (d < minD) { minD = d; minI = i; }
    }
    const p = restantes.splice(minI, 1)[0];
    out.push(p);
    actual = { lat: p.lat, lng: p.lng };
  }
  return out;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
