// Capa offline para citas (app nativa).
//
// Dos piezas:
//   1. CACHÉ DE LECTURA: guardamos la última lista de citas traída del server.
//      Si se va el internet, las pantallas siguen mostrando esta copia.
//   2. COLA DE CREACIÓN: si se agenda una cita sin conexión, se guarda en una
//      cola local con una cita "optimista" (se ve de inmediato con un badge
//      "sin conexión") y se sincroniza al volver la señal.
//
// Distinguimos "sin red" de "el server rechazó": apiFetch lanza un ApiError con
// `status` numérico en errores HTTP; un fallo de red (offline) lanza un
// TypeError SIN status. Eso decide si encolamos o propagamos el error.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Cita, CrearCitaInput } from "../api/citas";

const CACHE_KEY = "mercadito_citas_cache";
const QUEUE_KEY = "mercadito_citas_cola";

// Una cita encolada: el payload original + una cita optimista para pintar en la
// lista mientras no sincroniza, y un estado de sincronización.
export interface CitaEncolada {
  localId: string; // "pend-xxxxxxxx"
  input: CrearCitaInput;
  optimista: Cita;
  estadoSync: "pendiente" | "error";
  errorMsg?: string;
  creada_ts: number;
}

// True si el error de apiFetch es por falta de red (no llegó al server).
export function esErrorDeRed(e: unknown): boolean {
  return !(e && typeof (e as { status?: unknown }).status === "number");
}

// ---------- Caché de lectura ----------
export async function guardarCacheCitas(citas: Cita[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(citas));
  } catch {
    // sin espacio / error de storage: no es fatal, seguimos online
  }
}

export async function leerCacheCitas(): Promise<Cita[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cita[]) : [];
  } catch {
    return [];
  }
}

// ---------- Cola de creación ----------
async function leerCola(): Promise<CitaEncolada[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as CitaEncolada[]) : [];
  } catch {
    return [];
  }
}

async function escribirCola(cola: CitaEncolada[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(cola));
  } catch {
    // ignore
  }
}

// Encola una cita creada sin conexión. Devuelve el localId asignado.
export async function encolarCita(item: CitaEncolada): Promise<void> {
  const cola = await leerCola();
  cola.push(item);
  await escribirCola(cola);
}

// Las citas de la cola, en forma de Cita, para mezclarlas en la lista. Llevan
// flags (_offline / _syncError) que la UI usa para el badge.
export interface CitaOffline extends Cita {
  _offline: true;
  _localId: string;
  _syncError?: string;
}

export async function citasEnCola(): Promise<CitaOffline[]> {
  const cola = await leerCola();
  return cola.map((c) => ({
    ...c.optimista,
    _offline: true as const,
    _localId: c.localId,
    _syncError: c.estadoSync === "error" ? c.errorMsg || "No se pudo agendar" : undefined,
  }));
}

// Quita una entrada de la cola (tras sincronizar bien, o al descartar un error).
export async function quitarDeCola(localId: string): Promise<void> {
  const cola = await leerCola();
  await escribirCola(cola.filter((c) => c.localId !== localId));
}

async function marcarErrorEnCola(localId: string, msg: string): Promise<void> {
  const cola = await leerCola();
  const next = cola.map((c) =>
    c.localId === localId ? { ...c, estadoSync: "error" as const, errorMsg: msg } : c
  );
  await escribirCola(next);
}

// Intenta enviar al server cada cita pendiente de la cola. Se llama al cargar
// listas o al volver el foco. Devuelve cuántas se sincronizaron OK.
//   - Éxito → se quita de la cola.
//   - Rechazo del server (status, ej. 409 horario ocupado) → se marca error
//     (queda visible para que el tendero la rehaga) y NO se reintenta sola.
//   - Sin red → se detiene; se reintentará después.
export async function sincronizarCola(
  postFn: (input: CrearCitaInput) => Promise<{ id: string }>
): Promise<{ sincronizadas: number; errores: number }> {
  const cola = await leerCola();
  let sincronizadas = 0;
  let errores = 0;
  for (const item of cola) {
    if (item.estadoSync === "error") continue; // ya marcada, no reintentar sola
    try {
      await postFn(item.input);
      await quitarDeCola(item.localId);
      sincronizadas++;
    } catch (e) {
      if (esErrorDeRed(e)) break; // sigue offline: reintentar luego
      const msg = (e as { error?: string })?.error || "No se pudo agendar";
      await marcarErrorEnCola(item.localId, msg);
      errores++;
    }
  }
  return { sincronizadas, errores };
}

export async function hayPendientes(): Promise<boolean> {
  const cola = await leerCola();
  return cola.length > 0;
}
