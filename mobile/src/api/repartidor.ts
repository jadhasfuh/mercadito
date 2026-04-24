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
