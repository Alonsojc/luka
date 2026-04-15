"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  AlertTriangle,
  Package,
  Target,
  Activity,
  Search,
  ShoppingCart,
  Building2,
  Calendar,
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
import { useAuth } from "@/hooks/use-auth";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-field";
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
  costPerUnit: number | string;
}

interface ConsumptionBucket {
  period: string;
  quantity: number;
  cost: number;
}

interface ForecastWeek {
  week: string;
  predictedQuantity: number;
  confidence: number;
}

interface ProductForecast {
  product: {
    id: string;
    sku: string;
    name: string;
    unitOfMeasure: string;
    costPerUnit: number;
  };
  branch?: { id: string; name: string } | null;
  historical: ConsumptionBucket[];
  forecast: ForecastWeek[];
  trend: "increasing" | "decreasing" | "stable";
  avgWeeklyConsumption: number;
  avgDailyConsumption: number;
}

interface BranchProductForecast extends ProductForecast {
  currentStock: number;
  daysOfStockLeft: number | null;
  reorderNeeded: boolean;
}

interface ReorderAlert {
  productId: string;
  productName: string;
  productSku: string;
  branchId: string;
  branchName: string;
  currentStock: number;
  daysOfStockLeft: number | null;
  avgDailyConsumption: number;
  forecastedWeeklyQuantity: number;
}

interface ForecastSummary {
  criticalStockBranches: ReorderAlert[];
  highestGrowthProducts: Array<{
    productId: string;
    productName: string;
    productSku: string;
    growthRate: number;
    avgWeeklyConsumption: number;
  }>;
  decliningProducts: Array<{
    productId: string;
    productName: string;
    productSku: string;
    declineRate: number;
    avgWeeklyConsumption: number;
  }>;
  forecastedCostByBranch: Array<{
    branchId: string;
    branchName: string;
    totalCost: number;
  }>;
  reorderAlerts: ReorderAlert[];
}

