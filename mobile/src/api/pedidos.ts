import { apiFetch } from "./client";
import type { SeleccionModificador } from "../lib/variantes";

export type EstadoPedido = "pendiente" | "en_compra" | "en_camino" | "entregado" | "cancelado";

export interface ItemPedido {
  id: string;
  pedido_id: string;
  // null cuando es un item manual (sustitución agregada por el repartidor).
  producto_id: string | null;
  puesto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  comision: number;
  producto_nombre?: string;
  puesto_nombre?: string;
  puesto_telefono?: string;
  puesto_ubicacion?: string;
  puesto_lat?: number | null;
  puesto_lng?: number | null;
  unidad?: string;
  // true si producto_id es null. El back lo agrega como columna calculada.
  manual?: boolean;
  variante_id?: string | null;
  variante_nombre?: string | null;
  modificadores?: SeleccionModificador[] | null;
}

export interface PatchItemInput {
  producto_id?: string | null;
  producto_nombre?: string;
  puesto_id: string;
  cantidad: number;
  precio_unitario: number;
}

export async function editarItemsPedido(
  pedidoId: string,
  items: PatchItemInput[],
  editadoPor: string
): Promise<{ ok: true; subtotal: number; total: number }> {
  return apiFetch(`/api/pedidos/${pedidoId}/items`, {
    method: "PATCH",
    body: JSON.stringify({ items, editado_por: editadoPor }),
  });
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
  repartidor_id?: string | null;
  repartidor_nombre?: string;
  repartidor_telefono?: string;
  repartidor_default?: { nombre: string; telefono: string } | null;
  repartidor_lat?: number | null;
  repartidor_lng?: number | null;
  repartidor_ubicacion_at?: string | null;
  repartidor_rating?: number | null;
  repartidor_review?: string | null;
  agendado_para?: string | null;
  motivo_cancelacion?: string | null;
  // Envíos: tipo='envio' + recogida_* + peso_kg + descripcion_contenido.
  tipo?: "mercado" | "envio";
  direccion_recogida?: string | null;
  recogida_lat?: number | null;
  recogida_lng?: number | null;
  recogida_nombre?: string | null;
  recogida_telefono?: string | null;
  peso_kg?: number | null;
  descripcion_contenido?: string | null;
  // Solicitud de repartidor por tienda (B2B). Si está, indica qué tienda
  // pidió que un repartidor recoja y entregue su pedido.
  solicitado_por_tienda_id?: string | null;
  envio_pagado_por?: "tienda" | "cliente";
  // Foto del paquete entregado, capturada por el repartidor.
  foto_entrega?: string | null;
  created_at: string;
  items: ItemPedido[];
}

export interface CrearEnvioInput {
  cliente_nombre: string;
  cliente_telefono: string;
  zona_id: string;
  direccion_entrega: string;
  recogida_nombre: string;
  recogida_telefono: string;
  direccion_recogida: string;
  recogida_lat: number;
  recogida_lng: number;
  peso_kg: number;
  descripcion_contenido: string;
  costo_envio_override: number;
  metodo_pago: "efectivo" | "tarjeta" | "transferencia";
  comprobante_pago?: string;
  agendado_para?: string;
}

export async function crearEnvio(input: CrearEnvioInput): Promise<{ id: string; total: number; costo_envio: number }> {
  return apiFetch<{ id: string; total: number; costo_envio: number }>("/api/pedidos", {
    method: "POST",
    body: JSON.stringify({ tipo: "envio", ...input }),
  });
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
