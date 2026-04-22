import { apiFetch } from "./client";

export type EstadoPedido = "pendiente" | "en_compra" | "en_camino" | "entregado" | "cancelado";

export interface ItemPedido {
  id: string;
  pedido_id: string;
  producto_id: string;
  puesto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  comision: number;
  producto_nombre?: string;
  puesto_nombre?: string;
  unidad?: string;
}

export interface Pedido {
  id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  zona_id: string;
  direccion_entrega: string;
  subtotal: number;
  costo_envio: number;
  total: number;
  estado: EstadoPedido;
  notas: string | null;
  metodo_pago: "efectivo" | "tarjeta";
  recargo_tarjeta: number;
  repartidor_nombre?: string;
  created_at: string;
  items: ItemPedido[];
}

export interface CrearPedidoInput {
  cliente_nombre: string;
  cliente_telefono: string;
  zona_id: string;
  direccion_entrega: string;
  notas?: string;
  metodo_pago: "efectivo" | "tarjeta";
  recargo_tarjeta?: number;
  items: {
    producto_id: string;
    puesto_id: string;
    cantidad: number;
    precio_unitario: number; // precio real sin comision
    comision: number;
  }[];
}

export interface CrearPedidoResponse {
  id: string;
  subtotal: number;
  servicio_mercadito: number;
  costo_envio: number;
  total: number;
}

export async function crearPedido(input: CrearPedidoInput): Promise<CrearPedidoResponse> {
  return apiFetch<CrearPedidoResponse>("/api/pedidos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function misPedidos(): Promise<Pedido[]> {
  return apiFetch<Pedido[]>("/api/mis-pedidos");
}