interface SuggestedRequisitionItem {
  productId: string;
  productSku: string;
  productName: string;
  unitOfMeasure: string;
  currentStock: number;
  forecastedWeeklyConsumption: number;
  suggestedQuantity: number;
  estimatedCost: number;
  daysOfStockLeft: number | null;
  urgency: "critical" | "warning" | "normal";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TABS = [
  { id: "branch", label: "Por Sucursal" },
  { id: "product", label: "Por Producto" },
  { id: "global", label: "Dashboard Global" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function PrediccionesPage() {
  const { user: _user, loading: authLoading, authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("branch");

  // Shared state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [_loadingBranches, setLoadingBranches] = useState(true);
  const [_loadingProducts, setLoadingProducts] = useState(true);

  // Tab 1: By Branch
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [branchForecasts, setBranchForecasts] = useState<BranchProductForecast[]>([]);
  const [loadingBranchForecast, setLoadingBranchForecast] = useState(false);
  const [suggestedRequisition, setSuggestedRequisition] = useState<SuggestedRequisitionItem[]>([]);
  const [requisitionModalOpen, setRequisitionModalOpen] = useState(false);
  const [loadingRequisition, setLoadingRequisition] = useState(false);

  // Tab 2: By Product
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productBranchFilter, setProductBranchFilter] = useState("");
  const [productForecast, setProductForecast] = useState<ProductForecast | null>(null);
  const [loadingProductForecast, setLoadingProductForecast] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Tab 3: Global
  const [summary, setSummary] = useState<ForecastSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // ---------------------------------------------------------------------------
  // Load branches and products
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (authLoading) return;
    authFetch<Branch[]>("get", "/branches")
      .then((data) => {
        setBranches(data);
        if (data.length > 0 && !selectedBranchId) {
          setSelectedBranchId(data[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingBranches(false));

    authFetch<Product[]>("get", "/inventarios/products")
      .then((data) => setProducts(data))
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Tab 1: Load branch forecast
  // ---------------------------------------------------------------------------
  const loadBranchForecast = useCallback(
    async (branchId: string) => {
      if (!branchId) return;
      setLoadingBranchForecast(true);
      try {
        const data = await authFetch<BranchProductForecast[]>(
          "get",
          `/inventarios/forecast/branch/${branchId}`,
        );
        setBranchForecasts(data);
      } catch {
        setBranchForecasts([]);
      } finally {
        setLoadingBranchForecast(false);
      }
    },
    [authFetch],
  );

  useEffect(() => {
    if (activeTab === "branch" && selectedBranchId) {
      loadBranchForecast(selectedBranchId);
    }
  }, [activeTab, selectedBranchId, loadBranchForecast]);

  // ---------------------------------------------------------------------------
  // Tab 2: Load product forecast
  // ---------------------------------------------------------------------------
  const loadProductForecast = useCallback(
    async (productId: string, branchId?: string) => {
      if (!productId) return;
      setLoadingProductForecast(true);
      try {
        const params = branchId ? `?branchId=${branchId}` : "";
        const data = await authFetch<ProductForecast>(
          "get",
          `/inventarios/forecast/product/${productId}${params}`,
        );
        setProductForecast(data);
      } catch {
        setProductForecast(null);
      } finally {
        setLoadingProductForecast(false);
      }
    },
    [authFetch],
  );

  useEffect(() => {
    if (activeTab === "product" && selectedProductId) {
      loadProductForecast(selectedProductId, productBranchFilter || undefined);
    }
  }, [activeTab, selectedProductId, productBranchFilter, loadProductForecast]);

  // ---------------------------------------------------------------------------
  // Tab 3: Load global summary
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== "global") return;
    setLoadingSummary(true);
    authFetch<ForecastSummary>("get", "/inventarios/forecast/summary")
      .then((data) => setSummary(data))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false));
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Suggested requisition
  // ---------------------------------------------------------------------------
  const loadSuggestedRequisition = async () => {
    if (!selectedBranchId) return;
    setLoadingRequisition(true);
    try {
      const data = await authFetch<SuggestedRequisitionItem[]>(
        "get",
        `/inventarios/forecast/suggested-requisition/${selectedBranchId}`,
      );
      setSuggestedRequisition(data);
      setRequisitionModalOpen(true);
    } catch {
      setSuggestedRequisition([]);
    } finally {
      setLoadingRequisition(false);
    }
  };

  const createRequisitionFromSuggested = async () => {
    if (!selectedBranchId || suggestedRequisition.length === 0) return;
    try {
      await authFetch("post", "/requisiciones", {
        requestingBranchId: selectedBranchId,
        notes: "Requisicion generada automaticamente por predicciones",
        items: suggestedRequisition.map((item) => ({
          productId: item.productId,
          requestedQuantity: item.suggestedQuantity,
          notes: `Stock actual: ${item.currentStock}, Dias restantes: ${item.daysOfStockLeft ?? "N/A"}`,
        })),
      });
      setRequisitionModalOpen(false);
    } catch {
      // Error handled silently; could add toast here
    }
  };

  // ---------------------------------------------------------------------------
  // Computed values for Tab 1
  // ---------------------------------------------------------------------------
  const branchStats = useMemo(() => {
    if (branchForecasts.length === 0) return { riskCount: 0, avgDays: 0, weeklyCost: 0 };
    const riskCount = branchForecasts.filter(
      (f) => f.daysOfStockLeft !== null && f.daysOfStockLeft < 7,
    ).length;
    const daysValues = branchForecasts
      .filter((f) => f.daysOfStockLeft !== null)
      .map((f) => f.daysOfStockLeft!);
    const avgDays =
      daysValues.length > 0 ? daysValues.reduce((s, d) => s + d, 0) / daysValues.length : 0;
    const weeklyCost = branchForecasts.reduce(
      (s, f) => s + (f.forecast[0]?.predictedQuantity ?? 0) * f.product.costPerUnit,
      0,
    );
    return {
      riskCount,
      avgDays: Math.round(avgDays * 10) / 10,
      weeklyCost: Math.round(weeklyCost * 100) / 100,
    };
  }, [branchForecasts]);

  // ---------------------------------------------------------------------------
  // Filtered product list for search
  // ---------------------------------------------------------------------------
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    const lower = productSearch.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower),
    );
  }, [products, productSearch]);

