import { Outlet } from "react-router-dom";
import styles from "./FullscreenLayout.module.css";

/** Layout for future fullscreen/operational experiences (Prompt 0.2 §10) —
 * e.g. a future kiosk-style student-verification screen with no sidebar
 * chrome. No such screen exists yet; this is shell only. */
export function FullscreenLayout() {
  return (
    <div className={styles.wrapper}>
      <Outlet />
    </div>
  );
}
