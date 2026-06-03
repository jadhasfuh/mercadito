import { apiFetch } from "./client";
import {
  guardarCacheCitas,
  leerCacheCitas,
  citasEnCola,
  encolarCita,
  sincronizarCola,
  esErrorDeRed,
} from "../lib/offlineCitas";

// Nota: PostgreSQL devuelve columnas NUMERIC como string (ej "120.00") y
// COUNT como string. Los campos numéricos se tipan laxo y se coercen con
// Number() en la UI.
type Num = number | string | null;

export interface Negocio {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  lat: number | null;
  lng: number | null;
  logo: string | null;
  telefono_contacto: string | null;
  tipo: "servicios" | "ambos";
  categoria_servicio: string | null;
  abierto_ahora: boolean;
  n_servicios: Num;
  desde_precio: Num;
}

export interface Servicio {
  id: string;
  puesto_id: string;
  nombre: string;
  descripcion: string | null;
  duracion_min: number;
  buffer_min: number;
  precio: Num;
  activo: boolean;
  orden: number;
}

export interface Slot {
  inicio: string; // ISO UTC
  fin: string;
  label: string; // "HH:MM" hora local del negocio
}

export type EstadoCita = "pendiente" | "confirmada" | "completada" | "cancelada" | "no_show";

export interface CitaPersona {
  servicio_id: string;
  servicio_nombre: string;
  precio: Num;
  nombre: string | null;
}

export interface Cita {
  id: string;
  puesto_id: string;
  puesto_nombre: string;
  cliente_id: string | null;
  cliente_nombre: string;
  cliente_telefono: string;
  servicio_id: string | null;
  servicio_nombre: string;
  precio: Num;
  monto_cobrado?: Num; // override del monto cobrado en completadas (si se ajustó)
  personas: CitaPersona[] | null;
  propuesta_inicio: string | null;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  notas: string | null;
  creada_por: string;
  created_at: string;
  // Flags offline (solo en citas locales aún no sincronizadas):
  _offline?: boolean;
  _localId?: string;
  _syncError?: string;
}

// ---------- Negocios de servicios ----------
export function listarNegocios(): Promise<Negocio[]> {
  return apiFetch<Negocio[]>("/api/negocios");
}

// ---------- Servicios ----------
export function listarServicios(puestoId: string): Promise<Servicio[]> {
  return apiFetch<Servicio[]>(`/api/servicios?puesto_id=${encodeURIComponent(puestoId)}`);
}

export interface ServicioInput {
  puesto_id?: string;
  nombre: string;
  descripcion?: string | null;
  duracion_min: number;
  buffer_min?: number;
  precio?: number | null;
  orden?: number;
}

export function crearServicio(input: ServicioInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/servicios", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function actualizarServicio(id: string, input: Partial<ServicioInput> & { activo?: boolean }): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/servicios/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function eliminarServicio(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/servicios/${id}`, { method: "DELETE" });
}

// ---------- Slots ----------
export function listarSlots(
  puestoId: string,
  servicioId: string,
  fecha: string, // "YYYY-MM-DD" local del negocio
  duracion?: number, // duración total (suma multi-persona); si no, la del servicio
  excluir?: string // al reagendar, id de la cita que se mueve (libera su lugar)
): Promise<{ slots: Slot[]; timezone: string }> {
  const dur = duracion ? `&duracion=${duracion}` : "";
  const exc = excluir ? `&excluir=${encodeURIComponent(excluir)}` : "";
  return apiFetch<{ slots: Slot[]; timezone: string }>(
    `/api/citas/slots?puesto_id=${encodeURIComponent(puestoId)}&servicio_id=${encodeURIComponent(
      servicioId
    )}&fecha=${fecha}${dur}${exc}`
  );
}

export interface GridSlot {
  inicio: string;
  label: string;
  estado: "libre" | "ocupado" | "actual";
  seleccionable: boolean;
}

// Cuadrícula visual (reagendar): todos los bloques de 15 min con su estado.
export function listarGrid(
  puestoId: string,
  servicioId: string,
  fecha: string,
  duracion: number,
  excluir?: string
): Promise<{ grid: GridSlot[]; timezone: string }> {
  const exc = excluir ? `&excluir=${encodeURIComponent(excluir)}` : "";
  return apiFetch<{ grid: GridSlot[]; timezone: string }>(
    `/api/citas/slots?puesto_id=${encodeURIComponent(puestoId)}&servicio_id=${encodeURIComponent(
      servicioId
    )}&fecha=${fecha}&duracion=${duracion}&vista=grid${exc}`
  );
}

