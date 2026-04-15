"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  TrendingUp,
  Package,
  Warehouse,
  DollarSign,
  Store,
  RefreshCw,
  FileSpreadsheet,
  Banknote,
  Clock,
  Download,
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
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { useApiQuery } from "@/hooks/use-api-query";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-field";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface SalesByBranch {
  branchId: string;
  branchName: string;
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
}

interface SalesByProduct {
  productId: string;
  productName: string;
  quantitySold: number;
  totalRevenue: number;
  averagePrice: number;
}

interface SalesTrend {
  date: string;
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
}

interface InventoryValuation {
  productId: string;
  productName: string;
  sku: string;
  currentQuantity: number;
  costPerUnit: number;
  totalValue: number;
  branchName?: string;
}

// --- Financial report types ---

interface PnlData {
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  operatingExpenses: {
    labor: number;
    rent: number;
    utilities: number;
    marketing: number;
    maintenance: number;
    other: number;
    total: number;
  };
  operatingIncome: number;
  otherIncome: number;
  otherExpenses: number;
  netIncome: number;
  margins: {
    grossMargin: number;
    operatingMargin: number;
    netMargin: number;
  };
}

interface CashFlowData {
  operatingActivities: {
    cashFromSales: number;
    cashToSuppliers: number;
    cashForPayroll: number;
    netOperating: number;
  };
  investingActivities: number;
  financingActivities: number;
  netCashFlow: number;
  beginningBalance: number;
  endingBalance: number;
}

interface AgingDetail {
  customerId?: string | null;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber: string | null;
  amount: number;
  balanceDue: number;
  dueDate: string;
  ageDays: number;
  bucket: string;
}

