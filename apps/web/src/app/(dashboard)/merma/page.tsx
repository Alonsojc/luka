"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  TrendingDown,
  DollarSign,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-field";
import { formatMXN } from "@luka/shared";

// ---------------------------------------------------------------------------
// Helpers – safe number coercion
// ---------------------------------------------------------------------------

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
}

interface WasteLog {
  id: string;
  branchId: string | null;
  productId: string;
  quantity: number | string;
  unit: string;
  reason: string;
  notes: string | null;
  cost: number | string | null;
  reportedAt: string;
  branch: { id: string; name: string; code: string } | null;
  product: { id: string; name: string; sku: string; unitOfMeasure: string };
  reporter: { id: string; firstName: string; lastName: string };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface WasteListResponse {
  data: WasteLog[];
  pagination: Pagination;
}

interface SummaryData {
  totalWaste: number;
  totalCost: number;
  byReason: { reason: string; quantity: number; cost: number }[];
  byBranch: {
    branchId: string;
    branchName: string;
    quantity: number;
    cost: number;
  }[];
  byProduct: {
    productId: string;
    productName: string;
    quantity: number;
    cost: number;
  }[];
  trend: { date: string; quantity: number; cost: number }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: "registro", label: "Registro de Merma" },
  { key: "dashboard", label: "Dashboard de Merma" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const REASON_OPTIONS = [
  { value: "SPOILAGE", label: "Caducidad" },
  { value: "OVER_PREP", label: "Sobre-preparacion" },
  { value: "ACCIDENT", label: "Accidente" },
  { value: "EXPIRED", label: "Merma natural" },
  { value: "OTHER", label: "Otro" },
];

const REASON_LABELS: Record<string, string> = {
  SPOILAGE: "Caducidad",
  OVER_PREP: "Sobre-preparacion",
  ACCIDENT: "Accidente",
  EXPIRED: "Merma natural",
  OTHER: "Otro",
};

const REASON_STYLES: Record<string, string> = {
  SPOILAGE: "bg-red-100 text-red-800",
  OVER_PREP: "bg-orange-100 text-orange-800",
  ACCIDENT: "bg-yellow-100 text-yellow-800",
  EXPIRED: "bg-purple-100 text-purple-800",
  OTHER: "bg-gray-100 text-gray-800",
};

const UNIT_OPTIONS = [
  { value: "kg", label: "Kilogramo (kg)" },
  { value: "g", label: "Gramo (g)" },
  { value: "lt", label: "Litro (lt)" },
  { value: "ml", label: "Mililitro (ml)" },
  { value: "pza", label: "Pieza (pza)" },
  { value: "paq", label: "Paquete (paq)" },
  { value: "caja", label: "Caja" },
];

const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#a855f7", "#6b7280"];

const BAR_COLORS = ["#000000", "#333333", "#555555", "#777777", "#999999", "#bbbbbb", "#dddddd"];

const EMPTY_FORM = {
  productId: "",
  branchId: "",
  quantity: "",
  unit: "kg",
  reason: "SPOILAGE",
  notes: "",
};

type MermaForm = typeof EMPTY_FORM;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

function fmtCurrency(v: number): string {
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${safeNum(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${safeNum(v / 1_000).toFixed(0)}k`;
  return fmtCurrency(v);
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function MermaPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("registro");

  // ---- Shared data (React Query) ----
  const { data: branches = [] } = useApiQuery<Branch[]>("/branches", ["branches"]);
  const { data: products = [] } = useApiQuery<Product[]>("/inventarios/products", [
    "merma-products",
  ]);

  // ---- Registro tab state ----
  const [filterBranch, setFilterBranch] = useState("");
  const [filterReason, setFilterReason] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Build waste logs query string
  const wasteQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("limit", "20");
    if (filterBranch) params.set("branchId", filterBranch);
    if (filterReason) params.set("reason", filterReason);
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);
    if (searchTerm) params.set("search", searchTerm);
    return params.toString();
  }, [currentPage, filterBranch, filterReason, filterDateFrom, filterDateTo, searchTerm]);

  // Waste logs (React Query)
  const { data: wasteResponse, isLoading: listLoading } = useApiQuery<WasteListResponse>(
    `/merma?${wasteQueryString}`,
    ["merma-logs", wasteQueryString],
    { enabled: activeTab === "registro" },
  );
  const wasteLogs = wasteResponse?.data ?? [];
  const pagination = wasteResponse?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 };

  // ---- Modal state ----
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<MermaForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // ---- Delete state ----
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ---- Dashboard tab state (React Query) ----
  const [dashBranch, setDashBranch] = useState("");

  const summaryQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (dashBranch) params.set("branchId", dashBranch);
    return params.toString();
  }, [dashBranch]);

  const { data: summary, isLoading: summaryLoading } = useApiQuery<SummaryData>(
    `/merma/summary?${summaryQueryString}`,
    ["merma-summary", summaryQueryString],
    { enabled: activeTab === "dashboard" },
  );

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterBranch, filterReason, filterDateFrom, filterDateTo, searchTerm]);

  // =======================================================================
  // Handlers
  // =======================================================================

  const handleCreate = async () => {
    if (!form.productId || !form.quantity) return;
    setSaving(true);
    try {
      await authFetch("post", "/merma", {
        productId: form.productId,
        branchId: form.branchId || undefined,
        quantity: parseFloat(form.quantity),
        unit: form.unit,
        reason: form.reason,
        notes: form.notes || undefined,
      });
      setModalOpen(false);
      setForm({ ...EMPTY_FORM });
      queryClient.invalidateQueries({ queryKey: ["merma-logs"] });
    } catch {
      /* handled by authFetch */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await authFetch("delete", `/merma/${deletingId}`);
      setDeleteConfirmOpen(false);
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ["merma-logs"] });
    } catch {
      /* handled by authFetch */
    }
  };

  const openDelete = (id: string) => {
    setDeletingId(id);
    setDeleteConfirmOpen(true);
  };

  // =======================================================================
  // Derived data for dashboard
  // =======================================================================

  const avgDailyWaste = useMemo(() => {
    if (!summary || summary.trend.length === 0) return 0;
    return summary.totalWaste / summary.trend.length;
  }, [summary]);

  const topProduct = useMemo(() => {
    if (!summary || summary.byProduct.length === 0) return null;
    return summary.byProduct[0];
  }, [summary]);

  const pieData = useMemo(() => {
    if (!summary) return [];
    return summary.byReason.map((r) => ({
      name: REASON_LABELS[r.reason] || r.reason,
      value: r.quantity,
      cost: r.cost,
    }));
  }, [summary]);

  const trendData = useMemo(() => {
    if (!summary) return [];
    return summary.trend.map((t) => ({
      ...t,
      label: fmtShortDate(t.date),
    }));
  }, [summary]);

  // =======================================================================
  // Table columns
  // =======================================================================

  const columns = useMemo(
    () => [
      {
        key: "reportedAt",
        header: "Fecha",
        render: (row: WasteLog) => fmtDate(row.reportedAt),
      },
      {
        key: "branch",
        header: "Sucursal",
        render: (row: WasteLog) => row.branch?.name || "-",
      },
      {
        key: "product",
        header: "Producto",
        render: (row: WasteLog) => (
          <div>
            <span className="font-medium">{row.product.name}</span>
            <span className="ml-2 text-xs text-gray-400">{row.product.sku}</span>
          </div>
        ),
      },
      {
        key: "quantity",
        header: "Cantidad",
        render: (row: WasteLog) => `${safeNum(row.quantity).toFixed(2)} ${row.unit}`,
      },
      {
        key: "reason",
        header: "Razon",
        render: (row: WasteLog) => (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${REASON_STYLES[row.reason] || REASON_STYLES.OTHER}`}
          >
            {REASON_LABELS[row.reason] || row.reason}
          </span>
        ),
      },
      {
        key: "cost",
        header: "Costo",
        render: (row: WasteLog) => (row.cost !== null ? fmtCurrency(safeNum(row.cost)) : "-"),
      },
      {
        key: "reporter",
        header: "Reportado por",
        render: (row: WasteLog) => `${row.reporter.firstName} ${row.reporter.lastName}`,
      },
      {
        key: "actions",
        header: "",
        render: (row: WasteLog) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openDelete(row.id);
            }}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ),
        className: "w-10",
      },
    ],
    [],
  );

  // =======================================================================
  // Render
  // =======================================================================

  if (authLoading) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Merma</h1>
          <p className="text-sm text-gray-500 mt-1">Control y seguimiento de merma por sucursal</p>
        </div>
        {activeTab === "registro" && (
          <Button
            onClick={() => {
              setForm({ ...EMPTY_FORM });
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Registrar Merma
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

      {/* Tab: Registro de Merma */}
      {activeTab === "registro" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar producto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <select
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
              >
                <option value="">Todas las sucursales</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select
                value={filterReason}
                onChange={(e) => setFilterReason(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
              >
                <option value="">Todas las razones</option>
                {REASON_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Desde"
              />
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Hasta"
              />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <DataTable
              columns={columns}
              data={wasteLogs}
              loading={listLoading}
              emptyMessage="No hay registros de merma"
            />

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                <p className="text-sm text-gray-500">
                  {pagination.total} registros &middot; Pagina {pagination.page} de{" "}
                  {pagination.totalPages}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={pagination.page <= 1}
                    className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Dashboard de Merma */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Dashboard branch filter */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <select
              value={dashBranch}
              onChange={(e) => setDashBranch(e.target.value)}
              className="w-full max-w-xs rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {summaryLoading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-400">
              Cargando datos...
            </div>
          ) : summary ? (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                      <TrendingDown className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Total Merma
                      </p>
                      <p className="text-2xl font-bold text-gray-900">
                        {safeNum(summary.totalWaste).toFixed(2)} kg
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
                      <DollarSign className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Costo Total
                      </p>
                      <p className="text-2xl font-bold text-gray-900">
                        {fmtCompact(summary.totalCost)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50">
                      <BarChart3 className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Promedio Diario
                      </p>
                      <p className="text-2xl font-bold text-gray-900">
                        {safeNum(avgDailyWaste).toFixed(2)} kg
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                      <AlertTriangle className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Top Producto
                      </p>
                      <p className="text-lg font-bold text-gray-900 truncate">
                        {topProduct?.productName || "-"}
                      </p>
                      {topProduct && (
                        <p className="text-xs text-gray-500">
                          {safeNum(topProduct.quantity).toFixed(2)} kg
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts Row 1 */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Bar chart: by reason */}
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <h3 className="mb-4 text-sm font-semibold text-gray-900">Merma por Razon</h3>
                  {summary.byReason.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={summary.byReason.map((r) => ({
                          name: REASON_LABELS[r.reason] || r.reason,
                          quantity: r.quantity,
                          cost: r.cost,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} />
                        <YAxis tick={{ fontSize: 12 }} axisLine={false} />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            name === "cost"
                              ? fmtCurrency(value)
                              : `${safeNum(value).toFixed(2)} kg`,
                            name === "cost" ? "Costo" : "Cantidad",
                          ]}
                        />
                        <Bar
                          dataKey="quantity"
                          fill="#000000"
                          radius={[4, 4, 0, 0]}
                          name="Cantidad"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-12 text-center text-sm text-gray-400">Sin datos</p>
                  )}
                </div>

                {/* Bar chart: by branch */}
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <h3 className="mb-4 text-sm font-semibold text-gray-900">Merma por Sucursal</h3>
                  {summary.byBranch.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={summary.byBranch}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="branchName" tick={{ fontSize: 11 }} axisLine={false} />
                        <YAxis tick={{ fontSize: 12 }} axisLine={false} />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            name === "cost"
                              ? fmtCurrency(value)
                              : `${safeNum(value).toFixed(2)} kg`,
                            name === "cost" ? "Costo" : "Cantidad",
                          ]}
                        />
                        <Bar dataKey="quantity" name="Cantidad" radius={[4, 4, 0, 0]}>
                          {summary.byBranch.map((_, i) => (
                            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-12 text-center text-sm text-gray-400">Sin datos</p>
                  )}
                </div>
              </div>

              {/* Charts Row 2 */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Line chart: trend */}
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <h3 className="mb-4 text-sm font-semibold text-gray-900">
                    Tendencia (ultimos 30 dias)
                  </h3>
                  {trendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} />
                        <YAxis tick={{ fontSize: 12 }} axisLine={false} />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            name === "cost"
                              ? fmtCurrency(value)
                              : `${safeNum(value).toFixed(2)} kg`,
                            name === "cost" ? "Costo" : "Cantidad",
                          ]}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="quantity"
                          stroke="#000000"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          name="Cantidad (kg)"
                        />
                        <Line
                          type="monotone"
                          dataKey="cost"
                          stroke="#999999"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          name="Costo ($)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-12 text-center text-sm text-gray-400">Sin datos</p>
                  )}
                </div>

                {/* Pie chart: distribution by reason */}
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <h3 className="mb-4 text-sm font-semibold text-gray-900">
                    Distribucion por Razon
                  </h3>
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          dataKey="value"
                          label={({ name, percent }) =>
                            `${name} ${(safeNum(percent) * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [
                            `${safeNum(value).toFixed(2)} kg`,
                            "Cantidad",
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-12 text-center text-sm text-gray-400">Sin datos</p>
                  )}
                </div>
              </div>

              {/* Top products table */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h3 className="mb-4 text-sm font-semibold text-gray-900">
                  Top 10 Productos con Mayor Merma
                </h3>
                {summary.byProduct.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                            #
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                            Producto
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                            Cantidad (kg)
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                            Costo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.byProduct.map((p, i) => (
                          <tr key={p.productId} className="border-b last:border-0">
                            <td className="px-4 py-2.5 text-sm text-gray-500">{i + 1}</td>
                            <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                              {p.productName}
                            </td>
                            <td className="px-4 py-2.5 text-right text-sm text-gray-700">
                              {safeNum(p.quantity).toFixed(2)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-sm text-gray-700">
                              {fmtCurrency(p.cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-gray-400">Sin datos</p>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-400">
              No se pudieron cargar los datos del dashboard
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Waste Log */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Registrar Merma">
        <div className="space-y-4">
          <FormField label="Producto" required>
            <Select
              value={form.productId}
              onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
            >
              <option value="">Seleccionar producto</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Sucursal">
            <Select
              value={form.branchId}
              onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
            >
              <option value="">Sin sucursal</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Cantidad" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Unidad">
              <Select
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Razon" required>
            <Select
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            >
              {REASON_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Notas">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Observaciones adicionales..."
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving || !form.productId || !form.quantity}>
              {saving ? "Guardando..." : "Registrar"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Delete Confirmation */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Eliminar Registro"
      >
        <p className="text-sm text-gray-600 mb-6">
          Esta seguro de que desea eliminar este registro de merma? Esta accion no se puede
          deshacer.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
