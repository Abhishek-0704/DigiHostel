import pino from "pino";
import { hostname } from "node:os";

// F-07 remediation (PRR production observability). No log call in this
// codebase intentionally logs any of the paths below today (verified by
// repository-wide search) — this is defense-in-depth against a future call
// site accidentally passing a whole object (e.g. `{ err }` where `err`
// embeds a provider response body) that happens to contain one of these
// well-known field names, not evidence of an existing leak.
// Both the bare key (for the field at the root of a logged object, e.g.
// `logger.info({ otp })`) and the `*.key` form (for the field nested one
// level under some parent, e.g. `logger.info({ req })`) are listed — pino's
// underlying fast-redact matcher treats `*.otp` as "any key, then .otp", NOT
// as "otp at any depth", so a bare top-level field needs its own literal
// entry too.
const sensitiveKeys = [
  "password",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "otp",
  "otpCode",
  "pushToken",
  "expoPushToken",
  "deviceToken",
  "biometricAssertion",
  "serviceRoleKey",
  "jwt",
];
const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  ...sensitiveKeys,
  ...sensitiveKeys.map((key) => `*.${key}`),
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: redactPaths, censor: "[REDACTED]" },
  // Per-instance/deploy identification (F-07) — every log line already
  // carries these facts without needing to thread them through every call
  // site. No default `component` is set here deliberately: pino's `.child()`
  // appends its own bindings rather than merging into `base`, so a `.child()`
  // override of a key already present in `base` produces a genuinely
  // duplicated key in the raw JSON text (harmless to a spec-compliant JSON
  // parser, which takes the last value, but needlessly messy) — simplest to
  // avoid entirely by only ever setting `component` once, on the worker
  // child logger below. A log line with no `component` field is an ordinary
  // HTTP-request-path log; `component: "worker"` marks a background
  // worker/queue log, per ADR-021's own anticipated "Future F-07" tagging
  // approach.
  // A custom `base` REPLACES pino's own default ({ pid, hostname }) rather
  // than merging with it — both are included explicitly below so this
  // addition doesn't silently drop metadata every log line already had.
  base: {
    pid: process.pid,
    hostname: hostname(),
    service: "digihostel-api",
    buildSha: process.env.BUILD_SHA ?? "unknown",
  },
  transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});

/** Background workers/queue infra (escalationWorker, notificationWorker,
 * notificationReaperWorker, boss.ts) use this instead of the bare `logger`
 * so their log lines are distinguishable from HTTP-request logs on the one
 * shared process (see the `base` comment above). */
export const workerLogger = logger.child({ component: "worker" });
