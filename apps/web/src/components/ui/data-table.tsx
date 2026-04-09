"use client";

import { useState, useMemo } from "react";
import { Search, Download, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { Skeleton } from "./skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Column<T> {
  key: string;
  /** Display label for the column header. Falls back to `header` if not provided. */
  label?: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
  /** @deprecated Use `label` instead. Kept for backward compatibility. */
  header?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  onExport?: () => void;
  exportLabel?: string;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the display label from either `label` or legacy `header` field. */
function colLabel<T>(col: Column<T>): string {
  return col.label || col.header || col.key;
}

/** Get a cell's raw string value for search/sort. */
function getCellValue<T extends Record<string, any>>(row: T, key: string): string {
  const val = row[key];
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <div className="border rounded-lg overflow-hidden border-border bg-card">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-24 ml-auto" />
      </div>
      {/* Header */}
      <div className="hidden md:flex items-center gap-4 bg-muted/50 px-4 py-3 border-b border-border">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-4 border-b border-border last:border-b-0"
        >
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  searchable = false,
  searchPlaceholder = "Buscar...",
  pageSize = 10,
  onExport,
  exportLabel = "Exportar",
  loading = false,
  emptyMessage = "No hay datos",
  onRowClick,
}: DataTableProps<T>) {
  // --- state ---------------------------------------------------------------
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  // --- search --------------------------------------------------------------
  const filtered = useMemo(() => {
    if (loading || !search.trim()) return data;
    const term = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => getCellValue(row, col.key).toLowerCase().includes(term)),
    );
  }, [data, search, columns, loading]);

  // --- sort ----------------------------------------------------------------
  const sorted = useMemo(() => {
    if (loading || !sortKey) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const aVal = getCellValue(a, sortKey);
      const bVal = getCellValue(b, sortKey);
      // Try numeric comparison
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDir === "asc" ? aNum - bNum : bNum - aNum;
      }
      // Fallback to locale string comparison
      const cmp = aVal.localeCompare(bVal, "es-MX", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir, loading]);

  // --- loading state (AFTER all hooks to avoid hook count mismatch) --------
  if (loading) {
    return <TableSkeleton columns={columns.length} />;
  }

  // --- pagination ----------------------------------------------------------
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Reset to page 1 when data changes and current page is out of bounds
  const safePage = currentPage > totalPages ? 1 : currentPage;
  const pageData = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  // --- handlers ------------------------------------------------------------
  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setCurrentPage(1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setCurrentPage(1);
  }

  // --- sort arrow indicator ------------------------------------------------
  function SortIndicator({ colKey }: { colKey: string }) {
    if (sortKey !== colKey) {
      return (
        <span className="ml-1 inline-flex flex-col text-muted-foreground/40">
          <ChevronUp className="h-3 w-3 -mb-0.5" />
          <ChevronDown className="h-3 w-3 -mt-0.5" />
        </span>
      );
    }
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 h-3.5 w-3.5 text-foreground" />
    ) : (
      <ChevronDown className="ml-1 h-3.5 w-3.5 text-foreground" />
    );
  }

  // --- empty state ---------------------------------------------------------
  if (data.length === 0 && !search) {
    return (
      <div className="border rounded-lg border-border bg-card">
        {/* Toolbar even when empty, so export still shows */}
        {(searchable || onExport) && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            {searchable && <div className="flex-1" />}
            {onExport && (
              <button
                onClick={onExport}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                <Download className="h-4 w-4" />
                {exportLabel}
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Inbox className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Render
  // =========================================================================
  return (
    <div className="border rounded-lg border-border bg-card overflow-hidden">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      {(searchable || onExport) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-4 py-3 border-b border-border">
          {searchable && (
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
          {onExport && (
            <button
              onClick={onExport}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              {exportLabel}
            </button>
          )}
        </div>
      )}

      {/* ── Desktop: standard table (hidden below md) ──────────────────────── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {columns.map((col) => {
                const isSortable = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    className={`text-left text-sm font-medium text-muted-foreground px-4 py-3 select-none ${
                      isSortable ? "cursor-pointer hover:text-foreground transition-colors" : ""
                    } ${col.className || ""}`}
                    onClick={isSortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center">
                      {colLabel(col)}
                      {isSortable && <SortIndicator colKey={col.key} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-6 w-6 opacity-40" />
                    <p className="text-sm">Sin resultados para &ldquo;{search}&rdquo;</p>
                  </div>
                </td>
              </tr>
            ) : (
              pageData.map((row, i) => (
                <tr
                  key={(row as any).id || `${safePage}-${i}`}
                  className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${
                    onRowClick ? "cursor-pointer" : ""
                  }`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-sm ${col.className || ""}`}>
                      {col.render ? col.render(row) : (row as any)[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: card layout (visible below md) ────────────────────────── */}
      <div className="md:hidden divide-y divide-border">
        {pageData.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Search className="h-6 w-6 opacity-40" />
            <p className="text-sm">Sin resultados para &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          pageData.map((row, i) => (
            <div
              key={(row as any).id || `${safePage}-${i}`}
              className={`px-4 py-3 space-y-1.5 ${
                onRowClick ? "cursor-pointer active:bg-muted/40" : ""
              }`}
              onClick={() => onRowClick?.(row)}
            >
              {/* First column as card title */}
              <div className="text-sm font-semibold text-foreground truncate">
                {columns[0]?.render
                  ? columns[0].render(row)
                  : (row as any)[columns[0]?.key]}
              </div>
              {/* Remaining columns as label: value */}
              {columns.slice(1).map((col) => (
                <div key={col.key} className="flex items-start justify-between gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">
                    {colLabel(col)}
                  </span>
                  <span className="text-sm text-foreground text-right truncate">
                    {col.render ? col.render(row) : (row as any)[col.key]}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {sorted.length > pageSize && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {(safePage - 1) * pageSize + 1}
            &ndash;
            {Math.min(safePage * pageSize, sorted.length)} de {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {/* Page numbers */}
            {Array.from({ length: totalPages }, (_, idx) => idx + 1)
              .filter((p) => {
                // Show first, last, and nearby pages
                if (p === 1 || p === totalPages) return true;
                if (Math.abs(p - safePage) <= 1) return true;
                return false;
              })
              .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                  acc.push("ellipsis");
                }
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "ellipsis" ? (
                  <span key={`e-${idx}`} className="px-1 text-xs text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item as number)}
                    className={`h-8 min-w-[2rem] rounded-md px-2 text-xs font-medium transition-colors ${
                      safePage === item
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