// ---------- Citas ----------
export interface CrearCitaInput {
  puesto_id: string;
  servicio_id?: string; // compat 1 persona
  personas?: { servicio_id: string; nombre?: string }[]; // multi-persona
  inicio: string; // ISO UTC
  notas?: string | null;
  // Solo para agendado manual desde la tienda:
  cliente_nombre?: string;
  cliente_telefono?: string;
}

// POST crudo al server (lo usa la sincronización de la cola).
function postCita(input: CrearCitaInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/citas", { method: "POST", body: JSON.stringify(input) });
}

// Datos de presentación para pintar la cita optimista mientras está offline.
export interface CrearCitaDisplay {
  puesto_nombre?: string;
  estado?: EstadoCita;
  personas?: CitaPersona[];
  servicio_nombre?: string;
  precio?: number | null;
  fin?: string;
  cliente_id?: string | null;
}

// Crea una cita. Si hay red → la manda al server. Si NO hay red → la encola
// localmente con una cita optimista y devuelve { offline: true } para que la UI
// avise "se guardó sin conexión, se sincroniza al volver el internet".
// OJO: un rechazo del server (status, ej. 409 horario ocupado) SÍ se propaga.
export async function crearCita(
  input: CrearCitaInput,
  display?: CrearCitaDisplay
): Promise<{ id: string; offline: boolean }> {
  try {
    const r = await postCita(input);
    // Aprovecha que hay red para vaciar cualquier cola pendiente.
    sincronizarCola(postCita).catch(() => {});
    return { id: r.id, offline: false };
  } catch (e) {
    if (!esErrorDeRed(e)) throw e; // el server rechazó → error real
    const localId = `pend-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const optimista: Cita = {
      id: localId,
      puesto_id: input.puesto_id,
      puesto_nombre: display?.puesto_nombre ?? "",
      cliente_id: display?.cliente_id ?? null,
      cliente_nombre: input.cliente_nombre ?? "",
      cliente_telefono: input.cliente_telefono ?? "",
      servicio_id: input.servicio_id ?? input.personas?.[0]?.servicio_id ?? null,
      servicio_nombre: display?.servicio_nombre ?? "Cita",
      precio: display?.precio ?? null,
      personas: display?.personas ?? null,
      propuesta_inicio: null,
      inicio: input.inicio,
      fin: display?.fin ?? input.inicio,
      estado: display?.estado ?? "pendiente",
      notas: input.notas ?? null,
      creada_por: display?.estado === "confirmada" ? "tienda" : "cliente",
      created_at: new Date().toISOString(),
    };
    await encolarCita({ localId, input, optimista, estadoSync: "pendiente", creada_ts: Date.now() });
    return { id: localId, offline: true };
  }
}

export async function listarCitas(params?: { estado?: EstadoCita; puesto_id?: string }): Promise<Cita[]> {
  // Con filtros (admin / por estado): comportamiento online normal, sin caché.
  if (params?.estado || params?.puesto_id) {
    const q = new URLSearchParams();
    if (params?.estado) q.set("estado", params.estado);
    if (params?.puesto_id) q.set("puesto_id", params.puesto_id);
    return apiFetch<Cita[]>(`/api/citas?${q.toString()}`);
  }
  // Lista principal (cliente/tienda): caché de lectura + cola offline.
  // Intenta vaciar la cola primero (best-effort, por si volvió la señal).
  await sincronizarCola(postCita).catch(() => {});
  try {
    const server = await apiFetch<Cita[]>("/api/citas");
    await guardarCacheCitas(server);
    const pend = await citasEnCola();
    return [...pend, ...server];
  } catch (e) {
    if (!esErrorDeRed(e)) throw e; // error HTTP real → propaga
    // Sin red: muestra la última copia + lo que esté en la cola.
    const cached = await leerCacheCitas();
    const pend = await citasEnCola();
    return [...pend, ...cached];
  }
}

export function actualizarCita(
  id: string,
  estado: EstadoCita,
  motivo_cancelacion?: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/citas/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ estado, motivo_cancelacion }),
  });
}

// Ajusta el monto cobrado de una cita completada (tienda/admin). null = vuelve
// a usar el precio del servicio.
export function ajustarMontoCita(id: string, monto: number | null): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/citas/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ monto_cobrado: monto }),
  });
}

// Elimina una cita del historial (cancelada/completada/no_show). Tienda/admin.
export function eliminarCita(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/citas/${id}`, { method: "DELETE" });
}

