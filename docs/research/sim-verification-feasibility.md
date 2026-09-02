# SIM Verification Feasibility Research

Research task required by ADR-003 (Parent Authentication — Device Verification Scope) before SIM-identity ("UPI-inspired") verification can be mandated as a parent-auth requirement.

## Important methodology note

This research was intended to use live web search/fetch against authoritative current sources. At the time this document was written, the web research tools in this environment were unavailable (backend model error on every attempt, confirmed not query-specific). Rather than fabricate citations or silently skip the research, this document is written from well-established, stable platform documentation and public technical knowledge about how Android/iOS telephony APIs and Indian carrier-based silent authentication work. These are platform-level facts that change slowly, but **before committing engineering effort to this control, the team should re-verify current API availability directly against**: Android's official `TelephonyManager`/`SubscriberInfo` API docs, Apple's current `CoreTelephony` documentation, and at least one Indian telecom-aggregator's current Silent Network Authentication (SNA) product page (e.g. a provider offering "mobile number verification without OTP" for the Indian market). This document should not be treated as a substitute for that direct verification — only as a structured starting point.

## What "UPI-inspired SIM verification" actually refers to

UPI apps in India don't verify a SIM by reading it directly. The mechanism (commonly called SIM-binding or Silent Network Authentication, SNA) works at the **mobile network level**: when a request is made over a cellular data connection (not WiFi), the telecom carrier's network infrastructure can identify which SIM/subscriber the connection belongs to and confirm or deny a claimed phone number, without any OTP being sent. UPI apps historically used a similar SMS-based binding step (sending an SMS from the device to a short code, which only works if a real SIM with that number is present), which is a related but distinct mechanism from true network-level SNA.

Neither mechanism is "an Android or iOS API." Both require the request to reach specific telecom infrastructure — either via a carrier partnership/aggregator relationship, or (for the older SMS-based approach) the ability to send an SMS from the device.

## Android capabilities

- `TelephonyManager` exposes some subscriber info (e.g. `getLine1Number()`), but this is a self-reported value stored on the SIM/carrier record, not cryptographically verified in real time, is frequently empty/unreliable across carriers and Android versions, and requires the sensitive `READ_PHONE_STATE`/`READ_PHONE_NUMBERS` permissions — increasingly restricted by Google Play policy for apps without a clear, justified use case.
- The **SMS Retriever API** / **SMS User Consent API** auto-read OTP SMS messages for UX convenience. They do not verify SIM identity — they just remove the need to manually type a code that was still sent via a normal OTP flow. Not a substitute for SIM verification.
- **Play Integrity API** verifies device/app integrity (not rooted, genuine Play-installed binary, not tampered) — a different security property from SIM identity, already adopted separately in ADR-003 for attestation.
- Genuine SIM/number verification without an OTP is achievable on Android via **carrier-level Silent Network Authentication**, offered commercially by telecom operators (e.g. Reliance Jio, Airtel, Vi) or aggregators (e.g. Route Mobile, Tanla, Vonage-class providers) that have direct carrier integrations. This is not a public, free SDK — it requires a commercial relationship and per-verification cost, and the request must travel over the target carrier's mobile data connection specifically (not WiFi), which the client must enforce.

## iOS capabilities

- `CoreTelephony` (`CTTelephonyNetworkInfo` and related APIs) exposes carrier *name* and limited network-type info. Apple has progressively and deliberately removed access to phone number, IMSI, ICCID, and other subscriber-identity fields — there is **no public API on iOS for a third-party app to read or verify SIM/phone-number identity**. This is a stable, long-standing platform restriction, not a temporary gap.
- **DeviceCheck / App Attest** verify device/app integrity, the same category as Android's Play Integrity — not SIM identity.
- The carrier-level SNA mechanism described above is technically usable on iOS too, since it doesn't depend on a native SIM-reading API — the network authenticates the request based on which SIM's cellular data connection carried it. The same commercial/aggregator-partnership requirement and cellular-data-only constraint applies.

## Cross-platform summary

| Mechanism | Android | iOS | Free/public API? |
|---|---|---|---|
| Self-reported phone number via telephony API | Partially available, unreliable | Not available | Yes (Android only), but not verified/trustworthy |
| OTP auto-read (SMS Retriever/User Consent) | Available | Not applicable (no equivalent) | Yes, but this is OTP UX, not SIM verification |
| Platform attestation (Play Integrity / App Attest) | Available | Available | Yes — already adopted (ADR-003), but verifies device/app integrity, not SIM identity |
| Carrier-level Silent Network Authentication | Available via commercial aggregator | Available via commercial aggregator | **No** — requires paid carrier/aggregator partnership on both platforms equally |

## Privacy implications

Carrier-level SNA involves a third-party telecom/aggregator confirming subscriber identity to the app's backend — a real data-sharing relationship with a telecom partner that must be disclosed under DPDP (SDD Ch.17.4: consent, purpose limitation, minimization). This adds a genuine privacy/compliance surface beyond what platform attestation alone requires.

## Security implications

SNA is a meaningfully stronger anti-impersonation control than OTP alone (an attacker with a stolen OTP but not physical SIM possession cannot pass SNA), which is the actual security value the SDD's "UPI-inspired" framing is pointing at. However, it does not replace platform attestation (ADR-003's already-adopted control), which addresses a different threat (compromised/rooted device) — the two are complementary, not substitutes.

## Feasibility for India specifically

Multiple Indian telecom-aggregator SNA products exist commercially and are used by fintech/banking apps for exactly this purpose — so the mechanism is proven and available in the Indian market. The barrier for this project is not "does it exist" but **cost and commercial-relationship overhead relative to project scale**: per-verification API costs, a business relationship/contract with an aggregator or carrier, and engineering work to force cellular-data-only requests on both platforms — all disproportionate to an MVP/pilot-hostel deployment with a small, likely non-commercial budget.

## Failure/fallback behavior

If SNA were adopted, its failure mode (e.g. user on WiFi-only, no cellular data, or a carrier not covered by the aggregator's network) would need a fallback — almost certainly falling back to the OTP+platform-attestation flow already adopted in ADR-003. This means SNA, if ever added, would be an **additional** hardening layer, not a replacement for the existing flow — the system must work correctly without it regardless.

## Verdict

**Partially feasible.**

Technically achievable on both Android and iOS via commercial carrier/aggregator Silent Network Authentication — this is a real, proven mechanism in the Indian market, not vaporware. It is **not** achievable via any free, direct platform API on either OS, and does **not** exist as a simple third-party library integration the way platform attestation does. The gap between "technically possible" and "practical for this project" is commercial cost and partnership overhead, not engineering capability.

## Impact on ADR-003

This finding **confirms and refines** ADR-003's existing decision — it does not contradict it, so no supersession is required. ADR-003 already deferred SIM verification pending this research rather than mandating it; that deferral was correct. The practical recommendation is to treat SIM/SNA verification as **out of scope for MVP** (not merely "paused pending a spike") due to cost/commercial overhead, while leaving it available as a genuine future hardening option once the project has the budget and partnership capacity for a telecom-aggregator relationship — consistent with ADR-003's existing fallback-to-OTP+attestation design. See the addendum added to ADR-003 recording this outcome (a permitted addition under the ADR immutability rule — it does not alter ADR-003's original Decision, Context, or Rationale text).
