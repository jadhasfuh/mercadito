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
  subseccion: string | null;
  disponible: boolean;
  horarios: PuestoHorario[];
  // 0 = domingo, 6 = sábado. Lista vacía → disponible todos los días.
  dias_semana: number[];
  // null → hereda lead_time_dias del puesto. Número → sobrescribe (puede ser 0
  // para forzar entrega inmediata aunque el puesto sea por encargo).
  lead_time_dias?: number | null;
  opciones?: import("./variantes").ProductoOpcion[];
  variantes?: import("./variantes").ProductoVariante[];
  modificadores?: import("./variantes").ProductoModificador[];
}

export interface PuestoHorario {
  id: string;
  puesto_id?: string;
  nombre: string;
  desde: string;
  hasta: string;
}

export interface Precio {
  id: string;
  producto_id: string;
  puesto_id: string;
  precio: number;
  precio_mayoreo?: number | null;
  mayoreo_desde?: number | null;
  fecha: string;
  activo: number;
}

export interface ProductoConPrecios extends Producto {
  precios: (Precio & { puesto_nombre: string; puesto_lat?: number; puesto_lng?: number; puesto_ubicacion?: string; puesto_lead_time_dias?: number; cerrada?: boolean })[];
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
  precio_base: number;
  precio_mayoreo?: number | null;
  mayoreo_desde?: number | null;
  comision: number;
  unidad: string;
  subtotal: number;
  // Variantes y modificadores: si son null/vacío, el item es "simple".
  variante_id?: string | null;
  variante_nombre?: string | null;
  modificadores?: import("./variantes").SeleccionModificador[];
}

export interface Pedido {
  id: string;
  // 'mercado' = pedido del catálogo (default), 'envio' = paquete entre ciudades.
  tipo?: "mercado" | "envio";
  cliente_id: string | null;
  repartidor_id: string | null;
  repartidor_nombre?: string;
  repartidor_telefono?: string;
  // Repartidor "de turno" cuando el pedido aún no se ha asignado. Sirve para
  // que el cliente vea contacto desde el momento de la compra.
  repartidor_default?: { nombre: string; telefono: string } | null;
  // Última ubicación del repartidor (live tracking). NULL = no está
  // compartiendo ubicación o aún no se asigna.
  repartidor_lat?: number | null;
  repartidor_lng?: number | null;
  repartidor_ubicacion_at?: string | null;
  // Rating + comentario que el admin asigna por pedido. Solo el admin los ve.
  repartidor_rating?: number | null;
  repartidor_review?: string | null;
  cliente_nombre: string;
  cliente_telefono: string;
  zona_id: string;
  direccion_entrega: string;
  // Solo envíos: dónde recoger el paquete + datos del que envía.
  direccion_recogida?: string | null;
  recogida_lat?: number | null;
  recogida_lng?: number | null;
  recogida_nombre?: string | null;
  recogida_telefono?: string | null;
  peso_kg?: number | null;
  descripcion_contenido?: string | null;
  subtotal: number;
  costo_envio: number;
  total: number;
  estado: "pendiente" | "en_compra" | "en_camino" | "entregado" | "cancelado";
  notas: string | null;
  metodo_pago: "efectivo" | "tarjeta" | "transferencia";
  recargo_tarjeta: number;
  comprobante_pago: string | null;
  pago_validado_at: string | null;
  pago_validado_por: string | null;
  motivo_cancelacion: string | null;
  editado_por: string | null;
  editado_at: string | null;
  // ISO timestamp si el cliente agendó para más tarde. NULL = pedido inmediato.
  agendado_para: string | null;
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
  variante_id?: string | null;
  variante_nombre?: string | null;
  modificadores?: import("./variantes").SeleccionModificador[] | null;
}
