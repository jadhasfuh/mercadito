import { apiFetch } from "./client";
import type { SeleccionModificador } from "../lib/variantes";

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
  variante_id?: string | null;
  variante_nombre?: string | null;
  modificadores?: SeleccionModificador[] | null;
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
  metodo_pago: "efectivo" | "tarjeta" | "transferencia";
  recargo_tarjeta: number;
  comprobante_pago?: string | null;
  pago_validado_at?: string | null;
  repartidor_nombre?: string;
  repartidor_telefono?: string;
  repartidor_default?: { nombre: string; telefono: string } | null;
  agendado_para?: string | null;
  created_at: string;
  items: ItemPedido[];
}

export interface CrearPedidoInput {
  cliente_nombre: string;
  cliente_telefono: string;
  zona_id: string;
  direccion_entrega: string;
  notas?: string;
  metodo_pago: "efectivo" | "tarjeta" | "transferencia";
  recargo_tarjeta?: number;
  comprobante_pago?: string;
  costo_envio_override?: number;
  agendado_para?: string;
  items: {
    producto_id: string;
    puesto_id: string;
    cantidad: number;
    precio_unitario: number; // precio real sin comision
    comision: number;
    variante_id?: string | null;
    variante_nombre?: string | null;
    modificadores?: SeleccionModificador[] | null;
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
