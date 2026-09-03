/**
 * API service indirection (Prompt 2 foundation). Feature code should import
 * generated hooks/types from here rather than reaching into
 * `@digihostel/api-client-react` directly everywhere — a single place to
 * re-point if the generated package's internal layout ever changes, and a
 * natural place to layer request-level app-specific config later (this
 * pass adds none). No business logic lives here; this file only re-exports
 * the contract-generated (ADR-007) client as-is.
 */
export * from "@digihostel/api-client-react";
export * from "./authTokenProvider";
