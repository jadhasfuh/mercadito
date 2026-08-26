import { apiFetch } from "./client";

export interface Mesa { id: string; etiqueta: string; token: string; activa: boolean; orden: number; }
// La comanda trae presentación (sabor/tamaño) y extras: cocina los necesita
// para preparar bien, y el ticket para que el cliente reconozca lo que pidió.
export interface ComandaItem {
  id: string; producto_nombre: string; cantidad: number; subtotal: number; estado_cocina: string;
  variante_nombre?: string | null;
  /** Hora en que se mandó la comanda a cocina. */
  creado_at?: string | null;
  /** Indicación del comensal: "sin cebolla", "bien cocido". */
  notas?: string | null;
  modificadores?: { modificador_nombre?: string; opcion_nombre?: string; nombre?: string }[] | null;
}
export interface Comanda {
  cuenta_id: string; estado: string; mesa_id: string; etiqueta: string;
  total: number; items: ComandaItem[];
  /** Entrada del ítem sin servir más viejo; el servidor ya ordena por esto. */
  espera_desde?: string | null;
}

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
export async function cerrarCuenta(cuenta_id: string, metodo_pago: string, propina: number = 0): Promise<void> {
  await apiFetch(`/api/cuentas/${cuenta_id}`, { method: "PATCH", body: JSON.stringify({ action: "cerrar", metodo_pago, propina }) });
}

// Config dine-in (reusa PATCH /api/puestos).
export async function guardarConfigMesa(campos: { dine_in_activo?: boolean; metodos_pago_mesa?: string[] }): Promise<void> {
  await apiFetch("/api/puestos", { method: "PATCH", body: JSON.stringify(campos) });
}
// Lee config + métodos desde el menú público (incluye puesto.dine_in_activo).
export async function obtenerConfigMesa(puestoId: string): Promise<{ dine_in_activo: boolean; metodos_pago_mesa: string[]; premium: boolean; nombre: string }> {
  const d = await apiFetch<{ puesto: { dine_in_activo: boolean; metodos_pago_mesa: string[]; nombre?: string }; planInfo?: { acceso?: boolean } }>(`/api/menu/${puestoId}`);
  return { dine_in_activo: !!d.puesto.dine_in_activo, metodos_pago_mesa: d.puesto.metodos_pago_mesa || ["caja"], premium: !!d.planInfo?.acceso, nombre: d.puesto.nombre || "" };
}
