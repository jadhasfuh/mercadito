import { apiFetch } from "./client";

export interface PrecioInfo {
  precio_id: string;
  puesto_id: string;
  puesto_nombre: string;
  precio: number;
  precio_mayoreo?: number | null;
  mayoreo_desde?: number | null;
  fecha: string;
  puesto_lat?: number;
  puesto_lng?: number;
  puesto_ubicacion?: string;
}

export interface PuestoHorario {
  id: string;
  nombre: string;
  desde: string;
  hasta: string;
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
  precios: PrecioInfo[];
  horarios: PuestoHorario[];
}

export interface Puesto {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  lat: number | null;
  lng: number | null;
  logo: string | null;
  abierto_ahora: boolean;
  horario_atencion: { dia_semana: number; abre: string | null; cierra: string | null; descanso_desde?: string | null; descanso_hasta?: string | null }[];
}

export async function listarProductos(categoriaId?: string): Promise<Producto[]> {
  const params = new URLSearchParams();
  if (categoriaId) params.set("categoria", categoriaId);
  return apiFetch<Producto[]>(`/api/productos?${params.toString()}`);
}

/**
 * Vista de cliente: fuerza los filtros de cliente (horario/disponible/tienda
 * cerrada) aunque la sesión sea de tienda/repartidor/admin. Se usa en
 * /(tabs)/home para que al hacer login con cualquier rol se vea lo que
 * realmente ve un cliente.
 */
export async function listarProductosCliente(categoriaId?: string): Promise<Producto[]> {
  const params = new URLSearchParams({ visible_solo: "true" });
  if (categoriaId) params.set("categoria", categoriaId);
  return apiFetch<Producto[]>(`/api/productos?${params.toString()}`);
}

export async function listarPuestos(categoriaId?: string): Promise<Puesto[]> {
  const q = categoriaId ? `?categoria=${encodeURIComponent(categoriaId)}` : "";
  return apiFetch<Puesto[]>(`/api/puestos${q}`);
}
