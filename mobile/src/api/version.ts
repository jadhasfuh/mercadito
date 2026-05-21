// Check de versión: compara la versión instalada (de app.json/Constants)
// contra `/api/app-version` del backend. Si hay una versión más nueva,
// mostramos un alert al usuario invitándolo a actualizar desde Play Store.
import Constants from "expo-constants";
import { apiFetch } from "./client";

export interface VersionInfo {
  latest: string;
  minimo: string;
  apkUrl: string;
  notas?: string;
}

export async function getAppVersion(): Promise<VersionInfo | null> {
  try {
    return await apiFetch<VersionInfo>("/api/app-version");
  } catch {
    return null;
  }
}

/** Versión actualmente instalada (de app.json en build time). */
export function getCurrentVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

/** Comparador semver simple. Devuelve -1 si a<b, 1 si a>b, 0 si iguales. */
export function compareVersions(a: string, b: string): number {
  const aP = a.split(".").map((s) => parseInt(s, 10) || 0);
  const bP = b.split(".").map((s) => parseInt(s, 10) || 0);
  const len = Math.max(aP.length, bP.length);
  for (let i = 0; i < len; i++) {
    const av = aP[i] ?? 0;
    const bv = bP[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

export interface UpdateStatus {
  needsUpdate: boolean;
  blocking: boolean;
  info: VersionInfo;
}

/**
 * Devuelve el estado de actualización o null si no se puede determinar
 * (sin conexión, backend caído, etc — en esos casos no molestamos al
 * usuario).
 */
export async function checkForUpdate(): Promise<UpdateStatus | null> {
  const info = await getAppVersion();
  if (!info) return null;
  const current = getCurrentVersion();
  const cmpLatest = compareVersions(current, info.latest);
  const cmpMinimo = compareVersions(current, info.minimo);
  return {
    needsUpdate: cmpLatest < 0,
    blocking: cmpMinimo < 0,
    info,
  };
}
