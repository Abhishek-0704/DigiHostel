/**
 * Help & Support content (Prompt 11) — no ticketing backend exists in this
 * repository (`apps/api/src/routes/` has no support/ticket route), so this
 * is genuinely useful static content plus honest "what happens next"
 * framing for each action, never a fabricated ticket submission.
 */
export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    id: "how-leave-works",
    question: "How does leave approval work?",
    answer:
      "When your student requests leave, you and any other linked parent/guardian are notified. Any linked parent or guardian may approve or reject the request.",
  },
  {
    id: "why-biometric",
    question: "Why does the app ask for biometric confirmation?",
    answer:
      "Biometric confirmation helps make sure it's really you making a leave decision on this device.",
  },
  {
    id: "trusted-devices",
    question: "What is a trusted device?",
    answer:
      "A trusted device is one that's been verified to approve leave requests on your behalf. You can review and manage your trusted devices from the Security Center.",
  },
  {
    id: "missed-notification",
    question: "I didn't get a notification for a leave request",
    answer:
      "Check that notifications are enabled for DigiHostel in your phone's settings, and that you have a stable internet connection. You can also check the Notifications tab directly.",
  },
];

export interface SupportAction {
  id: string;
  title: string;
  description: string;
  /** What genuinely happens when this action is selected — shown in the UI
   * so the user always knows what to expect, per this prompt's own "the
   * user should always know what happens after selecting a support action"
   * instruction. */
  whatHappensNext: string;
}

export const SUPPORT_ACTIONS: SupportAction[] = [
  {
    id: "contact-hostel",
    title: "Contact hostel administration",
    description: "For questions about a specific leave request or your student's hostel.",
    whatHappensNext: "Contact your hostel's reception or administration office directly.",
  },
  {
    id: "report-problem",
    title: "Report a problem",
    description: "Something in the app isn't working as expected.",
    whatHappensNext:
      "In-app problem reporting isn't available yet. Please describe the issue to your hostel administration so it can be passed along.",
  },
  {
    id: "feedback",
    title: "Send feedback",
    description: "Suggestions for improving the app.",
    whatHappensNext:
      "In-app feedback submission isn't available yet — this is a planned future update.",
  },
];
