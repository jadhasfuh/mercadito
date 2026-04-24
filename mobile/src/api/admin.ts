import { apiFetch } from "./client";
import type { Pedido } from "./pedidos";

/**
 * Devuelve los pedidos con método transferencia aún sin validar. El filtrado
 * se hace en el cliente — el endpoint devuelve todos los pendientes y
 * descartamos los que ya tienen `pago_validado_at`.
 */
export async function listarPagosPendientes(): Promise<Pedido[]> {
  const pedidos = await apiFetch<Pedido[]>("/api/pedidos?estado=pendiente");
  return pedidos.filter((p) => p.metodo_pago === "transferencia" && !p.pago_validado_at);
}

export async function validarPago(pedidoId: string): Promise<void> {
  await apiFetch(`/api/pedidos/${pedidoId}/validar-pago`, { method: "POST" });
}

export interface TiendaAdmin {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  aprobado: boolean;
  activo: boolean;
  telefono_contacto: string | null;
  telefono_dueno: string | null;
  nombre_dueno: string | null;
  lat: number | null;
  lng: number | null;
  logo: string | null;
}

export async function listarTiendasAdmin(): Promise<TiendaAdmin[]> {
  return apiFetch<TiendaAdmin[]>("/api/tiendas");
}

export async function aprobarTienda(puesto_id: string, aprobado: boolean): Promise<void> {
  await apiFetch("/api/tiendas", {
    method: "PATCH",
    body: JSON.stringify({ puesto_id, aprobado }),
  });
}

export async function rechazarTienda(puesto_id: string): Promise<void> {
  await apiFetch("/api/tiendas", {
    method: "DELETE",
    body: JSON.stringify({ puesto_id }),
  });
}
