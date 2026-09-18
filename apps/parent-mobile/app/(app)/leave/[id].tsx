import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { SecurityBanner } from "@/src/components/ui/SecurityBanner";
import { Skeleton } from "@/src/components/feedback/Skeleton";
import { EmptyState } from "@/src/components/feedback/EmptyState";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { SuccessState } from "@/src/components/feedback/SuccessState";
import { StudentInformationSection } from "@/src/features/leave-approval/components/StudentInformationSection";
import { LeaveInformationSection } from "@/src/features/leave-approval/components/LeaveInformationSection";
import { LeaveTimeline } from "@/src/features/leave-approval/components/LeaveTimeline";
import { CountdownTimer } from "@/src/features/leave-approval/components/CountdownTimer";
import { ConfirmationPanel } from "@/src/components/ui/ConfirmationPanel";
import { ProcessingIndicator } from "@/src/features/leave-approval/components/ProcessingIndicator";
import { DetailRow } from "@/src/components/ui/DetailRow";
import { useLeaveApprovalDetails } from "@/src/features/leave-approval/hooks/useLeaveApprovalDetails";
import { useDecideLeaveRequest } from "@/src/features/leave-approval/hooks/useDecideLeaveRequest";
import { deriveUiStateFromPresentation } from "@/src/features/leave-approval/leavePresentationMapper";
import { buildMinimalTimelineFromStatus } from "@/src/features/leave-approval/leaveTimeline";
import { formatLeaveDate } from "@/src/features/leave-approval/leaveDateFormatting";
import {
  LEAVE_APPROVAL_DEV_FIXTURES,
  isDevFixtureId,
} from "@/src/features/leave-approval/devFixtures";
import { useTheme } from "@/src/hooks/useTheme";
import { useBiometric } from "@/src/hooks/useBiometric";
import { useNetwork } from "@/src/hooks/useNetwork";
import { useLeaveRequestRealtime } from "@/src/hooks/useLeaveRequestRealtime";
import { biometricResultMessage } from "@/src/features/biometric/biometricMessages";
import { safeMessageFor } from "@/src/types/errors";
import type { LeaveApprovalUiState } from "@/src/features/leave-approval/types";

/**
 * Leave Details (Prompt 9A presentation; Prompt 9B backend integration).
 * See `docs/leave-approval.md` for the presentation architecture (§14/§16
 * cover this integration) and the repo root's `docs/leave-approval-workflow.md`
 * for the backend contract this screen now actually calls.
 *
 * Production behavior: `useLeaveApprovalDetails()` calls the real
 * `approvalService.getById()` (a real GET through the generated API
 * client). Confirming Approve/Reject on a real id: checks connectivity,
 * requests a real local biometric step-up (`useBiometric().stepUp`), and —
 * only on a real platform success — submits the decision through
 * `useDecideLeaveRequest()`, which itself never blindly retries a failed
 * submission (see that hook's own doc comment for the reconciliation
 * behavior on an uncertain network/conflict outcome).
 *
 * DEV-ONLY fixtures (`isDevFixtureId`/`LEAVE_APPROVAL_DEV_FIXTURES`,
 * `__DEV__`-gated, never reachable in a production build) remain unchanged
 * from Prompt 9A — they still preview the confirm → preparing-verification
 * → processing → success journey with fabricated, clearly-isolated local
 * data, and never touch any real service.
 */
