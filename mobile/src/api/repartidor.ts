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

export async function cambiarEstado(pedidoId: string, estado: EstadoPedido, motivo_cancelacion?: string): Promise<void> {
  const body: Record<string, unknown> = { estado };
  if (estado === "cancelado" && motivo_cancelacion) body.motivo_cancelacion = motivo_cancelacion;
  await apiFetch(`/api/pedidos/${pedidoId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
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
