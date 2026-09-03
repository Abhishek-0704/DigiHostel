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

export async function customFetch<T>(config: RequestConfig, options?: RequestInit): Promise<T> {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
  const query = config.params
    ? `?${new URLSearchParams(config.params as Record<string, string>).toString()}`
    : "";

  const response = await fetch(`${baseUrl}${config.url}${query}`, {
    ...options,
    method: config.method,
    signal: config.signal,
    headers: {
      "Content-Type": "application/json",
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