export default function LeaveDetails() {
  const { theme } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const usingFixture = isDevFixtureId(id);

  const realQuery = useLeaveApprovalDetails(usingFixture ? undefined : id);
  const presentation = usingFixture ? LEAVE_APPROVAL_DEV_FIXTURES[id] : realQuery.presentation;
  const isLoading = usingFixture ? false : realQuery.isLoading;
  const loadError = usingFixture ? null : realQuery.error;
  const refresh = usingFixture ? async () => {} : realQuery.refresh;

  const { status: networkStatus } = useNetwork();
  const { stepUp } = useBiometric();
  const { decide } = useDecideLeaveRequest(id);

  // A filter that can never match a real row while previewing a dev
  // fixture (whose `id` is a non-UUID string) — keeps the realtime
  // subscription harmless in that mode without needing a conditional hook
  // call (React's rules of hooks).
  useLeaveRequestRealtime(
    refresh,
    usingFixture ? "id=eq.00000000-0000-0000-0000-000000000000" : `id=eq.${id}`,
  );

  const [uiState, setUiState] = useState<LeaveApprovalUiState>("loading");
  const [pendingDecision, setPendingDecision] = useState<"approved" | "rejected" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) {
      setUiState("loading");
      return;
    }
    if (loadError) {
      setUiState(loadError.kind === "leave_approval_unavailable" ? "unavailable" : "error");
      return;
    }
    if (presentation) {
      setUiState(deriveUiStateFromPresentation(presentation));
    }
  }, [isLoading, loadError, presentation]);

  const handleApprovePress = () => {
    setActionError(null);
    setUiState("confirming_approval");
  };
  const handleRejectPress = () => {
    setActionError(null);
    setUiState("confirming_rejection");
  };
  const handleCancelConfirm = () => {
    setActionError(null);
    setUiState("loaded");
  };

  // Guards against a double-tap on the ConfirmationPanel's confirm button
  // submitting the decision twice. A React state flag isn't enough here: the
  // two taps can both fire (and both read the same stale `uiState`) before
  // the first state update commits and unmounts the panel. A ref mutates
  // synchronously on the very first line of this handler, so the second tap
  // is rejected immediately regardless of render timing.
  const submittingRef = useRef(false);

  /**
   * Real submission path (Prompt 9B): offline check → local biometric
   * step-up → submit → reconcile. Never calls the backend if the local
   * biometric step fails/is cancelled (this prompt's explicit sequencing
   * requirement) and never blindly resubmits after an uncertain failure
   * (`useDecideLeaveRequest`'s own reconciliation). Dev-fixture ids remain
   * on the original, unchanged preview-only path.
   */
  const handleConfirmDecision = async (decision: "approved" | "rejected") => {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;

    setActionError(null);

    try {
      if (usingFixture) {
        setPendingDecision(decision);
        setUiState("preparing_verification");
        return;
      }

      if (networkStatus !== "online") {
        // Deliberately does not transition past confirming_* — a
        // security-sensitive mutation must never be queued for offline
        // execution (this prompt's explicit <offline> requirement).
        setActionError(safeMessageFor("network"));
        return;
      }

      setPendingDecision(decision);
      setUiState("preparing_verification");

      const stepUpResult = await stepUp(
        `leave-decision:${id}`,
        decision === "approved"
          ? "Confirm to approve this leave request"
          : "Confirm to reject this leave request",
      );

      if (stepUpResult.kind !== "success") {
        setActionError(biometricResultMessage(stepUpResult.kind).description);
        setUiState("loaded");
        return;
      }

      setUiState(decision === "approved" ? "processing_approval" : "processing_rejection");

      const result = await decide(decision, stepUpResult.assertion);
      setUiState(result.uiState);
      setActionError(result.error ? result.error.userMessage : null);
    } catch {
      setActionError(safeMessageFor("unknown"));
      setUiState("loaded");
    } finally {
      submittingRef.current = false;
    }
  };

  if (uiState === "loading") {
    return (
      <PageContainer>
        <PageHeader title="Leave Request" />
        <View style={{ gap: theme.spacing.sm }}>
          <Skeleton height={80} />
          <Skeleton height={160} />
          <Skeleton height={120} />
        </View>
      </PageContainer>
    );
  }

  if (uiState === "unavailable") {
    return (
      <PageContainer>
        <PageHeader title="Leave Request" />
        <EmptyState
          title="Leave approval isn't available yet"
          description="This feature is coming in a future update. If this is urgent, please contact hostel reception directly."
        />
      </PageContainer>
    );
  }

  if (uiState === "error") {
    return (
      <PageContainer>
        <PageHeader title="Leave Request" />
        <ErrorState error={loadError!} onRetry={refresh} />
      </PageContainer>
    );
  }

  if (!presentation) {
    return (
      <PageContainer>
        <PageHeader title="Leave Request" />
        <EmptyState title="This request isn't available" description="It may no longer exist." />
      </PageContainer>
    );
  }

  if (uiState === "expired") {
    return (
      <PageContainer>
        <PageHeader title="Leave Request" />
        <EmptyState
          title="Approval is no longer available"
          description="This leave request's approval window has closed. You don't need to take any action."
        />
      </PageContainer>
    );
  }

  if (uiState === "already_processed") {
    return (
      <PageContainer>
        <PageHeader title="Leave Request" />
        <EmptyState
          title="This request has already been decided"
          description={`This leave request was already ${presentation.status === "approved" ? "approved" : "rejected"}. No further action is needed.`}
        />
      </PageContainer>
    );
  }

  if (uiState === "not_yet_sent") {
    // Reception-Initiated Parent Approval correction: a `pending` leave
    // request has been created but not yet sent for parent approval by
    // Reception — genuinely nothing for the parent to do yet, not a missing
    // feature. See leavePresentationMapper.ts's mapBackendStatus().
    return (
      <PageContainer>
        <PageHeader title="Leave Request" />
        <EmptyState
          title="Awaiting hostel review"
          description="Your child's leave request has been submitted and is awaiting review by hostel reception. You'll be notified here once it's sent to you for approval."
        />
      </PageContainer>
    );
  }

  if (uiState === "cancelled") {
    // Never actually produced today — no cancellation status exists in the
    // backend model (see leavePresentationMapper.ts) — kept here only so
    // this uiState is exhaustively handled, not left to fall through.
    return (
      <PageContainer>
        <PageHeader title="Leave Request" />
        <EmptyState title="This request is unavailable" description="It may have been cancelled." />
      </PageContainer>
    );
  }

  if (uiState === "approval_success" || uiState === "rejection_success") {
    const approved = uiState === "approval_success";
    return (
      <PageContainer>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <SuccessState
            title={approved ? "Leave approved" : "Leave rejected"}
            description={
              approved ? "Your approval has been recorded." : "Your decision has been recorded."
            }
          />
          <Card style={{ marginTop: theme.spacing.lg }}>
            <DetailRow label="Result" value={approved ? "Approved" : "Rejected"} />
            <DetailRow label="Decided" value={formatLeaveDate(new Date().toISOString())} />
          </Card>
          <View style={{ marginTop: theme.spacing.lg, gap: 8 }}>
            <Button label="Return home" fullWidth onPress={() => router.push("/(app)/(tabs)")} />
            <Button
              label="View history"
              variant="secondary"
              fullWidth
              onPress={() => router.push("/(app)/(tabs)/history")}
            />
          </View>
        </ScrollView>
      </PageContainer>
    );
  }

  // loaded / confirming_approval / confirming_rejection / preparing_verification /
  // processing_approval / processing_rejection all share the same detail layout.
  const timelineEvents = buildMinimalTimelineFromStatus(presentation);

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="Leave Request" />

        {presentation.expiryTimestamp ? (
          <View style={{ marginBottom: theme.spacing.md }}>
            <CountdownTimer expiryTimestamp={presentation.expiryTimestamp} />
          </View>
        ) : null}

        <StudentInformationSection student={presentation.student} />
        <LeaveInformationSection leaveRequest={presentation} />

        <View style={{ marginTop: theme.spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Timeline</Text>
          <View style={{ marginTop: theme.spacing.sm }}>
            <LeaveTimeline events={timelineEvents} />
          </View>
        </View>

        {actionError ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <SecurityBanner tone="error" message={actionError} />
          </View>
        ) : null}

        {uiState === "loaded" ? (
          <View style={{ marginTop: theme.spacing.lg, gap: 8 }}>
            <Button
              label="Approve"
              fullWidth
              onPress={handleApprovePress}
              accessibilityHint="Opens a confirmation before approving this leave request"
            />
            <Button
              label="Reject"
              variant="danger"
              fullWidth
              onPress={handleRejectPress}
              accessibilityHint="Opens a confirmation before rejecting this leave request"
            />
          </View>
        ) : null}

        {uiState === "confirming_approval" ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <ConfirmationPanel
              title="Approve this leave request?"
              tone="primary"
              confirmLabel="Confirm approval"
              onCancel={handleCancelConfirm}
              onConfirm={() => handleConfirmDecision("approved")}
              bullets={[
                "This confirms you intend to approve the student's leave request.",
                "Secure biometric verification will be requested next, before the decision is submitted.",
                "Only confirm if you intend to approve.",
              ]}
            />
          </View>
        ) : null}

        {uiState === "confirming_rejection" ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <ConfirmationPanel
              title="Reject this leave request?"
              tone="danger"
              confirmLabel="Confirm rejection"
              onCancel={handleCancelConfirm}
              onConfirm={() => handleConfirmDecision("rejected")}
              bullets={[
                "This confirms you intend to reject the student's leave request.",
                "Secure biometric verification will be requested next, before the decision is submitted.",
                "Only confirm if you intend to reject.",
              ]}
            />
          </View>
        ) : null}

        {uiState === "preparing_verification" ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <ProcessingIndicator message="Preparing secure verification…" />
            {__DEV__ && usingFixture ? (
              <DevContinueButton
                label="[Dev] Continue → Processing"
                onPress={() =>
                  setUiState(
                    pendingDecision === "approved" ? "processing_approval" : "processing_rejection",
                  )
                }
              />
            ) : null}
          </View>
        ) : null}

        {uiState === "processing_approval" || uiState === "processing_rejection" ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <ProcessingIndicator
              message={
                uiState === "processing_approval"
                  ? "Submitting your approval…"
                  : "Submitting your decision…"
              }
            />
            {__DEV__ && usingFixture ? (
              <DevContinueButton
                label="[Dev] Continue → Success"
                onPress={() =>
                  setUiState(
                    uiState === "processing_approval" ? "approval_success" : "rejection_success",
                  )
                }
              />
            ) : null}
          </View>
        ) : null}

        {usingFixture ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <SecurityBanner
              tone="info"
              message="DEV ONLY — this screen is showing a local presentation fixture, not real data."
            />
          </View>
        ) : null}
      </ScrollView>
    </PageContainer>
  );
}

/** Dev-only manual state-advance control — never a timer, always an
 * explicit tap, matching this prompt's "no artificial delays" rule even for
 * this preview-only path. See `devFixtures.ts`'s isolation doc comment. */
function DevContinueButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Button label={label} variant="ghost" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  sectionTitle: { fontSize: 13, fontWeight: "600" },
});
