"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Timer,
  AlertTriangle,
  Package,
  Calendar,
  Trash2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  DollarSign,
  BarChart3,
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
import { useAuth } from "@/hooks/use-auth";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-field";
import { formatMXN } from "@luka/shared";

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

interface Supplier {
  id: string;
  name: string;
}

interface ProductLot {
  id: string;
  lotNumber: string;
  batchDate: string | null;
  expirationDate: string;
  quantity: number | string;
  initialQuantity: number | string;
  unitCost: number | string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string; unitOfMeasure: string };
  branch: { id: string; name: string; code: string };
  supplier: { id: string; name: string } | null;
  receivedBy: { id: string; firstName: string; lastName: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface LotListResponse {
  data: ProductLot[];
  pagination: Pagination;
}

interface ExpiringAlerts {
  critical: { count: number; lots: ProductLot[] };
  warning: { count: number; lots: ProductLot[] };
  upcoming: { count: number; lots: ProductLot[] };
  total: number;
}

interface SummaryData {
  activeLots: number;
  expiredLots: number;
  expiringThisWeek: number;
  valueAtRisk: number;
  byBranch: {
    branchId: string;
    branchName: string;
    expired: number;
    expiringSoon: number;
  }[];
  byProduct: {
    productId: string;
    productName: string;
    lotCount: number;
    totalQuantity: number;
  }[];
  statusDistribution: { status: string; count: number }[];
  fifoCompliance: number;
  trend: { date: string; expired: number; disposed: number; consumed: number }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: "activos", label: "Lotes Activos" },
  { key: "alertas", label: "Alertas de Caducidad" },
  { key: "dashboard", label: "Dashboard" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  LOW: "Bajo",
  EXPIRED: "Vencido",
  CONSUMED: "Consumido",
  DISPOSED: "Descartado",
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  LOW: "bg-yellow-100 text-yellow-800",
  EXPIRED: "bg-red-100 text-red-800",
  CONSUMED: "bg-gray-100 text-gray-800",
  DISPOSED: "bg-purple-100 text-purple-800",
};

const PIE_COLORS = ["#22c55e", "#eab308", "#ef4444", "#9ca3af", "#a855f7"];

const STATUS_PIE_ORDER = ["ACTIVE", "LOW", "EXPIRED", "CONSUMED", "DISPOSED"];

const _BAR_COLORS = ["#000000", "#333333", "#555555", "#777777", "#999999", "#bbbbbb"];

const EMPTY_FORM = {
  productId: "",
  branchId: "",
  lotNumber: "",
  batchDate: "",
  expirationDate: "",
  quantity: "",
  unitCost: "",
  supplierId: "",
  notes: "",
};

type LotForm = typeof EMPTY_FORM;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

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

function getDaysRemaining(expirationDate: string): number {
  const now = new Date();
  const exp = new Date(expirationDate);
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getExpiryColor(days: number): string {
  if (days <= 0) return "text-red-700 bg-red-50";
  if (days <= 2) return "text-red-600 bg-red-50";
  if (days <= 5) return "text-orange-600 bg-orange-50";
  if (days <= 7) return "text-yellow-600 bg-yellow-50";
  return "text-green-600 bg-green-50";
}

function getExpiryBadge(days: number): { label: string; className: string } {
  if (days <= 0) return { label: "VENCIDO", className: "bg-red-600 text-white" };
  if (days <= 2) return { label: `${days}d`, className: "bg-red-500 text-white" };
  if (days <= 5) return { label: `${days}d`, className: "bg-orange-500 text-white" };
  if (days <= 7) return { label: `${days}d`, className: "bg-yellow-500 text-white" };
  return { label: `${days}d`, className: "bg-green-100 text-green-800" };
}

function fmtCompact(v: number): string {
  const val = safeNum(v);
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
  return formatMXN(val);
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function LotesPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("activos");

  // ---- Shared data ----
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // ---- Activos tab state ----
  const [lots, setLots] = useState<ProductLot[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [listLoading, setListLoading] = useState(false);
  const [filterBranch, setFilterBranch] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterExpiring, setFilterExpiring] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabKey | null;
    if (tab && TABS.some((item) => item.key === tab)) {
      setActiveTab(tab);
    }
    setSearchTerm(params.get("search") || "");
    setFilterBranch(params.get("branchId") || "");
    setFilterProduct(params.get("productId") || "");
    setFilterStatus(params.get("status") || "");
    setCurrentPage(1);
  }, []);

  // ---- Create lot modal ----
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<LotForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // ---- Consume modal ----
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [consumeLot, setConsumeLot] = useState<ProductLot | null>(null);
  const [consumeQty, setConsumeQty] = useState("");

  // ---- Dispose modal ----
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [disposeLot, setDisposeLot] = useState<ProductLot | null>(null);
  const [disposeReason, setDisposeReason] = useState("");

  // ---- Alertas tab state ----
  const [alerts, setAlerts] = useState<ExpiringAlerts | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertBranch, setAlertBranch] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>("critical");

  // ---- Dashboard tab state ----
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // =======================================================================
  // Data-fetching
  // =======================================================================

  const fetchBranches = useCallback(async () => {
    try {
      const data = await authFetch<Branch[]>("get", "/branches");
      setBranches(data);
    } catch {
      /* handled by authFetch */
    }
  }, [authFetch]);

  const fetchProducts = useCallback(async () => {
    try {
      const data = await authFetch<Product[]>("get", "/inventarios/products");
      setProducts(
        data.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          unitOfMeasure: p.unitOfMeasure,
        })),
      );
    } catch {
      /* handled by authFetch */
    }
  }, [authFetch]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const data = await authFetch<Supplier[]>("get", "/compras/suppliers");
      setSuppliers(data.map((s) => ({ id: s.id, name: s.name })));
    } catch {
      /* handled by authFetch */
    }
  }, [authFetch]);

  const fetchLots = useCallback(async () => {
    setListLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "20");
      if (filterBranch) params.set("branchId", filterBranch);
      if (filterProduct) params.set("productId", filterProduct);
      if (filterStatus) params.set("status", filterStatus);
      if (filterExpiring) params.set("expiringWithin", filterExpiring);
      if (searchTerm) params.set("search", searchTerm);

      const res = await authFetch<LotListResponse>("get", `/inventarios/lots?${params.toString()}`);
      setLots(res.data);
      setPagination(res.pagination);
    } catch {
      /* handled by authFetch */
    } finally {
      setListLoading(false);
    }
  }, [
    authFetch,
    currentPage,
    filterBranch,
    filterProduct,
    filterStatus,
    filterExpiring,
    searchTerm,
  ]);

  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const params = new URLSearchParams();
      if (alertBranch) params.set("branchId", alertBranch);
      const res = await authFetch<ExpiringAlerts>(
        "get",
        `/inventarios/lots/expiring?${params.toString()}`,
      );
      setAlerts(res);
    } catch {
      /* handled by authFetch */
    } finally {
      setAlertsLoading(false);
    }
  }, [authFetch, alertBranch]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await authFetch<SummaryData>("get", "/inventarios/lots/summary");
      setSummary(res);
    } catch {
      /* handled by authFetch */
    } finally {
      setSummaryLoading(false);
    }
  }, [authFetch]);

  // ---- Initial load ----
  useEffect(() => {
    if (!authLoading) {
      fetchBranches();
      fetchProducts();
      fetchSuppliers();
    }
  }, [authLoading, fetchBranches, fetchProducts, fetchSuppliers]);

  // ---- Tab-dependent load ----
  useEffect(() => {
    if (authLoading) return;
    if (activeTab === "activos") fetchLots();
    else if (activeTab === "alertas") fetchAlerts();
    else if (activeTab === "dashboard") fetchSummary();
  }, [activeTab, authLoading, fetchLots, fetchAlerts, fetchSummary]);

  // =======================================================================
  // Actions
  // =======================================================================

  const handleCreateLot = async () => {
    if (!form.productId || !form.branchId || !form.expirationDate || !form.quantity) return;
    setSaving(true);
    try {
      await authFetch("post", "/inventarios/lots", {
        productId: form.productId,
        branchId: form.branchId,
        lotNumber: form.lotNumber || undefined,
        batchDate: form.batchDate || undefined,
        expirationDate: form.expirationDate,
        quantity: parseFloat(form.quantity),
        unitCost: form.unitCost ? parseFloat(form.unitCost) : undefined,
        supplierId: form.supplierId || undefined,
        notes: form.notes || undefined,
      });
      setForm({ ...EMPTY_FORM });
      setCreateOpen(false);
      fetchLots();
    } catch {
      /* handled by authFetch */
    } finally {
      setSaving(false);
    }
  };

  const handleConsume = async () => {
    if (!consumeLot || !consumeQty) return;
    setSaving(true);
    try {
      await authFetch("post", `/inventarios/lots/${consumeLot.id}/consume`, {
        quantity: parseFloat(consumeQty),
      });
      setConsumeOpen(false);
      setConsumeLot(null);
      setConsumeQty("");
      fetchLots();
    } catch {
      /* handled by authFetch */
    } finally {
      setSaving(false);
    }
  };

  const handleDispose = async () => {
    if (!disposeLot) return;
    setSaving(true);
    try {
      await authFetch("post", `/inventarios/lots/${disposeLot.id}/dispose`, {
        reason: disposeReason || "Descartado manualmente",
      });
      setDisposeOpen(false);
      setDisposeLot(null);
      setDisposeReason("");
      fetchLots();
      if (activeTab === "alertas") fetchAlerts();
    } catch {
      /* handled by authFetch */
    } finally {
      setSaving(false);
    }
  };

  const handleAutoExpire = async () => {
    setSaving(true);
    try {
      const res = await authFetch<{ expired: number }>("post", "/inventarios/lots/auto-expire", {});
      alert(`Se marcaron ${res.expired} lotes como vencidos`);
      fetchAlerts();
      if (activeTab === "activos") fetchLots();
    } catch {
      /* handled by authFetch */
    } finally {
      setSaving(false);
    }
  };

  // =======================================================================
  // Columns for DataTable
  // =======================================================================

  const lotColumns = useMemo(
    () => [
      {
        key: "lotNumber",
        header: "Lote #",
        render: (row: ProductLot) => <span className="font-mono text-xs">{row.lotNumber}</span>,
      },
      {
        key: "product",
        header: "Producto",
        render: (row: ProductLot) => (
          <div>
            <div className="font-medium">{row.product.name}</div>
            <div className="text-xs text-gray-500">{row.product.sku}</div>
          </div>
        ),
      },
      {
        key: "branch",
        header: "Sucursal",
        render: (row: ProductLot) => row.branch.name,
      },
      {
        key: "quantity",
        header: "Cantidad",
        render: (row: ProductLot) => (
          <span>
            {safeNum(row.quantity).toFixed(2)} {row.product.unitOfMeasure}
          </span>
        ),
      },
      {
        key: "batchDate",
        header: "Recepcion",
        render: (row: ProductLot) => (row.batchDate ? fmtDate(row.batchDate) : "-"),
      },
      {
        key: "expirationDate",
        header: "Caducidad",
        render: (row: ProductLot) => {
          const days = getDaysRemaining(row.expirationDate);
          return (
            <div
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${getExpiryColor(days)}`}
            >
              <Calendar className="h-3 w-3" />
              <span className="text-xs font-medium">{fmtDate(row.expirationDate)}</span>
            </div>
          );
        },
      },
      {
        key: "daysRemaining",
        header: "Dias",
        render: (row: ProductLot) => {
          const days = getDaysRemaining(row.expirationDate);
          const badge = getExpiryBadge(days);
          return (
            <span
              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold ${badge.className}`}
            >
              {badge.label}
            </span>
          );
        },
      },
      {
        key: "supplier",
        header: "Proveedor",
        render: (row: ProductLot) => row.supplier?.name || "-",
      },
      {
        key: "status",
        header: "Estado",
        render: (row: ProductLot) => (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[row.status] || "bg-gray-100 text-gray-800"}`}
          >
            {STATUS_LABELS[row.status] || row.status}
          </span>
        ),
      },
      {
        key: "actions",
        header: "",
        render: (row: ProductLot) => {
          if (row.status !== "ACTIVE" && row.status !== "LOW" && row.status !== "EXPIRED")
            return null;
          return (
            <div className="flex items-center gap-1">
              {(row.status === "ACTIVE" || row.status === "LOW") && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConsumeLot(row);
                    setConsumeQty("");
                    setConsumeOpen(true);
                  }}
                  className="rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  Consumir
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDisposeLot(row);
                  setDisposeReason("");
                  setDisposeOpen(true);
                }}
                className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
              >
                Descartar
              </button>
            </div>
          );
        },
      },
    ],
    [],
  );

  // =======================================================================
  // Render
  // =======================================================================

  if (authLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Control de Lotes y Caducidad</h1>
          <p className="text-sm text-gray-500 mt-1">
            Seguimiento de lotes, fechas de caducidad y sistema FEFO
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo Lote
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ================================================================= */}
      {/* TAB 1: Lotes Activos                                              */}
      {/* ================================================================= */}
      {activeTab === "activos" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por producto o lote..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <Select
              value={filterBranch}
              onChange={(e) => {
                setFilterBranch(e.target.value);
                setCurrentPage(1);
              }}
              className="!w-auto min-w-[160px]"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="!w-auto min-w-[140px]"
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVE">Activo</option>
              <option value="LOW">Bajo</option>
              <option value="EXPIRED">Vencido</option>
              <option value="CONSUMED">Consumido</option>
              <option value="DISPOSED">Descartado</option>
            </Select>
            <Select
              value={filterExpiring}
              onChange={(e) => {
                setFilterExpiring(e.target.value);
                setCurrentPage(1);
              }}
              className="!w-auto min-w-[160px]"
            >
              <option value="">Sin filtro caducidad</option>
              <option value="2">Vence en 2 dias</option>
              <option value="5">Vence en 5 dias</option>
              <option value="7">Vence en 7 dias</option>
              <option value="14">Vence en 14 dias</option>
              <option value="30">Vence en 30 dias</option>
            </Select>
          </div>

          {/* Table */}
          <DataTable
            columns={lotColumns}
            data={lots}
            loading={listLoading}
            emptyMessage="No hay lotes registrados"
          />

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                Mostrando {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)} de{" "}
                {pagination.total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="font-medium">
                  {currentPage} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={currentPage === pagination.totalPages}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: Alertas de Caducidad                                       */}
      {/* ================================================================= */}
      {activeTab === "alertas" && (
        <div className="space-y-4">
          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Select
              value={alertBranch}
              onChange={(e) => setAlertBranch(e.target.value)}
              className="!w-auto min-w-[200px]"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Button variant="destructive" size="sm" onClick={handleAutoExpire} disabled={saving}>
              <RefreshCw className={`h-4 w-4 ${saving ? "animate-spin" : ""}`} />
              Auto-expirar
            </Button>
          </div>

          {alertsLoading ? (
            <div className="text-center py-12 text-gray-500">Cargando alertas...</div>
          ) : alerts ? (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <AlertCard
                  title="Critico (0-2 dias)"
                  count={alerts.critical.count}
                  color="red"
                  icon={<AlertTriangle className="h-5 w-5" />}
                />
                <AlertCard
                  title="Advertencia (3-5 dias)"
                  count={alerts.warning.count}
                  color="orange"
                  icon={<Timer className="h-5 w-5" />}
                />
                <AlertCard
                  title="Proximos (6-7 dias)"
                  count={alerts.upcoming.count}
                  color="yellow"
                  icon={<Calendar className="h-5 w-5" />}
                />
              </div>

              {/* Expandable sections */}
              <AlertSection
                title="Critico"
                subtitle="0-2 dias restantes"
                lots={alerts.critical.lots}
                color="red"
                expanded={expandedSection === "critical"}
                onToggle={() => setExpandedSection((s) => (s === "critical" ? null : "critical"))}
                onDispose={(lot) => {
                  setDisposeLot(lot);
                  setDisposeReason("");
                  setDisposeOpen(true);
                }}
              />
              <AlertSection
                title="Advertencia"
                subtitle="3-5 dias restantes"
                lots={alerts.warning.lots}
                color="orange"
                expanded={expandedSection === "warning"}
                onToggle={() => setExpandedSection((s) => (s === "warning" ? null : "warning"))}
                onDispose={(lot) => {
                  setDisposeLot(lot);
                  setDisposeReason("");
                  setDisposeOpen(true);
                }}
              />
              <AlertSection
                title="Proximos"
                subtitle="6-7 dias restantes"
                lots={alerts.upcoming.lots}
                color="yellow"
                expanded={expandedSection === "upcoming"}
                onToggle={() => setExpandedSection((s) => (s === "upcoming" ? null : "upcoming"))}
                onDispose={(lot) => {
                  setDisposeLot(lot);
                  setDisposeReason("");
                  setDisposeOpen(true);
                }}
              />
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              No se pudieron cargar las alertas.
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: Dashboard                                                  */}
      {/* ================================================================= */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {summaryLoading ? (
            <div className="text-center py-12 text-gray-500">Cargando dashboard...</div>
          ) : summary ? (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Lotes Activos"
                  value={summary.activeLots}
                  icon={<Package className="h-5 w-5" />}
                  color="green"
                />
                <KPICard
                  title="Lotes Vencidos"
                  value={summary.expiredLots}
                  icon={<AlertTriangle className="h-5 w-5" />}
                  color="red"
                />
                <KPICard
                  title="Vencen esta Semana"
                  value={summary.expiringThisWeek}
                  icon={<Timer className="h-5 w-5" />}
                  color="orange"
                />
                <KPICard
                  title="Valor en Riesgo"
                  value={fmtCompact(summary.valueAtRisk)}
                  icon={<DollarSign className="h-5 w-5" />}
                  color="purple"
                  isText
                />
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bar chart: expiring by branch */}
                <div className="border rounded-xl bg-white p-5">
                  <h3 className="text-sm font-semibold mb-4">Lotes por Vencer por Sucursal</h3>
                  {summary.byBranch.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={summary.byBranch}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="branchName" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="expired" name="Vencidos" fill="#ef4444" />
                        <Bar dataKey="expiringSoon" name="Por vencer" fill="#f97316" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-12">Sin datos</p>
                  )}
                </div>

                {/* Pie chart: status distribution */}
                <div className="border rounded-xl bg-white p-5">
                  <h3 className="text-sm font-semibold mb-4">Distribucion por Estado</h3>
                  {summary.statusDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={summary.statusDistribution.sort(
                            (a, b) =>
                              STATUS_PIE_ORDER.indexOf(a.status) -
                              STATUS_PIE_ORDER.indexOf(b.status),
                          )}
                          dataKey="count"
                          nameKey="status"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ status, count }) =>
                            `${STATUS_LABELS[status] || status}: ${count}`
                          }
                        >
                          {summary.statusDistribution
                            .sort(
                              (a, b) =>
                                STATUS_PIE_ORDER.indexOf(a.status) -
                                STATUS_PIE_ORDER.indexOf(b.status),
                            )
                            .map((entry, i) => (
                              <Cell
                                key={entry.status}
                                fill={
                                  PIE_COLORS[STATUS_PIE_ORDER.indexOf(entry.status)] ||
                                  PIE_COLORS[i % PIE_COLORS.length]
                                }
                              />
                            ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            value,
                            STATUS_LABELS[name] || name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-12">Sin datos</p>
                  )}
                </div>
              </div>

              {/* Top products table */}
              <div className="border rounded-xl bg-white p-5">
                <h3 className="text-sm font-semibold mb-4">
                  Top 10 Productos con Mas Lotes por Vencer
                </h3>
                {summary.byProduct.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2">Producto</th>
                        <th className="pb-2 text-right"># Lotes</th>
                        <th className="pb-2 text-right">Cantidad Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.byProduct.map((p) => (
                        <tr key={p.productId} className="border-b last:border-0">
                          <td className="py-2 font-medium">{p.productName}</td>
                          <td className="py-2 text-right">{p.lotCount}</td>
                          <td className="py-2 text-right">{safeNum(p.totalQuantity).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
                )}
              </div>

              {/* Trend chart + FIFO card */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Line chart: 30-day trend */}
                <div className="lg:col-span-2 border rounded-xl bg-white p-5">
                  <h3 className="text-sm font-semibold mb-4">Tendencia ultimos 30 dias</h3>
                  {summary.trend.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={summary.trend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          tickFormatter={fmtShortDate}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip labelFormatter={fmtDate} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="expired"
                          name="Vencidos"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="disposed"
                          name="Descartados"
                          stroke="#a855f7"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="consumed"
                          name="Consumidos"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-12">
                      Sin datos de tendencia
                    </p>
                  )}
                </div>

                {/* FIFO compliance */}
                <div className="border rounded-xl bg-white p-5 flex flex-col items-center justify-center text-center">
                  <BarChart3 className="h-8 w-8 text-gray-400 mb-3" />
                  <p className="text-sm text-gray-500 mb-1">Cumplimiento FEFO</p>
                  <p className="text-4xl font-bold text-gray-900">{summary.fifoCompliance}%</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Lotes consumidos en orden de caducidad
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">No se pudo cargar el dashboard.</div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: Nuevo Lote                                                 */}
      {/* ================================================================= */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo Lote" wide>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Producto" required>
            <Select
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              <option value="">Seleccionar...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Sucursal" required>
            <Select
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            >
              <option value="">Seleccionar...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Numero de Lote">
            <Input
              placeholder="Auto-generado si se deja vacio"
              value={form.lotNumber}
              onChange={(e) => setForm({ ...form, lotNumber: e.target.value })}
            />
          </FormField>
          <FormField label="Fecha de Recepcion">
            <Input
              type="date"
              value={form.batchDate}
              onChange={(e) => setForm({ ...form, batchDate: e.target.value })}
            />
          </FormField>
          <FormField label="Fecha de Caducidad" required>
            <Input
              type="date"
              value={form.expirationDate}
              onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
            />
          </FormField>
          <FormField label="Cantidad" required>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </FormField>
          <FormField label="Costo Unitario">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.unitCost}
              onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
            />
          </FormField>
          <FormField label="Proveedor">
            <Select
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            >
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Notas">
              <Textarea
                placeholder="Notas sobre este lote..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setCreateOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreateLot}
            disabled={
              saving || !form.productId || !form.branchId || !form.expirationDate || !form.quantity
            }
          >
            {saving ? "Guardando..." : "Registrar Lote"}
          </Button>
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* MODAL: Consumir de Lote                                           */}
      {/* ================================================================= */}
      <Modal open={consumeOpen} onClose={() => setConsumeOpen(false)} title="Consumir de Lote">
        {consumeLot && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p>
                <span className="text-gray-500">Lote:</span>{" "}
                <span className="font-mono">{consumeLot.lotNumber}</span>
              </p>
              <p>
                <span className="text-gray-500">Producto:</span> {consumeLot.product.name}
              </p>
              <p>
                <span className="text-gray-500">Disponible:</span>{" "}
                {safeNum(consumeLot.quantity).toFixed(2)} {consumeLot.product.unitOfMeasure}
              </p>
              <p>
                <span className="text-gray-500">Caduca:</span> {fmtDate(consumeLot.expirationDate)}
              </p>
            </div>
            <FormField label="Cantidad a consumir" required>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={String(safeNum(consumeLot.quantity))}
                placeholder="0.00"
                value={consumeQty}
                onChange={(e) => setConsumeQty(e.target.value)}
              />
            </FormField>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConsumeOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleConsume}
                disabled={
                  saving ||
                  !consumeQty ||
                  parseFloat(consumeQty) <= 0 ||
                  parseFloat(consumeQty) > safeNum(consumeLot.quantity)
                }
              >
                {saving ? "Procesando..." : "Consumir"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* MODAL: Descartar Lote                                             */}
      {/* ================================================================= */}
      <Modal open={disposeOpen} onClose={() => setDisposeOpen(false)} title="Descartar Lote">
        {disposeLot && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <p className="text-red-800 font-medium mb-1">
                Se descartara todo el lote y se registrara como merma.
              </p>
              <p className="text-red-600">
                Lote: {disposeLot.lotNumber} - {disposeLot.product.name}
              </p>
              <p className="text-red-600">
                Cantidad: {safeNum(disposeLot.quantity).toFixed(2)}{" "}
                {disposeLot.product.unitOfMeasure}
              </p>
            </div>
            <FormField label="Razon del descarte">
              <Textarea
                placeholder="Describa la razon..."
                value={disposeReason}
                onChange={(e) => setDisposeReason(e.target.value)}
              />
            </FormField>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDisposeOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDispose} disabled={saving}>
                {saving ? "Procesando..." : "Descartar Lote"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function KPICard({
  title,
  value,
  icon,
  color,
  isText,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: "green" | "red" | "orange" | "purple";
  isText?: boolean;
}) {
  const colorMap = {
    green: "bg-green-50 text-green-600",
    red: "bg-red-50 text-red-600",
    orange: "bg-orange-50 text-orange-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="border rounded-xl bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{title}</span>
        <span className={`p-2 rounded-lg ${colorMap[color]}`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">
        {isText ? value : safeNum(value).toLocaleString()}
      </p>
    </div>
  );
}

function AlertCard({
  title,
  count,
  color,
  icon,
}: {
  title: string;
  count: number;
  color: "red" | "orange" | "yellow";
  icon: React.ReactNode;
}) {
  const styles = {
    red: "border-red-200 bg-red-50",
    orange: "border-orange-200 bg-orange-50",
    yellow: "border-yellow-200 bg-yellow-50",
  };
  const textStyles = {
    red: "text-red-700",
    orange: "text-orange-700",
    yellow: "text-yellow-700",
  };

  return (
    <div className={`border rounded-xl p-4 ${styles[color]}`}>
      <div className="flex items-center gap-3">
        <span className={textStyles[color]}>{icon}</span>
        <div>
          <p className={`text-2xl font-bold ${textStyles[color]}`}>{count}</p>
          <p className={`text-sm ${textStyles[color]} opacity-80`}>{title}</p>
        </div>
      </div>
    </div>
  );
}

function AlertSection({
  title,
  subtitle,
  lots,
  color,
  expanded,
  onToggle,
  onDispose,
}: {
  title: string;
  subtitle: string;
  lots: ProductLot[];
  color: "red" | "orange" | "yellow";
  expanded: boolean;
  onToggle: () => void;
  onDispose: (lot: ProductLot) => void;
}) {
  const borderStyles = {
    red: "border-red-200",
    orange: "border-orange-200",
    yellow: "border-yellow-200",
  };
  const headerStyles = {
    red: "bg-red-50 hover:bg-red-100",
    orange: "bg-orange-50 hover:bg-orange-100",
    yellow: "bg-yellow-50 hover:bg-yellow-100",
  };
  const textStyles = {
    red: "text-red-800",
    orange: "text-orange-800",
    yellow: "text-yellow-800",
  };

  return (
    <div className={`border rounded-xl overflow-hidden ${borderStyles[color]}`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${headerStyles[color]}`}
      >
        <div className="flex items-center gap-3">
          <span className={`font-semibold ${textStyles[color]}`}>{title}</span>
          <span className={`text-sm opacity-70 ${textStyles[color]}`}>{subtitle}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${textStyles[color]} bg-white/60`}
          >
            {lots.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className={`h-4 w-4 ${textStyles[color]}`} />
        ) : (
          <ChevronDown className={`h-4 w-4 ${textStyles[color]}`} />
        )}
      </button>

      {expanded && lots.length > 0 && (
        <div className="divide-y bg-white">
          {lots.map((lot) => {
            const days = getDaysRemaining(lot.expirationDate);
            return (
              <div
                key={lot.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{lot.product.name}</span>
                    <span className="text-xs text-gray-500 font-mono">{lot.lotNumber}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    <span>{lot.branch.name}</span>
                    <span>
                      {safeNum(lot.quantity).toFixed(2)} {lot.product.unitOfMeasure}
                    </span>
                    <span>Caduca: {fmtDate(lot.expirationDate)}</span>
                    {days <= 0 ? (
                      <span className="font-bold text-red-600">VENCIDO</span>
                    ) : (
                      <span className="font-bold">
                        {days} {days === 1 ? "dia" : "dias"}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onDispose(lot)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-red-700 hover:bg-red-50 transition-colors border border-red-200"
                >
                  <Trash2 className="h-3 w-3" />
                  Descartar
                </button>
              </div>
            );
          })}
        </div>
      )}

      {expanded && lots.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-gray-400 bg-white">
          No hay lotes en esta categoria
        </div>
      )}
    </div>
  );
}
