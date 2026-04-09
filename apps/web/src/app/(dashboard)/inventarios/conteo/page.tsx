"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ClipboardCheck,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  ArrowLeft,
  Ban,
  Save,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
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

interface ProductInfo {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
  costPerUnit: number | string;
}

interface PhysicalCountItem {
  id: string;
  physicalCountId: string;
  productId: string;
  product: ProductInfo;
  systemQuantity: number | string;
  countedQuantity: number | string | null;
  difference: number | string | null;
  unitCost: number | string | null;
  adjustmentValue: number | string | null;
  notes: string | null;
  countedAt: string | null;
}

interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
}

interface PhysicalCount {
  id: string;
  organizationId: string;
  branchId: string;
  branch: Branch;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  countDate: string;
  notes: string | null;
  startedBy: UserRef;
  completedBy: UserRef | null;
  completedAt: string | null;
  totalProducts: number;
  totalDiscrepancies: number;
  totalAdjustmentValue: number | string | null;
  createdAt: string;
  items?: PhysicalCountItem[];
}

interface CountsResponse {
  data: PhysicalCount[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  OPEN: { label: "Abierto", variant: "blue" },
  IN_PROGRESS: { label: "En Progreso", variant: "yellow" },
  COMPLETED: { label: "Completado", variant: "green" },
  CANCELLED: { label: "Cancelado", variant: "gray" },
};

function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "string" ? parseFloat(v) : v;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function diffColorClass(systemQty: number, countedQty: number | null): string {
  if (countedQty === null) return "";
  const diff = countedQty - systemQty;
  if (diff === 0) return "text-green-600";
  const pct = systemQty !== 0 ? Math.abs(diff / systemQty) : (diff !== 0 ? 1 : 0);
  if (pct > 0.1) return "text-red-600 font-semibold";
  return "text-yellow-600";
}

function diffRowBg(systemQty: number, countedQty: number | null): string {
  if (countedQty === null) return "";
  const diff = countedQty - systemQty;
  if (diff === 0) return "bg-green-50";
  const pct = systemQty !== 0 ? Math.abs(diff / systemQty) : (diff !== 0 ? 1 : 0);
  if (pct > 0.1) return "bg-red-50";
  return "bg-yellow-50";
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ConteoFisicoPage() {
  const { authFetch, loading: authLoading } = useAuth();

  // Data
  const [counts, setCounts] = useState<PhysicalCount[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [totalCounts, setTotalCounts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterBranch, setFilterBranch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);

  // Active count detail
  const [activeCount, setActiveCount] = useState<PhysicalCount | null>(null);
  const [activeItems, setActiveItems] = useState<PhysicalCountItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editedItems, setEditedItems] = useState<Map<string, { countedQuantity: string; notes: string }>>(new Map());
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [newBranchId, setNewBranchId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Error/Success messages
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchBranches = useCallback(async () => {
    try {
      const data = await authFetch<Branch[]>("get", "/branches");
      setBranches(data);
    } catch {
      // silent
    }
  }, [authFetch]);

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterBranch) params.set("branchId", filterBranch);
      if (filterStatus) params.set("status", filterStatus);
      params.set("page", String(page));
      params.set("limit", "25");
      const qs = params.toString();
      const res = await authFetch<CountsResponse>("get", `/inventarios/physical-counts?${qs}`);
      setCounts(res.data);
      setTotalCounts(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setMessage({ type: "error", text: "Error al cargar los conteos" });
    } finally {
      setLoading(false);
    }
  }, [authFetch, filterBranch, filterStatus, page]);

  const fetchCountDetail = useCallback(
    async (id: string) => {
      try {
        const data = await authFetch<PhysicalCount>("get", `/inventarios/physical-counts/${id}`);
        setActiveCount(data);
        setActiveItems(data.items || []);
        setEditedItems(new Map());
      } catch {
        setMessage({ type: "error", text: "Error al cargar el conteo" });
      }
    },
    [authFetch],
  );

