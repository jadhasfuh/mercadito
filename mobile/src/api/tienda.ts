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

export async function actualizarTienda(campos: Partial<{
  nombre: string;
  ubicacion: string;
  descripcion: string;
  telefono_contacto: string;
  lat: number;
  lng: number;
  logo: string | null;
  lead_time_dias: number;
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