  // ---------------------------------------------------------------------------
  // Chart data for Tab 2
  // ---------------------------------------------------------------------------
  const chartData = useMemo(() => {
    if (!productForecast) return [];
    const historicalPoints = productForecast.historical.map((h) => ({
      period: h.period,
      consumo: h.quantity,
      pronostico: null as number | null,
    }));
    const forecastPoints = productForecast.forecast.map((f) => ({
      period: f.week,
      consumo: null as number | null,
      pronostico: f.predictedQuantity,
    }));
    // Connect lines: add last historical point to forecast
    if (historicalPoints.length > 0 && forecastPoints.length > 0) {
      forecastPoints[0].consumo = historicalPoints[historicalPoints.length - 1].consumo;
    }
    return [...historicalPoints, ...forecastPoints];
  }, [productForecast]);

  // ---------------------------------------------------------------------------
  // Trend icon helper
  // ---------------------------------------------------------------------------
  const TrendIcon = ({ trend }: { trend: "increasing" | "decreasing" | "stable" }) => {
    if (trend === "increasing") return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (trend === "decreasing") return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <ArrowRight className="h-4 w-4 text-gray-400" />;
  };

  const TrendLabel = ({ trend }: { trend: "increasing" | "decreasing" | "stable" }) => {
    if (trend === "increasing")
      return <span className="text-green-600 text-xs font-medium">En aumento</span>;
    if (trend === "decreasing")
      return <span className="text-red-600 text-xs font-medium">En descenso</span>;
    return <span className="text-gray-500 text-xs font-medium">Estable</span>;
  };

