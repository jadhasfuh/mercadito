import { apiFetch } from "./client";
import type { Producto, PuestoHorario } from "./catalogo";

export async function editarProducto(
  id: string,
  campos: Partial<{
    disponible: boolean;
    descripcion: string;
    nombre: string;
    horario_ids: string[];
    dias_semana: number[];
    imagen: string | null;
    seccion: string;
    subseccion: string;
    categoria_id: string;
    categorias: string[];
    unidad: string;
    opciones: unknown[];
    variantes: unknown[];
    modificadores: unknown[];
    lead_time_dias: number | null;
    permite_fraccion: boolean;
    permite_por_dinero: boolean;
    precio_variable_peso: boolean;
  }>
): Promise<void> {
  await apiFetch(`/api/productos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(campos),
  });
}

export interface CrearProductoInput {
  nombre: string;
  categoria_id: string;
  // Categorías extra (M:N). Incluye o no la principal; el backend une ambas.
  categorias?: string[];
  unidad: string;
  descripcion?: string;
  imagen?: string | null;
  seccion?: string;
  subseccion?: string;
  precio: number;
  puesto_id: string;
  horario_ids?: string[];
  // Días de la semana (0=domingo .. 6=sábado) en que el producto está
  // disponible. Vacío/undefined = todos los días.
  dias_semana?: number[];
  precio_mayoreo?: number;
  mayoreo_desde?: number;
  opciones?: unknown[];
  variantes?: unknown[];
  modificadores?: unknown[];
  lead_time_dias?: number | null;
  permite_fraccion?: boolean;
  permite_por_dinero?: boolean;
  precio_variable_peso?: boolean;
}

export async function crearProducto(input: CrearProductoInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/productos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function eliminarProducto(id: string): Promise<void> {
  await apiFetch(`/api/productos/${id}`, { method: "DELETE" });
}

export async function actualizarPrecio(
  productoId: string,
  puestoId: string,
  precio: number,
  mayoreo?: { precio_mayoreo: number; mayoreo_desde: number } | null
): Promise<void> {
  const body: Record<string, unknown> = { producto_id: productoId, puesto_id: puestoId, precio };
  if (mayoreo) {
    body.precio_mayoreo = mayoreo.precio_mayoreo;
    body.mayoreo_desde = mayoreo.mayoreo_desde;
  } else {
    body.precio_mayoreo = null;
    body.mayoreo_desde = null;
  }
  await apiFetch("/api/precios", { method: "PUT", body: JSON.stringify(body) });
}

export interface PuestoCompleto {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  lat: number | null;
  lng: number | null;
  logo: string | null;
  telefono_contacto: string | null;
  abierto_ahora: boolean;
  horario_atencion: HorarioDia[];
  lead_time_dias: number;
  tipo: string; // 'mercado' | 'servicios' | 'ambos' — reservas activas si servicios|ambos
  color_marca: string | null; // color de marca del menú digital (hex); null = naranja por defecto
  citas_auto_confirmar?: boolean; // reservas nuevas entran ya confirmadas
  citas_capacidad?: number; // citas simultáneas que el negocio puede atender
  menu_vistas: number;
  menu_pedidos: number;
  // Ficha del negocio en el menú digital — cómo te pagan y cómo te piden.
  metodos_pago?: string[] | null;
  servicios_pedido?: string[] | null;
}

export interface HorarioDia {
  dia_semana: number;
  abre: string | null;
  cierra: string | null;
  descanso_desde: string | null;
  descanso_hasta: string | null;
}

export async function obtenerMiTienda(puestoId: string): Promise<PuestoCompleto | null> {
  const all = await apiFetch<PuestoCompleto[]>("/api/puestos");
  return all.find((p) => p.id === puestoId) ?? null;
}

// Habilita el módulo de Reservas para cualquier negocio (restaurante, café, etc.).
export async function activarReservas(): Promise<{ ok: boolean; tipo: string; trial: boolean }> {
  return apiFetch<{ ok: boolean; tipo: string; trial: boolean }>("/api/puestos/activar-reservas", { method: "POST" });
}

export async function actualizarTienda(campos: Partial<{
  nombre: string;
  ubicacion: string;
  descripcion: string;
  telefono_contacto: string;
  lat: number;
  lng: number;
  logo: string | null;
  lead_time_dias: number;
  color_marca: string;
  citas_auto_confirmar: boolean;
  citas_capacidad: number;
  // Ficha del negocio en el menú — espejo del panel web.
  metodos_pago: string[];
  servicios_pedido: string[];
}>): Promise<void> {
  await apiFetch("/api/puestos", {
    method: "PATCH",
    body: JSON.stringify(campos),
  });
}

export async function obtenerHorarioAtencion(): Promise<HorarioDia[]> {
  return apiFetch<HorarioDia[]>("/api/puestos/horario-atencion");
}

export async function guardarHorarioAtencion(dias: HorarioDia[]): Promise<void> {
  await apiFetch("/api/puestos/horario-atencion", {
    method: "PUT",
    body: JSON.stringify({ dias }),
  });
}

// ──────── Horarios del menú (puesto_horarios) ────────

export async function listarHorariosMenu(): Promise<PuestoHorario[]> {
  return apiFetch<PuestoHorario[]>("/api/puestos/horarios");
}

export async function crearHorarioMenu(nombre: string, desde: string, hasta: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/puestos/horarios", {
    method: "POST",
    body: JSON.stringify({ nombre, desde, hasta }),
  });
}

export async function eliminarHorarioMenu(id: string): Promise<void> {
  await apiFetch(`/api/puestos/horarios/${id}`, { method: "DELETE" });
}

// ──────── Solicitar repartidor (B2B) ────────

export interface SolicitarRepartidorInput {
  cliente_nombre: string;
  cliente_telefono: string;
  direccion_entrega: string;
  // Pin opcional — si no, el backend usa centro Sahuayo como estimación.
  cliente_lat: number | null;
  cliente_lng: number | null;
  monto_pedido: number;
  notas?: string;
  envio_pagado_por: "tienda" | "cliente";
}

export interface SolicitarRepartidorRes {
  ok: true;
  pedido_id: string;
  costo_envio: number;
  total_a_cobrar: number;
  distancia_km: number;
  tiempo_estimado: string;
  envio_pagado_por: "tienda" | "cliente";
  costo_estimado?: boolean;
  tracking_url?: string;
}

export async function solicitarRepartidor(input: SolicitarRepartidorInput): Promise<SolicitarRepartidorRes> {
  return apiFetch<SolicitarRepartidorRes>("/api/tienda/solicitar-repartidor", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface CotizacionEnvio {
  costo_envio: number;
  distancia_km: number;
  tiempo_estimado: string;
  recargo_nocturno: number;
  fuera_de_cobertura?: boolean;
}

/** Preview en vivo del costo de envío para el form. */
export async function cotizarEnvio(lat: number, lng: number): Promise<CotizacionEnvio> {
  return apiFetch<CotizacionEnvio>(`/api/tienda/cotizar-envio?lat=${lat}&lng=${lng}`);
}

export function filtrarProductosDePuesto(productos: Producto[], puestoId: string): Producto[] {
  return productos.filter((p) => p.precios.some((pr) => pr.puesto_id === puestoId));
}

export function precioPropio(p: Producto, puestoId: string): number | null {
  const pr = p.precios.find((x) => x.puesto_id === puestoId);
  return pr ? pr.precio : null;
}

// ── Resumen del negocio ────────────────────────────────────────────────
// Espejo de /api/tienda/resumen: menú, más vendidos y ventas de mesa. Los
// reportes ya existían pero vivían en el panel de admin; esto es lo que ve
// el negocio de lo suyo.
export interface ResumenNegocio {
  dias: number;
  menu: { vistas: number; pedidos: number; conversion: number | null };
  mas_vendidos: { producto_id: string; nombre: string; pedidos: number; cantidad: number }[];
  mesas: {
    cuentas: number; total: number; propinas: number; ticket_promedio: number;
    por_dia: { fecha: string; total: number; cuentas: number }[];
    horas_pico: { hora: number; cuentas: number; total: number }[];
  };
}

export async function resumenNegocio(dias = 7): Promise<ResumenNegocio | null> {
  return apiFetch<ResumenNegocio>(`/api/tienda/resumen?dias=${dias}`).catch(() => null);
}

// ── Corte de caja a ciegas ─────────────────────────────────────────────
// Espejo de /api/tienda/caja. Mientras el turno está abierto la respuesta NO
// trae el efectivo esperado: si el cajero lo puede consultar antes de contar,
// ajusta el conteo y el corte deja de detectar nada.
export interface TurnoCaja {
  id: string; caja: string; fondo_inicial: number;
  abierto_at: string; abierto_por_nombre: string | null;
}
export interface MovimientoCaja {
  id: string; tipo: string; monto: number; motivo: string | null;
  usuario_nombre: string | null; created_at: string;
}
export interface EstadoCaja {
  turno: TurnoCaja | null;
  movimientos?: MovimientoCaja[];
  entradas?: number; retiros?: number; cuentas?: number;
  ventas_tarjeta?: number; ventas_transferencia?: number;
}
export interface CorteCaja {
  id: string; caja: string; fondo_inicial: number; abierto_at: string;
  cerrado_por_nombre: string | null;
  ventas_efectivo: number; ventas_tarjeta: number; ventas_transferencia: number;
  cuentas: number; propinas: number; entradas: number; retiros: number;
  esperado: number; declarado: number; diferencia: number;
  fondo_siguiente: number; nota: string | null;
}
export interface CorteHistorial {
  id: string; caja: string; fondo_inicial: number; abierto_at: string; cerrado_at: string;
  abierto_por_nombre: string | null; cerrado_por_nombre: string | null;
  declarado: number | null; esperado: number | null; diferencia: number | null; nota: string | null;
}

export async function estadoCaja(): Promise<EstadoCaja> {
  return apiFetch<EstadoCaja>("/api/tienda/caja").catch(() => ({ turno: null }));
}
export async function historialCortes(): Promise<CorteHistorial[]> {
  return apiFetch<CorteHistorial[]>("/api/tienda/caja?historial=1").catch(() => []);
}
export async function abrirCaja(caja: string, fondoInicial: number): Promise<void> {
  await apiFetch("/api/tienda/caja", {
    method: "POST",
    body: JSON.stringify({ action: "abrir", caja, fondo_inicial: fondoInicial }),
  });
}
export async function movimientoCaja(tipo: "entrada" | "retiro", monto: number, motivo: string): Promise<void> {
  await apiFetch("/api/tienda/caja", {
    method: "POST",
    body: JSON.stringify({ action: "movimiento", tipo, monto, motivo }),
  });
}
export async function cerrarCaja(declarado: number, fondoSiguiente: number, nota: string): Promise<CorteCaja> {
  const r = await apiFetch<{ corte: CorteCaja }>("/api/tienda/caja", {
    method: "POST",
    body: JSON.stringify({ action: "cerrar", declarado, fondo_siguiente: fondoSiguiente, nota }),
  });
  return r.corte;
}

// ── Centro de ayuda: qué funciones tiene encendidas el negocio ─────────
// Espejo de /api/tienda/funciones. "Activado" significa USADO, no disponible.
export interface EstadoFuncion { activado: boolean; aplica: boolean; extra?: Record<string, unknown> }

export async function funcionesNegocio(): Promise<Record<string, EstadoFuncion>> {
  return apiFetch<Record<string, EstadoFuncion>>("/api/tienda/funciones").catch(() => ({}));
}

// ── Venta en mostrador ─────────────────────────────────────────────────
// Espejo de /api/tienda/mostrador. Los precios los recalcula el servidor: de
// aquí sólo salen ids y cantidades.
export interface VentaMostrador {
  cuenta_id: string; folio: number | null; servicio: string; total: number; propina: number;
  pagos: { metodo: string; monto: number }[];
  items: { nombre: string; cantidad: number; precio: number; subtotal: number; notas: string | null }[];
  cliente: { nombre: string | null; telefono: string | null; direccion: string | null };
  a_cocina: boolean;
  /** false = la caja no estaba abierta y la venta no entra a ningún corte. */
  en_turno: boolean;
}

export async function cobrarMostrador(datos: {
  items: { producto_id: string; cantidad: number; notas: string | null }[];
  servicio: string;
  pagos: { metodo: string; monto: number }[];
  propina: number;
  a_cocina: boolean;
  cliente_nombre?: string;
  cliente_telefono?: string;
  cliente_direccion?: string;
}): Promise<VentaMostrador> {
  const r = await apiFetch<{ venta: VentaMostrador }>("/api/tienda/mostrador", {
    method: "POST",
    body: JSON.stringify(datos),
  });
  return r.venta;
}


// ── Promociones ────────────────────────────────────────────────────────
// Espejo de PATCH /api/precios. Va aparte del PUT de precio porque ese archiva
// la fila y crea una nueva: si la promo viajara ahí, cambiar el precio de lista
// borraría la promo en silencio.
export async function guardarPromo(
  productoId: string,
  puestoId: string,
  promo: { precio: number; etiqueta: string; dias: number[]; desde: string; hasta: string; termina: string | null }
): Promise<void> {
  await apiFetch("/api/precios", {
    method: "PATCH",
    body: JSON.stringify({ producto_id: productoId, puesto_id: puestoId, promo }),
  });
}

export async function quitarPromo(productoId: string, puestoId: string): Promise<void> {
  await apiFetch("/api/precios", {
    method: "PATCH",
    body: JSON.stringify({ producto_id: productoId, puesto_id: puestoId, promo: null }),
  });
}

// ── Tickets cobrados (reimpresión) ─────────────────────────────────────
// Espejo de /api/tienda/tickets. Sin historial, un ticket impreso mal se
// perdía: la venta quedaba registrada pero no había forma de sacarla en papel.
export interface TicketCobrado {
  id: string; folio: number | null; titulo: string; metodo_pago: string | null;
  propina: number; total: number; cerrada_at: string; cliente_nombre: string | null;
  items: { nombre: string; cantidad: number; subtotal: number; notas: string | null; variante: string | null }[];
}

export async function listarTickets(q = ""): Promise<TicketCobrado[]> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return apiFetch<TicketCobrado[]>(`/api/tienda/tickets${qs}`).catch(() => []);
}
