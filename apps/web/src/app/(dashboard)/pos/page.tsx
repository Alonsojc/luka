"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RefreshCw,
  DollarSign,
  ShoppingCart,
  Store,
  Clock,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMXN } from "@luka/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function fmtMXN(value: unknown): string {
  return formatMXN(safeNum(value));
}

function timeAgo(date: string | null | undefined): string {
  if (!date) return "—";
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "justo ahora";

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "justo ahora";
  if (mins < 60) return `hace ${mins} min`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} hora${hours > 1 ? "s" : ""}`;

  const days = Math.floor(hours / 24);
  return `hace ${days} día${days > 1 ? "s" : ""}`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BranchSyncStatus {
  branchId: string;
  branchName: string;
  branchCity: string;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  todaySalesCount: number;
  todaySalesTotal: number;
}

interface SalesSummaryBranch {
  branchId: string;
  branchName: string;
  sales: { paymentMethod: string; count: number; total: number }[];
  totalSales: number;
  totalCount: number;
}

interface SalesSummary {
  branches: SalesSummaryBranch[];
  grandTotal: number;
  grandCount: number;
}

interface PosSaleItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface PosSale {
  id: string;
  ticketNumber: string;
  branchId: string;
  branch: { id: string; name: string };
  saleDate: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  items: PosSaleItem[];
}

interface PosSyncLog {
  id: string;
  branchId: string;
  branch: { id: string; name: string };
  syncType: string;
  status: string;
  recordsSynced: number;
  recordsTotal: number;
  recordsFailed: number;
  durationMs: number;
  errorMessage: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: "sync", label: "Estado de Sync" },
  { key: "ventas", label: "Ventas del Día" },
  { key: "historial", label: "Historial de Sync" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const SYNC_STATUS_MAP: Record<string, { label: string; variant: string }> = {
  SUCCESS: { label: "Exitoso", variant: "green" },
  RUNNING: { label: "Ejecutando", variant: "blue" },
  FAILED: { label: "Fallido", variant: "red" },
  PENDING: { label: "Pendiente", variant: "yellow" },
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PosPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("sync");

  // ---- Sync tab state ----
  const [syncStatuses, setSyncStatuses] = useState<BranchSyncStatus[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncingBranch, setSyncingBranch] = useState<string | null>(null);

  // ---- Ventas tab state ----
  const [salesDate, setSalesDate] = useState(todayISO());
  const [salesBranchFilter, setSalesBranchFilter] = useState("");
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [salesList, setSalesList] = useState<PosSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesListLoading, setSalesListLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<PosSale | null>(null);
  const [saleModalOpen, setSaleModalOpen] = useState(false);

  // ---- Historial tab state ----
  const [logBranchFilter, setLogBranchFilter] = useState("");
  const [syncLogs, setSyncLogs] = useState<PosSyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // =======================================================================
  // Data fetching
  // =======================================================================

  const fetchSyncStatus = useCallback(async () => {
    setSyncLoading(true);
    try {
      const data = await authFetch<BranchSyncStatus[]>("get", "/corntech/sync/status");
      setSyncStatuses(data);
    } catch {
      /* handled by authFetch */
    } finally {
      setSyncLoading(false);
    }
  }, [authFetch]);

  const triggerSync = useCallback(
    async (branchId?: string) => {
      setSyncingBranch(branchId || "all");
      try {
        await authFetch("post", "/corntech/sync/sales", branchId ? { branchId } : undefined);
        await fetchSyncStatus();
      } catch {
        /* handled by authFetch */
      } finally {
        setSyncingBranch(null);
      }
    },
    [authFetch, fetchSyncStatus],
  );

  const fetchSalesSummary = useCallback(async () => {
    setSalesLoading(true);
    try {
      const data = await authFetch<SalesSummary>(
        "get",
        `/corntech/sales/summary?date=${salesDate}`,
      );
      setSalesSummary(data);
    } catch {
      /* handled by authFetch */
    } finally {
      setSalesLoading(false);
    }
  }, [authFetch, salesDate]);

  const fetchSalesList = useCallback(async () => {
    setSalesListLoading(true);
    try {
      const params = new URLSearchParams({ date: salesDate, limit: "50" });
      if (salesBranchFilter) params.set("branchId", salesBranchFilter);
      const data = await authFetch<PosSale[]>("get", `/corntech/sales/list?${params.toString()}`);
      setSalesList(data);
    } catch {
      /* handled by authFetch */
    } finally {
      setSalesListLoading(false);
    }
  }, [authFetch, salesDate, salesBranchFilter]);

  const fetchSyncLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (logBranchFilter) params.set("branchId", logBranchFilter);
      const data = await authFetch<PosSyncLog[]>("get", `/corntech/sync/logs?${params.toString()}`);
      setSyncLogs(data);
    } catch {
      /* handled by authFetch */
    } finally {
      setLogsLoading(false);
    }
  }, [authFetch, logBranchFilter]);

  // ---- Fetch on mount / tab change ----
  useEffect(() => {
    if (authLoading) return;
    if (activeTab === "sync") fetchSyncStatus();
  }, [authLoading, activeTab, fetchSyncStatus]);

  useEffect(() => {
    if (authLoading) return;
    if (activeTab === "ventas") {
      fetchSalesSummary();
      fetchSalesList();
    }
  }, [authLoading, activeTab, fetchSalesSummary, fetchSalesList]);

  useEffect(() => {
    if (authLoading) return;
    if (activeTab === "historial") fetchSyncLogs();
  }, [authLoading, activeTab, fetchSyncLogs]);

  // =======================================================================
  // Derived data
  // =======================================================================

  const kpiData = useMemo(() => {
    const totalSales = syncStatuses.reduce((sum, b) => sum + safeNum(b.todaySalesTotal), 0);
    const totalTx = syncStatuses.reduce((sum, b) => sum + safeNum(b.todaySalesCount), 0);

    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const activeBranches = syncStatuses.filter(
      (b) => b.lastSyncAt && new Date(b.lastSyncAt).getTime() > twoHoursAgo,
    ).length;

    const lastSync = syncStatuses.reduce<string | null>((latest, b) => {
      if (!b.lastSyncAt) return latest;
      if (!latest) return b.lastSyncAt;
      return new Date(b.lastSyncAt) > new Date(latest) ? b.lastSyncAt : latest;
    }, null);

    return { totalSales, totalTx, activeBranches, lastSync };
  }, [syncStatuses]);

  const branchOptions = useMemo(() => {
    return syncStatuses.map((b) => ({
      value: b.branchId,
      label: `${b.branchName} - ${b.branchCity}`,
    }));
  }, [syncStatuses]);

  const paymentBreakdown = useMemo(() => {
    if (!salesSummary) return [];
    const map: Record<string, number> = {};
    for (const branch of salesSummary.branches) {
      for (const sale of branch.sales) {
        const method = sale.paymentMethod || "OTHER";
        map[method] = (map[method] || 0) + sale.total;
      }
    }
    return Object.entries(map).map(([method, total]) => ({
      method,
      label: PAYMENT_LABELS[method] || method,
      total,
    }));
  }, [salesSummary]);

  // =======================================================================
  // Table columns
  // =======================================================================

  const syncColumns = useMemo(
    () => [
      {
        key: "branchName",
        header: "Sucursal",
        render: (row: BranchSyncStatus) => (
          <div>
            <span className="font-medium">{row.branchName}</span>
            <span className="ml-2 text-xs text-gray-400">{row.branchCity}</span>
          </div>
        ),
      },
      {
        key: "lastSyncAt",
        header: "Última Sync",
        render: (row: BranchSyncStatus) => (
          <span className="text-sm text-muted-foreground">{timeAgo(row.lastSyncAt)}</span>
        ),
      },
      {
        key: "lastSyncStatus",
        header: "Estado",
        render: (row: BranchSyncStatus) => {
          const status = SYNC_STATUS_MAP[row.lastSyncStatus] || SYNC_STATUS_MAP.PENDING;
          return <StatusBadge label={status.label} variant={status.variant as any} />;
        },
      },
      {
        key: "todaySalesCount",
        header: "Transacciones Hoy",
        render: (row: BranchSyncStatus) => safeNum(row.todaySalesCount).toLocaleString("es-MX"),
      },
      {
        key: "todaySalesTotal",
        header: "Ventas Hoy",
        render: (row: BranchSyncStatus) => fmtMXN(row.todaySalesTotal),
      },
      {
        key: "actions",
        header: "",
        sortable: false,
        render: (row: BranchSyncStatus) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              triggerSync(row.branchId);
            }}
            disabled={syncingBranch !== null}
          >
            {syncingBranch === row.branchId ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Sync
          </Button>
        ),
        className: "w-24",
      },
    ],
    [syncingBranch, triggerSync],
  );

  const salesColumns = useMemo(
    () => [
      {
        key: "ticketNumber",
        header: "Ticket #",
        render: (row: PosSale) => <span className="font-mono font-medium">{row.ticketNumber}</span>,
      },
      {
        key: "branch",
        header: "Sucursal",
        render: (row: PosSale) => row.branch?.name || "—",
      },
      {
        key: "saleDate",
        header: "Hora",
        render: (row: PosSale) => fmtTime(row.saleDate),
      },
      {
        key: "items",
        header: "Artículos",
        render: (row: PosSale) => safeNum(row.items?.length).toString(),
      },
      {
        key: "subtotal",
        header: "Subtotal",
        render: (row: PosSale) => fmtMXN(row.subtotal),
      },
      {
        key: "tax",
        header: "IVA",
        render: (row: PosSale) => fmtMXN(row.tax),
      },
      {
        key: "total",
        header: "Total",
        render: (row: PosSale) => <span className="font-medium">{fmtMXN(row.total)}</span>,
      },
      {
        key: "paymentMethod",
        header: "Método de Pago",
        render: (row: PosSale) => (
          <StatusBadge
            label={PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod}
            variant="gray"
          />
        ),
      },
    ],
    [],
  );

  const logColumns = useMemo(
    () => [
      {
        key: "createdAt",
        header: "Fecha / Hora",
        render: (row: PosSyncLog) => fmtDateTime(row.createdAt),
      },
      {
        key: "branch",
        header: "Sucursal",
        render: (row: PosSyncLog) => row.branch?.name || "—",
      },
      {
        key: "syncType",
        header: "Tipo",
        render: (row: PosSyncLog) => (
          <StatusBadge
            label={row.syncType}
            variant={
              row.syncType === "FULL" ? "purple" : row.syncType === "SALES" ? "blue" : "gray"
            }
          />
        ),
      },
      {
        key: "status",
        header: "Estado",
        render: (row: PosSyncLog) => {
          const status = SYNC_STATUS_MAP[row.status] || SYNC_STATUS_MAP.PENDING;
          return <StatusBadge label={status.label} variant={status.variant as any} />;
        },
      },
      {
        key: "records",
        header: "Registros",
        render: (row: PosSyncLog) => (
          <span className="text-sm">
            {safeNum(row.recordsSynced)}/{safeNum(row.recordsTotal)}
            {safeNum(row.recordsFailed) > 0 && (
              <span className="ml-1 text-red-500">({row.recordsFailed} err)</span>
            )}
          </span>
        ),
      },
      {
        key: "durationMs",
        header: "Duración",
        render: (row: PosSyncLog) => {
          const ms = safeNum(row.durationMs);
          if (ms < 1000) return `${ms}ms`;
          return `${(ms / 1000).toFixed(1)}s`;
        },
      },
      {
        key: "errorMessage",
        header: "Error",
        render: (row: PosSyncLog) =>
          row.errorMessage ? (
            <span
              className="text-xs text-red-500 truncate block max-w-[200px]"
              title={row.errorMessage}
            >
              {row.errorMessage}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  // =======================================================================
  // Handlers
  // =======================================================================

  const openSaleDetail = (sale: PosSale) => {
    setSelectedSale(sale);
    setSaleModalOpen(true);
  };

  // =======================================================================
  // Render
  // =======================================================================

  if (authLoading) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">POS Corntech</h1>
          <p className="text-sm text-gray-500 mt-1">Monitoreo en tiempo real del punto de venta</p>
        </div>
        {activeTab === "sync" && (
          <Button onClick={() => triggerSync()} disabled={syncingBranch !== null}>
            {syncingBranch === "all" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar Todo
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ================================================================= */}
      {/* Tab: Estado de Sync                                               */}
      {/* ================================================================= */}
      {activeTab === "sync" && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Total Ventas Hoy
                  </p>
                  <p className="text-2xl font-bold text-gray-900">{fmtMXN(kpiData.totalSales)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                  <ShoppingCart className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Transacciones Hoy
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {kpiData.totalTx.toLocaleString("es-MX")}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                  <Store className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Sucursales Activas
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {kpiData.activeBranches} / {syncStatuses.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Última Sincronización
                  </p>
                  <p className="text-2xl font-bold text-gray-900">{timeAgo(kpiData.lastSync)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Sync Status Table */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <DataTable
              columns={syncColumns}
              data={syncStatuses}
              loading={syncLoading}
              emptyMessage="No hay sucursales configuradas"
            />
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Tab: Ventas del Día                                               */}
      {/* ================================================================= */}
      {activeTab === "ventas" && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
                <input
                  type="date"
                  value={salesDate}
                  onChange={(e) => setSalesDate(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal</label>
                <select
                  value={salesBranchFilter}
                  onChange={(e) => setSalesBranchFilter(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                >
                  <option value="">Todas las sucursales</option>
                  {branchOptions.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          {salesLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400">
              Cargando resumen...
            </div>
          ) : salesSummary ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Total del Día
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {fmtMXN(salesSummary.grandTotal)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {safeNum(salesSummary.grandCount).toLocaleString("es-MX")} transacciones
                </p>
              </div>
              {paymentBreakdown.map((pm) => (
                <div key={pm.method} className="rounded-xl border border-gray-200 bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {pm.label}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{fmtMXN(pm.total)}</p>
                </div>
              ))}
            </div>
          ) : null}

          {/* Sales Table */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <DataTable
              columns={salesColumns}
              data={salesList}
              loading={salesListLoading}
              emptyMessage="No hay ventas para esta fecha"
              onRowClick={openSaleDetail}
            />
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Tab: Historial de Sync                                            */}
      {/* ================================================================= */}
      {activeTab === "historial" && (
        <div className="space-y-6">
          {/* Filter */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sucursal</label>
                <select
                  value={logBranchFilter}
                  onChange={(e) => setLogBranchFilter(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                >
                  <option value="">Todas las sucursales</option>
                  {branchOptions.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Logs Table */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <DataTable
              columns={logColumns}
              data={syncLogs}
              loading={logsLoading}
              emptyMessage="No hay registros de sincronización"
            />
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Modal: Sale Detail                                                */}
      {/* ================================================================= */}
      <Modal
        open={saleModalOpen}
        onClose={() => {
          setSaleModalOpen(false);
          setSelectedSale(null);
        }}
        title={`Ticket ${selectedSale?.ticketNumber || ""}`}
        wide
      >
        {selectedSale && (
          <div className="space-y-4">
            {/* Sale header info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Sucursal:</span>{" "}
                <span className="font-medium">{selectedSale.branch?.name}</span>
              </div>
              <div>
                <span className="text-gray-500">Fecha:</span>{" "}
                <span className="font-medium">{fmtDateTime(selectedSale.saleDate)}</span>
              </div>
              <div>
                <span className="text-gray-500">Método de Pago:</span>{" "}
                <StatusBadge
                  label={PAYMENT_LABELS[selectedSale.paymentMethod] || selectedSale.paymentMethod}
                  variant="gray"
                />
              </div>
              <div>
                <span className="text-gray-500">Total:</span>{" "}
                <span className="font-bold text-lg">{fmtMXN(selectedSale.total)}</span>
              </div>
            </div>

            {/* Items table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-2 font-medium text-gray-500">SKU</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Producto</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500">Cant.</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500">P. Unit.</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedSale.items || []).map((item, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{item.sku}</td>
                      <td className="px-4 py-2">{item.name}</td>
                      <td className="px-4 py-2 text-right">{safeNum(item.quantity)}</td>
                      <td className="px-4 py-2 text-right">{fmtMXN(item.unitPrice)}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmtMXN(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-gray-50">
                    <td colSpan={3} />
                    <td className="px-4 py-2 text-right text-gray-500">Subtotal</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {fmtMXN(selectedSale.subtotal)}
                    </td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td colSpan={3} />
                    <td className="px-4 py-2 text-right text-gray-500">IVA</td>
                    <td className="px-4 py-2 text-right font-medium">{fmtMXN(selectedSale.tax)}</td>
                  </tr>
                  <tr className="bg-gray-50 border-t">
                    <td colSpan={3} />
                    <td className="px-4 py-2 text-right font-bold">Total</td>
                    <td className="px-4 py-2 text-right font-bold text-lg">
                      {fmtMXN(selectedSale.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSaleModalOpen(false);
                  setSelectedSale(null);
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
