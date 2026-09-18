import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Table.module.css";

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage?: string;
  /** Optional per-row `<tr>` attributes (className, data-* attributes,
   * aria-current, etc.) — added for the Reception Leave Request Queue
   * (Prompt 7A), this table's first real business consumer, so a caller
   * can mark the currently-selected row without this primitive needing to
   * know what "selected" means for any particular feature. Omitting it
   * (every existing usage, none yet) preserves the exact previous
   * behavior — a plain `<tr>` with no extra attributes. */
  getRowProps?: (
    row: T,
  ) => HTMLAttributes<HTMLTableRowElement> & Partial<Record<`data-${string}`, string>>;
}

/** Reusable data-table primitive (Prompt 0.2 §16/§25) — a real `<table>`
 * with semantic headers, not a `<div>` grid (accessible tables, §26). No
 * pagination/virtualization implemented yet (Performance Strategy,
 * docs/reception-dashboard-architecture.md §23, notes this as a future
 * need once real data volume exists — none does yet). No business data
 * rendered by this foundation itself. */
export function Table<T>({ columns, rows, getRowKey, emptyMessage, getRowProps }: TableProps<T>) {
  if (rows.length === 0) {
    return <p className={styles.empty}>{emptyMessage ?? "No data."}</p>;
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} {...getRowProps?.(row)}>
              {columns.map((col) => (
                <td key={col.key}>{col.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
