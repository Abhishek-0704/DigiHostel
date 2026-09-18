import Fastify from "fastify";
import cors from "@fastify/cors";
import { logger } from "./lib/logger.js";
import { createErrorHandler } from "./lib/errorHandler.js";
import { healthRoutes } from "./routes/health.js";
import { testAuthRoutes } from "./routes/test-auth.js";
import { leaveRoutes } from "./routes/leave.js";
import { studentRoutes } from "./routes/students.js";
import { movementRoutes } from "./routes/movements.js";
import { emergencyRoutes } from "./routes/emergencies.js";
import { healthCaseRoutes } from "./routes/health-cases.js";
import { auditRoutes } from "./routes/audit.js";
import { staffRoutes } from "./routes/staff.js";
import { configurationRoutes } from "./routes/configuration.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { reportsRoutes } from "./routes/reports.js";
import { authRoutes } from "./routes/auth.js";
import { deviceRoutes } from "./routes/devices.js";
import { registerAuth, type RegisterAuthOverrides } from "./plugins/auth.js";
import { registerLeave, type RegisterLeaveOverrides } from "./plugins/leave.js";
import { registerStudent, type RegisterStudentOverrides } from "./plugins/student.js";
import { registerMovement, type RegisterMovementOverrides } from "./plugins/movement.js";
import { registerEmergency, type RegisterEmergencyOverrides } from "./plugins/emergency.js";
import { registerHealthCase, type RegisterHealthCaseOverrides } from "./plugins/healthCase.js";
import { registerAudit, type RegisterAuditOverrides } from "./plugins/audit.js";
import { registerStaff, type RegisterStaffOverrides } from "./plugins/staff.js";
import {
  registerConfiguration,
  type RegisterConfigurationOverrides,
} from "./plugins/configuration.js";
import { registerAnalytics, type RegisterAnalyticsOverrides } from "./plugins/analytics.js";
import { registerReports, type RegisterReportsOverrides } from "./plugins/reports.js";
import { registerRateLimit, type RegisterRateLimitOverrides } from "./plugins/rateLimit.js";
import { registerOtpAuth, type RegisterOtpAuthOverrides } from "./plugins/otpAuth.js";
import { registerDevice, type RegisterDeviceOverrides } from "./plugins/device.js";

/**
 * CORS origin resolution (Reception Dashboard Prompt 1). Returns:
 *   - the explicit env-configured allow-list, if `CORS_ALLOWED_ORIGINS` is set
 *     (comma-separated, e.g. "https://reception.example.com,https://staging-reception.example.com")
 *   - otherwise, outside production, the Reception Dashboard's own local dev
 *     server origin (a real, verified value — apps/reception-dashboard's
 *     `vite` default port — not a guessed one)
 *   - otherwise (production, nothing configured), `false` — fail closed,
 *     matching this app's pre-existing default exactly. A production
 *     deployment that needs the Reception Dashboard to work MUST set
 *     `CORS_ALLOWED_ORIGINS` — this is a deliberate, documented gap
 *     (docs/reception-dashboard-architecture.md §35), not silently papered
 *     over with an invented URL.
 */
