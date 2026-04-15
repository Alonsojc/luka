"use client";

import { useState, useMemo } from "react";
import {
  Bike,
  UtensilsCrossed,
  BarChart3,
  Settings,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, Input, Select } from "@/components/ui/form-field";
import { formatMXN, safeNum } from "@luka/shared";
import type { Branch } from "@luka/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeliveryOrder {
  id: string;
  platform: string;
  externalOrderId: string | null;
  status: string;
  customerName: string | null;
  subtotal: string | number;
  deliveryFee: string | number | null;
  platformFee: string | number | null;
  discount: string | number | null;
  total: string | number;
  netRevenue: string | number | null;
  orderDate: string;
  items: Array<{ name: string; qty: number; unitPrice: number }> | null;
  branchId: string | null;
  branch: Branch | null;
  createdAt: string;
}

interface OrdersResponse {
  data: DeliveryOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface DeliverySummary {
  totalOrders: number;
  totalRevenue: number;
  totalFees: number;
  netRevenue: number;
  avgOrderValue: number;
  byPlatform: Array<{
    platform: string;
    orders: number;
    revenue: number;
    fees: number;
  }>;
  byBranch: Array<{
    branchId: string;
    branchName: string;
    orders: number;
    revenue: number;
  }>;
  dailyTrend: Array<{ date: string; orders: number; revenue: number }>;
}

interface DeliveryConfig {
  id: string;
  platform: string;
  branchId: string | null;
  apiKey: string | null;
  storeId: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
  syncInterval: number;
  branch: Branch | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = ["Ordenes", "Dashboard", "Configuracion"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, typeof UtensilsCrossed> = {
  Ordenes: UtensilsCrossed,
  Dashboard: BarChart3,
  Configuracion: Settings,
};

const PLATFORMS = ["UBEREATS", "RAPPI", "DIDI_FOOD", "MANUAL"] as const;

const PLATFORM_LABEL: Record<string, string> = {
  UBEREATS: "UberEats",
  RAPPI: "Rappi",
  DIDI_FOOD: "DiDi Food",
  MANUAL: "Manual",
};

const PLATFORM_VARIANT: Record<string, string> = {
  UBEREATS: "green",
  RAPPI: "yellow",
  DIDI_FOOD: "red",
  MANUAL: "gray",
};

const PLATFORM_COLOR: Record<string, string> = {
  UBEREATS: "#22c55e",
  RAPPI: "#f97316",
  DIDI_FOOD: "#ef4444",
  MANUAL: "#6b7280",
};

const STATUS_VALUES = [
  "RECEIVED",
  "PREPARING",
  "READY",
  "PICKED_UP",
  "DELIVERED",
  "CANCELLED",
] as const;

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Recibida",
  PREPARING: "Preparando",
  READY: "Lista",
  PICKED_UP: "Recogida",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
};

const STATUS_VARIANT: Record<string, string> = {
  RECEIVED: "blue",
  PREPARING: "yellow",
  READY: "purple",
  PICKED_UP: "gray",
  DELIVERED: "green",
  CANCELLED: "red",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DeliveryPage() {
  const { user, loading: authLoading, authFetch } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("Ordenes");

  // Orders filter/pagination state
  const [ordersPage, setOrdersPage] = useState(1);
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Build orders query string
  const ordersQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(ordersPage));
    params.set("limit", "25");
    if (filterPlatform) params.set("platform", filterPlatform);
    if (filterBranch) params.set("branchId", filterBranch);
    if (filterStatus) params.set("status", filterStatus);
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);
    return params.toString();
  }, [ordersPage, filterPlatform, filterBranch, filterStatus, filterDateFrom, filterDateTo]);

  // Orders (React Query)
  const { data: ordersResponse, isLoading: ordersLoading } = useApiQuery<OrdersResponse>(
    `/delivery/orders?${ordersQueryString}`,
    ["delivery-orders", ordersQueryString],
    { enabled: tab === "Ordenes" },
  );
  const orders = ordersResponse?.data ?? [];
  const ordersTotal = ordersResponse?.total ?? 0;
  const ordersTotalPages = ordersResponse?.totalPages ?? 1;

  // Summary (React Query)
  const { data: summary, isLoading: summaryLoading } = useApiQuery<DeliverySummary>(
    "/delivery/summary",
    ["delivery-summary"],
    { enabled: tab === "Dashboard" },
  );

  // Config (React Query)
  const { data: configs = [], isLoading: configsLoading } = useApiQuery<DeliveryConfig[]>(
    "/delivery/config",
    ["delivery-config"],
    { enabled: tab === "Configuracion" },
  );
  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null);

  // Branch list for filters (React Query)
  const { data: branches = [] } = useApiQuery<Branch[]>("/branches", ["branches"]);

  // Manual order modal
  const [showModal, setShowModal] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);

  // Config modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<{
    platform: string;
    apiKey: string;
    storeId: string;
    isActive: boolean;
    syncInterval: number;
  } | null>(null);

  // ---------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      await authFetch("patch", `/delivery/orders/${orderId}/status`, {
        status: newStatus,
      });
      queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al actualizar", "error");
    }
  };

  const handleManualOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setModalSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await authFetch("post", "/delivery/orders", {
        platform: fd.get("platform") || "MANUAL",
        branchId: fd.get("branchId") || undefined,
        customerName: fd.get("customerName") || undefined,
        subtotal: Number(fd.get("subtotal")),
        deliveryFee: Number(fd.get("deliveryFee") || 0),
        platformFee: Number(fd.get("platformFee") || 0),
        discount: Number(fd.get("discount") || 0),
        total: Number(fd.get("total")),
        orderDate: fd.get("orderDate"),
        items: [],
      });
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setModalSaving(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingConfig) return;
    try {
      await authFetch("post", "/delivery/config", editingConfig);
      setShowConfigModal(false);
      setEditingConfig(null);
      queryClient.invalidateQueries({ queryKey: ["delivery-config"] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    }
  };

  const handleSync = async (platform: string) => {
    setSyncingPlatform(platform);
    try {
      await authFetch("post", "/delivery/sync", { platform });
      queryClient.invalidateQueries({ queryKey: ["delivery-config"] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al actualizar", "error");
    } finally {
      setSyncingPlatform(null);
    }
  };

  const handleToggleActive = async (config: DeliveryConfig) => {
    try {
      await authFetch("post", "/delivery/config", {
        platform: config.platform,
        branchId: config.branchId || undefined,
        isActive: !config.isActive,
      });
      queryClient.invalidateQueries({ queryKey: ["delivery-config"] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al actualizar", "error");
    }
  };

  // ---------------------------------------------------------------
  // Order columns
  // ---------------------------------------------------------------

  const orderColumns = useMemo(
    () => [
      {
        key: "orderDate",
        header: "Fecha",
        render: (row: DeliveryOrder) =>
          new Date(row.orderDate).toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
      },
      {
        key: "platform",
        header: "Plataforma",
        render: (row: DeliveryOrder) => (
          <StatusBadge
            label={PLATFORM_LABEL[row.platform] || row.platform}
            variant={(PLATFORM_VARIANT[row.platform] || "gray") as any}
          />
        ),
      },
      {
        key: "externalOrderId",
        header: "# Orden",
        render: (row: DeliveryOrder) => row.externalOrderId || row.id.slice(0, 8),
      },
      {
        key: "branch",
        header: "Sucursal",
        render: (row: DeliveryOrder) => row.branch?.name || "-",
      },
      {
        key: "customerName",
        header: "Cliente",
        render: (row: DeliveryOrder) => row.customerName || "-",
      },
      {
        key: "items",
        header: "Items",
        render: (row: DeliveryOrder) => {
          if (!row.items || !Array.isArray(row.items)) return "-";
          return row.items.length > 0
            ? `${row.items.length} item${row.items.length > 1 ? "s" : ""}`
            : "-";
        },
      },
      {
        key: "subtotal",
        header: "Subtotal",
        render: (row: DeliveryOrder) => formatMXN(row.subtotal),
      },
      {
        key: "fees",
        header: "Comision",
        render: (row: DeliveryOrder) => {
          const fees = safeNum(row.deliveryFee) + safeNum(row.platformFee);
          return fees > 0 ? formatMXN(fees) : "-";
        },
      },
      {
        key: "total",
        header: "Total",
        render: (row: DeliveryOrder) => <span className="font-medium">{formatMXN(row.total)}</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (row: DeliveryOrder) => (
          <select
            value={row.status}
            onChange={(e) => handleStatusChange(row.id, e.target.value)}
            className="text-xs border rounded px-2 py-1 bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ),
      },
    ],
    [],
  );

  // ---------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------

  if (authLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Cargando...</div>;
  }

  // ---------------------------------------------------------------
  // TAB: Ordenes
  // ---------------------------------------------------------------

  const renderOrdenes = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Plataforma</label>
          <select
            value={filterPlatform}
            onChange={(e) => {
              setFilterPlatform(e.target.value);
              setOrdersPage(1);
            }}
            className="border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">Todas</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Sucursal</label>
          <select
            value={filterBranch}
            onChange={(e) => {
              setFilterBranch(e.target.value);
              setOrdersPage(1);
            }}
            className="border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">Todas</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setOrdersPage(1);
            }}
            className="border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos</option>
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Desde</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => {
              setFilterDateFrom(e.target.value);
              setOrdersPage(1);
            }}
            className="border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => {
              setFilterDateTo(e.target.value);
              setOrdersPage(1);
            }}
            className="border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["delivery-orders"] })}
        >
          <Search className="h-4 w-4" /> Buscar
        </Button>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4" /> Orden Manual
          </Button>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={orderColumns}
        data={orders}
        loading={ordersLoading}
        emptyMessage="No hay ordenes de delivery"
      />

      {/* Pagination */}
      {ordersTotalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {ordersTotal} orden{ordersTotal !== 1 ? "es" : ""} en total
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={ordersPage <= 1}
              onClick={() => setOrdersPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {ordersPage} / {ordersTotalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={ordersPage >= ordersTotalPages}
              onClick={() => setOrdersPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------
  // TAB: Dashboard
  // ---------------------------------------------------------------

  const renderDashboard = () => {
    if (summaryLoading || !summary) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-400">
          Cargando resumen...
        </div>
      );
    }

    const maxPlatformOrders = Math.max(...summary.byPlatform.map((p) => p.orders), 1);
    const maxBranchRevenue = Math.max(...summary.byBranch.map((b) => b.revenue), 1);
    const maxDailyOrders = Math.max(...summary.dailyTrend.map((d) => d.orders), 1);

    // Top products from all order items
    const productCountMap: Record<string, number> = {};
    for (const order of orders) {
      if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
          productCountMap[item.name] = (productCountMap[item.name] || 0) + item.qty;
        }
      }
    }
    const topProducts = Object.entries(productCountMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return (
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            {
              label: "Total ordenes",
              value: summary.totalOrders.toLocaleString("es-MX"),
            },
            {
              label: "Ingresos totales",
              value: formatMXN(summary.totalRevenue),
            },
            { label: "Comisiones", value: formatMXN(summary.totalFees) },
            {
              label: "Ingreso neto",
              value: formatMXN(summary.netRevenue),
            },
            {
              label: "Ticket promedio",
              value: formatMXN(summary.avgOrderValue),
            },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
              <p className="text-xl font-semibold">{kpi.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart: Orders by Platform */}
          <div className="rounded-xl border bg-white p-5">
            <h3 className="text-sm font-semibold mb-4">Ordenes por plataforma</h3>
            {summary.byPlatform.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {summary.byPlatform.map((p) => {
                  const pct =
                    summary.totalOrders > 0
                      ? Math.round((p.orders / summary.totalOrders) * 100)
                      : 0;
                  return (
                    <div key={p.platform}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{
                              backgroundColor: PLATFORM_COLOR[p.platform] || "#6b7280",
                            }}
                          />
                          <span>{PLATFORM_LABEL[p.platform] || p.platform}</span>
                        </div>
                        <span className="font-medium">
                          {p.orders} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(p.orders / maxPlatformOrders) * 100}%`,
                            backgroundColor: PLATFORM_COLOR[p.platform] || "#6b7280",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bar Chart: Revenue by Branch */}
          <div className="rounded-xl border bg-white p-5">
            <h3 className="text-sm font-semibold mb-4">Ingresos por sucursal</h3>
            {summary.byBranch.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {summary.byBranch.map((b) => (
                  <div key={b.branchId}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{b.branchName}</span>
                      <span className="font-medium">{formatMXN(b.revenue)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-black transition-all"
                        style={{
                          width: `${(b.revenue / maxBranchRevenue) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Line Chart: Daily Trend */}
        <div className="rounded-xl border bg-white p-5">
          <h3 className="text-sm font-semibold mb-4">Tendencia diaria (ultimos 30 dias)</h3>
          {summary.dailyTrend.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1 min-w-[600px] h-40">
                {summary.dailyTrend.map((d) => {
                  const heightPct = (d.orders / maxDailyOrders) * 100;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center group relative">
                      <div className="absolute -top-8 hidden group-hover:block bg-black text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                        {d.date}: {d.orders} ordenes, {formatMXN(d.revenue)}
                      </div>
                      <div
                        className="w-full bg-black rounded-t transition-all hover:bg-gray-700"
                        style={{
                          height: `${Math.max(heightPct, 4)}%`,
                        }}
                      />
                      <span className="text-[9px] text-gray-400 mt-1 -rotate-45 origin-top-left whitespace-nowrap">
                        {d.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Top Products */}
        {topProducts.length > 0 && (
          <div className="rounded-xl border bg-white p-5">
            <h3 className="text-sm font-semibold mb-4">Top 5 productos en delivery</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left text-xs font-medium text-gray-500 pb-2">Producto</th>
                  <th className="text-right text-xs font-medium text-gray-500 pb-2">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={p.name} className="border-b last:border-0">
                    <td className="py-2 text-sm">
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-100 text-xs font-medium mr-2">
                        {i + 1}
                      </span>
                      {p.name}
                    </td>
                    <td className="py-2 text-sm text-right font-medium">{p.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------
  // TAB: Configuracion
  // ---------------------------------------------------------------

  const CONFIGURABLE_PLATFORMS = ["UBEREATS", "RAPPI", "DIDI_FOOD"] as const;

  const renderConfiguracion = () => {
    if (configsLoading) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-400">
          Cargando configuracion...
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {CONFIGURABLE_PLATFORMS.map((platform) => {
          const config = configs.find((c) => c.platform === platform);

          return (
            <div key={platform} className="rounded-xl border bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: PLATFORM_COLOR[platform],
                    }}
                  />
                  <h3 className="text-sm font-semibold">{PLATFORM_LABEL[platform]}</h3>
                </div>
                <button
                  onClick={() =>
                    config
                      ? handleToggleActive(config)
                      : authFetch("post", "/delivery/config", {
                          platform,
                          isActive: true,
                        }).then(() =>
                          queryClient.invalidateQueries({ queryKey: ["delivery-config"] }),
                        )
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config?.isActive ? "bg-black" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config?.isActive ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-gray-500">API Key</label>
                  <p className="font-mono text-xs bg-gray-50 rounded px-2 py-1.5 truncate">
                    {config?.apiKey ? "****" + config.apiKey.slice(-4) : "No configurada"}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Store ID</label>
                  <p className="text-xs bg-gray-50 rounded px-2 py-1.5">
                    {config?.storeId || "No configurado"}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Ultima sincronizacion</label>
                  <p className="text-xs">
                    {config?.lastSyncAt
                      ? new Date(config.lastSyncAt).toLocaleString("es-MX")
                      : "Nunca"}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Intervalo de sincronizacion</label>
                  <p className="text-xs">Cada {config?.syncInterval || 15} minutos</p>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setEditingConfig({
                      platform,
                      apiKey: config?.apiKey || "",
                      storeId: config?.storeId || "",
                      isActive: config?.isActive ?? true,
                      syncInterval: config?.syncInterval || 15,
                    });
                    setShowConfigModal(true);
                  }}
                >
                  <Settings className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  disabled={!config?.isActive || syncingPlatform === platform}
                  onClick={() => handleSync(platform)}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${syncingPlatform === platform ? "animate-spin" : ""}`}
                  />
                  {syncingPlatform === platform ? "Sincronizando..." : "Sync Now"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ---------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black">
            <Bike className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Delivery</h1>
            <p className="text-sm text-gray-500">UberEats, Rappi, DiDi Food</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-6">
          {TABS.map((t) => {
            const Icon = TAB_ICONS[t];
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? "border-black text-black"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {tab === "Ordenes" && renderOrdenes()}
      {tab === "Dashboard" && renderDashboard()}
      {tab === "Configuracion" && renderConfiguracion()}

      {/* Manual Order Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nueva Orden Manual" wide>
        <form onSubmit={handleManualOrder} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Plataforma" required>
              <Select name="platform" defaultValue="MANUAL">
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABEL[p]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Sucursal">
              <Select name="branchId">
                <option value="">Sin asignar</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Cliente">
              <Input name="customerName" placeholder="Nombre del cliente" />
            </FormField>
            <FormField label="Fecha de orden" required>
              <Input
                name="orderDate"
                type="datetime-local"
                defaultValue={new Date().toISOString().slice(0, 16)}
                required
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FormField label="Subtotal" required>
              <Input name="subtotal" type="number" step="0.01" min="0" required />
            </FormField>
            <FormField label="Tarifa envio">
              <Input name="deliveryFee" type="number" step="0.01" min="0" />
            </FormField>
            <FormField label="Comision plataforma">
              <Input name="platformFee" type="number" step="0.01" min="0" />
            </FormField>
            <FormField label="Descuento">
              <Input name="discount" type="number" step="0.01" min="0" />
            </FormField>
          </div>
          <FormField label="Total" required>
            <Input name="total" type="number" step="0.01" min="0" required />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={modalSaving}>
              {modalSaving ? "Guardando..." : "Guardar Orden"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Config Edit Modal */}
      <Modal
        open={showConfigModal}
        onClose={() => {
          setShowConfigModal(false);
          setEditingConfig(null);
        }}
        title={`Configurar ${editingConfig ? PLATFORM_LABEL[editingConfig.platform] : ""}`}
      >
        {editingConfig && (
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <FormField label="API Key">
              <Input
                value={editingConfig.apiKey}
                onChange={(e) =>
                  setEditingConfig({
                    ...editingConfig,
                    apiKey: e.target.value,
                  })
                }
                placeholder="Ingresa la API key"
              />
            </FormField>
            <FormField label="Store ID">
              <Input
                value={editingConfig.storeId}
                onChange={(e) =>
                  setEditingConfig({
                    ...editingConfig,
                    storeId: e.target.value,
                  })
                }
                placeholder="ID de tienda en la plataforma"
              />
            </FormField>
            <FormField label="Intervalo de sincronizacion (minutos)">
              <Select
                value={String(editingConfig.syncInterval)}
                onChange={(e) =>
                  setEditingConfig({
                    ...editingConfig,
                    syncInterval: Number(e.target.value),
                  })
                }
              >
                <option value="5">5 minutos</option>
                <option value="10">10 minutos</option>
                <option value="15">15 minutos</option>
                <option value="30">30 minutos</option>
                <option value="60">60 minutos</option>
              </Select>
            </FormField>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowConfigModal(false);
                  setEditingConfig(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
