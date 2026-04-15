"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PieChart,
  DollarSign,
  Save,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Building2,
  BarChart3,
  TrendingUp,
  Edit3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { useApiQuery } from "@/hooks/use-api-query";
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

interface ComparisonRow {
  category: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number;
  status: "UNDER" | "OVER";
}

interface ComparisonTotals {
  budget: number;
  actual: number;
  variance: number;
  variancePct: number;
  status: "UNDER" | "OVER";
}

interface ComparisonData {
  rows: ComparisonRow[];
  totals: ComparisonTotals;
}

interface BudgetEntry {
  id: string;
  branchId: string;
  year: number;
  month: number;
  category: string;
  budgetAmount: string | number;
  notes: string | null;
}

interface MultiBranchRow {
  branchId: string;
  branchName: string;
  branchCode: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  "LABOR",
  "FOOD_COST",
  "RENT",
  "UTILITIES",
  "MARKETING",
  "MAINTENANCE",
  "OTHER",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  LABOR: "Nomina",
  FOOD_COST: "Costo de Alimentos",
  RENT: "Renta",
  UTILITIES: "Servicios",
  MARKETING: "Marketing",
  MAINTENANCE: "Mantenimiento",
  OTHER: "Otros",
};

const MONTH_NAMES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

const MONTH_NAMES_FULL = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const TABS = [
  { key: "comparativo", label: "Presupuesto vs Real", icon: BarChart3 },
  { key: "captura", label: "Capturar Presupuesto", icon: Edit3 },
  { key: "sucursales", label: "Comparativo Sucursales", icon: Building2 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function formatMXN(value: number | string): string {
  return safeNum(value).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

function formatPct(value: number): string {
  const v = safeNum(value);
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PresupuestoPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("comparativo");

  // Shared state
  const { data: branches = [], isSuccess: branchesLoaded } = useApiQuery<Branch[]>(
    "/branches",
    ["branches"],
  );

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // ---- Tab 1: Comparativo ----
  const [compBranchId, setCompBranchId] = useState("");
  const [compYear, setCompYear] = useState(currentYear);
  const [compMonth, setCompMonth] = useState(currentMonth);
  const [compData, setCompData] = useState<ComparisonData | null>(null);
  const [compLoading, setCompLoading] = useState(false);

  // ---- Tab 2: Captura ----
  const [capBranchId, setCapBranchId] = useState("");
  const [capYear, setCapYear] = useState(currentYear);
  const [capGrid, setCapGrid] = useState<Record<string, Record<number, string>>>({});
  const [capLoading, setCapLoading] = useState(false);
  const [capSaving, setCapSaving] = useState(false);
  const [copyAdjustment, setCopyAdjustment] = useState("0");
  const [copyLoading, setCopyLoading] = useState(false);

  // ---- Tab 3: Multi-Branch ----
  const [mbYear, setMbYear] = useState(currentYear);
  const [mbMonth, setMbMonth] = useState(currentMonth);
  const [mbData, setMbData] = useState<MultiBranchRow[]>([]);
  const [mbLoading, setMbLoading] = useState(false);

  // =======================================================================
  // Set default branch when branches load
  // =======================================================================

  useEffect(() => {
    if (branches.length > 0) {
      setCompBranchId((prev) => prev || branches[0].id);
      setCapBranchId((prev) => prev || branches[0].id);
    }
  }, [branches]);

  // =======================================================================
  // Tab 1: Fetch comparison
  // =======================================================================

  const fetchComparison = useCallback(async () => {
    if (!compBranchId) return;
    setCompLoading(true);
    try {
      const data = await authFetch<ComparisonData>(
        "get",
        `/reportes/budget/comparison?branchId=${compBranchId}&year=${compYear}&month=${compMonth}`,
      );
      setCompData(data);
    } catch {
      toast("Error al cargar comparativo", "error");
    } finally {
      setCompLoading(false);
    }
  }, [authFetch, compBranchId, compYear, compMonth, toast]);

  useEffect(() => {
    if (activeTab === "comparativo" && compBranchId && branchesLoaded) {
      fetchComparison();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, compBranchId, compYear, compMonth, branchesLoaded]);

  // =======================================================================
  // Tab 2: Fetch budgets for grid
  // =======================================================================

  const fetchBudgets = useCallback(async () => {
    if (!capBranchId) return;
    setCapLoading(true);
    try {
      const data = await authFetch<BudgetEntry[]>(
        "get",
        `/reportes/budget?branchId=${capBranchId}&year=${capYear}`,
      );
      // Build grid: { [category]: { [month]: amount } }
      const grid: Record<string, Record<number, string>> = {};
      for (const cat of CATEGORIES) {
        grid[cat] = {};
        for (let m = 1; m <= 12; m++) {
          grid[cat][m] = "";
        }
      }
      for (const entry of data) {
        if (grid[entry.category]) {
          grid[entry.category][entry.month] = String(
            safeNum(entry.budgetAmount),
          );
        }
      }
      setCapGrid(grid);
    } catch {
      toast("Error al cargar presupuestos", "error");
    } finally {
      setCapLoading(false);
    }
  }, [authFetch, capBranchId, capYear, toast]);

  useEffect(() => {
    if (activeTab === "captura" && capBranchId && branchesLoaded) {
      fetchBudgets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, capBranchId, capYear, branchesLoaded]);

  // =======================================================================
  // Tab 2: Save budgets
  // =======================================================================

  const saveBudgets = useCallback(async () => {
    if (!capBranchId) return;
    setCapSaving(true);
    try {
      const budgets: { month: number; category: string; amount: number }[] = [];
      for (const cat of CATEGORIES) {
        for (let m = 1; m <= 12; m++) {
          const val = parseFloat(capGrid[cat]?.[m] || "0");
          if (val > 0) {
            budgets.push({ month: m, category: cat, amount: val });
          }
        }
      }
      await authFetch("post", "/reportes/budget/set-bulk", {
        branchId: capBranchId,
        year: capYear,
        budgets,
      });
      toast("Presupuesto guardado correctamente", "success");
    } catch {
      toast("Error al guardar presupuesto", "error");
    } finally {
      setCapSaving(false);
    }
  }, [authFetch, capBranchId, capYear, capGrid, toast]);

  // =======================================================================
  // Tab 2: Copy from previous year
  // =======================================================================

  const copyFromPrevYear = useCallback(async () => {
    if (!capBranchId) return;
    setCopyLoading(true);
    try {
      await authFetch("post", "/reportes/budget/copy", {
        branchId: capBranchId,
        fromYear: capYear - 1,
        toYear: capYear,
        adjustmentPercent: parseFloat(copyAdjustment) || 0,
      });
      toast("Presupuesto copiado del ano anterior", "success");
      fetchBudgets();
    } catch {
      toast("Error al copiar presupuesto", "error");
    } finally {
      setCopyLoading(false);
    }
  }, [authFetch, capBranchId, capYear, copyAdjustment, toast, fetchBudgets]);

  // =======================================================================
  // Tab 3: Fetch multi-branch
  // =======================================================================

  const fetchMultiBranch = useCallback(async () => {
    setMbLoading(true);
    try {
      const data = await authFetch<{ rows: MultiBranchRow[] }>(
        "get",
        `/reportes/budget/multi-branch?year=${mbYear}&month=${mbMonth}`,
      );
      setMbData(data.rows);
    } catch {
      toast("Error al cargar comparativo de sucursales", "error");
    } finally {
      setMbLoading(false);
    }
  }, [authFetch, mbYear, mbMonth, toast]);

  useEffect(() => {
    if (activeTab === "sucursales" && branchesLoaded) {
      fetchMultiBranch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, mbYear, mbMonth, branchesLoaded]);

  // =======================================================================
  // Grid cell handler
  // =======================================================================

  function handleGridChange(category: string, month: number, value: string) {
    setCapGrid((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [month]: value,
      },
    }));
  }

  // =======================================================================
  // Year options
  // =======================================================================

  const yearOptions = [];
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    yearOptions.push(y);
  }

  // =======================================================================
  // Chart data for Tab 1
  // =======================================================================

  const compChartData =
    compData?.rows.map((r) => ({
      name: CATEGORY_LABELS[r.category] || r.category,
      Presupuesto: r.budget,
      Real: r.actual,
    })) || [];

  // =======================================================================
  // Chart data for Tab 3
  // =======================================================================

  const mbChartData = mbData.map((r) => ({
    name: r.branchName,
    Presupuesto: r.budget,
    Real: r.actual,
  }));

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
          <h1 className="text-2xl font-bold text-gray-900">
            Presupuesto vs Real
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Controla y compara el presupuesto contra el gasto real por sucursal
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
                className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors whitespace-nowrap ${
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
        {/* TAB 1: PRESUPUESTO VS REAL                                   */}
        {/* ============================================================ */}
        {activeTab === "comparativo" && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-52">
                <FormField label="Sucursal" required>
                  <Select
                    value={compBranchId}
                    onChange={(e) => setCompBranchId(e.target.value)}
                  >
                    {branches.length === 0 && (
                      <option value="">Cargando...</option>
                    )}
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="w-28">
                <FormField label="Ano">
                  <Select
                    value={compYear}
                    onChange={(e) => setCompYear(Number(e.target.value))}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="w-36">
                <FormField label="Mes">
                  <Select
                    value={compMonth}
                    onChange={(e) => setCompMonth(Number(e.target.value))}
                  >
                    {MONTH_NAMES_FULL.map((name, i) => (
                      <option key={i} value={i + 1}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            </div>

            {compLoading && (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                Cargando...
              </div>
            )}

            {!compLoading && compData && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    title="Presupuesto Total"
                    value={formatMXN(compData.totals.budget)}
                    sub={`${MONTH_NAMES_FULL[compMonth - 1]} ${compYear}`}
                    icon={DollarSign}
                  />
                  <MetricCard
                    title="Gasto Real"
                    value={formatMXN(compData.totals.actual)}
                    sub="del periodo actual"
                    icon={TrendingUp}
                  />
                  <MetricCard
                    title="Variacion"
                    value={formatMXN(Math.abs(compData.totals.variance))}
                    sub={
                      compData.totals.status === "UNDER"
                        ? "por debajo del presupuesto"
                        : "por encima del presupuesto"
                    }
                    icon={
                      compData.totals.status === "UNDER"
                        ? CheckCircle2
                        : AlertTriangle
                    }
                    color={
                      compData.totals.status === "UNDER"
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  />
                  <MetricCard
                    title="Variacion %"
                    value={formatPct(compData.totals.variancePct)}
                    sub="respecto al presupuesto"
                    icon={PieChart}
                  />
                </div>

                {/* Table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                          Categoria
                        </th>
                        <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                          Presupuesto
                        </th>
                        <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                          Real
                        </th>
                        <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                          Variacion ($)
                        </th>
                        <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                          Variacion (%)
                        </th>
                        <th className="text-center text-sm font-medium text-muted-foreground px-4 py-3">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {compData.rows.map((row) => (
                        <tr
                          key={row.category}
                          className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium">
                            {CATEGORY_LABELS[row.category] || row.category}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatMXN(row.budget)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatMXN(row.actual)}
                          </td>
                          <td
                            className={`px-4 py-3 text-sm text-right font-medium ${
                              row.status === "UNDER"
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {formatMXN(row.variance)}
                          </td>
                          <td
                            className={`px-4 py-3 text-sm text-right font-medium ${
                              row.status === "UNDER"
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {formatPct(row.variancePct)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {row.status === "UNDER" ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" />
                            ) : (
                              <AlertTriangle className="h-5 w-5 text-red-500 inline-block" />
                            )}
                          </td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="bg-muted/50 font-bold">
                        <td className="px-4 py-3 text-sm">Total</td>
                        <td className="px-4 py-3 text-sm text-right">
                          {formatMXN(compData.totals.budget)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {formatMXN(compData.totals.actual)}
                        </td>
                        <td
                          className={`px-4 py-3 text-sm text-right ${
                            compData.totals.status === "UNDER"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatMXN(compData.totals.variance)}
                        </td>
                        <td
                          className={`px-4 py-3 text-sm text-right ${
                            compData.totals.status === "UNDER"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatPct(compData.totals.variancePct)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {compData.totals.status === "UNDER" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-red-500 inline-block" />
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Chart */}
                {compChartData.length > 0 && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 text-sm font-semibold text-gray-700">
                      Presupuesto vs Real por Categoria
                    </h3>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={compChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 12 }}
                          interval={0}
                          angle={-25}
                          textAnchor="end"
                          height={70}
                        />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v) =>
                            `$${(safeNum(v) / 1000).toFixed(0)}k`
                          }
                        />
                        <Tooltip
                          formatter={(value: number) => formatMXN(value)}
                        />
                        <Legend />
                        <Bar
                          dataKey="Presupuesto"
                          fill="#000000"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="Real"
                          fill="#6b7280"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: CAPTURAR PRESUPUESTO                                  */}
        {/* ============================================================ */}
        {activeTab === "captura" && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-52">
                <FormField label="Sucursal" required>
                  <Select
                    value={capBranchId}
                    onChange={(e) => setCapBranchId(e.target.value)}
                  >
                    {branches.length === 0 && (
                      <option value="">Cargando...</option>
                    )}
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="w-28">
                <FormField label="Ano">
                  <Select
                    value={capYear}
                    onChange={(e) => setCapYear(Number(e.target.value))}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <Button
                onClick={saveBudgets}
                disabled={capSaving}
                variant="primary"
                size="md"
              >
                <Save className="h-4 w-4" />
                {capSaving ? "Guardando..." : "Guardar Todo"}
              </Button>
              <div className="flex items-end gap-2">
                <div className="w-24">
                  <FormField label="Ajuste %">
                    <Input
                      type="number"
                      value={copyAdjustment}
                      onChange={(e) => setCopyAdjustment(e.target.value)}
                      placeholder="0"
                    />
                  </FormField>
                </div>
                <Button
                  onClick={copyFromPrevYear}
                  disabled={copyLoading}
                  variant="outline"
                  size="md"
                >
                  <Copy className="h-4 w-4" />
                  {copyLoading
                    ? "Copiando..."
                    : `Copiar de ${capYear - 1}`}
                </Button>
              </div>
            </div>

            {capLoading && (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                Cargando...
              </div>
            )}

            {!capLoading && (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left text-sm font-medium text-muted-foreground px-3 py-3 sticky left-0 bg-muted/50 z-10 min-w-[160px]">
                        Categoria
                      </th>
                      {MONTH_NAMES.map((name, i) => (
                        <th
                          key={i}
                          className="text-center text-sm font-medium text-muted-foreground px-1 py-3 min-w-[90px]"
                        >
                          {name}
                        </th>
                      ))}
                      <th className="text-right text-sm font-medium text-muted-foreground px-3 py-3 min-w-[100px]">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATEGORIES.map((cat) => {
                      const rowTotal = Object.values(capGrid[cat] || {}).reduce(
                        (sum, v) => sum + (parseFloat(v) || 0),
                        0,
                      );
                      return (
                        <tr
                          key={cat}
                          className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-3 py-2 text-sm font-medium sticky left-0 bg-white z-10">
                            {CATEGORY_LABELS[cat]}
                          </td>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(
                            (month) => (
                              <td key={month} className="px-1 py-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="100"
                                  className="w-full px-2 py-1.5 border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-black"
                                  value={capGrid[cat]?.[month] ?? ""}
                                  onChange={(e) =>
                                    handleGridChange(cat, month, e.target.value)
                                  }
                                  placeholder="0"
                                />
                              </td>
                            ),
                          )}
                          <td className="px-3 py-2 text-sm text-right font-medium">
                            {formatMXN(rowTotal)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Column totals */}
                    <tr className="bg-muted/50 font-bold">
                      <td className="px-3 py-3 text-sm sticky left-0 bg-muted/50 z-10">
                        Total
                      </td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(
                        (month) => {
                          const colTotal = CATEGORIES.reduce(
                            (sum, cat) =>
                              sum +
                              (parseFloat(capGrid[cat]?.[month] || "0") || 0),
                            0,
                          );
                          return (
                            <td
                              key={month}
                              className="px-1 py-3 text-sm text-center"
                            >
                              {formatMXN(colTotal)}
                            </td>
                          );
                        },
                      )}
                      <td className="px-3 py-3 text-sm text-right">
                        {formatMXN(
                          CATEGORIES.reduce(
                            (total, cat) =>
                              total +
                              Object.values(capGrid[cat] || {}).reduce(
                                (sum, v) => sum + (parseFloat(v) || 0),
                                0,
                              ),
                            0,
                          ),
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: COMPARATIVO SUCURSALES                                */}
        {/* ============================================================ */}
        {activeTab === "sucursales" && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-28">
                <FormField label="Ano">
                  <Select
                    value={mbYear}
                    onChange={(e) => setMbYear(Number(e.target.value))}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="w-36">
                <FormField label="Mes">
                  <Select
                    value={mbMonth}
                    onChange={(e) => setMbMonth(Number(e.target.value))}
                  >
                    {MONTH_NAMES_FULL.map((name, i) => (
                      <option key={i} value={i + 1}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            </div>

            {mbLoading && (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                Cargando...
              </div>
            )}

            {!mbLoading && mbData.length > 0 && (
              <>
                {/* Table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                          Sucursal
                        </th>
                        <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                          Presupuesto
                        </th>
                        <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                          Real
                        </th>
                        <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                          Variacion ($)
                        </th>
                        <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                          Variacion (%)
                        </th>
                        <th className="text-center text-sm font-medium text-muted-foreground px-4 py-3">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {mbData.map((row) => (
                        <tr
                          key={row.branchId}
                          className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium">
                            {row.branchName}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatMXN(row.budget)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {formatMXN(row.actual)}
                          </td>
                          <td
                            className={`px-4 py-3 text-sm text-right font-medium ${
                              row.variance >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {formatMXN(row.variance)}
                          </td>
                          <td
                            className={`px-4 py-3 text-sm text-right font-medium ${
                              row.variance >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {formatPct(row.variancePct)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {row.status === "UNDER" ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" />
                            ) : (
                              <AlertTriangle className="h-5 w-5 text-red-500 inline-block" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Chart */}
                {mbChartData.length > 0 && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 text-sm font-semibold text-gray-700">
                      Comparativo por Sucursal -{" "}
                      {MONTH_NAMES_FULL[mbMonth - 1]} {mbYear}
                    </h3>
                    <ResponsiveContainer width="100%" height={Math.max(300, mbChartData.length * 50)}>
                      <BarChart
                        data={mbChartData}
                        layout="vertical"
                        margin={{ left: 20, right: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v) =>
                            `$${(safeNum(v) / 1000).toFixed(0)}k`
                          }
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 12 }}
                          width={120}
                        />
                        <Tooltip
                          formatter={(value: number) => formatMXN(value)}
                        />
                        <Legend />
                        <Bar
                          dataKey="Presupuesto"
                          fill="#000000"
                          radius={[0, 4, 4, 0]}
                        />
                        <Bar
                          dataKey="Real"
                          fill="#6b7280"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}

            {!mbLoading && mbData.length === 0 && (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                No hay datos de presupuesto para el periodo seleccionado
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricCard Sub-component
// ---------------------------------------------------------------------------

function MetricCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  sub: string;
  icon: typeof DollarSign;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
          <Icon className={`h-5 w-5 ${color || "text-black"}`} />
        </div>
      </div>
      <p className={`mt-3 text-2xl font-bold ${color || "text-gray-900"}`}>
        {value}
      </p>
      <p className="mt-1 text-sm text-gray-500">{sub}</p>
    </div>
  );
}
