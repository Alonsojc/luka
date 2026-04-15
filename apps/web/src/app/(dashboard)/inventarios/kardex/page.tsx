"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BookOpen,
  Search,
  Download,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Package,
  Calendar,
  Filter,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { exportToCSV } from "@/lib/export-csv";
import { formatMXN } from "@luka/shared";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-field";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Product {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
  costPerUnit: number;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface KardexRow {
  id: string;
  timestamp: string;
  movementType: string;
  quantity: number;
  runningBalance: number;
  unitCost: number;
  totalCost: number;
  branchName: string;
  branchCode: string;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  userName: string;
}

interface KardexResponse {
  product: {
    id: string;
    name: string;
    sku: string;
    unitOfMeasure: string;
    costPerUnit: number;
  } | null;
  initialBalance: number;
  movements: KardexRow[];
  totalMovements: number;
}

interface KardexSummary {
  product: { id: string; name: string; sku: string; unitOfMeasure: string } | null;
  currentStock: number;
  stockValue: number;
  totalEntries: number;
  totalExits: number;
  totalAdjustments: number;
  averageCost: number;
  costPerUnit: number;
  lastMovementDate: string | null;
  stockByBranch: Array<{ branchName: string; quantity: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOVEMENT_TYPES = [
  { value: "", label: "Todos" },
  { value: "IN", label: "Entrada" },
  { value: "OUT", label: "Salida" },
  { value: "ADJUSTMENT", label: "Ajuste" },
  { value: "TRANSFER_IN", label: "Traspaso Entrada" },
  { value: "TRANSFER_OUT", label: "Traspaso Salida" },
  { value: "WASTE", label: "Merma" },
  { value: "SALE_DEDUCTION", label: "Venta" },
];

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  IN: { label: "Entrada", color: "bg-emerald-100 text-emerald-700" },
  OUT: { label: "Salida", color: "bg-red-100 text-red-700" },
  ADJUSTMENT: { label: "Ajuste", color: "bg-yellow-100 text-yellow-700" },
  TRANSFER_IN: { label: "Traspaso E", color: "bg-blue-100 text-blue-700" },
  TRANSFER_OUT: { label: "Traspaso S", color: "bg-purple-100 text-purple-700" },
  WASTE: { label: "Merma", color: "bg-orange-100 text-orange-700" },
  SALE_DEDUCTION: { label: "Venta", color: "bg-pink-100 text-pink-700" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KardexPage() {
  const { authFetch, loading: authLoading } = useAuth();

  // --- Data ---
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [kardexData, setKardexData] = useState<KardexResponse | null>(null);
  const [summary, setSummary] = useState<KardexSummary | null>(null);
  const [loadingKardex, setLoadingKardex] = useState(false);
  const [_loadingSummary, setLoadingSummary] = useState(false);

  // --- Filters ---
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [movementType, setMovementType] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // --- Load products and branches ---
  useEffect(() => {
    if (authLoading) return;
    const load = async () => {
      try {
        const [prods, brch] = await Promise.all([
          authFetch<Product[]>("get", "/inventarios/products"),
          authFetch<Branch[]>("get", "/branches"),
        ]);
        setProducts(prods);
        setBranches(brch);
      } catch {
        // silent
      }
    };
    load();
  }, [authFetch, authLoading]);

  // --- Fetch Kardex when product selected ---
  const fetchKardex = useCallback(async () => {
    if (!selectedProductId) {
      setKardexData(null);
      setSummary(null);
      return;
    }
    setLoadingKardex(true);
    setLoadingSummary(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranchId) params.set("branchId", selectedBranchId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (movementType) params.set("movementType", movementType);

      const qs = params.toString();
      const [kData, sData] = await Promise.all([
        authFetch<KardexResponse>(
          "get",
          `/inventarios/kardex/${selectedProductId}${qs ? `?${qs}` : ""}`,
        ),
        authFetch<KardexSummary>(
          "get",
          `/inventarios/kardex/${selectedProductId}/summary${selectedBranchId ? `?branchId=${selectedBranchId}` : ""}`,
        ),
      ]);
      setKardexData(kData);
      setSummary(sData);
    } catch {
      // silent
    } finally {
      setLoadingKardex(false);
      setLoadingSummary(false);
    }
  }, [selectedProductId, selectedBranchId, dateFrom, dateTo, movementType, authFetch]);

  useEffect(() => {
    fetchKardex();
  }, [fetchKardex]);

  // --- Product search filter ---
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 50);
    const q = productSearch.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 50);
  }, [products, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId],
  );

  // --- Totals ---
  const totals = useMemo(() => {
    if (!kardexData?.movements.length) return { entries: 0, exits: 0, netChange: 0 };
    let entries = 0;
    let exits = 0;
    for (const m of kardexData.movements) {
      if (m.quantity > 0) entries += m.quantity;
      else exits += Math.abs(m.quantity);
    }
    return { entries, exits, netChange: entries - exits };
  }, [kardexData]);

  // --- Export CSV ---
  const handleExportCSV = () => {
    if (!kardexData?.movements.length) return;
    const data = kardexData.movements.map((m) => ({
      fecha: new Date(m.timestamp).toLocaleString("es-MX"),
      sucursal: m.branchName,
      tipo: TYPE_BADGES[m.movementType]?.label || m.movementType,
      referencia: m.referenceType ? `${m.referenceType}:${m.referenceId || ""}` : "",
      entrada: m.quantity > 0 ? m.quantity : "",
      salida: m.quantity < 0 ? Math.abs(m.quantity) : "",
      saldo: m.runningBalance,
      costoUnitario: m.unitCost,
      costoTotal: m.totalCost,
      notas: m.notes || "",
      usuario: m.userName,
    }));
    const productName = kardexData.product?.name || "producto";
    exportToCSV(data, `kardex_${productName}`, [
      { key: "fecha", label: "Fecha" },
      { key: "sucursal", label: "Sucursal" },
      { key: "tipo", label: "Tipo" },
      { key: "referencia", label: "Referencia" },
      { key: "entrada", label: "Entrada" },
      { key: "salida", label: "Salida" },
      { key: "saldo", label: "Saldo" },
      { key: "costoUnitario", label: "Costo Unit." },
      { key: "costoTotal", label: "Costo Total" },
      { key: "notas", label: "Notas" },
      { key: "usuario", label: "Usuario" },
    ]);
  };

  // --- Render ---
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Kardex</h1>
            <p className="text-sm text-gray-500">Consulta de movimientos por producto</p>
          </div>
        </div>
        {kardexData && kardexData.movements.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Product Selector */}
          <div className="relative lg:col-span-2">
            <label className="block text-sm font-medium mb-1">Producto</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por SKU o nombre..."
                className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={
                  selectedProduct
                    ? `${selectedProduct.sku} - ${selectedProduct.name}`
                    : productSearch
                }
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setSelectedProductId("");
                  setShowProductDropdown(true);
                }}
                onFocus={() => setShowProductDropdown(true)}
              />
            </div>
            {showProductDropdown && !selectedProductId && (
              <div className="absolute z-30 mt-1 w-full bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400">No se encontraron productos</div>
                ) : (
                  filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setProductSearch("");
                        setShowProductDropdown(false);
                      }}
                    >
                      <span className="font-mono text-xs text-gray-400">{p.sku}</span>
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto text-xs text-gray-400">{p.unitOfMeasure}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Branch Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Sucursal</label>
            <Select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)}>
              <option value="">Todas</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Movement Type Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Tipo de Movimiento</label>
            <Select value={movementType} onChange={(e) => setMovementType(e.target.value)}>
              {MOVEMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-sm font-medium mb-1">Fecha Desde</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-sm font-medium mb-1">Fecha Hasta</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedProductId("");
                setSelectedBranchId("");
                setDateFrom("");
                setDateTo("");
                setMovementType("");
                setProductSearch("");
              }}
            >
              <Filter className="h-4 w-4" />
              Limpiar filtros
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && selectedProductId && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <SummaryCard
            title="Stock Actual"
            value={`${summary.currentStock} ${summary.product?.unitOfMeasure || ""}`}
            icon={<Package className="h-5 w-5 text-blue-600" />}
            bgColor="bg-blue-50"
          />
          <SummaryCard
            title="Valor en Stock"
            value={formatMXN(summary.stockValue)}
            icon={<ArrowUpDown className="h-5 w-5 text-green-600" />}
            bgColor="bg-green-50"
          />
          <SummaryCard
            title="Total Entradas"
            value={`${summary.totalEntries}`}
            icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
            bgColor="bg-emerald-50"
          />
          <SummaryCard
            title="Total Salidas"
            value={`${summary.totalExits}`}
            icon={<TrendingDown className="h-5 w-5 text-red-600" />}
            bgColor="bg-red-50"
          />
          <SummaryCard
            title="Ultimo Movimiento"
            value={
              summary.lastMovementDate
                ? new Date(summary.lastMovementDate).toLocaleDateString("es-MX")
                : "Sin movimientos"
            }
            icon={<Calendar className="h-5 w-5 text-gray-600" />}
            bgColor="bg-gray-50"
          />
        </div>
      )}

      {/* Kardex Table */}
      {selectedProductId ? (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              Movimientos
              {kardexData?.product && (
                <span className="text-gray-400 font-normal ml-2">
                  {kardexData.product.sku} - {kardexData.product.name}
                </span>
              )}
            </h2>
            <span className="text-sm text-gray-500">
              {kardexData?.totalMovements || 0} registros
            </span>
          </div>

          {loadingKardex ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
            </div>
          ) : !kardexData?.movements.length ? (
            <div className="py-16 text-center text-gray-400">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay movimientos para este producto</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50/80">
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Fecha</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                      Sucursal
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Tipo</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                      Referencia
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                      Entrada
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                      Salida
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                      Saldo
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                      Costo Unit.
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                      Costo Total
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Notas</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                      Usuario
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {kardexData.movements.map((row) => {
                    const isNegativeBalance = row.runningBalance < 0;
                    return (
                      <tr
                        key={row.id}
                        className={`border-b last:border-0 hover:bg-gray-50/50 transition-colors ${
                          isNegativeBalance ? "bg-red-50" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap">
                          {new Date(row.timestamp).toLocaleString("es-MX", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{row.branchName}</td>
                        <td className="px-4 py-2.5">
                          <MovementBadge type={row.movementType} />
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-500">
                          {row.referenceType ? (
                            <span className="font-mono text-xs">
                              {row.referenceType}
                              {row.referenceId ? `:${row.referenceId.slice(0, 8)}` : ""}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-medium text-emerald-600">
                          {row.quantity > 0
                            ? `+${row.quantity.toLocaleString("es-MX", { maximumFractionDigits: 4 })}`
                            : ""}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-medium text-red-600">
                          {row.quantity < 0
                            ? Math.abs(row.quantity).toLocaleString("es-MX", {
                                maximumFractionDigits: 4,
                              })
                            : ""}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-sm text-right font-semibold ${
                            isNegativeBalance ? "text-red-700" : "text-gray-900"
                          }`}
                        >
                          {row.runningBalance.toLocaleString("es-MX", {
                            maximumFractionDigits: 4,
                          })}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                          {formatMXN(row.unitCost)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                          {formatMXN(row.totalCost)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-500 max-w-[200px] truncate">
                          {row.notes || <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">
                          {row.userName}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Totals row */}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-sm text-gray-900" colSpan={4}>
                      TOTALES
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-emerald-700">
                      +
                      {totals.entries.toLocaleString("es-MX", {
                        maximumFractionDigits: 4,
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-red-700">
                      {totals.exits.toLocaleString("es-MX", {
                        maximumFractionDigits: 4,
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {kardexData.movements.length > 0
                        ? kardexData.movements[
                            kardexData.movements.length - 1
                          ].runningBalance.toLocaleString("es-MX", {
                            maximumFractionDigits: 4,
                          })
                        : "0"}
                    </td>
                    <td colSpan={4}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border rounded-lg py-20 text-center">
          <BookOpen className="h-16 w-16 mx-auto mb-4 text-gray-200" />
          <h3 className="text-lg font-medium text-gray-500 mb-1">Selecciona un producto</h3>
          <p className="text-sm text-gray-400">
            Busca un producto por SKU o nombre para ver su Kardex completo
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  title,
  value,
  icon,
  bgColor,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  bgColor: string;
}) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bgColor}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 truncate">{title}</p>
          <p className="text-lg font-semibold text-gray-900 truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}

function MovementBadge({ type }: { type: string }) {
  const badge = TYPE_BADGES[type] || {
    label: type,
    color: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}
    >
      {badge.label}
    </span>
  );
}
