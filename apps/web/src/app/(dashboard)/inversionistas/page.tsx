"use client";

import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  Percent,
  Receipt,
  RefreshCw,
  Building2,
  FileText,
  BarChart3,
  Download,
  AlertTriangle,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { generateFinancialPDF } from "@/lib/pdf-generator";
import { useAuth } from "@/hooks/use-auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Branch {
  id: string;
  name: string;
}

interface BranchProfitability {
  branchId: string;
  branchName: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  margin: number;
  transactions: number;
  averageTicket: number;
}

interface PnlItem {
  label: string;
  amount: number;
  children?: PnlItem[];
}

interface PnlData {
  revenue: PnlItem;
  cogs: PnlItem;
  grossProfit: PnlItem;
  operatingExpenses: PnlItem;
  operatingIncome: PnlItem;
  otherIncome?: PnlItem;
  otherExpenses?: PnlItem;
  netIncome: PnlItem;
  [key: string]: PnlItem | undefined;
}

interface RoiData {
  totalInvested: number;
  totalReturn: number;
  roi: number;
  annualizedRoi: number;
  paybackMonths: number;
  byBranch: {
    branchId: string;
    branchName: string;
    invested: number;
    netReturn: number;
    roi: number;
  }[];
}

type DataStatus = "OK" | "PARTIAL_DATA" | "NO_DATA";

interface TrendsData {
  months: string[];
  sales: number[];
  expenses: number[];
  profit: number[];
  employeeCount: number[];
  dataStatus?: DataStatus;
  dataQuality?: {
    hasSales?: boolean;
    hasExpenses?: boolean;
  };
}

