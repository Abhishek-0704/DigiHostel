import { Outlet } from "react-router-dom";
import { Card } from "../components/ui";
import styles from "./AuthenticationLayout.module.css";

/** Layout for future staff authentication pages (Prompt 0.2 §10). Renders
 * only a centered card shell — no login form (Prompt 0.2 §14/§39 explicitly
 * forbids implementing login UI in this scaffolding pass). */
export function AuthenticationLayout() {
  return (
    <div className={styles.wrapper}>
      <Card className={styles.card}>
        <Outlet />
      </Card>
    </div>
  );
}
