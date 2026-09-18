/**
 * Data-availability classification (Prompt 5 §3/§21/§35, promoted here in
 * Prompt 6 §5 so the Notification Center can share the exact same concept
 * `features/dashboard` already established rather than redefining it).
 * Every widget that can show either real or not-yet-available data carries
 * one of these so a page is honest about what it shows, instead of
 * presenting placeholder and real data identically:
 *
 * - `real` — an existing, working data source this app can genuinely read
 *   today.
 * - `partial` — existing infrastructure exists but does not yet cover the
 *   full domain (e.g. a realtime CLIENT connection can be proven, but no
 *   business event source is attached to it yet).
 * - `placeholder` — the UI slot is built and ready, but no backend/service
 *   currently supplies real values for it.
 * - `future` — belongs to a later roadmap module/phase; nothing here reads
 *   or guesses at that module's eventual data shape.
 */
export type DataAvailability = "real" | "partial" | "placeholder" | "future";
