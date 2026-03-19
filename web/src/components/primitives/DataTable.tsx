// ─── DataTable ────────────────────────────────────────────────────────────────
// Generic typed table primitive. Pure presentational — no store or hook deps.

import React from 'react'

export interface DataTableColumn<T> {
  /** Key to access on the row object (used when `render` is absent) */
  key: string
  /** Column header label */
  header: string
  /** Optional custom renderer. If omitted, `row[column.key]` is rendered as-is. */
  render?: (row: T) => React.ReactNode
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  className?: string
  /** Shown when `rows` is empty. Defaults to "No data". */
  emptyMessage?: string
}

/**
 * Generic table component. Renders a compact, monospaced table with:
 * - bg-bg-secondary header row
 * - border-border row separators
 * - tabular-nums on cells for numeric alignment
 * - Empty-state row when rows.length === 0
 *
 * Usage:
 *   <DataTable<MyRow>
 *     columns={[{ key: 'name', header: 'Name' }, { key: 'cost', header: 'Cost', render: (r) => `$${r.cost.toFixed(2)}` }]}
 *     rows={myRows}
 *   />
 */
export function DataTable<T extends object>({
  columns,
  rows,
  className,
  emptyMessage = 'No data',
}: DataTableProps<T>) {
  return (
    <div className={['overflow-x-auto', className].filter(Boolean).join(' ')}>
      <table className="w-full font-mono text-xs border-collapse">
        <thead>
          <tr className="bg-bg-secondary">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-3 py-2 text-left text-text-secondary font-medium border-b border-border whitespace-nowrap"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-4 text-center text-text-secondary text-sm"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-border last:border-b-0 hover:bg-bg-secondary/50 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-3 py-2 text-text-primary tabular-nums"
                  >
                    {col.render
                      ? col.render(row)
                      : ((row as Record<string, unknown>)[col.key] as React.ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
