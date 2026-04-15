"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { hasRole } from "@/lib/auth";
import { DateRangePicker, type DateRange } from "@/components/dashboard/date-range-picker";
import {
  Building2,
  Package,
  ShoppingCart,
  FileText,
  BarChart3,
  Landmark,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Clock,
  Truck,
  ClipboardList,
  DollarSign,
  Receipt,
  Calculator,
  ChevronDown,
  RefreshCw,
  Warehouse,
  PieChart as PieChartIcon,
  Users,
  ArrowLeft,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { safeNum } from "@luka/shared";

// =============================================================================
// Helpers
// =============================================================================

function fmt(v: number): string {
  return safeNum(v).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function fmtCompact(v: number): string {
  const sv = safeNum(v);
  if (Math.abs(sv) >= 1_000_000) return `$${(sv / 1_000_000).toFixed(1)}M`;
  if (Math.abs(sv) >= 1_000) return `$${(sv / 1_000).toFixed(0)}k`;
  return fmt(sv);
}

function fmtNum(v: number): string {
  return safeNum(v).toLocaleString("es-MX");
}

type DashboardView = "investor" | "store" | "cedis" | "accountant";

const VIEW_LABELS: Record<DashboardView, string> = {
  store: "Mi Tienda",
  cedis: "CEDIS",
  investor: "Inversionista",
  accountant: "Contabilidad",
};

// Determine which dashboard view the user should see by default
function getDefaultView(roles: Array<{ roleName: string }>): DashboardView {
  const names = roles.map((r) => r.roleName);
  if (names.includes("owner") || names.includes("admin") || names.includes("investor"))
    return "investor";
  if (names.includes("accountant")) return "accountant";
  if (names.includes("cedis_manager")) return "cedis";
  return "store";
}

function canSwitchViews(roles: Array<{ roleName: string }>): boolean {
  const names = roles.map((r) => r.roleName);
  return names.includes("owner") || names.includes("admin");
}

// =============================================================================
// Shared Components
// =============================================================================

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendLabel,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number | null;
  trendLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide truncate mr-2">
          {title}
        </p>
        <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-black shrink-0">
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
        </div>
      </div>
      <p className="mt-2 sm:mt-3 text-xl sm:text-2xl font-bold text-foreground truncate">{value}</p>
      {trend !== undefined && trend !== null && (
        <div className="mt-1 flex items-center gap-1">
          {trend >= 0 ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
          )}
          <span className={`text-xs font-medium ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
            {trend >= 0 ? "+" : ""}
            {trend}%
          </span>
          {trendLabel && <span className="text-xs text-muted-foreground ml-1">{trendLabel}</span>}
        </div>
      )}
      {subtitle && !trend && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function QuickAction({
  label,
  href,
  icon: Icon,
}: {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm hover:bg-black hover:text-white hover:border-black transition-colors"
    >
      <Icon className="h-4 w-4" />
      {label}
    </a>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
      Cargando...
    </div>
  );
}

// =============================================================================
// STORE DASHBOARD
// =============================================================================

function StoreDashboard({
  data,
  loading,
  branches,
  selectedBranch,
  onBranchChange,
}: {
  data: any;
  loading: boolean;
  branches: Array<{ id: string; name: string }>;
  selectedBranch: string;
  onBranchChange: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return <EmptyState message="No se pudo cargar el dashboard" />;

  return (
    <div className="mt-6 space-y-6">
      {/* Branch selector */}
      {branches.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground">Sucursal:</label>
          <div className="relative">
            <select
              value={selectedBranch}
              onChange={(e) => onBranchChange(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-card px-4 py-2 pr-8 text-sm font-medium text-foreground shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title="Stock Total"
          value={fmtNum(data.stock?.totalProducts || 0)}
          subtitle="en inventario"
          icon={Package}
        />
        <KpiCard
          title="Bajo Minimo"
          value={data.stock?.lowStockCount || 0}
          subtitle="por debajo"
          icon={AlertTriangle}
        />
        <KpiCard
          title="Ventas Hoy"
          value={fmt(data.salesToday?.total || 0)}
          subtitle={`${data.salesToday?.count || 0} txns`}
          icon={DollarSign}
        />
        <KpiCard
          title="Requisiciones"
          value={data.pendingRequisitions || 0}
          subtitle="pendientes"
          icon={ClipboardList}
        />
      </div>

      {/* Row 2: Expiring lots + Recent transfers */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Lotes por Vencer (7 dias)">
          {data.expiringLots?.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.expiringLots.map((lot: any) => (
                <div
                  key={lot.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                    lot.daysUntilExpiry <= 2
                      ? "border-red-200 bg-red-50"
                      : lot.daysUntilExpiry <= 4
                        ? "border-yellow-200 bg-yellow-50"
                        : "border-border bg-muted"
                  }`}
                >
                  <div>
                    <p className="font-medium text-foreground">{lot.product}</p>
                    <p className="text-xs text-muted-foreground">
                      Lote {lot.lotNumber} - {lot.quantity} unidades
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      lot.daysUntilExpiry <= 2
                        ? "text-red-600"
                        : lot.daysUntilExpiry <= 4
                          ? "text-yellow-600"
                          : "text-muted-foreground"
                    }`}
                  >
                    {lot.daysUntilExpiry === 0
                      ? "Hoy"
                      : lot.daysUntilExpiry === 1
                        ? "Manana"
                        : `${lot.daysUntilExpiry} dias`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Sin lotes por vencer esta semana" />
          )}
        </SectionCard>

        <SectionCard title="Transferencias Recientes">
          {data.recentTransfers?.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.recentTransfers.map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {t.direction === "INCOMING" ? (
                      <ArrowDownRight className="h-4 w-4 text-green-500" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-blue-500" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">
                        {t.direction === "INCOMING" ? `De ${t.from}` : `A ${t.to}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString("es-MX")}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.status === "RECEIVED"
                        ? "bg-green-100 text-green-700"
                        : t.status === "IN_TRANSIT"
                          ? "bg-blue-100 text-blue-700"
                          : t.status === "PENDING"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {t.status === "RECEIVED"
                      ? "Recibido"
                      : t.status === "IN_TRANSIT"
                        ? "En transito"
                        : t.status === "PENDING"
                          ? "Pendiente"
                          : t.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Sin transferencias recientes" />
          )}
        </SectionCard>
      </div>

      {/* Row 3: Sales chart + Waste + Quick actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Ventas Ultimos 7 Dias">
          {data.salesByDay?.some((d: any) => d.total > 0) ? (
            <div className="h-52 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.salesByDay} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#888" }}
                    tickFormatter={(v: number) => fmtCompact(v)}
                    width={45}
                  />
                  <Tooltip
                    formatter={(value: number) => [fmt(value), "Ventas"]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e5e5e5",
                      fontSize: 12,
                      backgroundColor: "var(--color-card, #fff)",
                    }}
                  />
                  <Bar dataKey="total" fill="#000000" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState message="Sin datos de ventas" />
          )}
        </SectionCard>

        <div className="space-y-6">
          {/* Waste summary */}
          <SectionCard title="Merma Semanal">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-muted p-3 text-center">
                <p className="text-xs text-muted-foreground uppercase">Esta semana</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {fmt(data.waste?.thisWeek || 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.waste?.thisWeekCount || 0} registros
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted p-3 text-center">
                <p className="text-xs text-muted-foreground uppercase">Semana pasada</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {fmt(data.waste?.lastWeek || 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.waste?.lastWeekCount || 0} registros
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Quick actions */}
          <div>
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
              Acciones Rapidas
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <QuickAction
                label="Nueva Requisicion"
                href="/requisiciones/nueva"
                icon={ClipboardList}
              />
              <QuickAction label="Nuevo Conteo" href="/inventarios/conteo" icon={Package} />
              <QuickAction label="Registrar Merma" href="/inventarios/merma" icon={AlertTriangle} />
              <QuickAction label="Ver Inventario" href="/inventarios" icon={Warehouse} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CEDIS DASHBOARD
// =============================================================================

function CedisDashboard({ data, loading }: { data: any; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return <EmptyState message="No se pudo cargar el dashboard" />;

  return (
    <div className="mt-6 space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title="Requisiciones"
          value={data.requisitions?.total || 0}
          subtitle={
            data.requisitions?.URGENT ? `${data.requisitions.URGENT} urgentes` : "pendientes"
          }
          icon={ClipboardList}
        />
        <KpiCard
          title="Transferencias"
          value={data.activeTransfers || 0}
          subtitle="en transito"
          icon={Truck}
        />
        <KpiCard
          title="Reabastecimiento"
          value={data.reorderAlerts || 0}
          subtitle="bajo minimo"
          icon={AlertTriangle}
        />
        <KpiCard
          title="Despachos Hoy"
          value={data.todaysDispatches || 0}
          subtitle="enviadas"
          icon={ShoppingCart}
        />
      </div>

      {/* Row 2: Urgent requisitions + Top products */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Requisiciones Urgentes">
          {data.urgentRequisitions?.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.urgentRequisitions.map((r: any) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                    r.priority === "URGENT"
                      ? "border-red-200 bg-red-50"
                      : "border-orange-200 bg-orange-50"
                  }`}
                >
                  <div>
                    <p className="font-medium text-foreground">{r.branch}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.itemCount} productos - {new Date(r.createdAt).toLocaleDateString("es-MX")}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      r.priority === "URGENT"
                        ? "bg-red-100 text-red-700"
                        : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {r.priority === "URGENT" ? "URGENTE" : "ALTA"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Sin requisiciones urgentes" />
          )}
        </SectionCard>

        <SectionCard title="Top Productos Solicitados (Semana)">
          {data.topRequestedProducts?.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left text-xs font-semibold text-muted-foreground uppercase">
                    Producto
                  </th>
                  <th className="pb-2 text-right text-xs font-semibold text-muted-foreground uppercase">
                    Solicitudes
                  </th>
                  <th className="pb-2 text-right text-xs font-semibold text-muted-foreground uppercase">
                    Cantidad
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topRequestedProducts.map((p: any, i: number) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 text-sm font-medium text-foreground">{p.name}</td>
                    <td className="py-2.5 text-sm text-right text-muted-foreground">{p.count}</td>
                    <td className="py-2.5 text-sm text-right text-muted-foreground">
                      {fmtNum(Math.round(p.totalQty))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState message="Sin datos de productos" />
          )}
        </SectionCard>
      </div>

      {/* Row 3: Priority breakdown + Expiring lots */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Requisiciones por Prioridad">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "Urgente",
                value: data.requisitions?.URGENT || 0,
                color: "bg-red-100 text-red-700",
              },
              {
                label: "Alta",
                value: data.requisitions?.HIGH || 0,
                color: "bg-orange-100 text-orange-700",
              },
              {
                label: "Normal",
                value: data.requisitions?.NORMAL || 0,
                color: "bg-blue-100 text-blue-700",
              },
              {
                label: "Baja",
                value: data.requisitions?.LOW || 0,
                color: "bg-gray-100 text-gray-700",
              },
            ].map((item) => (
              <div key={item.label} className={`rounded-lg px-3 py-3 text-center ${item.color}`}>
                <p className="text-2xl font-bold">{item.value}</p>
                <p className="text-xs font-medium mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Lotes por Vencer (Semana)">
          {data.expiringLots?.length > 0 ? (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {data.expiringLots.map((lot: any) => (
                <div
                  key={lot.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                    lot.daysUntilExpiry <= 2
                      ? "border-red-200 bg-red-50"
                      : "border-yellow-200 bg-yellow-50"
                  }`}
                >
                  <div>
                    <p className="font-medium text-foreground">{lot.product}</p>
                    <p className="text-xs text-muted-foreground">
                      {lot.branch} - Lote {lot.lotNumber}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      lot.daysUntilExpiry <= 2 ? "text-red-600" : "text-yellow-600"
                    }`}
                  >
                    {lot.daysUntilExpiry} dias
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Sin lotes por vencer" />
          )}
        </SectionCard>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
          Acciones Rapidas
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickAction label="Ver Requisiciones" href="/requisiciones" icon={ClipboardList} />
          <QuickAction label="Transferencias" href="/inventarios/transferencias" icon={Truck} />
          <QuickAction label="Inventarios" href="/inventarios" icon={Package} />
          <QuickAction label="Compras" href="/compras" icon={ShoppingCart} />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// INVESTOR DASHBOARD
// =============================================================================

const CHART_COLORS = ["#000000", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#e5e7eb"];

function InvestorDashboard({
  data,
  loading,
  onDrillDown,
}: {
  data: any;
  loading: boolean;
  onDrillDown?: (branchId: string) => void;
}) {
  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return <EmptyState message="No se pudo cargar el dashboard" />;

  // Prepare pie data for expense breakdown
  const pieData = [
    { name: "Food Cost", value: data.expenses || 0 },
    { name: "Nomina", value: data.payrollCost || 0 },
    {
      name: "Utilidad",
      value: Math.max(
        0,
        (data.revenue?.thisMonth || 0) - (data.expenses || 0) - (data.payrollCost || 0),
      ),
    },
  ].filter((d) => d.value > 0);

  return (
    <div className="mt-6 space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title="Ingresos"
          value={fmtCompact(data.revenue?.thisMonth || 0)}
          trend={data.revenue?.change}
          trendLabel="vs anterior"
          icon={TrendingUp}
        />
        <KpiCard
          title="Gastos"
          value={fmtCompact(data.expenses || 0)}
          subtitle="compras y costos"
          icon={TrendingDown}
        />
        <KpiCard
          title="Margen Bruto"
          value={`${data.grossMargin || 0}%`}
          subtitle="ingresos - costos"
          icon={PieChartIcon}
        />
        <KpiCard
          title="Caja"
          value={fmtCompact(data.cashPosition || 0)}
          subtitle="saldo en bancos"
          icon={Landmark}
        />
      </div>

      {/* Row 2: Revenue trend (Area) + Revenue by branch (clickable) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Tendencia de Ingresos (12 Meses)">
          {data.monthlyTrend?.some((m: any) => m.revenue > 0) ? (
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.monthlyTrend}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#000000" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#000000" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#9ca3af" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: "#888" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#888" }}
                    tickFormatter={(v: number) => fmtCompact(v)}
                    width={50}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      fmt(value),
                      name === "revenue" ? "Ingresos" : "Gastos",
                    ]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e5e5e5",
                      fontSize: 12,
                      backgroundColor: "var(--color-card, #fff)",
                    }}
                  />
                  <Legend
                    formatter={(value: string) => (value === "revenue" ? "Ingresos" : "Gastos")}
                    wrapperStyle={{ paddingTop: 10, fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#000000"
                    strokeWidth={2}
                    fill="url(#revGrad)"
                    dot={{ r: 3, fill: "#000000" }}
                    activeDot={{ r: 6, strokeWidth: 2 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    stroke="#9ca3af"
                    strokeWidth={2}
                    fill="url(#expGrad)"
                    dot={{ r: 3, fill: "#9ca3af" }}
                    activeDot={{ r: 6, strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState message="Sin datos de tendencia" />
          )}
        </SectionCard>

        <SectionCard title="Ingresos por Sucursal">
          {data.topBranches?.length > 0 ? (
            <>
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.topBranches.map((b: any) => ({
                      name: b.name.replace("Luka ", ""),
                      revenue: b.revenue,
                      id: b.id,
                    }))}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "#888" }}
                      tickFormatter={(v: number) => fmtCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "#888" }}
                      width={55}
                    />
                    <Tooltip
                      formatter={(value: number) => [fmt(value), "Ingresos"]}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e5e5e5",
                        fontSize: 12,
                        backgroundColor: "var(--color-card, #fff)",
                      }}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="#000000"
                      radius={[0, 4, 4, 0]}
                      barSize={18}
                      cursor="pointer"
                      onClick={(entry: any) => {
                        if (onDrillDown && entry?.id) onDrillDown(entry.id);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {onDrillDown && (
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  Haz clic en una sucursal para ver detalle
                </p>
              )}
            </>
          ) : (
            <EmptyState message="Sin datos de sucursales" />
          )}
        </SectionCard>
      </div>

      {/* Row 3: P&L Pie + Summary cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Distribucion de Costos">
          {pieData.length > 0 ? (
            <div className="h-48 sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => fmt(value)}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e5e5e5",
                      fontSize: 12,
                      backgroundColor: "var(--color-card, #fff)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState message="Sin datos" />
          )}
        </SectionCard>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Food Cost
          </p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold text-foreground">
            {data.foodCostPct || 0}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">costo de insumos / ingresos</p>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-black transition-all"
              style={{ width: `${Math.min(100, data.foodCostPct || 0)}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Utilidad Bruta
          </p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold text-foreground">
            {fmtCompact((data.revenue?.thisMonth || 0) - (data.expenses || 0))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">ingresos - gastos</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4">
            Costo Nomina
          </p>
          <p className="mt-1 text-lg font-bold text-foreground">{fmt(data.payrollCost || 0)}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
          Acciones Rapidas
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickAction label="Reportes" href="/reportes" icon={BarChart3} />
          <QuickAction label="Facturacion" href="/facturacion" icon={FileText} />
          <QuickAction label="Bancos" href="/bancos" icon={Landmark} />
          <QuickAction label="Sucursales" href="/sucursales" icon={Building2} />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ACCOUNTANT DASHBOARD
// =============================================================================

function AccountantDashboard({ data, loading }: { data: any; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return <EmptyState message="No se pudo cargar el dashboard" />;

  return (
    <div className="mt-6 space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title="Polizas"
          value={data.pendingPolizas || 0}
          subtitle="pendientes"
          icon={FileText}
        />
        <KpiCard
          title="Sin Conciliar"
          value={data.unreconciledTxns || 0}
          subtitle="txns bancarias"
          icon={Receipt}
        />
        <KpiCard
          title="CxP Vencidas"
          value={data.cxpOverdue?.count || 0}
          subtitle={fmt(data.cxpOverdue?.amount || 0)}
          icon={TrendingDown}
        />
        <KpiCard
          title="CxC Vencidas"
          value={data.cxcOverdue?.count || 0}
          subtitle={fmt(data.cxcOverdue?.amount || 0)}
          icon={TrendingUp}
        />
      </div>

      {/* Row 2: Fiscal period + CFDI + Tax estimates */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Periodo Fiscal Actual">
          {data.openPeriod ? (
            <div className="text-center py-4">
              <p className="text-3xl font-bold text-foreground">
                {String(data.openPeriod.month).padStart(2, "0")} / {data.openPeriod.year}
              </p>
              <span className="mt-2 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                {data.openPeriod.status === "OPEN" ? "Abierto" : data.openPeriod.status}
              </span>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Sin periodo fiscal abierto</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="CFDI Pendientes">
          <div className="text-center py-4">
            <p className="text-3xl font-bold text-foreground">{data.pendingCfdi || 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">facturas en borrador</p>
          </div>
        </SectionCard>

        <SectionCard title="Estimado Provisionales">
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">ISR</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {fmt(data.taxEstimates?.isrProvisional || 0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">IVA</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {fmt(data.taxEstimates?.ivaProvisional || 0)}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Row 3: Summaries */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Cuentas por Pagar Vencidas">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase">Cantidad</p>
              <p className="mt-1 text-2xl font-bold text-red-600">{data.cxpOverdue?.count || 0}</p>
            </div>
            <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase">Monto</p>
              <p className="mt-1 text-2xl font-bold text-red-600">
                {fmtCompact(data.cxpOverdue?.amount || 0)}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Cuentas por Cobrar Vencidas">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-orange-100 bg-orange-50 p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase">Cantidad</p>
              <p className="mt-1 text-2xl font-bold text-orange-600">
                {data.cxcOverdue?.count || 0}
              </p>
            </div>
            <div className="rounded-lg border border-orange-100 bg-orange-50 p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase">Monto</p>
              <p className="mt-1 text-2xl font-bold text-orange-600">
                {fmtCompact(data.cxcOverdue?.amount || 0)}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
          Acciones Rapidas
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickAction label="Generar Polizas" href="/contabilidad/polizas" icon={FileText} />
          <QuickAction label="Conciliacion" href="/bancos/conciliacion" icon={Calculator} />
          <QuickAction label="Facturacion" href="/facturacion" icon={Receipt} />
          <QuickAction label="Reportes" href="/reportes" icon={BarChart3} />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN DASHBOARD PAGE
// =============================================================================

// Default date range: this month
function getDefaultDateRange(): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: now.toISOString().split("T")[0],
    label: "Este mes",
  };
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();

  const [currentView, setCurrentView] = useState<DashboardView>("investor");
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);

  // Drill-down state: when user clicks a branch in investor view
  const [drillDownBranch, setDrillDownBranch] = useState<string | null>(null);

  // Branch selector state (for store view)
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  // Determine default view from user roles
  useEffect(() => {
    if (!user) return;
    const defaultView = getDefaultView(user.roles);
    setCurrentView(defaultView);
    setShowSwitcher(canSwitchViews(user.roles));
  }, [user]);

  // Fetch branches for store view
  const { data: branchesData = [] } = useApiQuery<Array<{ id: string; name: string }>>(
    "/branches",
    ["branches"],
    { enabled: !authLoading && !!user },
  );

  // Set selectedBranch from fetched branches
  const branches = branchesData;
  useEffect(() => {
    if (branches.length > 0 && !selectedBranch && user) {
      const assignedBranch = user.roles.find((r) => r.branchId)?.branchId;
      if (assignedBranch && branches.some((b) => b.id === assignedBranch)) {
        setSelectedBranch(assignedBranch);
      } else {
        setSelectedBranch(branches[0].id);
      }
    }
  }, [branches, selectedBranch, user]);

  // Compute dashboard endpoint based on view, branch, and date range
  const effectiveView = drillDownBranch ? "store" : currentView;
  const effectiveBranch = drillDownBranch || selectedBranch;

  const dashboardEndpoint = useMemo(() => {
    let endpoint = "";
    switch (effectiveView) {
      case "store":
        if (!effectiveBranch) return "";
        endpoint = `/reportes/dashboard/store/${effectiveBranch}`;
        break;
      case "cedis":
        endpoint = "/reportes/dashboard/cedis";
        break;
      case "investor":
        endpoint = "/reportes/dashboard/investor";
        break;
      case "accountant":
        endpoint = "/reportes/dashboard/accountant";
        break;
    }
    if (dateRange) {
      endpoint += `?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    }
    return endpoint;
  }, [effectiveView, effectiveBranch, dateRange]);

  const dashboardEnabled =
    !authLoading &&
    !!user &&
    !!dashboardEndpoint &&
    (effectiveView !== "store" || !!effectiveBranch);

  const { data: dashboardData, isLoading: dashboardLoading } = useApiQuery<any>(
    dashboardEndpoint || "/reportes/dashboard/investor",
    ["dashboard", effectiveView, effectiveBranch, dateRange.startDate, dateRange.endDate],
    { enabled: dashboardEnabled },
  );

  // Handle drill-down from investor branch chart
  const handleDrillDown = useCallback((branchId: string) => {
    setDrillDownBranch(branchId);
  }, []);

  const handleBackFromDrillDown = useCallback(() => {
    setDrillDownBranch(null);
  }, []);

  if (authLoading) return null;

  const viewSubtitles: Record<DashboardView, string> = {
    investor: "Vista ejecutiva - Indicadores financieros y tendencias",
    store: "Vista de tienda - Stock, ventas y operaciones del dia",
    cedis: "Vista CEDIS - Requisiciones, transferencias y abastecimiento",
    accountant: "Vista contable - Polizas, conciliacion y obligaciones fiscales",
  };

  const drillDownBranchName = drillDownBranch
    ? branches.find((b) => b.id === drillDownBranch)?.name
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Row 1: Welcome + Date picker */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {drillDownBranch ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBackFromDrillDown}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver
                </button>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
                    {drillDownBranchName || "Sucursal"}
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Detalle de sucursal - Drill-down desde vista inversionista
                  </p>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                  Bienvenido{user ? `, ${user.firstName}` : ""}
                </h1>
                <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
                  {viewSubtitles[currentView]}
                </p>
              </>
            )}
          </div>

          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        {/* Row 2: View switcher */}
        {showSwitcher && !drillDownBranch && (
          <div className="flex rounded-lg border border-border bg-card shadow-sm overflow-x-auto flex-nowrap -mx-1 sm:mx-0">
            {(Object.keys(VIEW_LABELS) as DashboardView[]).map((view) => (
              <button
                key={view}
                onClick={() => setCurrentView(view)}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap min-w-0 ${
                  currentView === view
                    ? "bg-black text-white"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {VIEW_LABELS[view]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dashboard content */}
      {drillDownBranch ? (
        <StoreDashboard
          data={dashboardData}
          loading={dashboardLoading}
          branches={branches}
          selectedBranch={drillDownBranch}
          onBranchChange={(id) => setDrillDownBranch(id)}
        />
      ) : (
        <>
          {currentView === "store" && (
            <StoreDashboard
              data={dashboardData}
              loading={dashboardLoading}
              branches={branches}
              selectedBranch={selectedBranch}
              onBranchChange={setSelectedBranch}
            />
          )}
          {currentView === "cedis" && (
            <CedisDashboard data={dashboardData} loading={dashboardLoading} />
          )}
          {currentView === "investor" && (
            <InvestorDashboard
              data={dashboardData}
              loading={dashboardLoading}
              onDrillDown={handleDrillDown}
            />
          )}
          {currentView === "accountant" && (
            <AccountantDashboard data={dashboardData} loading={dashboardLoading} />
          )}
        </>
      )}
    </div>
  );
}
