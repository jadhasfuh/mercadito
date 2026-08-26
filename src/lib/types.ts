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
  // Categorías M:N (incluye la principal). El filtro del catálogo la usa para
  // que un producto salga en varias categorías sin duplicarse. Vacío en datos
  // viejos → fallback a [categoria_id].
  categorias?: string[];
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
  // Cantidad libre: permite_fraccion habilita decimales (0.25 kg, 0.5 L);
  // permite_por_dinero habilita pedir por monto ("$20 de tortilla"). Ambos
  // se bloquean cuando hay variantes (medio rompope no aplica).
  permite_fraccion?: boolean;
  permite_por_dinero?: boolean;
  // Precio aproximado: el precio listado es referencia, varía por peso real
  // al pesar la pieza (sandía, melón, repollo, etc.). Cliente ve un chip
  // "⚖️ Precio aprox · varía por peso" y la tienda/repartidor ajusta el
  // precio_unitario real cuando prepara/recoge el pedido.
  precio_variable_peso?: boolean;
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
  /** Precio de lista cuando hay una promo corriendo — para tacharlo. null =
   *  sin promo activa ahora mismo (nunca se pinta un tachado falso). */
  precio_antes?: number | null;
  /** Etiqueta de la promo activa ("Martes de tacos"). null = sin promo. */
  promo_etiqueta?: string | null;
  fecha: string;
  activo: number;
}

export interface ProductoConPrecios extends Producto {
  precios: (Precio & { puesto_nombre: string; puesto_lat?: number; puesto_lng?: number; puesto_ubicacion?: string; puesto_ciudad?: string; puesto_lead_time_dias?: number; puesto_rating?: number | null; cerrada?: boolean })[];
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
  // Cantidad libre por monto: si el cliente compró por pesos
  // (permite_por_dinero), guardamos el monto exacto pedido para mostrarlo
  // en el carrito y para precargar el modal en edición. cantidad y subtotal
  // siguen siendo la fuente de verdad para el checkout.
  monto_solicitado?: number | null;
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
  // Solicitud de repartidor por tienda (B2B). Cuando un restaurante usa
  // /tienda/solicitar-repartidor, se llena con su puesto_id. envio_pagado_por
  // indica si la tienda absorbe el envío ('tienda', acumulado semanal) o si
  // el cliente paga al recibir ('cliente').
  solicitado_por_tienda_id?: string | null;
  envio_pagado_por?: "tienda" | "cliente";
  // Tier del repartidor (foráneos): 'normal' o 'premium' (Fernando asegurado).
  tier_repartidor?: "normal" | "premium";
  // Aporte fijo de la tienda foránea al envío ($20 si no hay repartidor local).
  aporte_tienda?: number;
  // Calculado en GET: el pedido es de una ciudad foránea (Jiquilpan/San Pedro).
  es_foraneo?: boolean;
  // Mandado del cliente (reusa tipo='envio'): es_mandado marca el subtipo de
  // forma definitiva (las heurísticas por monto/ida_vuelta fallaban con
  // mandados simples). ida_vuelta=true cuando el repartidor regresa al
  // origen; monto_mandado es lo que el repartidor adelanta y cobra al
  // entregar; destino_* son instrucciones/cobro extra al entregar.
  es_mandado?: boolean;
  ida_vuelta?: boolean;
  monto_mandado?: number | null;
  destino_descripcion?: string | null;
  destino_monto?: number | null;
  // Foto que toma el repartidor al entregar (data URL base64). Prueba
  // de entrega visible al cliente — refuerza confianza, reduce disputas.
  foto_entrega?: string | null;
  subtotal: number;
  costo_envio: number;
  total: number;
  estado: "pendiente" | "en_compra" | "en_camino" | "entregado" | "cancelado";
  notas: string | null;
  metodo_pago: "efectivo" | "tarjeta" | "transferencia";
  recargo_tarjeta: number;
  // Crédito de referidos aplicado al pagar — resta del total. Sin esta línea
  // en los desgloses, las sumas "no cuadraban" con el total.
  credito_usado?: number;
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
  // null = item manual agregado por el repartidor (sustitución por similar);
  // en ese caso producto_nombre tiene el texto libre.
  producto_id: string | null;
  puesto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  comision: number;
  producto_nombre?: string;
  puesto_nombre?: string;
  unidad?: string;
  // true cuando producto_id IS NULL — el back lo agrega como columna
  // calculada en el SELECT, así el front no tiene que volver a chequear.
  manual?: boolean;
  variante_id?: string | null;
  variante_nombre?: string | null;
  modificadores?: import("./variantes").SeleccionModificador[] | null;
}
