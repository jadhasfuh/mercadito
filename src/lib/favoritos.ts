"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Favoritos del cliente — platillos (`producto`) y negocios (`puesto`).
 *
 * Regla: el dispositivo manda. Guardamos en localStorage al instante (el
 * corazón nunca espera a la red) y, SI hay sesión, subimos una copia a la
 * cuenta para que los favoritos crucen del teléfono al navegador. Sin sesión
 * todo sigue funcionando: la mayoría del tráfico del menú llega por QR sin
 * cuenta y un corazón que exige login no lo toca nadie.
 *
 * Espejo de mobile/src/lib/favoritos.ts (AsyncStorage). Si cambia la forma
 * guardada, cambiar las dos.
 */

export type TipoFavorito = "producto" | "puesto";
export interface Favoritos { productos: string[]; puestos: string[] }

const KEY = "mercadito_favoritos";
const VACIO: Favoritos = { productos: [], puestos: [] };

const campo = (tipo: TipoFavorito): keyof Favoritos => (tipo === "producto" ? "productos" : "puestos");
const unir = (a: string[], b: string[]) => [...new Set([...a, ...b])];

function leerLocal(): Favoritos {
  if (typeof window === "undefined") return VACIO;
  try {
    const raw = localStorage.getItem(KEY);
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

function guardarLocal(f: Favoritos) {
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* modo privado / cuota */ }
}

// Store mínimo en memoria: varios componentes de la misma página (la tarjeta
// del directorio y el corazón del menú) tienen que ver el mismo estado sin
// releer localStorage ni pasarse props por medio árbol. Se consume con
// useSyncExternalStore, así que la identidad del objeto SOLO cambia cuando
// cambian los favoritos de verdad (si no, re-render infinito).
let estado: Favoritos = VACIO;
let inicializado = false;
const suscriptores = new Set<() => void>();

function publicar(f: Favoritos) {
  estado = f;
  guardarLocal(f);
  suscriptores.forEach((fn) => fn());
}

function suscribir(fn: () => void) {
  suscriptores.add(fn);
  return () => { suscriptores.delete(fn); };
}
const snapshot = () => estado;
// En SSR no hay localStorage: el corazón se pinta apagado y el cliente lo
// corrige en la hidratación.
const snapshotServidor = () => VACIO;

/** Primera lectura del dispositivo + sincronización con la cuenta. Una sola
 *  vez por pestaña, aunque haya diez corazones montados. */
function inicializar() {
  if (inicializado) return;
  inicializado = true;
  const local = leerLocal();
  if (local.productos.length > 0 || local.puestos.length > 0) publicar(local);
  sincronizar(local);
}

/** Sube lo local a la cuenta y baja la unión. Silencioso: sin sesión (o sin
 *  red) los favoritos del dispositivo siguen siendo la verdad. */
async function sincronizar(local: Favoritos) {
  try {
    const res = await fetch("/api/favoritos");
    if (!res.ok) return;
    const data = await res.json() as { autenticado?: boolean } & Favoritos;
    if (!data.autenticado) return;
    const hayLocalNuevo =
      local.productos.some((id) => !data.productos.includes(id)) ||
      local.puestos.some((id) => !data.puestos.includes(id));
    let remoto: Favoritos = { productos: data.productos ?? [], puestos: data.puestos ?? [] };
    if (hayLocalNuevo) {
      const put = await fetch("/api/favoritos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      if (put.ok) {
        const merged = await put.json() as Favoritos;
        remoto = { productos: merged.productos ?? [], puestos: merged.puestos ?? [] };
      }
    }
    publicar({
      productos: unir(remoto.productos, local.productos),
      puestos: unir(remoto.puestos, local.puestos),
    });
  } catch { /* offline: nos quedamos con lo local */ }
}

export function useFavoritos() {
  const favoritos = useSyncExternalStore(suscribir, snapshot, snapshotServidor);

  useEffect(inicializar, []);

  const esFavorito = useCallback(
    (tipo: TipoFavorito, id: string) => favoritos[campo(tipo)].includes(id),
    [favoritos]
  );

  const alternar = useCallback((tipo: TipoFavorito, id: string) => {
    const actual = estado;
    const key = campo(tipo);
    const activo = !actual[key].includes(id);
    publicar({
      ...actual,
      [key]: activo ? [...actual[key], id] : actual[key].filter((x) => x !== id),
    });
    fetch("/api/favoritos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, ref_id: id, activo }),
    }).catch(() => { /* sin sesión o sin red: vive en el dispositivo */ });
    return activo;
  }, []);

  return { favoritos, esFavorito, alternar };
}
