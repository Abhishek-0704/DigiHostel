import type { AnnouncementData, FuturePanelState } from "./types";

/**
 * Announcements data source (Prompt 5 §12). No announcement service or
 * database table exists anywhere in this repository — confirmed by
 * inspection, not assumed. Per §12's explicit instruction, this hook
 * implements only the presentation-side integration seam; it must not
 * create an announcement-management system or a new database table
 * (§37 — "do not create new database tables merely because the dashboard
 * wants a metric").
 */
export function useAnnouncements(): FuturePanelState<AnnouncementData> {
  return { availability: "future", items: [] };
}
