import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSessionContext } from "../../contexts/SessionContext";
import { useAuthContext } from "../../contexts/AuthContext";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import { ROUTES } from "../../constants/routes";
import { UserCircleIcon, ChevronDownIcon, LogoutIcon } from "../icons";
import { RoleBadge } from "./RoleBadge";
import styles from "./ProfileMenu.module.css";

/**
 * Header profile menu (Prompt 4 §7/§25/§31). Uses the existing
 * authenticated staff identity (`SessionContext`/`AuthorizationContext`)
 * and the existing session lifecycle (`AuthContext.signOut`) — no second
 * identity source, no second logout mechanism (§7's/§33's explicit rules).
 *
 * A labeled popup, not a spec-complete ARIA `menu`/`menuitem` widget
 * (which implies arrow-key/Home/End/typeahead navigation this component
 * doesn't implement) — every item is a real, natural-tab-order
 * link/button, fully keyboard-operable without overclaiming a pattern
 * that isn't fully built (§27 — accessibility must be genuine, not
 * decorative ARIA). Closes on outside click, on Escape (returning focus to
 * the trigger), and on selecting an item.
 */
export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const { session } = useSessionContext();
  const { signOut } = useAuthContext();
  const { role, staffName } = useAuthorization();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!session) return null;

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
      >
        <UserCircleIcon size="md" />
        <ChevronDownIcon size="sm" />
      </button>

      {open && (
        <div ref={panelRef} className={styles.panel} aria-label="Account">
          <div className={styles.identity}>
            <p className={styles.name}>{staffName ?? session.user.email ?? "Signed in"}</p>
            {staffName && session.user.email && (
              <p className={styles.email}>{session.user.email}</p>
            )}
            {role && <RoleBadge role={role} />}
          </div>
          <Link to={ROUTES.settings} className={styles.item} onClick={() => setOpen(false)}>
            Settings
          </Link>
          <Link to={ROUTES.help} className={styles.item} onClick={() => setOpen(false)}>
            Help &amp; Support
          </Link>
          <button
            type="button"
            className={styles.item}
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            <LogoutIcon size="sm" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
