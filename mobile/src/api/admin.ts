import { apiFetch } from "./client";
import type { Pedido } from "./pedidos";

/**
 * Devuelve los pedidos con método transferencia aún sin validar. El filtrado
 * se hace en el cliente — el endpoint devuelve todos los pendientes y
 * descartamos los que ya tienen `pago_validado_at`.
 */
export async function listarPagosPendientes(): Promise<Pedido[]> {
  const pedidos = await apiFetch<Pedido[]>("/api/pedidos?estado=pendiente");
  return pedidos.filter((p) => p.metodo_pago === "transferencia" && !p.pago_validado_at);
}

export async function validarPago(pedidoId: string): Promise<void> {
  await apiFetch(`/api/pedidos/${pedidoId}/validar-pago`, { method: "POST" });
}

export interface TiendaAdmin {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  aprobado: boolean;
  activo: boolean;
  telefono_contacto: string | null;
  telefono_dueno: string | null;
  nombre_dueno: string | null;
  lat: number | null;
  lng: number | null;
  logo: string | null;
}

export async function listarTiendasAdmin(): Promise<TiendaAdmin[]> {
  return apiFetch<TiendaAdmin[]>("/api/tiendas");
}

export async function aprobarTienda(puesto_id: string, aprobado: boolean): Promise<void> {
  await apiFetch("/api/tiendas", {
    method: "PATCH",
    body: JSON.stringify({ puesto_id, aprobado }),
  });
}

export async function rechazarTienda(puesto_id: string): Promise<void> {
  await apiFetch("/api/tiendas", {
    method: "DELETE",
    body: JSON.stringify({ puesto_id }),
  });
}

export interface UsuarioAdmin {
  id: string;
  nombre: string;
  telefono: string;
  rol: "cliente" | "repartidor" | "tienda" | "admin";
  activo: boolean;
  puesto_id: string | null;
  puesto_nombre: string | null;
  tiene_pin: boolean;
  created_at: string | null;
  pedidos_count: number | string;
}

export async function listarUsuariosAdmin(q?: string, rol?: string): Promise<UsuarioAdmin[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (rol) params.set("rol", rol);
  return apiFetch<UsuarioAdmin[]>(`/api/admin/usuarios?${params.toString()}`);
}

/** Borra el PIN del usuario (vuelve a "sin PIN"). */
export async function borrarPinUsuario(usuario_id: string): Promise<void> {
  await apiFetch("/api/admin/reset-pin", {
    method: "POST",
    body: JSON.stringify({ usuario_id, borrar: true }),
  });
}

/** Asigna o cambia el PIN de un usuario (6 dígitos numéricos). */
export async function asignarPinUsuario(usuario_id: string, nuevo_pin: string): Promise<void> {
  await apiFetch("/api/admin/reset-pin", {
    method: "POST",
    body: JSON.stringify({ usuario_id, nuevo_pin }),
  });
}

// =====================================================================
// Stats / Resumen
// =====================================================================
export interface AdminStats {
  totales: {
    total_pedidos: number;
    entregados: number;
    cancelados: number;
    activos: number;
    ventas_total: number;
    subtotal_productos: number;
    ingresos_envio: number;
    ingresos_comisiones: number;
    clientes_unicos: number;
  };
  ventasPorDia: { fecha: string; pedidos: number; total: number; envios: number }[];
  ventasPorTienda: { puesto_id: string; puesto_nombre: string; pedidos: number; total_vendido: number; comision_total: number }[];
  ventasPorRepartidor: { repartidor: string; pedidos_entregados: number; total: number; envios: number }[];
  topProductos: { producto: string; cantidad_total: number; total_vendido: number }[];
}

export async function obtenerStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>("/api/admin/stats");
}

// =====================================================================
// Anuncios
// =====================================================================
export interface Anuncio {
  id: string;
  titulo: string;
  mensaje: string;
  tipo: string;
  activo: boolean;
  created_at: string;
}
export async function listarAnuncios(): Promise<Anuncio[]> {
  return apiFetch<Anuncio[]>("/api/anuncios");
}
export async function crearAnuncio(titulo: string, mensaje: string, tipo: string): Promise<void> {
  await apiFetch("/api/anuncios", { method: "POST", body: JSON.stringify({ titulo, mensaje, tipo }) });
}
export async function toggleAnuncio(id: string, activo: boolean): Promise<void> {
  await apiFetch("/api/anuncios", { method: "PATCH", body: JSON.stringify({ id, activo }) });
}
export async function borrarAnuncio(id: string): Promise<void> {
  await apiFetch("/api/anuncios", { method: "DELETE", body: JSON.stringify({ id }) });
}

// ──────── Cuentas por cobrar a tiendas (B2B envíos absorbidos) ────────

export interface CuentaTienda {
  tienda_id: string;
  tienda_nombre: string;
  telefono_contacto: string | null;
  num_pedidos: number;
  total_a_cobrar: number;
  primer_pedido: string;
  ultimo_pedido: string;
}

export interface CuentasTiendaResp {
  dias: number;
  total_general: number;
  tiendas: CuentaTienda[];
}

export async function listarCuentasTienda(dias: 7 | 30 = 7): Promise<CuentasTiendaResp> {
  return apiFetch<CuentasTiendaResp>(`/api/admin/cuentas-tienda?dias=${dias}`);
}