  useEffect(() => {
    if (!authLoading) {
      fetchBranches();
      fetchCounts();
    }
  }, [authLoading, fetchBranches, fetchCounts]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleCreate = async () => {
    if (!newBranchId) return;
    setCreating(true);
    try {
      const data = await authFetch<PhysicalCount>("post", "/inventarios/physical-counts", {
        branchId: newBranchId,
        notes: newNotes || undefined,
      });
      setShowNewModal(false);
      setNewBranchId("");
      setNewNotes("");
      setMessage({ type: "success", text: "Conteo creado exitosamente" });
      // Open the new count directly
      setActiveCount(data);
      setActiveItems(data.items || []);
      setEditedItems(new Map());
      fetchCounts();
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Error al crear el conteo" });
    } finally {
      setCreating(false);
    }
  };

  const handleItemChange = (itemId: string, field: "countedQuantity" | "notes", value: string) => {
    setEditedItems((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId) || { countedQuantity: "", notes: "" };
      // Initialize from current item if not yet edited
      if (!next.has(itemId)) {
        const item = activeItems.find((i) => i.id === itemId);
        if (item) {
          existing.countedQuantity = item.countedQuantity !== null ? String(toNum(item.countedQuantity)) : "";
          existing.notes = item.notes || "";
        }
      }
      next.set(itemId, { ...existing, [field]: value });
      return next;
    });
  };

  const handleSaveProgress = async () => {
    if (!activeCount || editedItems.size === 0) return;
    setSaving(true);
    try {
      const itemsToUpdate = Array.from(editedItems.entries())
        .filter(([, val]) => val.countedQuantity !== "")
        .map(([itemId, val]) => ({
          itemId,
          countedQuantity: parseFloat(val.countedQuantity),
          notes: val.notes || undefined,
        }));

      if (itemsToUpdate.length === 0) {
        setSaving(false);
        return;
      }

      await authFetch("patch", `/inventarios/physical-counts/${activeCount.id}/items`, {
        items: itemsToUpdate,
      });

      setMessage({ type: "success", text: `${itemsToUpdate.length} producto(s) guardados` });
      await fetchCountDetail(activeCount.id);
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Error al guardar" });
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!activeCount) return;
    setCompleting(true);
    try {
      const data = await authFetch<PhysicalCount>("post", `/inventarios/physical-counts/${activeCount.id}/complete`);
      setShowCompleteConfirm(false);
      setActiveCount(data);
      setActiveItems(data.items || []);
      setEditedItems(new Map());
      setMessage({ type: "success", text: "Conteo finalizado. Ajustes de inventario generados." });
      fetchCounts();
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Error al finalizar el conteo" });
    } finally {
      setCompleting(false);
    }
  };

  const handleCancel = async () => {
    if (!activeCount) return;
    try {
      await authFetch("post", `/inventarios/physical-counts/${activeCount.id}/cancel`);
      setShowCancelConfirm(false);
      setActiveCount(null);
      setActiveItems([]);
      setMessage({ type: "success", text: "Conteo cancelado" });
      fetchCounts();
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Error al cancelar" });
    }
  };

  // ---------------------------------------------------------------------------
  // Computed values for active count
  // ---------------------------------------------------------------------------

  const filteredItems = useMemo(() => {
    if (!searchTerm) return activeItems;
    const lower = searchTerm.toLowerCase();
    return activeItems.filter(
      (item) =>
        item.product.name.toLowerCase().includes(lower) ||
        item.product.sku.toLowerCase().includes(lower),
    );
  }, [activeItems, searchTerm]);