  const StockBadge = ({ days }: { days: number | null }) => {
    if (days === null) return <span className="text-xs text-gray-400">Sin datos</span>;
    if (days < 3)
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          <AlertTriangle className="h-3 w-3" />
          Critico
        </span>
      );
    if (days < 7)
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
          <AlertTriangle className="h-3 w-3" />
          Bajo
        </span>
      );
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        OK
      </span>
    );
  };

  if (authLoading) return null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Predicciones de Consumo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pronosticos basados en consumo historico con media movil ponderada
          </p>
        </div>
        <Activity className="h-8 w-8 text-gray-400" />
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Por Sucursal */}
      {activeTab === "branch" && (
        <div className="space-y-6">
          {/* Branch selector */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <Select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-64"
              >
                <option value="">Seleccionar sucursal...</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadSuggestedRequisition}
              disabled={!selectedBranchId || loadingRequisition}
            >
              <ShoppingCart className="h-4 w-4" />
              Generar Requisicion Sugerida
            </Button>
          </div>

          {/* Summary cards */}
          {selectedBranchId && !loadingBranchForecast && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Productos en riesgo"
                value={branchStats.riskCount.toString()}
                icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
                color="red"
              />
              <StatCard
                label="Dias promedio de stock"
                value={`${branchStats.avgDays} dias`}
                icon={<Calendar className="h-5 w-5 text-blue-500" />}
                color="blue"
              />
              <StatCard
                label="Costo semanal estimado"
                value={formatMXN(branchStats.weeklyCost)}
                icon={<Target className="h-5 w-5 text-green-500" />}
                color="green"
              />
              <StatCard
                label="Requisicion sugerida"
                value={`${branchForecasts.filter((f) => f.reorderNeeded).length} productos`}
                icon={<ShoppingCart className="h-5 w-5 text-purple-500" />}
                color="purple"
              />
            </div>
          )}

          {/* Branch forecasts table */}
          <DataTable
            columns={[
              {
                key: "product",
                header: "Producto",
                render: (row: BranchProductForecast) => (
                  <div>
                    <p className="font-medium">{row.product.name}</p>
                    <p className="text-xs text-gray-400">{row.product.sku}</p>
                  </div>
                ),
              },
              {
                key: "currentStock",
                header: "Stock Actual",
                render: (row: BranchProductForecast) => (
                  <span>
                    {row.currentStock} {row.product.unitOfMeasure}
                  </span>
                ),
              },
              {
                key: "avgWeeklyConsumption",
                header: "Consumo Semanal",
                render: (row: BranchProductForecast) => (
                  <span>{safeNum(row.avgWeeklyConsumption).toFixed(1)}</span>
                ),
              },
              {
                key: "daysOfStockLeft",
                header: "Dias de Stock",
                render: (row: BranchProductForecast) => (
                  <span
                    className={
                      row.daysOfStockLeft !== null && row.daysOfStockLeft < 7
                        ? "font-semibold text-red-600"
                        : ""
                    }
                  >
                    {row.daysOfStockLeft !== null ? `${row.daysOfStockLeft} dias` : "N/A"}
                  </span>
                ),
              },
              {
                key: "forecast",
                header: "Pronostico 4 Sem.",
                render: (row: BranchProductForecast) => {
                  const total = row.forecast.reduce((s, f) => s + f.predictedQuantity, 0);
                  return <span>{safeNum(total).toFixed(1)}</span>;
                },
              },
              {
                key: "trend",
                header: "Tendencia",
                render: (row: BranchProductForecast) => (
                  <div className="flex items-center gap-1">
                    <TrendIcon trend={row.trend} />
                    <TrendLabel trend={row.trend} />
                  </div>
                ),
              },
              {
                key: "alert",
                header: "Alerta",
                render: (row: BranchProductForecast) => <StockBadge days={row.daysOfStockLeft} />,
              },
            ]}
            data={branchForecasts}
            loading={loadingBranchForecast}
            emptyMessage={
              selectedBranchId
                ? "No hay datos de inventario para esta sucursal"
                : "Selecciona una sucursal para ver predicciones"
            }
          />

          {/* Requisition Modal */}
          <Modal
            open={requisitionModalOpen}
            onClose={() => setRequisitionModalOpen(false)}
            title="Requisicion Sugerida"
            wide
          >
            {suggestedRequisition.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">
                No hay productos que necesiten reorden en este momento.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  {suggestedRequisition.length} productos necesitan reorden. Costo estimado total:{" "}
                  <strong>
                    {formatMXN(suggestedRequisition.reduce((s, i) => s + i.estimatedCost, 0))}
                  </strong>
                </p>
                <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">
                          Producto
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">
                          Stock
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">
                          Dias Rest.
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">
                          Cant. Sugerida
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">
                          Costo Est.
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">
                          Urgencia
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestedRequisition.map((item) => (
                        <tr key={item.productId} className="border-b last:border-0">
                          <td className="px-3 py-2 text-sm">
                            <p className="font-medium">{item.productName}</p>
                            <p className="text-xs text-gray-400">{item.productSku}</p>
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {item.currentStock} {item.unitOfMeasure}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {item.daysOfStockLeft !== null ? `${item.daysOfStockLeft} dias` : "N/A"}
                          </td>
                          <td className="px-3 py-2 text-sm font-semibold">
                            {item.suggestedQuantity} {item.unitOfMeasure}
                          </td>
                          <td className="px-3 py-2 text-sm">{formatMXN(item.estimatedCost)}</td>
                          <td className="px-3 py-2">
                            {item.urgency === "critical" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                Critico
                              </span>
                            )}
                            {item.urgency === "warning" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                                Atencion
                              </span>
                            )}
                            {item.urgency === "normal" && (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                Normal
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setRequisitionModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={createRequisitionFromSuggested}>
                    <ShoppingCart className="h-4 w-4" />
                    Crear Requisicion
                  </Button>
                </div>
              </div>
            )}
          </Modal>
        </div>
      )}

      {/* Tab 2: Por Producto */}
      {activeTab === "product" && (
        <div className="space-y-6">
          {/* Selectors */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[250px] max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <Select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-72"
            >
              <option value="">Seleccionar producto...</option>
              {filteredProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>
            <Select
              value={productBranchFilter}
              onChange={(e) => setProductBranchFilter(e.target.value)}
              className="w-56"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          {loadingProductForecast && (
            <div className="text-center py-12 text-gray-400">Cargando pronostico...</div>
          )}

          {!loadingProductForecast && !selectedProductId && (
            <div className="text-center py-12 text-gray-400">
              Selecciona un producto para ver su pronostico de consumo
            </div>
          )}

          {!loadingProductForecast && productForecast && (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Consumo promedio diario"
                  value={`${safeNum(productForecast.avgDailyConsumption).toFixed(1)} ${productForecast.product.unitOfMeasure}`}
                  icon={<Package className="h-5 w-5 text-blue-500" />}
                  color="blue"
                />
                <StatCard
                  label="Consumo promedio semanal"
                  value={`${safeNum(productForecast.avgWeeklyConsumption).toFixed(1)} ${productForecast.product.unitOfMeasure}`}
                  icon={<Calendar className="h-5 w-5 text-green-500" />}
                  color="green"
                />
                <StatCard
                  label="Tendencia"
                  value={
                    productForecast.trend === "increasing"
                      ? "En aumento"
                      : productForecast.trend === "decreasing"
                        ? "En descenso"
                        : "Estable"
                  }
                  icon={<TrendIcon trend={productForecast.trend} />}
                  color={
                    productForecast.trend === "increasing"
                      ? "green"
                      : productForecast.trend === "decreasing"
                        ? "red"
                        : "gray"
                  }
                />
                <StatCard
                  label="Confianza del pronostico"
                  value={
                    productForecast.forecast.length > 0
                      ? `${(safeNum(productForecast.forecast[0].confidence) * 100).toFixed(0)}%`
                      : "N/A"
                  }
                  icon={<Target className="h-5 w-5 text-purple-500" />}
                  color="purple"
                />
              </div>

              {/* Chart */}
              {chartData.length > 0 && (
                <div className="border rounded-lg p-4 bg-white">
                  <h3 className="text-sm font-semibold mb-4">Consumo Historico y Pronostico</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="period"
                          tick={{ fontSize: 11 }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          formatter={(value: number, name: string) => [
                            value != null ? safeNum(value).toFixed(1) : "-",
                            name === "consumo" ? "Consumo real" : "Pronostico",
                          ]}
                        />
                        <Legend
                          formatter={(value) =>
                            value === "consumo" ? "Consumo real" : "Pronostico"
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="consumo"
                          stroke="#000"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="pronostico"
                          stroke="#6366f1"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 3 }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Historical table */}
              {productForecast.historical.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Historial de Consumo</h3>
                  <DataTable
                    columns={[
                      { key: "period", header: "Periodo" },
                      {
                        key: "quantity",
                        header: "Cantidad",
                        render: (row: ConsumptionBucket) => (
                          <span>
                            {safeNum(row.quantity).toFixed(1)}{" "}
                            {productForecast.product.unitOfMeasure}
                          </span>
                        ),
                      },
                      {
                        key: "cost",
                        header: "Costo",
                        render: (row: ConsumptionBucket) => formatMXN(row.cost),
                      },
                    ]}
                    data={[...productForecast.historical].reverse()}
                    emptyMessage="Sin historial de consumo"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 3: Dashboard Global */}
      {activeTab === "global" && (
        <div className="space-y-6">
          {loadingSummary && (
            <div className="text-center py-12 text-gray-400">Cargando resumen global...</div>
          )}

          {!loadingSummary && summary && (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Productos en riesgo total"
                  value={summary.reorderAlerts.length.toString()}
                  icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
                  color="red"
                />
                <StatCard
                  label="Costo total proximas 4 semanas"
                  value={formatMXN(
                    summary.forecastedCostByBranch.reduce((s, b) => s + b.totalCost, 0),
                  )}
                  icon={<Target className="h-5 w-5 text-green-500" />}
                  color="green"
                />
                <StatCard
                  label="Sucursales con stock critico"
                  value={new Set(
                    summary.criticalStockBranches.map((a) => a.branchId),
                  ).size.toString()}
                  icon={<Building2 className="h-5 w-5 text-yellow-500" />}
                  color="yellow"
                />
              </div>

              {/* Cost by branch chart */}
              {summary.forecastedCostByBranch.length > 0 && (
                <div className="border rounded-lg p-4 bg-white">
                  <h3 className="text-sm font-semibold mb-4">
                    Costo Pronosticado por Sucursal (4 semanas)
                  </h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.forecastedCostByBranch}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="branchName"
                          tick={{ fontSize: 11 }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `$${safeNum(v / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          formatter={(value: number) => [formatMXN(value), "Costo estimado"]}
                        />
                        <Bar dataKey="totalCost" fill="#000" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Growth products table */}
              {summary.highestGrowthProducts.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    Top 10 Productos con Mayor Crecimiento
                  </h3>
                  <DataTable
                    columns={[
                      {
                        key: "product",
                        header: "Producto",
                        render: (row) => (
                          <div>
                            <p className="font-medium">{row.productName}</p>
                            <p className="text-xs text-gray-400">{row.productSku}</p>
                          </div>
                        ),
                      },
                      {
                        key: "growthRate",
                        header: "Crecimiento",
                        render: (row) => (
                          <span className="text-green-600 font-medium">+{row.growthRate}%</span>
                        ),
                      },
                      {
                        key: "avgWeeklyConsumption",
                        header: "Consumo Semanal Prom.",
                        render: (row) => safeNum(row.avgWeeklyConsumption).toFixed(1),
                      },
                    ]}
                    data={summary.highestGrowthProducts}
                    emptyMessage="Sin datos de crecimiento"
                  />
                </div>
              )}

              {/* Critical stock table */}
              {summary.criticalStockBranches.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Top 10 Productos con Stock Critico (&lt;7 dias)
                  </h3>
                  <DataTable
                    columns={[
                      {
                        key: "product",
                        header: "Producto",
                        render: (row: ReorderAlert) => (
                          <div>
                            <p className="font-medium">{row.productName}</p>
                            <p className="text-xs text-gray-400">{row.productSku}</p>
                          </div>
                        ),
                      },
                      {
                        key: "branchName",
                        header: "Sucursal",
                      },
                      {
                        key: "currentStock",
                        header: "Stock Actual",
                        render: (row: ReorderAlert) => safeNum(row.currentStock).toFixed(1),
                      },
                      {
                        key: "daysOfStockLeft",
                        header: "Dias Restantes",
                        render: (row: ReorderAlert) => <StockBadge days={row.daysOfStockLeft} />,
                      },
                      {
                        key: "avgDailyConsumption",
                        header: "Consumo Diario",
                        render: (row: ReorderAlert) => safeNum(row.avgDailyConsumption).toFixed(1),
                      },
                    ]}
                    data={summary.criticalStockBranches}
                    emptyMessage="Sin alertas criticas"
                  />
                </div>
              )}

              {/* Reorder alerts grouped by branch */}
              {summary.reorderAlerts.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-purple-500" />
                    Alertas de Reorden por Sucursal
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(
                      summary.reorderAlerts.reduce(
                        (acc, alert) => {
                          if (!acc[alert.branchName]) acc[alert.branchName] = [];
                          acc[alert.branchName].push(alert);
                          return acc;
                        },
                        {} as Record<string, ReorderAlert[]>,
                      ),
                    ).map(([branchName, alerts]) => (
                      <div key={branchName} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-gray-400" />
                            {branchName}
                          </h4>
                          <span className="text-xs text-gray-400">{alerts.length} productos</span>
                        </div>
                        <div className="space-y-1">
                          {alerts.map((alert) => (
                            <div
                              key={`${alert.branchId}-${alert.productId}`}
                              className="flex items-center justify-between text-sm py-1"
                            >
                              <div className="flex items-center gap-2">
                                <StockBadge days={alert.daysOfStockLeft} />
                                <span>{alert.productName}</span>
                              </div>
                              <span className="text-gray-500">
                                Stock: {safeNum(alert.currentStock).toFixed(1)} |{" "}
                                {alert.daysOfStockLeft !== null
                                  ? `${alert.daysOfStockLeft} dias`
                                  : "N/A"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Declining products */}
              {summary.decliningProducts.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    Productos con Consumo en Descenso
                  </h3>
                  <DataTable
                    columns={[
                      {
                        key: "product",
                        header: "Producto",
                        render: (row) => (
                          <div>
                            <p className="font-medium">{row.productName}</p>
                            <p className="text-xs text-gray-400">{row.productSku}</p>
                          </div>
                        ),
                      },
                      {
                        key: "declineRate",
                        header: "Descenso",
                        render: (row) => (
                          <span className="text-red-600 font-medium">{row.declineRate}%</span>
                        ),
                      },
                      {
                        key: "avgWeeklyConsumption",
                        header: "Consumo Semanal Prom.",
                        render: (row) => safeNum(row.avgWeeklyConsumption).toFixed(1),
                      },
                    ]}
                    data={summary.decliningProducts}
                    emptyMessage="Sin productos en descenso"
                  />
                </div>
              )}
            </>
          )}

          {!loadingSummary && !summary && (
            <div className="text-center py-12 text-gray-400">
              No se pudo cargar el resumen global. Verifica que existan datos de inventario.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard sub-component
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  const bgMap: Record<string, string> = {
    red: "bg-red-50",
    blue: "bg-blue-50",
    green: "bg-green-50",
    purple: "bg-purple-50",
    yellow: "bg-yellow-50",
    gray: "bg-gray-50",
  };

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <div className={`p-1.5 rounded-md ${bgMap[color] || "bg-gray-50"}`}>{icon}</div>
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
