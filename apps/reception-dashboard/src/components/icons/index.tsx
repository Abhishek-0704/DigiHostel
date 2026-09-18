import type { ReactNode, SVGProps } from "react";
import styles from "./icons.module.css";

export type IconSize = "sm" | "md" | "lg";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  size?: IconSize;
}

/**
 * Small, hand-authored, dependency-free icon set (Prompt 4 §8/§9 — no icon
 * library was added; every icon here is a plain inline SVG using
 * `currentColor`, sized off the existing `--icon-sm/md/lg` tokens). Every
 * icon is `aria-hidden` by default — the accessible name always comes from
 * the surrounding control's own label/text, never from the icon itself
 * (§27 — "do not rely on animation/icon-only content to communicate
 * state"). Line-style (stroke, not fill), 24x24 viewBox, matching the
 * restrained enterprise visual language §23 asks for — no illustration,
 * no color-coded meaning baked into the icon itself.
 */
function IconBase({
  size = "md",
  className,
  children,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={[styles[size], className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </IconBase>
  );
}

export function LeaveIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 2v4M16 2v4" />
      <path d="m9 15 2 2 4-4" />
    </IconBase>
  );
}

export function StudentsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17.5" cy="9" r="2.5" />
      <path d="M15.5 14.5c2.9.4 5 2.9 5 5.5" />
    </IconBase>
  );
}

export function EmergencyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

export function HealthIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 20s-7-4.4-9.5-9C1 7.5 3 4 6.5 4c2 0 3.3 1 4.5 2.4C12.2 5 13.5 4 15.5 4 19 4 21 7.5 20.5 11 18 15.6 12 20 12 20Z" />
      <path d="M9 11h2l1-2 1.5 4L14 11h1" />
    </IconBase>
  );
}

export function ReportsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M2 20h20" />
    </IconBase>
  );
}

export function AuditIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M9 3v2h6V3" />
      <path d="M9 11h6M9 15h4" />
    </IconBase>
  );
}

export function AdminIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7" />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M3 12h2.2M18.8 12H21M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" />
    </IconBase>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9a2.7 2.7 0 1 1 3.8 2.5c-.9.4-1.4 1-1.4 2" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

export function SystemIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </IconBase>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m15 6-6 6 6 6" />
    </IconBase>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9 6 6 6-6 6" />
    </IconBase>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </IconBase>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </IconBase>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.35-4.35" />
    </IconBase>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </IconBase>
  );
}

export function WifiIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2 8.5a15.9 15.9 0 0 1 20 0" />
      <path d="M5.5 12.3a11 11 0 0 1 13 0" />
      <path d="M9 16a5.5 5.5 0 0 1 6 0" />
      <path d="M12 20h.01" />
    </IconBase>
  );
}

export function WifiOffIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2 8.5a15.9 15.9 0 0 1 5.5-3.4M22 8.5a15.9 15.9 0 0 0-6-3.6" />
      <path d="M5.5 12.3a11 11 0 0 1 3-1.7M15.5 10.6a11 11 0 0 1 3 1.7" />
      <path d="M9 16a5.5 5.5 0 0 1 6 0" />
      <path d="M12 20h.01" />
      <path d="M2 2l20 20" />
    </IconBase>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </IconBase>
  );
}

export function UserCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.2 18.5a6.5 6.5 0 0 1 11.6 0" />
    </IconBase>
  );
}

/** Added Prompt 5 (Dashboard Home) for `DashboardRefreshControl`. */
export function RefreshIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 4v5h-5" />
    </IconBase>
  );
}

/** Added Phase 5, Prompt 14 (Enterprise Configuration Center) — a "sliders"
 * glyph, distinct from `SettingsIcon`'s gear (personal account settings)
 * and `SystemIcon`'s server-rack (system health monitoring), matching this
 * page's own distinct concept (administrative configuration editing). */
export function ConfigurationIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h13M21 18h-1" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </IconBase>
  );
}
