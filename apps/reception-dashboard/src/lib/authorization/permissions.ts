/**
 * Centralized permission taxonomy (Prompt 3 §8/§9). Every permission a
 * future Reception Dashboard feature might check is declared here, once —
 * no `if (role === "reception_warden")` string comparison should ever
 * appear in a component or page. These are AUTHORIZATION CATEGORIES only;
 * none of the corresponding business features (leave queue, student
 * verification, emergency handling, etc.) are implemented by this prompt.
 *
 * Naming convention: `<module>:<capability>` (or `<module>:<resource>:<capability>`
 * for a module with more than one gated action), matching §8's category
 * list exactly: dashboard, notifications, leave, student, movement,
 * emergency, health, audit, reports, users (User Management), configuration,
 * system.
 */
export const PERMISSIONS = [
  "dashboard:view",

  "notifications:view",

  "leave:queue:view",
  "leave:manual_verification:decide",
  "leave:parent_approval:initiate",
  "leave:parent_approval:monitor",

  "student:search",
  "student:verify",

  "movement:exit",
  "movement:return",

  "emergency:manage",

  "health:manage",

  "audit:view",

  "reports:view",
  "reports:generate",

  "users:manage",

  "configuration:manage",

  "system:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
