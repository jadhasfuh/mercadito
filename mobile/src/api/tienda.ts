import { apiFetch } from "./client";
import type { Producto } from "./catalogo";

export async function editarProducto(
  id: string,
  campos: Partial<{ disponible: boolean; descripcion: string; nombre: string; horario_ids: string[] }>
): Promise<void> {
  await apiFetch(`/api/productos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(campos),
  });
}

export async function actualizarPrecio(productoId: string, puestoId: string, precio: number): Promise<void> {
  await apiFetch("/api/precios", {
    method: "PUT",
    body: JSON.stringify({ producto_id: productoId, puesto_id: puestoId, precio }),
  });
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

export function filtrarProductosDePuesto(productos: Producto[], puestoId: string): Producto[] {
  return productos.filter((p) => p.precios.some((pr) => pr.puesto_id === puestoId));
}

export function precioPropio(p: Producto, puestoId: string): number | null {
  const pr = p.precios.find((x) => x.puesto_id === puestoId);
  return pr ? pr.precio : null;
}
