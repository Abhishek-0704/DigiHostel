import { CONFIGURATION_DOMAINS, type ConfigurationValueType } from "./types.js";

/**
 * Pure, framework/DB-agnostic validation (Phase 5, Prompt 14's own
 * "VALIDATION STRATEGY"/"POST validate"/"POST preview" sections — this is
 * the ONE function both the real write path (`repository.ts`'s `create()`)
 * and the stateless `/configuration/validate` preview endpoint call, so a
 * preview can never diverge from what the real write actually enforces.
 * Hostel EXISTENCE (a database fact) is deliberately NOT checked here — see
 * `repository.ts`'s `create()`/`validateFull()` for that, since this module
 * has no database access by design (keeps it trivially unit-testable).
 */

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,99}$/;

/** Never store a secret as an ordinary configuration value (Prompt 14's own
 * explicit "Do not store passwords... API keys or credentials" rule) — a
 * key or domain that even LOOKS like it's naming one is rejected outright,
 * regardless of what `value`/`valueType` claim. */
const SECRET_LIKE_PATTERN = /password|secret|token|api[_-]?key|credential|private[_-]?key/i;

export interface ShapeValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateKey(domain: string, key: string): ShapeValidationResult {
  if (!(CONFIGURATION_DOMAINS as readonly string[]).includes(domain)) {
    return { ok: false, reason: `"${domain}" is not a recognized configuration domain.` };
  }
  if (!KEY_PATTERN.test(key)) {
    return {
      ok: false,
      reason: 'Key must be lowercase snake_case, starting with a letter (e.g. "stage_timeout").',
    };
  }
  if (SECRET_LIKE_PATTERN.test(key) || SECRET_LIKE_PATTERN.test(domain)) {
    return {
      ok: false,
      reason:
        "This key/domain name resembles a secret (password/token/API key/credential) — secrets must never be stored as configuration.",
    };
  }
  return { ok: true };
}

export function validateValueShape(
  value: unknown,
  valueType: ConfigurationValueType,
): ShapeValidationResult {
  switch (valueType) {
    case "string":
      return typeof value === "string"
        ? { ok: true }
        : { ok: false, reason: 'valueType "string" requires a JSON string value.' };
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? { ok: true }
        : { ok: false, reason: 'valueType "number" requires a finite JSON number value.' };
    case "boolean":
      return typeof value === "boolean"
        ? { ok: true }
        : { ok: false, reason: 'valueType "boolean" requires a JSON true/false value.' };
    case "json":
      // Any JSON-serializable value is acceptable for the generic "json"
      // type — `undefined` is the one JS value with no JSON representation
      // at all, so it's the only thing rejected here.
      return value === undefined
        ? { ok: false, reason: 'valueType "json" requires a value (got none).' }
        : { ok: true };
  }
}

export function validateScopeHostelConsistency(
  scope: "global" | "hostel",
  hostelId: string | null,
): ShapeValidationResult {
  if (scope === "hostel" && !hostelId) {
    return { ok: false, reason: 'A hostel-scoped entry requires a hostel id ("scope": "hostel").' };
  }
  if (scope === "global" && hostelId) {
    return { ok: false, reason: 'A global entry must not name a hostel ("scope": "global").' };
  }
  return { ok: true };
}
