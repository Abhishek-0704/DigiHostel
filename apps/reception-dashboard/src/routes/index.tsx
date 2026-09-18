import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AuthenticationLayout, DashboardLayout } from "../layouts";
import { RequireAuth } from "./RequireAuth";
import { RequirePermission } from "./RequirePermission";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { LoadingIndicator } from "../components/ui";
import { ROUTES } from "../constants/routes";
import type { Permission } from "../lib/authorization/permissions";

/**
 * Routing foundation (Prompt 0.2 §9, extended Prompt 3 §12/§16). Every page
 * below is a lazy-loaded placeholder (see src/pages/*) — route-level code
 * splitting via `React.lazy`. No business screen is implemented.
 *
 * Each protected route now declares its permission requirement (Prompt 3
 * §12: "future protected routes must be able to declare their
 * authorization requirements consistently") via `RequirePermission`,
 * composed INSIDE `RequireAuth` (auth+AAL2 must pass before role/permission
 * is even checked — Sidebar.tsx derives its own visibility from the exact
 * same `permissions` list, per §16's "navigation visibility must derive
 * from the same centralized authorization model"). `/settings` and
 * `/help` are intentionally ungated by permission — personal-account and
 * universally-accessible pages respectively, not administrative modules.
 */
const LoginPage = lazy(() => import("../pages/LoginPage"));
const DashboardHomePage = lazy(() => import("../pages/DashboardHomePage"));
const NotificationsPage = lazy(() => import("../pages/NotificationsPage"));
const LeaveQueuePage = lazy(() => import("../pages/LeaveQueuePage"));
const LeaveDetailPage = lazy(() => import("../pages/LeaveDetailPage"));
const StudentsPage = lazy(() => import("../pages/StudentsPage"));
const StudentProfilePage = lazy(() => import("../pages/StudentProfilePage"));
const StudentVerificationPage = lazy(() => import("../pages/StudentVerificationPage"));
const StudentReturnPage = lazy(() => import("../pages/StudentReturnPage"));
const StudentReportEmergencyPage = lazy(() => import("../pages/StudentReportEmergencyPage"));
const EmergencyPage = lazy(() => import("../pages/EmergencyPage"));
const EmergencyDetailPage = lazy(() => import("../pages/EmergencyDetailPage"));
const StudentReportHealthCasePage = lazy(() => import("../pages/StudentReportHealthCasePage"));
const HealthPage = lazy(() => import("../pages/HealthPage"));
const HealthCaseDetailPage = lazy(() => import("../pages/HealthCaseDetailPage"));
const ApprovalHistoryPage = lazy(() => import("../pages/ApprovalHistoryPage"));
const AuditPage = lazy(() => import("../pages/AuditPage"));
const ReportsPage = lazy(() => import("../pages/ReportsPage"));
const AnalyticsPage = lazy(() => import("../pages/AnalyticsPage"));
const UsersPage = lazy(() => import("../pages/UsersPage"));
const ConfigurationPage = lazy(() => import("../pages/ConfigurationPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const HelpPage = lazy(() => import("../pages/HelpPage"));
const SystemPage = lazy(() => import("../pages/SystemPage"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<LoadingIndicator />}>{element}</Suspense>;
}

function withPermission(permission: Permission, element: ReactNode) {
  return <RequirePermission permission={permission}>{withSuspense(element)}</RequirePermission>;
}

function protectedDashboard() {
  return (
    <RequireAuth>
      <DashboardLayout />
    </RequireAuth>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to={ROUTES.dashboard} replace />,
  },
  {
    element: <AuthenticationLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [{ path: ROUTES.login, element: withSuspense(<LoginPage />) }],
  },
  {
    element: protectedDashboard(),
    children: [
      {
        // A pathless layout route whose only job is to own `errorElement`
        // (Prompt 4 §19) — React Router replaces everything from the
        // nearest ancestor WITH an `errorElement` downward on a route
        // error, so putting it directly on `protectedDashboard()`'s own
        // route above would tear down the whole DashboardLayout (sidebar +
        // header) on every route-level error, not just the affected
        // page's content. Nesting it one level in means a thrown error
        // only ever replaces what's inside DashboardLayout's `<Outlet/>` —
        // the shell chrome stays mounted, exactly as
        // `RouteErrorBoundary`'s own doc comment describes.
        element: <Outlet />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            path: ROUTES.dashboard,
            element: withPermission("dashboard:view", <DashboardHomePage />),
          },
          {
            path: ROUTES.notifications,
            element: withPermission("notifications:view", <NotificationsPage />),
          },
          {
            path: ROUTES.leaveQueue,
            element: withPermission("leave:queue:view", <LeaveQueuePage />),
          },
          {
            path: ROUTES.leaveDetail,
            element: withPermission("leave:queue:view", <LeaveDetailPage />),
          },
          { path: ROUTES.students, element: withPermission("student:search", <StudentsPage />) },
          {
            path: ROUTES.studentProfile,
            element: withPermission("student:search", <StudentProfilePage />),
          },
          {
            path: ROUTES.studentVerification,
            element: withPermission("student:verify", <StudentVerificationPage />),
          },
          {
            path: ROUTES.studentReturn,
            element: withPermission("movement:return", <StudentReturnPage />),
          },
          {
            path: ROUTES.studentReportEmergency,
            element: withPermission("emergency:manage", <StudentReportEmergencyPage />),
          },
          {
            path: ROUTES.emergency,
            element: withPermission("emergency:manage", <EmergencyPage />),
          },
          {
            path: ROUTES.emergencyDetail,
            element: withPermission("emergency:manage", <EmergencyDetailPage />),
          },
          {
            path: ROUTES.studentReportHealthCase,
            element: withPermission("health:manage", <StudentReportHealthCasePage />),
          },
          { path: ROUTES.health, element: withPermission("health:manage", <HealthPage />) },
          {
            path: ROUTES.healthDetail,
            element: withPermission("health:manage", <HealthCaseDetailPage />),
          },
          {
            path: ROUTES.approvalHistory,
            element: withPermission("leave:parent_approval:monitor", <ApprovalHistoryPage />),
          },
          { path: ROUTES.audit, element: withPermission("audit:view", <AuditPage />) },
          { path: ROUTES.reports, element: withPermission("reports:view", <ReportsPage />) },
          { path: ROUTES.analytics, element: withPermission("reports:view", <AnalyticsPage />) },
          { path: ROUTES.users, element: withPermission("users:manage", <UsersPage />) },
          {
            path: ROUTES.configuration,
            element: withPermission("configuration:manage", <ConfigurationPage />),
          },
          { path: ROUTES.settings, element: withSuspense(<SettingsPage />) },
          { path: ROUTES.help, element: withSuspense(<HelpPage />) },
          { path: ROUTES.system, element: withPermission("system:view", <SystemPage />) },
        ],
      },
    ],
  },
  {
    path: "*",
    element: withSuspense(<NotFoundPage />),
  },
]);