interface KpisData {
  currentMonthSales: number;
  previousMonthSales: number;
  salesGrowth: number;
  averageTicket: number;
  inventoryTurnover: number;
  cashPosition: number;
  accountsPayable: number;
  accountsReceivable: number;
  employeeCostRatio: number;
  topSellingProducts: { name: string; quantity: number; revenue: number }[];
  topBranches: { name: string; sales: number }[];
  dataStatus?: DataStatus;
  dataQuality?: {
    hasCurrentSales?: boolean;
    hasPreviousSales?: boolean;
    salesGrowthAvailable?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: "rentabilidad", label: "Rentabilidad por Sucursal", icon: Building2 },
  { key: "pnl", label: "Estado de Resultados (P&L)", icon: FileText },
  { key: "roi", label: "ROI", icon: BarChart3 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function fmtMXN(value: number): string {
  return safeNum(value).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

function fmtPct(value: number): string {
  return `${safeNum(value).toFixed(1)}%`;
}

function getDefaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    startDate: `${y}-${m}-01`,
    endDate: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InversionistasPage() {
  const { loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // --- state ----------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<TabKey>("rentabilidad");
  const defaults = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);

  // --- React Query fetchers --------------------------------------------------
  const { data: branches = [] } = useApiQuery<Branch[]>("/branches", ["branches"]);

  const { data: profitability = [], isLoading: loadingProfit } = useApiQuery<BranchProfitability[]>(
    `/inversionistas/profitability/by-branch?startDate=${startDate}&endDate=${endDate}`,
    ["inversionistas-profitability", startDate, endDate],
  );

  const { data: pnl, isLoading: loadingPnl } = useApiQuery<PnlData>(
    `/inversionistas/pnl?startDate=${startDate}&endDate=${endDate}`,
    ["inversionistas-pnl", startDate, endDate],
  );

  const { data: roi, isLoading: loadingRoi } = useApiQuery<RoiData>(
    `/inversionistas/roi?startDate=${startDate}&endDate=${endDate}`,
    ["inversionistas-roi", startDate, endDate],
  );

  const { data: trends, isLoading: analyticsLoading } = useApiQuery<TrendsData>(
    "/reportes/analytics/trends",
    ["analytics-trends"],
  );

  const { data: analyticsKpis } = useApiQuery<KpisData>("/reportes/analytics/kpis", [
    "analytics-kpis",
  ]);

  const hasAnalyticsSales = Boolean(
    analyticsKpis?.dataQuality?.hasCurrentSales ??
      (analyticsKpis ? safeNum(analyticsKpis.currentMonthSales) !== 0 : false),
  );
  const hasSalesGrowthData = Boolean(
    analyticsKpis?.dataQuality?.salesGrowthAvailable ??
      (analyticsKpis ? safeNum(analyticsKpis.previousMonthSales) !== 0 : false),
  );
  const trendHasCashFlowData = Boolean(
    trends &&
      trends.dataStatus !== "NO_DATA" &&
      (trends.sales.some((value) => safeNum(value) !== 0) ||
        trends.expenses.some((value) => safeNum(value) !== 0)),
  );
  const estimatedAnnualReturn =
    analyticsKpis && hasAnalyticsSales
      ? (analyticsKpis.currentMonthSales -
          analyticsKpis.previousMonthSales * (analyticsKpis.employeeCostRatio / 100 + 0.55)) *
        12
      : null;
  const estimatedRoi =
    analyticsKpis && hasAnalyticsSales && analyticsKpis.cashPosition > 0
      ? ((analyticsKpis.currentMonthSales * 12 * 0.15) / analyticsKpis.cashPosition) * 100
      : null;

  // --- derived KPIs ---------------------------------------------------------
  const kpis = useMemo(() => {
    const totalRevenue = profitability.reduce((s, b) => s + b.revenue, 0);
    const totalNetProfit = profitability.reduce((s, b) => s + b.netProfit, 0);
    const totalTransactions = profitability.reduce((s, b) => s + (b.transactions || 0), 0);
    const avgTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    const roiValue = roi?.roi ?? 0;

    return [
      {
        title: "Ingresos Totales",
        value: fmtMXN(totalRevenue),
        icon: DollarSign,
      },
      {
        title: "Utilidad Neta",
        value: fmtMXN(totalNetProfit),
        icon: TrendingUp,
      },
      {
        title: "ROI",
        value: fmtPct(roiValue),
        icon: Percent,
      },
      {
        title: "Ticket Promedio",
        value: fmtMXN(avgTicket),
        icon: Receipt,
      },
    ];
  }, [profitability, roi]);

  // --- table columns --------------------------------------------------------
  const profitColumns = useMemo(
    () => [
      { key: "branchName", header: "Sucursal" },
      {
        key: "revenue",
        header: "Ingresos",
        className: "text-right",
        render: (row: BranchProfitability) => fmtMXN(row.revenue),
      },
      {
        key: "cogs",
        header: "Costo de Venta",
        className: "text-right",
        render: (row: BranchProfitability) => fmtMXN(row.cogs),
      },
      {
        key: "grossProfit",
        header: "Utilidad Bruta",
        className: "text-right",
        render: (row: BranchProfitability) => fmtMXN(row.grossProfit),
      },
      {
        key: "operatingExpenses",
        header: "Gastos Op.",
        className: "text-right",
        render: (row: BranchProfitability) => fmtMXN(row.operatingExpenses),
      },
      {
        key: "netProfit",
        header: "Utilidad Neta",
        className: "text-right",
        render: (row: BranchProfitability) => (
          <span
            className={
              row.netProfit >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"
            }
          >
            {fmtMXN(row.netProfit)}
          </span>
        ),
      },
      {
        key: "margin",
        header: "Margen",
        className: "text-right",
        render: (row: BranchProfitability) => (
          <span className="font-medium text-black">{fmtPct(row.margin)}</span>
        ),
      },
    ],
    [],
  );

  // --- refresh --------------------------------------------------------------
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["inversionistas-profitability"] });
    queryClient.invalidateQueries({ queryKey: ["inversionistas-pnl"] });
    queryClient.invalidateQueries({ queryKey: ["inversionistas-roi"] });
  };

  // --- loading guard --------------------------------------------------------
  if (authLoading) {
    return <div className="flex h-96 items-center justify-center text-gray-400">Cargando...</div>;
  }

  // --- render ---------------------------------------------------------------
  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard de Inversionistas</h1>
          <p className="mt-1 text-sm text-gray-500">Indicadores clave de rendimiento</p>
        </div>