// Limpia (borra) todas las citas canceladas y no-show del puesto. Tienda/admin.
export function limpiarCitas(): Promise<{ ok: boolean; borradas: number }> {
  return apiFetch<{ ok: boolean; borradas: number }>("/api/citas", { method: "DELETE" });
}

// Reagendar/editar una cita (tienda/admin): mueve horario y/o cambia servicio.
export function reprogramarCita(
  id: string,
  input: { inicio?: string; servicio_id?: string; notas?: string | null }
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/citas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ---------- Horario laboral (reusa el endpoint existente) ----------
export interface HorarioDia {
  dia_semana: number; // 0=domingo ... 6=sábado
  abre: string | null; // "HH:MM"
  cierra: string | null;
  descanso_desde: string | null;
  descanso_hasta: string | null;
}

export function listarHorario(puestoId?: string): Promise<HorarioDia[]> {
  return apiFetch<HorarioDia[]>(
    `/api/puestos/horario-atencion${puestoId ? `?puesto_id=${encodeURIComponent(puestoId)}` : ""}`
  );
}

export function guardarHorario(dias: HorarioDia[]): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/puestos/horario-atencion", {
    method: "PUT",
    body: JSON.stringify({ dias }),
  });
}

// ---------- Chat cliente ↔ negocio ----------
export interface ChatMensaje {
  id: string;
  de: "cliente" | "negocio";
  texto: string;
  leido: boolean;
  created_at: string;
}

export interface ThreadCliente {
  puesto_id: string;
  puesto_nombre: string;
  logo: string | null;
  ultimo_texto: string;
  ultimo_de: string;
  created_at: string;
  no_leidos: Num;
}

export interface ThreadTienda {
  cliente_telefono: string;
  cliente_nombre: string | null;
  ultimo_texto: string;
  ultimo_de: string;
  created_at: string;
  no_leidos: Num;
}

export function listarChat(puestoId: string, clienteTelefono?: string): Promise<ChatMensaje[]> {
  const q = new URLSearchParams({ puesto_id: puestoId });
  if (clienteTelefono) q.set("cliente_telefono", clienteTelefono);
  return apiFetch<ChatMensaje[]>(`/api/chat?${q.toString()}`);
}

export function enviarChat(input: {
  puesto_id?: string;
  texto: string;
  cliente_telefono?: string;
  cliente_nombre?: string;
}): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/chat", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listarThreads(): Promise<(ThreadCliente | ThreadTienda)[]> {
  return apiFetch<(ThreadCliente | ThreadTienda)[]>("/api/chat/threads");
}

// Limpia todas las conversaciones del usuario (cliente o tienda).
export function limpiarChats(): Promise<{ ok: boolean; borrados: number }> {
  return apiFetch<{ ok: boolean; borrados: number }>("/api/chat", { method: "DELETE" });
}

// Borra UNA conversación: cliente pasa puesto_id; tienda pasa cliente_telefono.
export function eliminarChatThread(params: { puesto_id?: string; cliente_telefono?: string }): Promise<{ ok: boolean; borrados: number }> {
  const q = new URLSearchParams();
  if (params.puesto_id) q.set("puesto_id", params.puesto_id);
  if (params.cliente_telefono) q.set("cliente_telefono", params.cliente_telefono);
  return apiFetch<{ ok: boolean; borrados: number }>(`/api/chat?${q.toString()}`, { method: "DELETE" });
}

// ---------- Estadísticas / ventas del negocio ----------
export interface CitasStats {
  dias: number;
  resumen: {
    total: Num;
    completadas: Num;
    canceladas: Num;
    no_shows: Num;
    pendientes: Num;
    ingreso: Num;
  };
  top: { servicio_nombre: string; n: Num; ingreso: Num }[];
  productos: { pedidos: Num; items: Num; ingreso: Num };
  topProductos: { nombre: string; cantidad: Num; ingreso: Num }[];
  tieneProductos: boolean;
  plan: string;
  suscripcion_hasta: string | null;
  categoria_servicio: string | null;
  planInfo?: { estado: "trial" | "pro" | "vencido"; acceso: boolean; dias_restantes: number; hasta: string | null };
}

export function statsCitas(dias = 30): Promise<CitasStats> {
  return apiFetch<CitasStats>(`/api/citas/stats?dias=${dias}`);
}