  const summaryStats = useMemo(() => {
    const total = activeItems.length;
    const counted = activeItems.filter((i) => i.countedQuantity !== null).length;
    const pending = total - counted;
    const withDiff = activeItems.filter((i) => i.difference !== null && toNum(i.difference) !== 0).length;
    const totalAdjValue = activeItems.reduce((sum, i) => sum + toNum(i.adjustmentValue), 0);

    // Top 5 biggest differences
    const sorted = [...activeItems]
      .filter((i) => i.difference !== null)
      .sort((a, b) => Math.abs(toNum(b.difference)) - Math.abs(toNum(a.difference)))
      .slice(0, 5);

    return { total, counted, pending, withDiff, totalAdjValue, topDifferences: sorted };
  }, [activeItems]);

  const isEditable = activeCount?.status === "OPEN" || activeCount?.status === "IN_PROGRESS";
  const hasUnsavedChanges = editedItems.size > 0;
  const allCounted = summaryStats.pending === 0 && summaryStats.total > 0;

  // ---------------------------------------------------------------------------
  // Auto-clear messages
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // ---------------------------------------------------------------------------
  // Render: Detail / Capture View
  // ---------------------------------------------------------------------------

  if (activeCount) {
    const statusCfg = STATUS_CONFIG[activeCount.status] || STATUS_CONFIG.OPEN;

    return (
      <div className="space-y-4">
        {/* Message */}
        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium ${
              message.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setActiveCount(null);
                setActiveItems([]);
                setEditedItems(new Map());
                setSearchTerm("");
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <ClipboardCheck className="h-6 w-6" />
                Conteo Fisico
              </h1>
              <p className="text-sm text-gray-500">
                {activeCount.branch.name} - {formatDateTime(activeCount.countDate)} - Iniciado por {activeCount.startedBy.firstName} {activeCount.startedBy.lastName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge label={statusCfg.label} variant={statusCfg.variant as any} />
            {isEditable && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveProgress}
                  disabled={saving || !hasUnsavedChanges}
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Guardando..." : "Guardar Progreso"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  <Ban className="h-4 w-4" />
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowCompleteConfirm(true)}
                  disabled={!allCounted}
                  title={!allCounted ? "Todos los productos deben ser contados" : ""}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Finalizar Conteo
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Summary Panel */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Progress */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Progreso</span>
              <span className="text-sm font-bold text-gray-900">
                {summaryStats.counted}/{summaryStats.total}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-black rounded-full h-2.5 transition-all"
                style={{
                  width: `${summaryStats.total > 0 ? (summaryStats.counted / summaryStats.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{summaryStats.pending} pendientes</p>
          </div>

          {/* Discrepancies */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium text-gray-600">Discrepancias</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{summaryStats.withDiff}</p>
            <p className="text-xs text-gray-500">productos con diferencia</p>
          </div>

          {/* Adjustment Value */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Scale className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-600">Valor Ajuste</span>
            </div>
            <p className={`text-2xl font-bold ${summaryStats.totalAdjValue < 0 ? "text-red-600" : summaryStats.totalAdjValue > 0 ? "text-green-600" : "text-gray-900"}`}>
              {formatMXN(summaryStats.totalAdjValue)}
            </p>
          </div>

          {/* Top Differences */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-gray-600">Top Diferencias</span>
            </div>
            {summaryStats.topDifferences.length === 0 ? (
              <p className="text-xs text-gray-400">Sin diferencias aun</p>
            ) : (
              <div className="space-y-1">
                {summaryStats.topDifferences.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[120px]" title={item.product.name}>{item.product.name}</span>
                    <span className={`font-mono font-medium ${toNum(item.difference) < 0 ? "text-red-600" : "text-green-600"}`}>
                      {toNum(item.difference) > 0 ? "+" : ""}{toNum(item.difference).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por producto o SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
          <span className="text-sm text-gray-500">
            {filteredItems.length} de {activeItems.length} productos
          </span>
        </div>

        {/* Items Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Producto</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3 w-20">SKU</th>
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-3 w-16">Unidad</th>
                <th className="text-right text-xs font-medium text-gray-500 px-3 py-3 w-28">Stock Sistema</th>
                <th className="text-right text-xs font-medium text-gray-500 px-3 py-3 w-32">Conteo Real</th>
                <th className="text-right text-xs font-medium text-gray-500 px-3 py-3 w-24">Diferencia</th>
                <th className="text-right text-xs font-medium text-gray-500 px-3 py-3 w-28">Valor Ajuste</th>
                {isEditable && (
                  <th className="text-left text-xs font-medium text-gray-500 px-3 py-3 w-36">Notas</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={isEditable ? 8 : 7} className="px-4 py-8 text-center text-gray-400">
                    {searchTerm ? "No se encontraron productos" : "Sin productos"}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const systemQty = toNum(item.systemQuantity);
                  const edited = editedItems.get(item.id);
                  const displayCounted = edited
                    ? edited.countedQuantity
                    : item.countedQuantity !== null
                      ? String(toNum(item.countedQuantity))
                      : "";
                  const computedCounted = displayCounted !== "" ? parseFloat(displayCounted) : null;
                  const computedDiff = computedCounted !== null ? computedCounted - systemQty : null;
                  const unitCost = toNum(item.unitCost);
                  const computedAdjValue = computedDiff !== null ? computedDiff * unitCost : null;

                  return (
                    <tr
                      key={item.id}
                      className={`border-b last:border-0 transition-colors ${diffRowBg(systemQty, computedCounted)}`}
                    >
                      <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{item.product.name}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-500">{item.product.sku}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{item.product.unitOfMeasure}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono">{systemQty.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {isEditable ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={displayCounted}
                            onChange={(e) => handleItemChange(item.id, "countedQuantity", e.target.value)}
                            className="w-24 px-2 py-1 border rounded text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-black"
                            placeholder="0.00"
                          />
                        ) : (
                          <span className="text-sm font-mono">
                            {item.countedQuantity !== null ? toNum(item.countedQuantity).toFixed(2) : "-"}
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-sm text-right font-mono ${diffColorClass(systemQty, computedCounted)}`}>
                        {computedDiff !== null ? (
                          <>
                            {computedDiff > 0 ? "+" : ""}
                            {computedDiff.toFixed(2)}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-sm text-right font-mono ${computedAdjValue !== null && computedAdjValue < 0 ? "text-red-600" : computedAdjValue !== null && computedAdjValue > 0 ? "text-green-600" : ""}`}>
                        {computedAdjValue !== null ? formatMXN(computedAdjValue) : "-"}
                      </td>
                      {isEditable && (
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            value={edited?.notes ?? item.notes ?? ""}
                            onChange={(e) => handleItemChange(item.id, "notes", e.target.value)}
                            className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-2 focus:ring-black"
                            placeholder="Nota..."
                          />
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Complete Confirmation Modal */}
        <Modal
          open={showCompleteConfirm}
          onClose={() => setShowCompleteConfirm(false)}
          title="Finalizar Conteo Fisico"
        >
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800">Esta accion es irreversible</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    Al finalizar el conteo, se generaran movimientos de ajuste para todos los productos con diferencias
                    y se actualizara el inventario de la sucursal.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
              <p><span className="font-medium">Sucursal:</span> {activeCount.branch.name}</p>
              <p><span className="font-medium">Productos contados:</span> {summaryStats.counted}</p>
              <p><span className="font-medium">Discrepancias:</span> {summaryStats.withDiff}</p>
              <p><span className="font-medium">Valor total ajuste:</span> {formatMXN(summaryStats.totalAdjValue)}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCompleteConfirm(false)}>
                Cancelar
              </Button>
              <Button onClick={handleComplete} disabled={completing}>
                <CheckCircle2 className="h-4 w-4" />
                {completing ? "Finalizando..." : "Confirmar y Finalizar"}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Cancel Confirmation Modal */}
        <Modal
          open={showCancelConfirm}
          onClose={() => setShowCancelConfirm(false)}
          title="Cancelar Conteo"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Se cancelara este conteo fisico. No se generaran ajustes de inventario.
              Los datos capturados se perderan.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>
                Volver
              </Button>
              <Button variant="destructive" onClick={handleCancel}>
                <Ban className="h-4 w-4" />
                Confirmar Cancelacion
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: List View
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Message */}
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            message.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" />
            Conteo Fisico
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Verifica el stock real vs el sistema y genera ajustes automaticos
          </p>
        </div>
        <Button onClick={() => setShowNewModal(true)}>
          <Plus className="h-4 w-4" />
          Nuevo Conteo
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select
          value={filterBranch}
          onChange={(e) => {
            setFilterBranch(e.target.value);
            setPage(1);
          }}
          className="w-48"
        >
          <option value="">Todas las Sucursales</option>
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
            setPage(1);
          }}
          className="w-40"
        >
          <option value="">Todos los Estados</option>
          <option value="OPEN">Abierto</option>
          <option value="IN_PROGRESS">En Progreso</option>
          <option value="COMPLETED">Completado</option>
          <option value="CANCELLED">Cancelado</option>
        </Select>
      </div>

      {/* Counts Table */}
      <DataTable
        columns={[
          {
            key: "countDate",
            header: "Fecha",
            render: (row: PhysicalCount) => formatDate(row.countDate),
          },
          {
            key: "branch",
            header: "Sucursal",
            render: (row: PhysicalCount) => (
              <span className="font-medium">{row.branch.name}</span>
            ),
          },
          {
            key: "status",
            header: "Estado",
            render: (row: PhysicalCount) => {
              const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.OPEN;
              return <StatusBadge label={cfg.label} variant={cfg.variant as any} />;
            },
          },
          {
            key: "totalProducts",
            header: "Productos",
            render: (row: PhysicalCount) => row.totalProducts,
          },
          {
            key: "totalDiscrepancies",
            header: "Discrepancias",
            render: (row: PhysicalCount) =>
              row.status === "COMPLETED" ? (
                <span className={row.totalDiscrepancies > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                  {row.totalDiscrepancies}
                </span>
              ) : (
                <span className="text-gray-400">-</span>
              ),
          },
          {
            key: "totalAdjustmentValue",
            header: "Valor Ajuste",
            render: (row: PhysicalCount) =>
              row.status === "COMPLETED" && row.totalAdjustmentValue !== null ? (
                <span className={`font-mono ${toNum(row.totalAdjustmentValue) < 0 ? "text-red-600" : "text-green-600"}`}>
                  {formatMXN(toNum(row.totalAdjustmentValue))}
                </span>
              ) : (
                <span className="text-gray-400">-</span>
              ),
          },
          {
            key: "startedBy",
            header: "Iniciado por",
            render: (row: PhysicalCount) =>
              `${row.startedBy.firstName} ${row.startedBy.lastName}`,
          },
        ]}
        data={counts}
        loading={loading}
        emptyMessage="No hay conteos registrados"
        onRowClick={(row) => fetchCountDetail(row.id)}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Mostrando pagina {page} de {totalPages} ({totalCounts} conteos)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* New Count Modal */}
      <Modal
        open={showNewModal}
        onClose={() => {
          setShowNewModal(false);
          setNewBranchId("");
          setNewNotes("");
        }}
        title="Nuevo Conteo Fisico"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Se creara un conteo con todos los productos del inventario de la sucursal seleccionada.
            Las cantidades del sistema se capturaran como referencia.
          </p>
          <FormField label="Sucursal" required>
            <Select value={newBranchId} onChange={(e) => setNewBranchId(e.target.value)}>
              <option value="">Seleccionar sucursal...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Notas (opcional)">
            <Textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Notas sobre este conteo..."
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowNewModal(false);
                setNewBranchId("");
                setNewNotes("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newBranchId}>
              <ClipboardCheck className="h-4 w-4" />
              {creating ? "Creando..." : "Crear Conteo"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