interface AgingData {
  total: number;
  buckets: {
    current: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
  };
  details: AgingDetail[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function formatMXN(value: unknown): string {
  return safeNum(value).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

function formatNumber(value: unknown): string {
  return safeNum(value).toLocaleString("es-MX");
}

function formatPct(value: unknown): string {
  return `${safeNum(value).toFixed(1)}%`;
}

/** Get the first day of the current month as YYYY-MM-DD */
function getFirstDayOfMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Get today as YYYY-MM-DD */
function getToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: "ventas-sucursal", label: "Ventas por Sucursal", icon: Store },
  { key: "ventas-producto", label: "Ventas por Producto", icon: Package },
  { key: "inventario", label: "Valuacion de Inventario", icon: Warehouse },
  { key: "tendencias", label: "Tendencias", icon: TrendingUp },
  { key: "estado-resultados", label: "Estado de Resultados", icon: FileSpreadsheet },
  { key: "flujo-efectivo", label: "Flujo de Efectivo", icon: Banknote },
  { key: "antiguedad-saldos", label: "Antiguedad de Saldos", icon: Clock },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

// ---------------------------------------------------------------------------
// Reusable sub-components (module-level to avoid re-creation on every render)
// ---------------------------------------------------------------------------

function MetricCard({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string;
  value: string;
  sub: string;
  icon: typeof DollarSign;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
          <Icon className="h-5 w-5 text-black" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{sub}</p>
    </div>
  );
}

function DateFilters({
  showBranch,
  branchValue,
  onBranchChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  branches,
  onRefresh,
}: {
  showBranch?: boolean;
  branchValue?: string;
  onBranchChange?: (id: string) => void;
  startDate: string;
  onStartDateChange: (v: string) => void;
  endDate: string;
  onEndDateChange: (v: string) => void;
  branches: Branch[];
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-44">
        <FormField label="Fecha Inicio">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </FormField>
      </div>
      <div className="w-44">
        <FormField label="Fecha Fin">
          <Input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
        </FormField>
      </div>
      {showBranch && (
        <div className="w-52">
          <FormField label="Sucursal">
            <Select value={branchValue ?? ""} onChange={(e) => onBranchChange?.(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      )}
      <Button onClick={onRefresh} variant="outline" size="md">
        <RefreshCw className="h-4 w-4" />
        Consultar
      </Button>
    </div>
  );
}

function BranchRequiredFilters({
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  branches,
  selectedBranchId,
  onBranchChange,
  onRefresh,
}: {
  startDate: string;
  onStartDateChange: (v: string) => void;
  endDate: string;
  onEndDateChange: (v: string) => void;
  branches: Branch[];
  selectedBranchId: string;
  onBranchChange: (v: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-44">
        <FormField label="Fecha Inicio">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </FormField>
      </div>
      <div className="w-44">
        <FormField label="Fecha Fin">
          <Input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
        </FormField>
      </div>
      <div className="w-52">
        <FormField label="Sucursal" required>
          <Select value={selectedBranchId} onChange={(e) => onBranchChange(e.target.value)}>
            {branches.length === 0 && <option value="">Cargando sucursales...</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <Button onClick={onRefresh} variant="outline" size="md">
        <RefreshCw className="h-4 w-4" />
        Consultar
      </Button>
    </div>
  );
}

/** P&L line item row */
function PnlRow({
  label,
  amount,
  margin,
  bold,
  indent,
  negative,
}: {
  label: string;
  amount: number;
  margin?: number;
  bold?: boolean;
  indent?: boolean;
  negative?: boolean;
}) {
  return (
    <tr className={bold ? "bg-gray-50 font-semibold" : ""}>
      <td className={`py-2 pr-4 ${indent ? "pl-8" : "pl-4"} text-sm text-gray-700`}>
        {negative && amount !== 0 ? `(-) ${label}` : label}
      </td>
      <td className="py-2 px-4 text-right text-sm text-gray-900">{formatMXN(amount)}</td>
      <td className="py-2 px-4 text-right text-sm text-gray-500">
        {margin !== undefined ? formatPct(margin) : ""}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ReportesPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("ventas-sucursal");

  // ---- Shared state ----
  const { data: branches = [], isSuccess: branchesLoaded } = useApiQuery<Branch[]>("/branches", [
    "branches",
  ]);

  // ---- Date filters ----
  const [startDate, setStartDate] = useState(getFirstDayOfMonth);
  const [endDate, setEndDate] = useState(getToday);

  // ---- Ventas por Sucursal ----
  const [salesByBranch, setSalesByBranch] = useState<SalesByBranch[]>([]);
  const [salesByBranchLoading, setSalesByBranchLoading] = useState(false);

  // ---- Ventas por Producto ----
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [salesByProduct, setSalesByProduct] = useState<SalesByProduct[]>([]);
  const [salesByProductLoading, setSalesByProductLoading] = useState(false);

  // ---- Inventario ----
  const [inventoryBranchId, setInventoryBranchId] = useState("");
  const [inventoryData, setInventoryData] = useState<InventoryValuation[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // ---- Tendencias ----
  const [trendsBranchId, setTrendsBranchId] = useState("");
  const [trendsData, setTrendsData] = useState<SalesTrend[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);

  // ---- Estado de Resultados (P&L) ----
  const [pnlBranchId, setPnlBranchId] = useState("");
  const [pnlData, setPnlData] = useState<PnlData | null>(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlExporting, setPnlExporting] = useState(false);

  // ---- Flujo de Efectivo ----
  const [cashFlowData, setCashFlowData] = useState<CashFlowData | null>(null);
  const [cashFlowLoading, setCashFlowLoading] = useState(false);

  // ---- Antiguedad de Saldos ----
  const [agingType, setAgingType] = useState<"receivable" | "payable">("receivable");
  const [agingData, setAgingData] = useState<AgingData | null>(null);
  const [agingLoading, setAgingLoading] = useState(false);
  const [agingExporting, setAgingExporting] = useState(false);

  // =======================================================================
  // Set default branch when branches load
  // =======================================================================

  useEffect(() => {
    if (branches.length > 0) {
      setSelectedBranchId((prev) => prev || branches[0].id);
    }
  }, [branches]);

  // =======================================================================
  // Data-fetching functions (existing)
  // =======================================================================

  const fetchSalesByBranch = useCallback(async () => {
    setSalesByBranchLoading(true);
    try {
      const data = await authFetch<SalesByBranch[]>(
        "get",
        `/reportes/sales/by-branch?startDate=${startDate}&endDate=${endDate}`,
      );
      setSalesByBranch(data);
    } catch {
      toast("Error al cargar ventas por sucursal", "error");
    } finally {
      setSalesByBranchLoading(false);
    }
  }, [authFetch, startDate, endDate, toast]);

  const fetchSalesByProduct = useCallback(
    async (branchId: string) => {
      if (!branchId) return;
      setSalesByProductLoading(true);
      try {
        const data = await authFetch<SalesByProduct[]>(
          "get",
          `/reportes/sales/by-product/${branchId}?startDate=${startDate}&endDate=${endDate}`,
        );
        setSalesByProduct(data);
      } catch {
        toast("Error al cargar ventas por producto", "error");
      } finally {
        setSalesByProductLoading(false);
      }
    },
    [authFetch, startDate, endDate, toast],
  );

  const fetchInventory = useCallback(
    async (branchId?: string) => {
      setInventoryLoading(true);
      try {
        const qs = branchId ? `?branchId=${branchId}` : "";
        const data = await authFetch<any>("get", `/reportes/inventory/valuation${qs}`);
        setInventoryData(Array.isArray(data) ? data : (data.items ?? []));
      } catch {
        toast("Error al cargar valuacion de inventario", "error");
      } finally {
        setInventoryLoading(false);
      }
    },
    [authFetch, toast],
  );

  const fetchTrends = useCallback(
    async (branchId?: string) => {
      setTrendsLoading(true);
      try {
        const params = new URLSearchParams({
          startDate,
          endDate,
        });
        if (branchId) params.set("branchId", branchId);
        const data = await authFetch<SalesTrend[]>(
          "get",
          `/reportes/sales/trends?${params.toString()}`,
        );
        setTrendsData(data);
      } catch {
        toast("Error al cargar tendencias", "error");
      } finally {
        setTrendsLoading(false);
      }
    },
    [authFetch, startDate, endDate, toast],
  );

  // =======================================================================
  // Data-fetching functions (new financial reports)
  // =======================================================================

  const fetchPnl = useCallback(async () => {
    setPnlLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (pnlBranchId) params.set("branchId", pnlBranchId);
      const data = await authFetch<PnlData>("get", `/reportes/financial/pnl?${params.toString()}`);
      setPnlData(data);
    } catch {
      toast("Error al cargar estado de resultados", "error");
    } finally {
      setPnlLoading(false);
    }
  }, [authFetch, startDate, endDate, pnlBranchId, toast]);

  const fetchCashFlow = useCallback(async () => {
    setCashFlowLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const data = await authFetch<CashFlowData>(
        "get",
        `/reportes/financial/cash-flow?${params.toString()}`,
      );
      setCashFlowData(data);
    } catch {
      toast("Error al cargar flujo de efectivo", "error");
    } finally {
      setCashFlowLoading(false);
    }
  }, [authFetch, startDate, endDate, toast]);

  const fetchAging = useCallback(
    async (type: "receivable" | "payable") => {
      setAgingLoading(true);
      try {
        const data = await authFetch<AgingData>("get", `/reportes/financial/aging/${type}`);
        setAgingData(data);
      } catch {
        toast("Error al cargar antiguedad de saldos", "error");
      } finally {
        setAgingLoading(false);
      }
    },
    [authFetch, toast],
  );

  // =======================================================================
  // Download helpers (same pattern as DIOT download)
  // =======================================================================

  async function downloadCSV(url: string, fallbackFilename: string) {
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1];
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const response = await fetch(`${baseUrl}${url}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token") || token || ""}`,
      },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.message || "Error al descargar");
    }
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fallbackFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }

  async function handleExportPnl() {
    setPnlExporting(true);
    try {
      await downloadCSV(
        `/reportes/financial/export/pnl?startDate=${startDate}&endDate=${endDate}`,
        `Estado_Resultados_${startDate}_${endDate}.csv`,
      );
    } catch (err: any) {
      toast(err?.message || "Error al exportar", "error");
    } finally {
      setPnlExporting(false);
    }
  }

  async function handleExportAging() {
    setAgingExporting(true);
    try {
      const label = agingType === "receivable" ? "CxC" : "CxP";
      await downloadCSV(
        `/reportes/financial/export/aging/${agingType}`,
        `Antiguedad_${label}_${new Date().toISOString().split("T")[0]}.csv`,
      );
    } catch (err: any) {
      toast(err?.message || "Error al exportar", "error");
    } finally {
      setAgingExporting(false);
    }
  }

  // =======================================================================
  // Load data when tab changes
  // =======================================================================

  useEffect(() => {
    if (authLoading || !branchesLoaded) return;

    if (activeTab === "ventas-sucursal") {
      fetchSalesByBranch();
    } else if (activeTab === "ventas-producto" && selectedBranchId) {
      fetchSalesByProduct(selectedBranchId);
    } else if (activeTab === "inventario") {
      fetchInventory(inventoryBranchId || undefined);
    } else if (activeTab === "tendencias") {
      fetchTrends(trendsBranchId || undefined);
    } else if (activeTab === "estado-resultados") {
      fetchPnl();
    } else if (activeTab === "flujo-efectivo") {
      fetchCashFlow();
    } else if (activeTab === "antiguedad-saldos") {
      fetchAging(agingType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, authLoading, branchesLoaded]);

  // Refetch Ventas por Producto when branch changes
  useEffect(() => {
    if (activeTab === "ventas-producto" && selectedBranchId && branchesLoaded) {
      fetchSalesByProduct(selectedBranchId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  // Refetch aging when type toggles
  useEffect(() => {
    if (activeTab === "antiguedad-saldos" && branchesLoaded) {
      fetchAging(agingType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agingType]);

  // =======================================================================
  // Manual refresh handlers (triggered by "Consultar" button)
  // =======================================================================

  function handleRefresh() {
    if (activeTab === "ventas-sucursal") {
      fetchSalesByBranch();
    } else if (activeTab === "ventas-producto") {
      fetchSalesByProduct(selectedBranchId);
    } else if (activeTab === "inventario") {
      fetchInventory(inventoryBranchId || undefined);
    } else if (activeTab === "tendencias") {
      fetchTrends(trendsBranchId || undefined);
    } else if (activeTab === "estado-resultados") {
      fetchPnl();
    } else if (activeTab === "flujo-efectivo") {
      fetchCashFlow();
    } else if (activeTab === "antiguedad-saldos") {
      fetchAging(agingType);
    }
  }

  // =======================================================================
  // Summary metric computations (existing)
  // =======================================================================

  const salesByBranchMetrics = {
    totalSales: salesByBranch.reduce((sum, r) => sum + safeNum(r.totalSales), 0),
    totalOrders: salesByBranch.reduce((sum, r) => sum + safeNum(r.totalOrders), 0),
    avgTicket:
      salesByBranch.length > 0
        ? salesByBranch.reduce((sum, r) => sum + safeNum(r.averageTicket), 0) / salesByBranch.length
        : 0,
    branchCount: salesByBranch.length,
  };

  const salesByProductMetrics = {
    totalRevenue: salesByProduct.reduce((sum, r) => sum + safeNum(r.totalRevenue), 0),
    totalQty: salesByProduct.reduce((sum, r) => sum + safeNum(r.quantitySold), 0),
    productCount: salesByProduct.length,
    topProduct:
      salesByProduct.length > 0
        ? [...salesByProduct].sort((a, b) => safeNum(b.totalRevenue) - safeNum(a.totalRevenue))[0]
            .productName
        : "-",
  };

  const inventoryMetrics = {
    totalValue: inventoryData.reduce((sum, r) => sum + safeNum(r.totalValue), 0),
    totalItems: inventoryData.length,
    totalUnits: inventoryData.reduce((sum, r) => sum + safeNum(r.currentQuantity), 0),
  };

  const trendsMetrics = {
    totalSales: trendsData.reduce((sum, r) => sum + safeNum(r.totalSales), 0),
    totalOrders: trendsData.reduce((sum, r) => sum + safeNum(r.totalOrders), 0),
    avgDailySales:
      trendsData.length > 0
        ? trendsData.reduce((sum, r) => sum + safeNum(r.totalSales), 0) / trendsData.length
        : 0,
    days: trendsData.length,
  };

  // =======================================================================
  // Column definitions (existing)
  // =======================================================================

  const salesByBranchColumns = [
    {
      key: "branchName",
      header: "Sucursal",
      render: (r: SalesByBranch) => <span className="font-medium">{r.branchName}</span>,
    },
    {
      key: "totalSales",
      header: "Ventas Totales",
      className: "text-right",
      render: (r: SalesByBranch) => formatMXN(r.totalSales),
    },
    {
      key: "totalOrders",
      header: "Ordenes",
      className: "text-right",
      render: (r: SalesByBranch) => formatNumber(r.totalOrders),
    },
    {
      key: "averageTicket",
      header: "Ticket Promedio",
      className: "text-right",
      render: (r: SalesByBranch) => formatMXN(r.averageTicket),
    },
  ];

  const salesByProductColumns = [
    {
      key: "productName",
      header: "Producto",
      render: (r: SalesByProduct) => <span className="font-medium">{r.productName}</span>,
    },
    {
      key: "quantitySold",
      header: "Cantidad Vendida",
      className: "text-right",
      render: (r: SalesByProduct) => formatNumber(r.quantitySold),
    },
    {
      key: "totalRevenue",
      header: "Ingreso Total",
      className: "text-right",
      render: (r: SalesByProduct) => formatMXN(r.totalRevenue),
    },
    {
      key: "averagePrice",
      header: "Precio Promedio",
      className: "text-right",
      render: (r: SalesByProduct) => formatMXN(r.averagePrice),
    },
  ];

  const inventoryColumns = [
    {
      key: "sku",
      header: "SKU",
      className: "font-mono",
    },
    {
      key: "productName",
      header: "Producto",
      render: (r: InventoryValuation) => <span className="font-medium">{r.productName}</span>,
    },
    {
      key: "branchName",
      header: "Sucursal",
      render: (r: InventoryValuation) => r.branchName ?? "Todas",
    },
    {
      key: "currentQuantity",
      header: "Cantidad",
      className: "text-right",
      render: (r: InventoryValuation) => formatNumber(r.currentQuantity),
    },
    {
      key: "costPerUnit",
      header: "Costo Unitario",
      className: "text-right",
      render: (r: InventoryValuation) => formatMXN(r.costPerUnit),
    },
    {
      key: "totalValue",
      header: "Valor Total",
      className: "text-right",
      render: (r: InventoryValuation) => formatMXN(r.totalValue),
    },
  ];

  const trendsColumns = [
    {
      key: "date",
      header: "Fecha",
      render: (r: SalesTrend) =>
        new Date(r.date).toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
    },
    {
      key: "totalSales",
      header: "Ventas",
      className: "text-right",
      render: (r: SalesTrend) => formatMXN(r.totalSales),
    },
    {
      key: "totalOrders",
      header: "Ordenes",
      className: "text-right",
      render: (r: SalesTrend) => formatNumber(r.totalOrders),
    },
    {
      key: "averageTicket",
      header: "Ticket Promedio",
      className: "text-right",
      render: (r: SalesTrend) => formatMXN(r.averageTicket),
    },
  ];

  // --- Aging detail columns ---
  const agingDetailColumns = [
    {
      key: "name",
      header: agingType === "receivable" ? "Cliente" : "Proveedor",
      render: (r: AgingDetail) => (
        <span className="font-medium">
          {agingType === "receivable" ? r.customerName : r.supplierName}
        </span>
      ),
    },
    {
      key: "invoiceNumber",
      header: "Factura",
      render: (r: AgingDetail) => r.invoiceNumber || "N/A",
    },
    {
      key: "amount",
      header: "Monto Original",
      className: "text-right",
      render: (r: AgingDetail) => formatMXN(r.amount),
    },
    {
      key: "balanceDue",
      header: "Saldo",
      className: "text-right",
      render: (r: AgingDetail) => formatMXN(r.balanceDue),
    },
    {
      key: "dueDate",
      header: "Vencimiento",
      render: (r: AgingDetail) =>
        new Date(r.dueDate).toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
    },
    {
      key: "ageDays",
      header: "Dias",
      className: "text-right",
      render: (r: AgingDetail) => String(r.ageDays),
    },
    {
      key: "bucket",
      header: "Clasificacion",
      render: (r: AgingDetail) => {
        const colors: Record<string, string> = {
          current: "bg-green-100 text-green-800",
          "31-60": "bg-blue-100 text-blue-800",
          "61-90": "bg-yellow-100 text-yellow-800",
          "90+": "bg-red-100 text-red-800",
        };
        const labels: Record<string, string> = {
          current: "Corriente",
          "31-60": "31-60 dias",
          "61-90": "61-90 dias",
          "90+": "90+ dias",
        };
        return (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[r.bucket] || "bg-gray-100 text-gray-800"}`}
          >
            {labels[r.bucket] || r.bucket}
          </span>
        );
      },
    },
  ];

  // =======================================================================
  // Render
  // =======================================================================

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes y Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Consulta ventas, inventario y tendencias de tu negocio
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-border">
        <div className="flex gap-6 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex shrink-0 items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "border-black text-gray-900"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {/* ============================================================ */}
        {/* VENTAS POR SUCURSAL                                          */}
        {/* ============================================================ */}
        {activeTab === "ventas-sucursal" && (
          <div className="space-y-6">
            <DateFilters
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              branches={branches}
              onRefresh={handleRefresh}
            />

            {/* Summary cards */}
            {!salesByBranchLoading && salesByBranch.length > 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Ventas Totales"
                  value={formatMXN(salesByBranchMetrics.totalSales)}
                  sub="en el periodo seleccionado"
                  icon={DollarSign}
                />
                <MetricCard
                  title="Total de Ordenes"
                  value={formatNumber(salesByBranchMetrics.totalOrders)}
                  sub="ordenes procesadas"
                  icon={BarChart3}
                />
                <MetricCard
                  title="Ticket Promedio"
                  value={formatMXN(salesByBranchMetrics.avgTicket)}
                  sub="promedio entre sucursales"
                  icon={TrendingUp}
                />
                <MetricCard
                  title="Sucursales"
                  value={String(salesByBranchMetrics.branchCount)}
                  sub="con ventas en el periodo"
                  icon={Store}
                />
              </div>
            )}

            <DataTable
              columns={salesByBranchColumns}
              data={salesByBranch}
              loading={salesByBranchLoading}
              emptyMessage="No hay datos de ventas para el periodo seleccionado"
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* VENTAS POR PRODUCTO                                          */}
        {/* ============================================================ */}
        {activeTab === "ventas-producto" && (
          <div className="space-y-6">
            <BranchRequiredFilters
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              branches={branches}
              selectedBranchId={selectedBranchId}
              onBranchChange={setSelectedBranchId}
              onRefresh={handleRefresh}
            />

            {/* Summary cards */}
            {!salesByProductLoading && salesByProduct.length > 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Ingreso Total"
                  value={formatMXN(salesByProductMetrics.totalRevenue)}
                  sub="de la sucursal seleccionada"
                  icon={DollarSign}
                />
                <MetricCard
                  title="Unidades Vendidas"
                  value={formatNumber(salesByProductMetrics.totalQty)}
                  sub="productos vendidos"
                  icon={Package}
                />
                <MetricCard
                  title="Productos"
                  value={String(salesByProductMetrics.productCount)}
                  sub="con ventas registradas"
                  icon={BarChart3}
                />
                <MetricCard
                  title="Producto Top"
                  value={salesByProductMetrics.topProduct}
                  sub="mayor ingreso en el periodo"
                  icon={TrendingUp}
                />
              </div>
            )}

            <DataTable
              columns={salesByProductColumns}
              data={salesByProduct}
              loading={salesByProductLoading}
              emptyMessage="No hay datos de productos para esta sucursal y periodo"
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* VALUACION DE INVENTARIO                                      */}
        {/* ============================================================ */}
        {activeTab === "inventario" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-52">
                <FormField label="Sucursal">
                  <Select
                    value={inventoryBranchId}
                    onChange={(e) => setInventoryBranchId(e.target.value)}
                  >
                    <option value="">Todas las sucursales</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <Button onClick={handleRefresh} variant="outline" size="md">
                <RefreshCw className="h-4 w-4" />
                Consultar
              </Button>
            </div>

            {/* Summary cards */}
            {!inventoryLoading && inventoryData.length > 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  title="Valor Total del Inventario"
                  value={formatMXN(inventoryMetrics.totalValue)}
                  sub="valuacion a costo"
                  icon={DollarSign}
                />
                <MetricCard
                  title="Productos"
                  value={String(inventoryMetrics.totalItems)}
                  sub="lineas de inventario"
                  icon={Package}
                />
                <MetricCard
                  title="Unidades Totales"
                  value={formatNumber(inventoryMetrics.totalUnits)}
                  sub="en existencia"
                  icon={Warehouse}
                />
              </div>
            )}

            <DataTable
              columns={inventoryColumns}
              data={inventoryData}
              loading={inventoryLoading}
              emptyMessage="No hay datos de inventario disponibles"
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* TENDENCIAS                                                   */}
        {/* ============================================================ */}
        {activeTab === "tendencias" && (
          <div className="space-y-6">
            <DateFilters
              showBranch
              branchValue={trendsBranchId}
              onBranchChange={(id) => setTrendsBranchId(id)}
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              branches={branches}
              onRefresh={handleRefresh}
            />

            {/* Summary cards */}
            {!trendsLoading && trendsData.length > 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Ventas del Periodo"
                  value={formatMXN(trendsMetrics.totalSales)}
                  sub="acumulado en el rango"
                  icon={DollarSign}
                />
                <MetricCard
                  title="Ordenes del Periodo"
                  value={formatNumber(trendsMetrics.totalOrders)}
                  sub="ordenes totales"
                  icon={BarChart3}
                />
                <MetricCard
                  title="Promedio Diario"
                  value={formatMXN(trendsMetrics.avgDailySales)}
                  sub="venta promedio por dia"
                  icon={TrendingUp}
                />
                <MetricCard
                  title="Dias con Datos"
                  value={String(trendsMetrics.days)}
                  sub="en el periodo consultado"
                  icon={Store}
                />
              </div>
            )}

            <DataTable
              columns={trendsColumns}
              data={trendsData}
              loading={trendsLoading}
              emptyMessage="No hay datos de tendencias para el periodo seleccionado"
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* ESTADO DE RESULTADOS (P&L)                                   */}
        {/* ============================================================ */}
        {activeTab === "estado-resultados" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-44">
                <FormField label="Fecha Inicio">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </FormField>
              </div>
              <div className="w-44">
                <FormField label="Fecha Fin">
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </FormField>
              </div>
              <div className="w-52">
                <FormField label="Sucursal">
                  <Select value={pnlBranchId} onChange={(e) => setPnlBranchId(e.target.value)}>
                    <option value="">Todas las sucursales</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <Button onClick={handleRefresh} variant="outline" size="md">
                <RefreshCw className="h-4 w-4" />
                Consultar
              </Button>
              <Button
                onClick={handleExportPnl}
                variant="outline"
                size="md"
                disabled={pnlExporting || !pnlData}
              >
                <Download className="h-4 w-4" />
                {pnlExporting ? "Exportando..." : "Exportar Excel"}
              </Button>
            </div>

            {pnlLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Cargando estado de resultados...
              </div>
            )}

            {!pnlLoading && pnlData && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    title="Ingresos"
                    value={formatMXN(pnlData.revenue)}
                    sub="ventas totales del periodo"
                    icon={DollarSign}
                  />
                  <MetricCard
                    title="Utilidad Bruta"
                    value={formatMXN(pnlData.grossProfit)}
                    sub={`Margen: ${formatPct(pnlData.margins.grossMargin)}`}
                    icon={TrendingUp}
                  />
                  <MetricCard
                    title="Utilidad Operativa"
                    value={formatMXN(pnlData.operatingIncome)}
                    sub={`Margen: ${formatPct(pnlData.margins.operatingMargin)}`}
                    icon={BarChart3}
                  />
                  <MetricCard
                    title="Utilidad Neta"
                    value={formatMXN(pnlData.netIncome)}
                    sub={`Margen: ${formatPct(pnlData.margins.netMargin)}`}
                    icon={FileSpreadsheet}
                  />
                </div>

                {/* P&L Table */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="py-3 pl-4 text-left text-xs font-semibold uppercase text-gray-500">
                          Concepto
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold uppercase text-gray-500">
                          Monto
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold uppercase text-gray-500">
                          Margen
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <PnlRow label="Ingresos (Revenue)" amount={pnlData.revenue} bold />
                      <PnlRow label="Costo de Ventas" amount={pnlData.costOfGoods} negative />
                      <PnlRow
                        label="= Utilidad Bruta"
                        amount={pnlData.grossProfit}
                        margin={pnlData.margins.grossMargin}
                        bold
                      />
                      <tr>
                        <td
                          colSpan={3}
                          className="py-2 pl-4 text-xs font-semibold uppercase text-gray-400"
                        >
                          Gastos Operativos
                        </td>
                      </tr>
                      <PnlRow
                        label="Nomina y mano de obra"
                        amount={pnlData.operatingExpenses.labor}
                        indent
                      />
                      <PnlRow label="Renta" amount={pnlData.operatingExpenses.rent} indent />
                      <PnlRow
                        label="Servicios (luz/agua/gas)"
                        amount={pnlData.operatingExpenses.utilities}
                        indent
                      />
                      <PnlRow
                        label="Marketing"
                        amount={pnlData.operatingExpenses.marketing}
                        indent
                      />
                      <PnlRow
                        label="Mantenimiento"
                        amount={pnlData.operatingExpenses.maintenance}
                        indent
                      />
                      <PnlRow
                        label="Otros gastos"
                        amount={pnlData.operatingExpenses.other}
                        indent
                      />
                      <PnlRow
                        label="Total Gastos Operativos"
                        amount={pnlData.operatingExpenses.total}
                        negative
                        bold
                      />
                      <PnlRow
                        label="= Utilidad Operativa"
                        amount={pnlData.operatingIncome}
                        margin={pnlData.margins.operatingMargin}
                        bold
                      />
                      <PnlRow label="Otros Ingresos" amount={pnlData.otherIncome} />
                      <PnlRow label="Otros Gastos" amount={pnlData.otherExpenses} negative />
                      <tr className="bg-gray-100">
                        <td className="py-3 pl-4 text-sm font-bold text-gray-900">
                          = Utilidad Neta
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-bold text-gray-900">
                          {formatMXN(pnlData.netIncome)}
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-bold text-gray-600">
                          {formatPct(pnlData.margins.netMargin)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Bar chart: Revenue vs Costs vs Net */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Ingresos vs Costos vs Utilidad Neta
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={[
                        {
                          name: "Ingresos",
                          value: pnlData.revenue,
                          fill: "#22c55e",
                        },
                        {
                          name: "Costo Ventas",
                          value: pnlData.costOfGoods,
                          fill: "#ef4444",
                        },
                        {
                          name: "Gastos Op.",
                          value: pnlData.operatingExpenses.total,
                          fill: "#f59e0b",
                        },
                        {
                          name: "Utilidad Neta",
                          value: pnlData.netIncome,
                          fill: "#3b82f6",
                        },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatMXN(value)} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {[
                          { name: "Ingresos", fill: "#22c55e" },
                          { name: "Costo Ventas", fill: "#ef4444" },
                          { name: "Gastos Op.", fill: "#f59e0b" },
                          { name: "Utilidad Neta", fill: "#3b82f6" },
                        ].map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {!pnlLoading && !pnlData && (
              <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                Selecciona un periodo y presiona Consultar para ver el estado de resultados.
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* FLUJO DE EFECTIVO                                            */}
        {/* ============================================================ */}
        {activeTab === "flujo-efectivo" && (
          <div className="space-y-6">
            <DateFilters
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              branches={branches}
              onRefresh={handleRefresh}
            />

            {cashFlowLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Cargando flujo de efectivo...
              </div>
            )}

            {!cashFlowLoading && cashFlowData && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    title="Saldo Inicial"
                    value={formatMXN(cashFlowData.beginningBalance)}
                    sub="al inicio del periodo"
                    icon={Banknote}
                  />
                  <MetricCard
                    title="Flujo Operativo"
                    value={formatMXN(cashFlowData.operatingActivities.netOperating)}
                    sub="actividades operativas"
                    icon={TrendingUp}
                  />
                  <MetricCard
                    title="Flujo Neto"
                    value={formatMXN(cashFlowData.netCashFlow)}
                    sub="total del periodo"
                    icon={DollarSign}
                  />
                  <MetricCard
                    title="Saldo Final"
                    value={formatMXN(cashFlowData.endingBalance)}
                    sub="al cierre del periodo"
                    icon={Banknote}
                  />
                </div>

                {/* Three sections */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  {/* Operating Activities */}
                  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-sm font-semibold text-gray-700">
                      Actividades Operativas
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Cobros de ventas</span>
                        <span className="font-medium text-green-600">
                          +{formatMXN(cashFlowData.operatingActivities.cashFromSales)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Pagos a proveedores</span>
                        <span className="font-medium text-red-600">
                          -{formatMXN(cashFlowData.operatingActivities.cashToSuppliers)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Pagos de nomina</span>
                        <span className="font-medium text-red-600">
                          -{formatMXN(cashFlowData.operatingActivities.cashForPayroll)}
                        </span>
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
                        <span>Flujo operativo neto</span>
                        <span
                          className={
                            cashFlowData.operatingActivities.netOperating >= 0
                              ? "text-green-700"
                              : "text-red-700"
                          }
                        >
                          {formatMXN(cashFlowData.operatingActivities.netOperating)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Investing Activities */}
                  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-sm font-semibold text-gray-700">
                      Actividades de Inversion
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Inversiones</span>
                        <span className="font-medium text-gray-500">
                          {formatMXN(cashFlowData.investingActivities)}
                        </span>
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
                        <span>Flujo de inversion</span>
                        <span>{formatMXN(cashFlowData.investingActivities)}</span>
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-gray-400">
                      Sin movimientos de inversion en este periodo.
                    </p>
                  </div>

                  {/* Financing Activities */}
                  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-sm font-semibold text-gray-700">
                      Actividades de Financiamiento
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Financiamiento</span>
                        <span className="font-medium text-gray-500">
                          {formatMXN(cashFlowData.financingActivities)}
                        </span>
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
                        <span>Flujo de financiamiento</span>
                        <span>{formatMXN(cashFlowData.financingActivities)}</span>
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-gray-400">
                      Sin movimientos de financiamiento en este periodo.
                    </p>
                  </div>
                </div>

                {/* Bottom: Saldo Inicial -> Flujo Neto -> Saldo Final */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Resumen de Flujo de Efectivo
                  </h3>
                  <div className="flex flex-wrap items-center justify-center gap-4 text-center">
                    <div className="rounded-lg bg-gray-50 p-4 min-w-[160px]">
                      <p className="text-xs text-gray-500">Saldo Inicial</p>
                      <p className="mt-1 text-lg font-bold text-gray-900">
                        {formatMXN(cashFlowData.beginningBalance)}
                      </p>
                    </div>
                    <span className="text-2xl text-gray-400">+</span>
                    <div
                      className={`rounded-lg p-4 min-w-[160px] ${cashFlowData.netCashFlow >= 0 ? "bg-green-50" : "bg-red-50"}`}
                    >
                      <p className="text-xs text-gray-500">Flujo Neto</p>
                      <p
                        className={`mt-1 text-lg font-bold ${cashFlowData.netCashFlow >= 0 ? "text-green-700" : "text-red-700"}`}
                      >
                        {formatMXN(cashFlowData.netCashFlow)}
                      </p>
                    </div>
                    <span className="text-2xl text-gray-400">=</span>
                    <div className="rounded-lg bg-blue-50 p-4 min-w-[160px]">
                      <p className="text-xs text-gray-500">Saldo Final</p>
                      <p className="mt-1 text-lg font-bold text-blue-700">
                        {formatMXN(cashFlowData.endingBalance)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Waterfall-style chart using stacked bars */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Grafica de Flujo de Efectivo
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={[
                        { name: "Saldo Inicial", value: cashFlowData.beginningBalance },
                        { name: "Cobros", value: cashFlowData.operatingActivities.cashFromSales },
                        {
                          name: "Pago Proveedores",
                          value: -cashFlowData.operatingActivities.cashToSuppliers,
                        },
                        { name: "Nomina", value: -cashFlowData.operatingActivities.cashForPayroll },
                        { name: "Saldo Final", value: cashFlowData.endingBalance },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatMXN(value)} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {[
                          { fill: "#6b7280" },
                          { fill: "#22c55e" },
                          { fill: "#ef4444" },
                          { fill: "#ef4444" },
                          { fill: "#3b82f6" },
                        ].map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {!cashFlowLoading && !cashFlowData && (
              <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                Selecciona un periodo y presiona Consultar para ver el flujo de efectivo.
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* ANTIGUEDAD DE SALDOS                                         */}
        {/* ============================================================ */}
        {activeTab === "antiguedad-saldos" && (
          <div className="space-y-6">
            {/* Toggle + Export */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setAgingType("receivable")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    agingType === "receivable"
                      ? "bg-black text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Cuentas por Cobrar
                </button>
                <button
                  onClick={() => setAgingType("payable")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    agingType === "payable"
                      ? "bg-black text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Cuentas por Pagar
                </button>
              </div>
              <Button onClick={() => fetchAging(agingType)} variant="outline" size="md">
                <RefreshCw className="h-4 w-4" />
                Consultar
              </Button>
              <Button
                onClick={handleExportAging}
                variant="outline"
                size="md"
                disabled={agingExporting || !agingData}
              >
                <Download className="h-4 w-4" />
                {agingExporting ? "Exportando..." : "Exportar Excel"}
              </Button>
            </div>

            {agingLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Cargando antiguedad de saldos...
              </div>
            )}

            {!agingLoading && agingData && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
                  <MetricCard
                    title="Total"
                    value={formatMXN(agingData.total)}
                    sub={agingType === "receivable" ? "por cobrar" : "por pagar"}
                    icon={DollarSign}
                  />
                  <MetricCard
                    title="Corriente (0-30)"
                    value={formatMXN(agingData.buckets.current)}
                    sub="dias"
                    icon={Clock}
                  />
                  <MetricCard
                    title="31-60 dias"
                    value={formatMXN(agingData.buckets.days31to60)}
                    sub="vencido"
                    icon={Clock}
                  />
                  <MetricCard
                    title="61-90 dias"
                    value={formatMXN(agingData.buckets.days61to90)}
                    sub="vencido"
                    icon={Clock}
                  />
                  <MetricCard
                    title="90+ dias"
                    value={formatMXN(agingData.buckets.days90plus)}
                    sub="alto riesgo"
                    icon={Clock}
                  />
                </div>

                {/* Pie chart */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Distribucion por Antiguedad
                  </h3>
                  <div className="flex flex-col items-center md:flex-row md:justify-center gap-8">
                    <ResponsiveContainer width={280} height={280}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Corriente (0-30)", value: agingData.buckets.current },
                            { name: "31-60 dias", value: agingData.buckets.days31to60 },
                            { name: "61-90 dias", value: agingData.buckets.days61to90 },
                            { name: "90+ dias", value: agingData.buckets.days90plus },
                          ]}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          innerRadius={50}
                          dataKey="value"
                          label={({ percent }) =>
                            percent > 0 ? `${(percent * 100).toFixed(0)}%` : ""
                          }
                          labelLine={false}
                        >
                          {PIE_COLORS.map((color, i) => (
                            <Cell key={i} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatMXN(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {[
                        {
                          label: "Corriente (0-30 dias)",
                          color: PIE_COLORS[0],
                          value: agingData.buckets.current,
                        },
                        {
                          label: "31-60 dias",
                          color: PIE_COLORS[1],
                          value: agingData.buckets.days31to60,
                        },
                        {
                          label: "61-90 dias",
                          color: PIE_COLORS[2],
                          value: agingData.buckets.days61to90,
                        },
                        {
                          label: "90+ dias",
                          color: PIE_COLORS[3],
                          value: agingData.buckets.days90plus,
                        },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-3">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-sm text-gray-600">{item.label}</span>
                          <span className="text-sm font-medium text-gray-900">
                            {formatMXN(item.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Detail table */}
                <DataTable
                  columns={agingDetailColumns}
                  data={agingData.details}
                  loading={agingLoading}
                  emptyMessage={
                    agingType === "receivable"
                      ? "No hay cuentas por cobrar pendientes"
                      : "No hay cuentas por pagar pendientes"
                  }
                />
              </>
            )}

            {!agingLoading && !agingData && (
              <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                Presiona Consultar para ver la antiguedad de saldos.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
