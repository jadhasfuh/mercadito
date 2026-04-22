import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "mercadito_session";

function getBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  return extra?.apiBaseUrl ?? "https://mercadito.cx";
}

export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function setSessionToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(SESSION_KEY, token);
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}

export interface ApiError {
  status: number;
  error: string;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["X-Session-Token"] = token;

  const res = await fetch(`${getBaseUrl()}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err: ApiError = { status: res.status, error: data?.error ?? `HTTP ${res.status}` };
    throw err;
  }
  return data as T;
}
