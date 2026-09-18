# ADR-003: Parent Authentication — Device Verification Scope

- **ADR ID:** ADR-003
- **Title:** Parent Authentication — Device Verification Scope
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Related ADRs:** ADR-001 (Client Application Architecture) — this decision applies to the Parent Mobile Application's registration/device-trust flow.

## Decision

The parent registration/device-trust flow will implement:

1. **Mandatory: platform attestation.** Android Play Integrity API and iOS DeviceCheck/App Attest, inserted into the device-trust flow after OTP verification and before a device is marked trusted, per SDD Ch.17.2.4/§17.2.8. This is adopted in full — it is standard, well-supported, cross-platform SDK-level integration with no known feasibility blocker.
2. **Deferred, not adopted as a hard MVP requirement: SIM-identity ("UPI-inspired") verification** (SDD Ch.17.2.1). This is flagged as an **open feasibility question** requiring a technical spike before it can be mandated, not silently dropped and not blindly committed to. See Rationale.

Ch.4's registration flow (§4.2–§4.5) is amended, for implementation purposes, to read: Roll Number → validate parent record → OTP → **platform attestation check** → trusted device registration → biometric enrollment → dashboard. This ADR is the authoritative sequence; Ch.4's text is not modified.

## Context

### Conflicting SDD references

- **SDD Chapter 4 — Parent Authentication Module**, §4.5 (Security Controls), lists exactly: Roll Number validation, OTP verification, trusted device binding, OS biometric authentication, encrypted tokens, audit log. No SIM validation and no app-attestation step appears anywhere in Ch.4's registration flow (§4.2), new-device flow (§4.3), or device management (§4.4).
- **SDD Chapter 17.2 — Security Architecture: Authentication & Device Security** introduces mechanisms absent from Ch.4:
  - §17.2.1 names a **"UPI-inspired SIM verification approach"** as part of the identity-verification model.
  - §17.2.4 (Trusted Device Lifecycle) inserts an explicit **"SIM / Device Validation"** step between OTP Verification and Register Trusted Device.
  - §17.2.8 mandates **Android Play Integrity / iOS DeviceCheck or App Attest**.

This was surfaced by a full 20-chapter contradiction sweep conducted this session, specifically checking whether the security chapter's authentication details matched the dedicated parent-authentication chapter's flow. They do not: Ch.4 (the chapter whose entire purpose is to specify this exact flow) simply does not mention two concrete, implementable security gates that Ch.17.2 (the dedicated security chapter) requires.

## Options Considered

### Option A — Follow Ch.4 only; treat Ch.17.2's additions as future hardening, not MVP
Implement OTP + trusted device + biometric only, as Ch.4 literally describes.

- **Pros:** simplest, matches the module chapter that a developer would naturally read first.
- **Cons:** directly contradicts `CLAUDE.md`'s "Never bypass authentication... for convenience" and the security-first posture in `docs/security.md`/`.claude/rules/security.md`, both of which are themselves derived from Ch.17. Silently dropping a security control that the dedicated security chapter explicitly mandates is exactly the kind of "silently reconcile a material... security... conflict" `CLAUDE.md` forbids.

### Option B — Follow Ch.17.2 in full; mandate both platform attestation and SIM verification
Implement all three: OTP, platform attestation, and SIM-identity verification as hard MVP requirements.

