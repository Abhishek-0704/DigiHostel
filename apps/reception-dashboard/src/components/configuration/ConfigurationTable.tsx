import { Table, EmptyState, ErrorState, Skeleton, StatusBadge } from "../ui";
import type { TableColumn } from "../ui";
import { configurationDomainLabel } from "./ConfigurationDomainLabel";
import type { ConfigurationEntry } from "@digihostel/api-client-react";
import styles from "./ConfigurationTable.module.css";

export interface ConfigurationTableProps {
  items: ConfigurationEntry[];
  activeId: string | null;
  onOpen: (id: string) => void;
  loading?: boolean;
  error?: { message: string; onRetry?: () => void };
  emptyTitle: string;
  emptyDescription?: string;
}

function formatValuePreview(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Enterprise Configuration Center directory table (Phase 5, Prompt 14) —
 * built on the existing `Table` primitive, mirroring `StaffTable`'s/
 * `AuditTable`'s exact loading/error/empty conventions.
 */
export function ConfigurationTable({
  items,
  activeId,
  onOpen,
  loading,
  error,
  emptyTitle,
  emptyDescription,
}: ConfigurationTableProps) {
  if (loading) {
    return (
      <div className={styles.skeletons} aria-busy="true" aria-label="Loading configuration entries">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonRow}>
            <Skeleton height={14} width="30%" />
            <Skeleton height={12} width="60%" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={error.onRetry} />;
  }

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const columns: TableColumn<ConfigurationEntry>[] = [
    {
      key: "key",
      header: "Key",
      render: (item) => (
        <div className={styles.keyCell}>
          <span className={styles.keyText}>{item.key}</span>
          <span className={styles.meta}>{configurationDomainLabel(item.domain)}</span>
        </div>
      ),
    },
    {
      key: "value",
      header: "Value",
      render: (item) => <span className={styles.valueText}>{formatValuePreview(item.value)}</span>,
    },
    {
      key: "scope",
      header: "Scope",
      render: (item) => (
        <span>{item.scope === "global" ? "Global" : (item.hostelName ?? "Hostel-scoped")}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item) =>
        item.isActive ? (
          <StatusBadge label="Active" tone="success" />
        ) : (
          <StatusBadge label="Inactive" tone="neutral" />
        ),
    },
    {
      key: "updated",
      header: "Last Updated",
      render: (item) => (
        <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString()}</time>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <button type="button" className={styles.viewButton} onClick={() => onOpen(item.id)}>
          Manage
        </button>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={items}
      getRowKey={(item) => item.id}
      getRowProps={(item) => ({
        "data-configuration-id": item.id,
        "aria-selected": item.id === activeId,
      })}
    />
  );
}