export function resolveCorsOrigins(): string[] | false {
  const configured = process.env.CORS_ALLOWED_ORIGINS;
  if (configured && configured.trim() !== "") {
    return configured
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
  if (process.env.NODE_ENV !== "production") {
    return ["http://localhost:5173"];
  }
  return false;
}

export interface BuildAppOptions {
  /** Test-only dependency injection — see plugins/auth.ts. Never used in
   * production (index.ts calls buildApp() with no arguments). */
  authOverrides?: RegisterAuthOverrides;
  /** Test-only dependency injection — see plugins/leave.ts. Never used in
   * production. */
  leaveOverrides?: RegisterLeaveOverrides;
  /** Test-only dependency injection — see plugins/student.ts. Never used in
   * production. */
  studentOverrides?: RegisterStudentOverrides;
  /** Test-only dependency injection — see plugins/movement.ts. Never used
   * in production. */
  movementOverrides?: RegisterMovementOverrides;
  /** Test-only dependency injection — see plugins/emergency.ts. Never used
   * in production. */
  emergencyOverrides?: RegisterEmergencyOverrides;
  /** Test-only dependency injection — see plugins/healthCase.ts. Never used
   * in production. */
  healthCaseOverrides?: RegisterHealthCaseOverrides;
  /** Test-only dependency injection — see plugins/audit.ts. Never used in
   * production. */
  auditOverrides?: RegisterAuditOverrides;
  /** Test-only dependency injection — see plugins/staff.ts. Never used in
   * production. */
  staffOverrides?: RegisterStaffOverrides;
  /** Test-only dependency injection — see plugins/configuration.ts. Never
   * used in production. */
  configurationOverrides?: RegisterConfigurationOverrides;
  /** Test-only dependency injection — see plugins/analytics.ts. Never used
   * in production. */
  analyticsOverrides?: RegisterAnalyticsOverrides;
  /** Test-only dependency injection — see plugins/reports.ts. Never used in
   * production. */
  reportsOverrides?: RegisterReportsOverrides;
  /** Test-only dependency injection — see plugins/rateLimit.ts. Never used
   * in production. */
  rateLimitOverrides?: RegisterRateLimitOverrides;
  /** Test-only dependency injection — see plugins/otpAuth.ts. Never used in
   * production. */
  otpAuthOverrides?: RegisterOtpAuthOverrides;
  /** Test-only dependency injection — see plugins/device.ts. Never used in
   * production. */
  deviceOverrides?: RegisterDeviceOverrides;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ loggerInstance: logger });

  // F-07 (production observability): Fastify already assigns every request
  // a request ID (its own internal sequential generator — `requestIdHeader`
  // is never set anywhere in this codebase, so Fastify's documented default
  // of `false` applies and no client-supplied header is ever trusted or
  // parsed for this; verified against the installed Fastify version's own
  // config defaults, not assumed) and threads it through every
  // `request.log` call automatically. What was missing is the other half:
  // the ID never reached the client at all, so a user reporting "I got an
  // error" had nothing to hand support that could be correlated back to a
  // specific server-side log line. This header is the minimum safe
  // mechanism — it exposes only an opaque per-request counter, nothing
  // sensitive, and requires no new dependency.
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  // Global error handler (G-01) — must be set before any route can run, so
  // every unexpected exception (from any route) is sanitized the same way.
  app.setErrorHandler(createErrorHandler());

  // Reception Dashboard Prompt 1 (Authentication Infrastructure) — a real
  // browser-based client now exists (apps/reception-dashboard), so the
  // "no browser client exists" rationale that justified `origin: false`
  // (Prompt 12 RC1, and reconfirmed by the Prompt 0.3 ASRB review) no
  // longer holds. Environment-driven, per that review's own explicit
  // instruction: no production origin is invented here — `CORS_ALLOWED_ORIGINS`
  // (comma-separated) is read from the environment; if unset, this falls
  // back to the Reception Dashboard's own actual local Vite dev server
  // origin (`apps/reception-dashboard/vite.config.ts`'s default port, `5173`)
  // ONLY outside production, so local development keeps working without
  // guessing a real deployment URL. In production with nothing configured,
  // this still fails closed (`origin: false`, unchanged from before) rather
  // than silently opening up — `@fastify/cors` defaults to `origin: "*"`
  // when given no options at all, which is why this is always passed
  // explicitly, never left to the plugin's own default.
  await app.register(cors, { origin: resolveCorsOrigins() });
  // Global rate limiting (G-02) — registered before routes so its `onRequest`
  // hook covers every route by default; individual sensitive routes
  // (routes/leave.ts) tighten this via their own `config.rateLimit`, and
  // /healthz opts out entirely (routes/health.ts).
  await registerRateLimit(app, options.rateLimitOverrides);

  // Decorates app.authenticate / app.authDbPort / app.leaveService before
  // any routes that use them are registered — Fastify decorators flow down
  // to child contexts, not up, so this must run first. /healthz below is
  // unaffected: it never lists app.authenticate in its own preHandler
  // chain, so it stays public.
  registerAuth(app, options.authOverrides);
  registerLeave(app, options.leaveOverrides);
  registerStudent(app, options.studentOverrides);
  registerMovement(app, options.movementOverrides);
  registerEmergency(app, options.emergencyOverrides);
  registerHealthCase(app, options.healthCaseOverrides);
  registerAudit(app, options.auditOverrides);
  registerStaff(app, options.staffOverrides);
  registerConfiguration(app, options.configurationOverrides);
  registerAnalytics(app, options.analyticsOverrides);
  registerReports(app, options.reportsOverrides);
  registerOtpAuth(app, options.otpAuthOverrides);
  registerDevice(app, options.deviceOverrides);

  await app.register(healthRoutes, { prefix: "/api/v1" });
  // Demonstration/test-only routes (test-auth.ts's own doc comment) — never
  // part of the product API contract. Previously registered unconditionally,
  // which meant a production deployment shipped an ungated
  // authenticated-token-validity oracle for no product purpose (RC1
  // hardening finding). Gated the same way `logger.ts` already gates its own
  // dev-only transport, rather than inventing a new flag.
  if (process.env.NODE_ENV !== "production") {
    await app.register(testAuthRoutes, { prefix: "/api/v1" });
  }
  await app.register(leaveRoutes, { prefix: "/api/v1" });
  // Phase 4, Prompt 8 — Student Operations Center. Reuses the existing
  // AAL2/hostel-scope staff boundary (leaveRoutes' own pattern) and the
  // already-declared `student:search` permission — no new authentication
  // mechanism, role, or permission was introduced.
  await app.register(studentRoutes, { prefix: "/api/v1" });
  // Phase 4, Prompt 9 — Student Movement Management System / Hostel
  // Return. Reuses the existing AAL2/hostel-scope staff boundary and the
  // already-declared `movement:return` permission — no new authentication
  // mechanism, role, or permission was introduced.
  await app.register(movementRoutes, { prefix: "/api/v1" });
  // Phase 4, Prompt 10 — Emergency Operations Center. Reuses the existing
  // AAL2/hostel-scope staff boundary and the already-declared
  // `emergency:manage` permission — no new authentication mechanism, role,
  // or permission was introduced.
  await app.register(emergencyRoutes, { prefix: "/api/v1" });
  // Phase 4, Prompt 11 — Health Operations Center. Reuses the existing
  // AAL2/hostel-scope staff boundary and the already-declared
  // `health:manage` permission — no new authentication mechanism, role, or
  // permission was introduced.
  await app.register(healthCaseRoutes, { prefix: "/api/v1" });
  // Phase 5, Prompt 12 — Enterprise Audit Center. A privileged read-only
  // path over `audit_logs` (zero client-facing RLS by design) — reuses the
  // existing AAL2/hostel-scope staff boundary and the already-declared
  // `audit:view` permission (granted since Prompt 3) — no new
  // authentication mechanism, role, or permission was introduced.
  await app.register(auditRoutes, { prefix: "/api/v1" });
  // Phase 5, Prompt 13 — Identity & Access Administration Center. The
  // first `requireSuperAdmin()`-only route family in this codebase — no
  // new role, permission, or authentication mechanism was introduced;
  // matches `staff`'s own pre-existing `staff_all_super_admin` RLS grant.
  await app.register(staffRoutes, { prefix: "/api/v1" });
  // Phase 5, Prompt 14 — Enterprise Configuration Center. Reuses the
  // existing AAL2 boundary and the already-declared `configuration:manage`
  // permission (granted to hostel_admin/super_admin since Prompt 3, never
  // previously wired to a route) — no new authentication mechanism, role,
  // or permission was introduced.
  await app.register(configurationRoutes, { prefix: "/api/v1" });
  await app.register(analyticsRoutes, { prefix: "/api/v1" });
  await app.register(reportsRoutes, { prefix: "/api/v1" });
  // F-02 remediation (PRR Phase 13) — the ADR-020-required eligibility gate.
  // Deliberately not gated by NODE_ENV: unlike test-auth.ts, this is real
  // product login functionality, not a demonstration route.
  await app.register(authRoutes, { prefix: "/api/v1" });
  // ADR-003 implementation — device-registration challenge/attestation
  // endpoints. Authenticated (unlike auth.ts's pre-session OTP routes), so
  // registration order relative to authRoutes doesn't matter; placed here to
  // keep every routes/*.ts registration grouped together.
  await app.register(deviceRoutes, { prefix: "/api/v1" });

  return app;
}