- **Pros:** fully honors the dedicated security chapter.
- **Cons:** "SIM verification" as literally described (UPI-inspired, i.e., verifying the phone's SIM/mobile-number identity against a carrier or OS-level API) has no public, reliable API on iOS for third-party apps to verify SIM identity — Apple does not expose carrier-level SIM verification to app developers the way Android's telephony APIs allow. Mandating this without qualification risks committing to something that may be technically infeasible on one of the two required platforms, which would only be discovered mid-implementation — precisely the kind of rework this ADR process exists to prevent.

### Option C — Adopt platform attestation in full now; treat SIM verification as an explicit open feasibility question, not a decision
Mandate Play Integrity/DeviceCheck/App Attest immediately (low cost, well-supported, real security value against emulated/rooted/jailbroken devices). Do not mandate SIM verification yet; require a short technical feasibility spike (Android telephony APIs vs. iOS constraints) before it is either adopted as a hard requirement, adopted as an Android-only enhancement, or formally deferred to post-MVP.

- **Pros:** adopts everything that is unambiguously implementable and valuable immediately, without either silently dropping a named security control (Option A's flaw) or over-committing to something whose cross-platform feasibility hasn't been verified (Option B's flaw).
- **Cons:** leaves one sub-question genuinely open rather than fully resolved — but that is a more honest state than a decision made without feasibility evidence.

## Rationale

1. Ch.17 is the SDD's dedicated security architecture chapter; per this project's own pattern (see ADR-002's treatment of Ch.12 as authoritative for schema naming), a dedicated chapter on a domain outranks a functional chapter's incidental omission on that same domain. Ch.4 not mentioning platform attestation reads as an omission by a UX-flow chapter, not a deliberate rejection of a security control specified elsewhere.
2. Platform attestation (Play Integrity, DeviceCheck/App Attest) is mature, documented, cross-platform tooling with no known feasibility barrier — there is no reason to defer it.
3. SIM-identity verification is materially different: it depends on platform-specific telephony capabilities that are not symmetric between Android and iOS, and the SDD gives no implementation detail (no named API, no fallback behavior for iOS) beyond the phrase "UPI-inspired." Committing to it as a hard requirement without first confirming what's actually buildable on iOS would risk exactly the kind of mid-implementation rework this ADR system exists to prevent.
4. This resolves the conflict without contradicting the security-first governance rule, and without inventing a feasibility answer this session has no evidence for.

## Consequences

- The parent device-trust registration flow, once implemented, must include a platform-attestation check (Play Integrity / DeviceCheck / App Attest) as a hard gate before a device is marked trusted.
- A technical feasibility spike on SIM-identity verification is required before backend/API work on that specific control begins. Until that spike concludes and is recorded (either as an update to this ADR's status or a new ADR if the outcome is architecturally significant), SIM verification must not be assumed present, and must not be silently skipped either — it stays an explicitly open item, not a resolved "no."
- `docs/security.md` and `.claude/rules/security.md` remain accurate as high-level references and require no correction from this ADR.
- Any implementation task touching parent authentication must treat this ADR, not Ch.4 alone, as the authoritative flow sequence.

## Addendum (2026-09-02, added post-acceptance — implementation reference only, does not alter the Decision/Context/Rationale above)

The feasibility spike required by this ADR's Consequences section has been completed: see `docs/research/sim-verification-feasibility.md`. Verdict: **partially feasible** — technically achievable on both Android and iOS only via commercial carrier/telecom-aggregator Silent Network Authentication (not a free platform API, not a simple SDK), with real per-verification cost and partnership overhead. This confirms rather than contradicts this ADR's original deferral; no supersession is required. Practical recommendation: SIM/SNA verification is out of scope for MVP, available as a future hardening option pending budget/partnership capacity.

## Addendum (2026-09-13, added post-acceptance — implementation reference only, does not alter the Decision/Context/Rationale above)

The mandatory platform-attestation gate (this ADR's Decision §1, Android leg) has been implemented: server-controlled challenge/nonce issuance (`device_registration_challenges`, single-use, short-lived, no client-facing RLS access), a real Google Play Integrity verifier that independently re-verifies the returned token server-side before a device is ever marked trusted, and a local Expo native module making the real Play Integrity call on the client. Full detail, evidence, and test coverage: `apps/parent-mobile/docs/authentication.md` §18 and the standalone ADR-003 Implementation Report (2026-09-13).

**Status of verification, honestly stated**: the architecture is real and tested (unit + integration, backend and mobile, against a real local Postgres instance), but no genuine end-to-end attestation has been verified against Google's live Play Integrity servers or on a physical device, because no Google Play Console project/Cloud Project number exists in this development environment — a real, external, account-holder-owned, paid dependency, not a technical gap in the code. This is classified as **BLOCKED BY PLATFORM/INFRASTRUCTURE DEPENDENCY**, not IMPLEMENTED AND VERIFIED. iOS DeviceCheck/App Attest (this ADR's Decision §1, iOS leg) was not implemented in this pass — `registerCurrentDevice()` remains fail-closed on iOS, unchanged.

This confirms rather than alters this ADR's original decision; no supersession is required.

## Rejected Alternatives

- **Option A** — rejected: silently drops a named security control from the dedicated security chapter, contradicting `CLAUDE.md`'s security-first mandate.
- **Option B** — rejected: commits to a specific mechanism (SIM verification) without confirmed cross-platform feasibility, risking rework.

## Impact on Future Implementation

- Auth-service and mobile-client (Parent app, per ADR-001) implementation must budget for a Play Integrity/App Attest integration from the start.
- A feasibility spike for SIM verification should be scheduled before or alongside early parent-auth implementation work, not discovered as a gap after the fact.
- This ADR does not modify SDD Ch.4 or Ch.17; both remain as written. This ADR is the authoritative implementation-level resolution of the gap between them.
