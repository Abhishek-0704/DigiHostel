/**
 * Push content (ADR-018 §8): may reference the student (name/roll number)
 * and a call to action. Must NEVER name/describe another parent/guardian
 * (who else was/will be contacted, their relationship type, whether they
 * responded) and must NEVER describe internal escalation-stage/scheduler
 * state — so the body is deliberately identical regardless of which
 * escalation stage triggered it; the stage itself is never surfaced here.
 */
export function buildLeaveNotificationContent(student: { fullName: string; rollNumber: string }): {
  title: string;
  body: string;
} {
  return {
    title: "Leave request awaiting your response",
    body: `${student.fullName} (${student.rollNumber}) has a pending leave request awaiting your response.`,
  };
}
