// Capa offline para citas en la web/PWA (corre solo en el cliente).
//
// Misma idea que la app nativa: caché de lectura en localStorage + cola de
// creación que se sincroniza al volver el internet. La auth web es por cookie,
// así que los fetch ya van autenticados.
//
// Distinguir "sin red" de "el server rechazó": fetch() SOLO rechaza (throw) por
// fallo de red; un error HTTP (4xx/5xx) resuelve con res.ok=false. Eso decide
// si encolamos o mostramos el error real.

const CACHE_KEY = "mercadito_citas_cache";
const QUEUE_KEY = "mercadito_citas_cola";

export interface CitaWeb {
  id: string;
  puesto_id: string;
  puesto_nombre?: string;
  cliente_id?: string | null;
  cliente_nombre?: string;
  cliente_telefono?: string;
  servicio_id?: string | null;
  servicio_nombre: string;
  precio?: string | number | null;
  personas?: unknown[] | null;
  inicio: string;
  fin?: string;
  estado: string;
  notas?: string | null;
  // flags offline (solo en citas locales sin sincronizar)
  _offline?: boolean;
  _localId?: string;
  _syncError?: string;
  [k: string]: unknown;
}

interface ColaItem {
  localId: string;
  input: Record<string, unknown>;
  optimista: CitaWeb;
  estadoSync: "pendiente" | "error";
  errorMsg?: string;
}

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read<T>(key: string, fallback: T): T {
  const s = ls();
  if (!s) return fallback;
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, val: unknown): void {
  const s = ls();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(val));
  } catch {
    // sin espacio: no fatal
  }
}

// ---------- caché de lectura ----------
function guardarCache(citas: CitaWeb[]): void {
  write(CACHE_KEY, citas);
}
function leerCache(): CitaWeb[] {
  return read<CitaWeb[]>(CACHE_KEY, []);
}

// ---------- cola ----------
function leerCola(): ColaItem[] {
  return read<ColaItem[]>(QUEUE_KEY, []);
}
function escribirCola(c: ColaItem[]): void {
  write(QUEUE_KEY, c);
}
function citasEnCola(): CitaWeb[] {
  return leerCola().map((c) => ({
    ...c.optimista,
    _offline: true,
    _localId: c.localId,
    _syncError: c.estadoSync === "error" ? c.errorMsg || "No se pudo agendar" : undefined,
  }));
}

export function quitarDeColaWeb(localId: string): void {
  escribirCola(leerCola().filter((c) => c.localId !== localId));
}
function marcarError(localId: string, msg: string): void {
  escribirCola(leerCola().map((c) => (c.localId === localId ? { ...c, estadoSync: "error", errorMsg: msg } : c)));
}

async function sincronizarCola(): Promise<void> {
  const cola = leerCola();
  for (const item of cola) {
    if (item.estadoSync === "error") continue;
    try {
      const res = await fetch("/api/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.input),
      });
      if (res.ok) {
        quitarDeColaWeb(item.localId);
      } else {
        const d = await res.json().catch(() => ({}));
        marcarError(item.localId, d?.error || "No se pudo agendar");
      }
    } catch {
      break; // sigue sin red: reintentar luego
    }
  }
}

// ---------- API pública ----------
export interface ListarResult {
  citas: CitaWeb[];
  offline: boolean;
  unauthorized: boolean;
}

// Lista de citas con caché + cola. Solo lanza en errores HTTP no-401.
export async function listarCitasOffline(): Promise<ListarResult> {
  await sincronizarCola().catch(() => {});
  try {
    const res = await fetch("/api/citas");
    if (res.status === 401) return { citas: [], offline: false, unauthorized: true };
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = await res.json();
    const arr: CitaWeb[] = Array.isArray(data) ? data : [];
    guardarCache(arr);
    return { citas: [...citasEnCola(), ...arr], offline: false, unauthorized: false };
  } catch (e) {
    const esHttp = e instanceof Error && e.message.startsWith("http ");
    if (esHttp) throw e; // error real del server
    // sin red: última copia + cola
    return { citas: [...citasEnCola(), ...leerCache()], offline: true, unauthorized: false };
  }
}

export interface CrearResult {
  offline: boolean;
  status?: number; // si el server respondió con error
  error?: string;
}

// Crea una cita. Si hay red la manda; si el server rechaza devuelve status/error;
// si NO hay red la encola con una cita optimista y devuelve offline:true.
export async function crearCitaOffline(
  payload: Record<string, unknown>,
  optimista: CitaWeb
): Promise<CrearResult> {
  try {
    const res = await fetch("/api/citas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { offline: false, status: res.status, error: d?.error };
    }
    sincronizarCola().catch(() => {});
    return { offline: false };
  } catch {
    // fetch rechazó = sin red → encolar
    const localId = `pend-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const cola = leerCola();
    cola.push({ localId, input: payload, optimista: { ...optimista, id: localId }, estadoSync: "pendiente" });
    escribirCola(cola);
    return { offline: true };
  }
}