        {/* Date range + refresh */}
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
          <button
            onClick={() =>
              generateFinancialPDF({
                profitability,
                startDate,
                endDate,
                roi: roi ?? undefined,
              })
            }
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Descargar PDF
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.title}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-500">{kpi.title}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                  <Icon className="h-5 w-5 text-black" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-bold text-gray-900">
                {loadingProfit ? "..." : kpi.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="mt-8 border-b border-gray-200">
        <div className="flex gap-6">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "border-black text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700"
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
        {/* ---- Rentabilidad por Sucursal ---- */}
        {activeTab === "rentabilidad" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Rentabilidad por Sucursal</h2>
              <span className="text-sm text-gray-500">{branches.length} sucursales</span>
            </div>
            <DataTable
              columns={profitColumns}
              data={profitability}
              loading={loadingProfit}
              emptyMessage="Sin datos de rentabilidad para el periodo seleccionado"
            />
          </div>
        )}

        {/* ---- Estado de Resultados (P&L) ---- */}
        {activeTab === "pnl" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Estado de Resultados Consolidado
            </h2>

            {loadingPnl ? (
              <div className="rounded-lg border p-8 text-center text-gray-400">Cargando...</div>
            ) : !pnl ? (
              <div className="rounded-lg border p-8 text-center text-gray-400">
                Sin datos para el periodo seleccionado
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <PnlSection item={pnl.revenue} bold />
                {pnl.revenue?.children?.map((child, i) => (
                  <PnlSection key={i} item={child} indent />
                ))}
                <PnlSection item={pnl.cogs} />
                {pnl.cogs?.children?.map((child, i) => (
                  <PnlSection key={i} item={child} indent />
                ))}
                <PnlSection item={pnl.grossProfit} bold highlight />
                <PnlSection item={pnl.operatingExpenses} />
                {pnl.operatingExpenses?.children?.map((child, i) => (
                  <PnlSection key={i} item={child} indent />
                ))}
                <PnlSection item={pnl.operatingIncome} bold highlight />
                {pnl.otherIncome && <PnlSection item={pnl.otherIncome} />}
                {pnl.otherExpenses && <PnlSection item={pnl.otherExpenses} />}
                <PnlSection item={pnl.netIncome} bold highlight accent />
              </div>
            )}
          </div>
        )}

        {/* ---- ROI ---- */}
        {activeTab === "roi" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Retorno sobre Inversion</h2>

            {loadingRoi ? (
              <div className="rounded-lg border p-8 text-center text-gray-400">Cargando...</div>
            ) : !roi ? (
              <div className="rounded-lg border p-8 text-center text-gray-400">
                Sin datos de ROI para el periodo seleccionado
              </div>
            ) : (
              <>
                {/* ROI summary cards */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard label="Inversion Total" value={fmtMXN(roi.totalInvested)} />
                  <MetricCard label="Retorno Total" value={fmtMXN(roi.totalReturn)} />
                  <MetricCard label="ROI" value={fmtPct(roi.roi)} />
                  <MetricCard label="ROI Anualizado" value={fmtPct(roi.annualizedRoi)} />
                </div>

                {roi.paybackMonths > 0 && (
                  <p className="text-sm text-gray-500">
                    Periodo estimado de recuperacion:{" "}
                    <span className="font-semibold text-gray-900">{roi.paybackMonths} meses</span>
                  </p>
                )}

                {/* ROI by branch */}
                {roi.byBranch && roi.byBranch.length > 0 && (
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900">ROI por Sucursal</h3>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Sucursal
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Inversion
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Retorno Neto
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                            ROI
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {roi.byBranch.map((b) => (
                          <tr key={b.branchId} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {b.branchName}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-700">
                              {fmtMXN(b.invested)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-700">
                              <span
                                className={b.netReturn >= 0 ? "text-green-600" : "text-red-600"}
                              >
                                {fmtMXN(b.netReturn)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-black">
                              {fmtPct(b.roi)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* Analytics Charts Section                                          */}
      {/* ================================================================ */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Analytics Avanzado</h2>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Monthly P&L Trend */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Tendencia P&L Mensual
            </h3>
            <div className="mt-4 h-72">
              {analyticsLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  Cargando...
                </div>
              ) : trends && trends.months.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trends.months.map((m, i) => ({
                      month: m,
                      ingresos: trends.sales[i],
                      costos: trends.expenses[i],
                      utilidad: trends.profit[i],
                    }))}
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10, fill: "#888" }}
                      tickFormatter={(v: string) => {
                        const parts = v.split("-");
                        const names = [
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
                        return names[parseInt(parts[1], 10) - 1] || v;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#888" }}
                      tickFormatter={(v: number) => {
                        const val = safeNum(v);
                        if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
                        if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
                        return `$${val}`;
                      }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        fmtMXN(value),
                        name === "ingresos"
                          ? "Ingresos"
                          : name === "costos"
                            ? "Costos"
                            : "Utilidad",
                      ]}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e5e5e5" }}
                    />
                    <Legend
                      formatter={(value: string) =>
                        value === "ingresos"
                          ? "Ingresos"
                          : value === "costos"
                            ? "Costos"
                            : "Utilidad"
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="ingresos"
                      stroke="#000000"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="costos"
                      stroke="#9ca3af"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="utilidad"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  Sin datos de tendencia
                </div>
              )}
            </div>
          </div>

          {/* ROI Calculator */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Calculadora ROI
            </h3>
            <div className="mt-6 space-y-5">
              {analyticsLoading ? (
                <div className="flex h-40 items-center justify-center text-sm text-gray-400">
                  Cargando...
                </div>
              ) : analyticsKpis ? (
                <>
                  {!hasAnalyticsSales && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Sin ventas POS/Corntech sincronizadas para el mes actual.</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <span className="text-sm text-gray-600">Posicion en Efectivo</span>
                    <span className="text-lg font-bold text-gray-900">
                      {fmtMXN(analyticsKpis.cashPosition)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <span className="text-sm text-gray-600">Ventas Mensuales</span>
                    <span className="text-lg font-bold text-gray-900">
                      {hasAnalyticsSales ? fmtMXN(analyticsKpis.currentMonthSales) : "Sin datos"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <span className="text-sm text-gray-600">Retorno Estimado Anual</span>
                    <span className="text-lg font-bold text-green-600">
                      {estimatedAnnualReturn !== null ? fmtMXN(estimatedAnnualReturn) : "--"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <span className="text-sm text-gray-600">ROI Estimado</span>
                    <span className="text-2xl font-bold text-black">
                      {estimatedRoi !== null ? fmtPct(estimatedRoi) : "--"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Crecimiento de Ventas</span>
                    <span
                      className={`text-lg font-bold ${
                        !hasSalesGrowthData
                          ? "text-gray-500"
                          : analyticsKpis.salesGrowth >= 0
                            ? "text-green-600"
                            : "text-red-600"
                      }`}
                    >
                      {hasSalesGrowthData
                        ? `${analyticsKpis.salesGrowth >= 0 ? "+" : ""}${fmtPct(
                            analyticsKpis.salesGrowth,
                          )}`
                        : "--"}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-gray-400">
                  Sin datos disponibles
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cash Flow Chart (full width) */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            Flujo de Efectivo Mensual
          </h3>
          <div className="mt-4 h-72">
            {analyticsLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                Cargando...
              </div>
            ) : trends && trendHasCashFlowData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trends.months.map((m, i) => ({
                    month: m,
                    entradas: trends.sales[i],
                    salidas: trends.expenses[i],
                  }))}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: "#888" }}
                    tickFormatter={(v: string) => {
                      const parts = v.split("-");
                      const names = [
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
                      return names[parseInt(parts[1], 10) - 1] || v;
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#888" }}
                    tickFormatter={(v: number) => {
                      const val = safeNum(v);
                      if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
                      if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
                      return `$${val}`;
                    }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      fmtMXN(value),
                      name === "entradas" ? "Entradas" : "Salidas",
                    ]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e5e5" }}
                  />
                  <Legend
                    formatter={(value: string) => (value === "entradas" ? "Entradas" : "Salidas")}
                  />
                  <Bar dataKey="entradas" fill="#000000" radius={[4, 4, 0, 0]} barSize={18} />
                  <Bar dataKey="salidas" fill="#999999" radius={[4, 4, 0, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                Sin datos de flujo
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PnlSection({
  item,
  bold,
  indent,
  highlight,
  accent,
}: {
  item: PnlItem;
  bold?: boolean;
  indent?: boolean;
  highlight?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-5 py-3 ${
        highlight ? "bg-gray-50" : ""
      } ${accent ? "bg-gray-100" : ""} border-b border-gray-100 last:border-0`}
    >
      <span
        className={`text-sm ${bold ? "font-semibold" : ""} ${
          indent ? "pl-6 text-gray-600" : "text-gray-900"
        }`}
      >
        {item.label}
      </span>
      <span
        className={`text-sm tabular-nums ${bold ? "font-semibold" : ""} ${
          accent ? "text-gray-900 font-bold" : item.amount < 0 ? "text-red-600" : "text-gray-900"
        }`}
      >
        {fmtMXN(item.amount)}
      </span>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
