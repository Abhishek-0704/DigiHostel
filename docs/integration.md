# Cross-Application Integration Reference

The system must preserve shared authoritative state across:
- Parent ↔ Reception
- Reception ↔ Library
- Parent ↔ shared leave state
- Notifications/escalation
- Audit/observability
- Realtime/events
- End-to-end leave workflow
- End-to-end library workflow
- Failure/recovery/offline workflows

Do not create competing copies of authoritative leave or library-session state.

Cross-application changes must consider all affected producers, consumers, API contracts, realtime subscriptions, audit events and recovery behavior.
