import { apiFetch } from "./client";
import type { ProductoOpcion, ProductoVariante, ProductoModificador } from "../lib/variantes";

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
  puesto_ciudad?: string;
  puesto_lead_time_dias?: number;
  puesto_rating?: number | null;
  cerrada?: boolean;
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
  // Categorías a las que pertenece (M:N). Incluye la principal (categoria_id).
  // El filtro de catálogo usa esta lista para que un producto aparezca en varias
  // categorías sin duplicarse. Puede venir vacío en datos viejos → fallback a
  // [categoria_id].
  categorias?: string[];
  unidad: string;
  imagen: string | null;
  descripcion: string | null;
  seccion: string | null;
  subseccion: string | null;
  disponible: boolean;
  // Días de la semana en que el producto está disponible (0=dom..6=sáb).
  // Vacío = todos los días.
  dias_semana: number[];
  // null → hereda lead_time_dias del puesto. Número → sobrescribe.
  lead_time_dias?: number | null;
  // Cantidad libre: permite_fraccion habilita decimales (0.25 kg, 0.5 L);
  // permite_por_dinero habilita pedir por monto ("$20 de tortilla"). Ambos
  // se bloquean cuando hay variantes.
  permite_fraccion?: boolean;
  permite_por_dinero?: boolean;
  // Precio aproximado: el precio listado es referencia, varía por peso real
  // al pesar la pieza. Card muestra chip "⚖️ Precio aprox · varía por peso".
  precio_variable_peso?: boolean;
  precios: PrecioInfo[];
  horarios: PuestoHorario[];
  opciones?: ProductoOpcion[];
  variantes?: ProductoVariante[];
  modificadores?: ProductoModificador[];
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
  // Presentes en el payload (p.*) — los usa el directorio de menús.
  ciudad?: string | null;
  aprobado?: boolean;
  menu_publico?: boolean | null;
  // Derivadas de los productos con precio activo; vacío = tienda sin productos.
  categorias?: string[];
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
