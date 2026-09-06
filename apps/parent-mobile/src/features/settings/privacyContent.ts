/**
 * Privacy information content (Prompt 11) — plain-language, non-technical
 * summaries of this app's ACTUAL behavior, grounded in what is genuinely
 * true of the accepted architecture (`docs/security.md`, ADR-014,
 * `docs/rls-policy-matrix.md`) — never database schema, RLS policy names,
 * or internal API details, per this prompt's explicit "do not expose...
 * internal security mechanisms" instruction.
 */
export interface PrivacySection {
  id: string;
  title: string;
  body: string;
}

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: "what-we-collect",
    title: "What we collect",
    body: "Your name and mobile number, your relationship to your linked student(s), and the leave requests you review — nothing more.",
  },
  {
    id: "how-its-protected",
    title: "How your information is protected",
    body: "Access controls at the database level mean your information can only be read by you, your linked student, and hostel staff who need it to do their job.",
  },
  {
    id: "who-can-see-it",
    title: "Who can see your information",
    body: "Your linked student and your hostel's staff. Other parents or guardians — even ones linked to the same student — can never see your personal details.",
  },
  {
    id: "notifications",
    title: "Notifications",
    body: "Notifications about leave requests are sent only to parents and guardians linked to that student.",
  },
  {
    id: "data-sharing",
    title: "Data sharing",
    body: "Your information is used only within DigiHostel to run hostel leave approval. It is not shared with any other organization.",
  },
  {
    id: "future-controls",
    title: "Future privacy controls",
    body: "Options to view, export, or request deletion of your data are planned for a future update and are not available yet.",
  },
];
