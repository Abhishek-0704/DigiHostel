// Fetch mutator consumed by Orval-generated hooks (packages/api-spec/orval.config.ts).
// Each consuming app supplies its own base URL; this stays generic
// infrastructure, not business logic.
//
// Two ways an app supplies it, both fully supported:
//   1. Expo apps (apps/parent-mobile, apps/student-mobile): rely on the
//      `EXPO_PUBLIC_API_BASE_URL` fallback below — Expo inlines env vars
//      into the client bundle only when they carry that exact prefix
//      (Expo's own documented convention — see apps/parent-mobile's
//      env.example). Unchanged, still the default when nothing else is set.
//   2. Any other web consumer (apps/reception-dashboard): calls
//      `setApiBaseUrl()` once at startup, since `process.env` isn't
//      populated the same way outside an Expo bundle (Vite exposes env vars
//      via `import.meta.env` instead, under its own `VITE_` prefix).

export interface CustomFetchError {
  status: number;
  message: string;
}

/**
 * Explicit base-URL override (Reception Dashboard scaffolding, Prompt 0.2).
 * `process.env.EXPO_PUBLIC_API_BASE_URL` only ever resolves inside an Expo
 * bundle — a Vite-built web app has no `process.env` inlining for that exact
 * name, so a non-Expo consumer of this package had no way to configure the
 * base URL at all. Mirrors `setAuthTokenProvider` below exactly: an app
 * registers its own value once at startup (see
 * apps/reception-dashboard/src/app/initialization/registerApiClient.ts).
 * Registering nothing (the default) preserves the exact previous behavior —
 * `customFetch` still falls back to `EXPO_PUBLIC_API_BASE_URL` — so this is
 * fully backward-compatible for the existing Expo apps, neither of which
 * calls this.
 */
let apiBaseUrlOverride: string | null = null;

export function setApiBaseUrl(url: string | null): void {
  apiBaseUrlOverride = url;
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

/**
 * Builds a query string from `params`, omitting any key whose value is
 * `undefined`/`null` entirely — never passing it through to
 * `URLSearchParams`. Found live (Phase 4, Prompt 8 — Student Operations
 * Center): `URLSearchParams`'s constructor coerces every value with
 * `String()`, so `new URLSearchParams({ q: undefined })` produces the
 * literal query string `q=undefined` — a real, previously-latent bug in
 * this shared infrastructure that no earlier generated endpoint had ever
 * triggered (every prior GET route in this API takes either no query
 * parameters at all, e.g. `listStaffLeaveQueue`, or only required ones),
 * so `app.inject()`-based route tests (which bypass this client entirely)
 * never exercised it either — confirmed live via the real browser, where
 * an omitted optional search term silently became the literal search text
 * "undefined" server-side, matching zero real students by design (the
 * backend correctly, honestly returned an empty result for that string —
 * this was a client-side serialization defect, not a backend logic bug).
 */
function buildQueryString(params: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null,
  ) as [string, string][];
  return entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : "";
}

export async function customFetch<T>(config: RequestConfig, options?: RequestInit): Promise<T> {
  const baseUrl = apiBaseUrlOverride ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
  const query = buildQueryString(config.params);

  const accessToken = authTokenProvider ? await authTokenProvider() : null;

  const response = await fetch(`${baseUrl}${config.url}${query}`, {
    ...options,
    method: config.method,
    signal: config.signal,
    headers: {
      // Only set when there is an actual JSON body to send. A no-body POST
      // (e.g. staff-only action routes like /expire or
      // /send-for-parent-approval, which take no request payload) previously
      // still carried this header with `body: undefined` — Fastify's default
      // JSON body parser rejects that combination outright
      // (`FST_ERR_CTP_EMPTY_JSON_BODY`, "Body cannot be empty when
      // content-type is set to 'application/json'"), turning every such
      // no-body route into an unconditional 400 for any real caller of this
      // client (confirmed live: the Reception Dashboard's "Send for Parent
      // Approval" button, which has no request body, failed this way through
      // a real browser fetch — not previously caught because `/expire`,
      // structurally identical, has never been wired to a live UI button
      // through this real fetch path, and vitest's `app.inject()`-based
      // route tests bypass this client/fetch layer entirely).
      ...(config.data ? { "Content-Type": "application/json" } : {}),
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
