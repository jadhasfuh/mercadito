import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, getSessionToken } from "../api/client";

/**
 * Favoritos del cliente — platillos (`producto`) y negocios (`puesto`).
 *
 * Regla: el dispositivo manda. Guardamos en AsyncStorage al instante (el
 * corazón nunca espera a la red) y, SI hay sesión, subimos una copia a la
 * cuenta para que los favoritos crucen del teléfono al navegador. Sin sesión
 * todo sigue funcionando: se puede navegar la app sin cuenta y un corazón que
 * exige login no lo toca nadie.
 *
 * Espejo de src/lib/favoritos.ts (localStorage). Si cambia la forma guardada,
 * cambiar las dos.
 */

export type TipoFavorito = "producto" | "puesto";
export interface Favoritos { productos: string[]; puestos: string[] }

const KEY = "mercadito_favoritos";
const VACIO: Favoritos = { productos: [], puestos: [] };

const campo = (tipo: TipoFavorito): keyof Favoritos => (tipo === "producto" ? "productos" : "puestos");
const unir = (a: string[], b: string[]) => [...new Set([...a, ...b])];

// Store en memoria consumido con useSyncExternalStore: la identidad del objeto
// SOLO cambia cuando cambian los favoritos de verdad (si no, re-render eterno).
let estado: Favoritos = VACIO;
let inicializado = false;
const suscriptores = new Set<() => void>();

function publicar(f: Favoritos) {
  estado = f;
  AsyncStorage.setItem(KEY, JSON.stringify(f)).catch(() => {});
  suscriptores.forEach((fn) => fn());
}

function suscribir(fn: () => void) {
  suscriptores.add(fn);
  return () => { suscriptores.delete(fn); };
}
const snapshot = () => estado;

async function leerLocal(): Promise<Favoritos> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return VACIO;
    const p = JSON.parse(raw) as Partial<Favoritos>;
    return {
      productos: Array.isArray(p.productos) ? p.productos : [],
      puestos: Array.isArray(p.puestos) ? p.puestos : [],
    };
  } catch {
    return VACIO;
  }
}

/** Sube lo local a la cuenta y baja la unión. Silencioso: sin sesión (o sin
 *  red) los favoritos del dispositivo siguen siendo la verdad. */
async function sincronizar(local: Favoritos) {
  try {
    // Sin token ni preguntamos: el endpoint responde "no autenticado" y sería
    // una request de más en cada arranque de la app.
    if (!(await getSessionToken())) return;
    const data = await apiFetch<{ autenticado?: boolean } & Favoritos>("/api/favoritos");
    if (!data?.autenticado) return;
    const hayLocalNuevo =
      local.productos.some((id) => !data.productos.includes(id)) ||
      local.puestos.some((id) => !data.puestos.includes(id));
    let remoto: Favoritos = { productos: data.productos ?? [], puestos: data.puestos ?? [] };
    if (hayLocalNuevo) {
      const merged = await apiFetch<Favoritos>("/api/favoritos", {
        method: "PUT",
        body: JSON.stringify(local),
      });
      remoto = { productos: merged.productos ?? [], puestos: merged.puestos ?? [] };
    }
    publicar({
      productos: unir(remoto.productos, local.productos),
      puestos: unir(remoto.puestos, local.puestos),
    });
  } catch {
    /* offline o sesión vencida: nos quedamos con lo local */
  }
}

/** Primera lectura del dispositivo + sincronización con la cuenta. Una sola
 *  vez por arranque, aunque haya veinte corazones montados. */
function inicializar() {
  if (inicializado) return;
  inicializado = true;
  leerLocal().then((local) => {
    if (local.productos.length > 0 || local.puestos.length > 0) publicar(local);
    sincronizar(local);
  });
}

export function useFavoritos() {
  const favoritos = useSyncExternalStore(suscribir, snapshot);

  useEffect(inicializar, []);

  const esFavorito = useCallback(
    (tipo: TipoFavorito, id: string) => favoritos[campo(tipo)].includes(id),
    [favoritos]
  );

  const alternar = useCallback((tipo: TipoFavorito, id: string) => {
    const key = campo(tipo);
    const activo = !estado[key].includes(id);
    publicar({
      ...estado,
      [key]: activo ? [...estado[key], id] : estado[key].filter((x) => x !== id),
    });
    apiFetch("/api/favoritos", {
      method: "POST",
      body: JSON.stringify({ tipo, ref_id: id, activo }),
    }).catch(() => { /* sin sesión o sin red: vive en el dispositivo */ });
    return activo;
  }, []);

  return { favoritos, esFavorito, alternar };
}
