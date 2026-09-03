// Fetch mutator consumed by Orval-generated hooks (packages/api-spec/orval.config.ts).
// Each consuming app supplies its own base URL via EXPO_PUBLIC_API_BASE_URL at
// build/runtime; this stays generic infrastructure, not business logic.
//
// EXPO_PUBLIC_-prefixed, not a bare API_BASE_URL: this package's only current
// consumers are Expo apps (apps/parent-mobile, apps/student-mobile), and Expo
// only inlines env vars into the client bundle when they carry that exact
// prefix (Expo's own documented convention — see apps/parent-mobile's
// env.example) — an unprefixed name would silently resolve to undefined at
// runtime, not merely fail to build.

export interface CustomFetchError {
  status: number;
  message: string;
}

export interface RequestConfig {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  data?: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

/**
 * Pluggable auth-token source (Prompt 3, apps/parent-mobile). This package
 * deliberately knows nothing about Supabase or any other auth provider —
 * an app that needs authenticated requests registers a provider once at
 * startup (apps/parent-mobile does this in src/services/api/authTokenProvider.ts)
 * rather than every generated hook call site attaching its own header.
 * Registering nothing (the default) preserves the exact previous
 * behavior — no Authorization header — so this is backward compatible for
 * any consumer that doesn't need authenticated requests.
 */
type AuthTokenProvider = () => Promise<string | null>;
let authTokenProvider: AuthTokenProvider | null = null;

export function setAuthTokenProvider(provider: AuthTokenProvider | null): void {
  authTokenProvider = provider;
}

export async function customFetch<T>(config: RequestConfig, options?: RequestInit): Promise<T> {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
  const query = config.params
    ? `?${new URLSearchParams(config.params as Record<string, string>).toString()}`
    : "";

  const accessToken = authTokenProvider ? await authTokenProvider() : null;

  const response = await fetch(`${baseUrl}${config.url}${query}`, {
    ...options,
    method: config.method,
    signal: config.signal,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...config.headers,
      ...options?.headers,
    },
    body: config.data ? JSON.stringify(config.data) : undefined,
  });

  if (!response.ok) {
    const error: CustomFetchError = {
      status: response.status,
      message: await response.text(),
    };
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
