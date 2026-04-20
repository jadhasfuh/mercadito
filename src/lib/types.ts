export interface Categoria {
  id: string;
  nombre: string;
  icono: string;
  orden: number;
}

export interface Puesto {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  activo: number;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria_id: string;
  unidad: string;
  imagen: string | null;
  descripcion: string | null;
  seccion: string | null;
}

export interface Precio {
  id: string;
  producto_id: string;
  puesto_id: string;
  precio: number;
  fecha: string;
  activo: number;
}

export interface ProductoConPrecios extends Producto {
  precios: (Precio & { puesto_nombre: string; puesto_lat?: number; puesto_lng?: number; puesto_ubicacion?: string })[];
}

export interface ZonaEntrega {
  id: string;
  nombre: string;
  costo_envio: number;
  tiempo_estimado: string | null;
  activa: number;
}

export interface ItemCarrito {
  producto_id: string;
  producto_nombre: string;
  puesto_id: string;
  puesto_nombre: string;
  puesto_ubicacion?: string;
  cantidad: number;
  precio_unitario: number;
  comision: number;
  unidad: string;
  subtotal: number;
}

export interface Pedido {
  id: string;
  cliente_id: string | null;
  repartidor_id: string | null;
  repartidor_nombre?: string;
  cliente_nombre: string;
  cliente_telefono: string;
  zona_id: string;
  direccion_entrega: string;
  subtotal: number;
  costo_envio: number;
  total: number;
  estado: "pendiente" | "en_compra" | "en_camino" | "entregado" | "cancelado";
  notas: string | null;
  metodo_pago: "efectivo" | "tarjeta";
  recargo_tarjeta: number;
  motivo_cancelacion: string | null;
  editado_por: string | null;
  editado_at: string | null;
  created_at: string;
}

export interface PedidoConItems extends Pedido {
  items: ItemPedido[];
  zona_nombre?: string;
}

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
