import { apiFetch } from "./client";

export interface Mesa { id: string; etiqueta: string; token: string; activa: boolean; orden: number; }
export interface ComandaItem { id: string; producto_nombre: string; cantidad: number; subtotal: number; estado_cocina: string; }
export interface Comanda { cuenta_id: string; estado: string; mesa_id: string; etiqueta: string; total: number; items: ComandaItem[]; }

export async function listarMesas(): Promise<Mesa[]> {
  return apiFetch<Mesa[]>("/api/mesas");
}
export async function crearMesa(etiqueta: string): Promise<void> {
  await apiFetch("/api/mesas", { method: "POST", body: JSON.stringify({ etiqueta }) });
}
export async function borrarMesa(id: string): Promise<void> {
  await apiFetch("/api/mesas", { method: "DELETE", body: JSON.stringify({ id }) });
}
export async function regenerarToken(id: string): Promise<void> {
  await apiFetch("/api/mesas", { method: "PATCH", body: JSON.stringify({ id, regenerar_token: true }) });
}

export async function listarComandas(): Promise<Comanda[]> {
  return apiFetch<Comanda[]>("/api/tienda/comandas");
}
export async function marcarItemCocina(item_id: string, estado_cocina: string): Promise<void> {
  await apiFetch("/api/tienda/comandas", { method: "PATCH", body: JSON.stringify({ item_id, estado_cocina }) });
}
export async function cerrarCuenta(cuenta_id: string, metodo_pago: string): Promise<void> {
  await apiFetch(`/api/cuentas/${cuenta_id}`, { method: "PATCH", body: JSON.stringify({ action: "cerrar", metodo_pago }) });
}

// Config dine-in (reusa PATCH /api/puestos).
export async function guardarConfigMesa(campos: { dine_in_activo?: boolean; metodos_pago_mesa?: string[] }): Promise<void> {
  await apiFetch("/api/puestos", { method: "PATCH", body: JSON.stringify(campos) });
}
// Lee config + métodos desde el menú público (incluye puesto.dine_in_activo).
export async function obtenerConfigMesa(puestoId: string): Promise<{ dine_in_activo: boolean; metodos_pago_mesa: string[] }> {
  const d = await apiFetch<{ puesto: { dine_in_activo: boolean; metodos_pago_mesa: string[] } }>(`/api/menu/${puestoId}`);
  return { dine_in_activo: !!d.puesto.dine_in_activo, metodos_pago_mesa: d.puesto.metodos_pago_mesa || ["caja"] };
}
