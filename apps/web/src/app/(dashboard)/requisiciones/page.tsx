"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ClipboardList,
  Send,
  CheckCircle,
  Truck,
  XCircle,
  Plus,
  Eye,
  Pencil,
  Ban,
  Clock,
  AlertTriangle,
  PackageCheck,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Branch {
  id: string;
  name: string;
  code: string;
  branchType?: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  costPerUnit: number | string;
}

interface RequisitionItem {
  id: string;
  productId: string;
  product: Product;
  requestedQuantity: number | string;
  approvedQuantity: number | string | null;
  unitOfMeasure: string;
  notes?: string;
}

interface Requisition {
  id: string;
  organizationId: string;
  requestingBranchId: string;
  fulfillingBranchId: string | null;
  status: string;
  priority: string;
  requestedDeliveryDate: string | null;
  notes: string | null;
  rejectionReason: string | null;
  requestedById: string;
  approvedById: string | null;
  transferId: string | null;
  createdAt: string;
  updatedAt: string;
  requestingBranch: { id: string; name: string; code: string };
  fulfillingBranch: { id: string; name: string; code: string } | null;
  requestedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  approvedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  items: RequisitionItem[];
}

interface Summary {
  counts: Record<string, number>;
  pendingApproval: number;
  approvedToday: number;
  rejectedToday: number;
  fulfilledToday: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: string; icon: React.ElementType }
> = {
  DRAFT: { label: "Borrador", variant: "gray", icon: Pencil },
  SUBMITTED: { label: "Enviada", variant: "blue", icon: Send },
  APPROVED: { label: "Aprobada", variant: "green", icon: CheckCircle },
  PARTIALLY_FULFILLED: {
    label: "Parcial",
    variant: "yellow",
    icon: PackageCheck,
  },
  FULFILLED: { label: "Surtida", variant: "purple", icon: Truck },
  REJECTED: { label: "Rechazada", variant: "red", icon: XCircle },
  CANCELLED: { label: "Cancelada", variant: "gray", icon: Ban },
};

const PRIORITY_CONFIG: Record<
  string,
  { label: string; variant: string }
> = {
  URGENT: { label: "Urgente", variant: "red" },
  HIGH: { label: "Alta", variant: "yellow" },
  NORMAL: { label: "Normal", variant: "blue" },
  LOW: { label: "Baja", variant: "gray" },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatShortId(id: string) {
  return id.slice(-6).toUpperCase();
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function RequisicionesPage() {
  const { user, authFetch, loading: authLoading } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState<"mis" | "aprobar">("mis");
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [pendingRequisitions, setPendingRequisitions] = useState<Requisition[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] =
    useState<Requisition | null>(null);

  // Create form
  const [formBranch, setFormBranch] = useState("");
  const [formPriority, setFormPriority] = useState("NORMAL");
  const [formDeliveryDate, setFormDeliveryDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formItems, setFormItems] = useState<
    Array<{
      productId: string;
      requestedQuantity: string;
      unitOfMeasure: string;
      notes: string;
    }>
  >([{ productId: "", requestedQuantity: "", unitOfMeasure: "", notes: "" }]);
  const [saving, setSaving] = useState(false);

  // Approve form
  const [approveItems, setApproveItems] = useState<
    Array<{ itemId: string; approvedQuantity: string }>
  >([]);

  // Reject form
  const [rejectReason, setRejectReason] = useState("");

  // Expandable rows for "Por Aprobar" tab
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchBranches = useCallback(async () => {
    try {
      const data = await authFetch<Branch[]>("get", "/branches");
      setBranches(data);
    } catch {
      /* silent */
    }
  }, [authFetch]);

  const fetchProducts = useCallback(async () => {
    try {
      const data = await authFetch<{ data: Product[] }>(
        "get",
        "/inventarios/products?limit=500",
      );
      setProducts(data.data || []);
    } catch {
      /* silent */
    }
  }, [authFetch]);

  const fetchRequisitions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterBranch) params.set("requestingBranchId", filterBranch);
      if (filterPriority) params.set("priority", filterPriority);
      params.set("page", String(page));
      params.set("limit", "25");

      const data = await authFetch<{
        data: Requisition[];
        total: number;
        totalPages: number;
      }>("get", `/requisitions?${params.toString()}`);
      setRequisitions(data.data);
      setTotalPages(data.totalPages);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [authFetch, filterStatus, filterBranch, filterPriority, page]);

  const fetchPending = useCallback(async () => {
    try {
      const data = await authFetch<{
        data: Requisition[];
      }>("get", "/requisitions?status=SUBMITTED&limit=100");
      setPendingRequisitions(data.data);
    } catch {
      /* silent */
    }
  }, [authFetch]);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await authFetch<Summary>("get", "/requisitions/summary");
      setSummary(data);
    } catch {
      /* silent */
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchBranches();
      fetchProducts();
      fetchSummary();
    }
  }, [authLoading, user, fetchBranches, fetchProducts, fetchSummary]);

  useEffect(() => {
    if (!authLoading && user) {
      if (activeTab === "mis") {
        fetchRequisitions();
      } else {
        fetchPending();
      }
    }
  }, [
    authLoading,
    user,
    activeTab,
    fetchRequisitions,
    fetchPending,
  ]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleCreate = async (submitDirectly: boolean) => {
    if (!formBranch || formItems.some((i) => !i.productId || !i.requestedQuantity)) {
      return;
    }
    setSaving(true);
    try {
      await authFetch("post", "/requisitions", {
        requestingBranchId: formBranch,
        priority: formPriority,
        requestedDeliveryDate: formDeliveryDate || undefined,
        notes: formNotes || undefined,
        status: submitDirectly ? "SUBMITTED" : "DRAFT",
        items: formItems.map((i) => ({
          productId: i.productId,
          requestedQuantity: parseFloat(i.requestedQuantity),
          unitOfMeasure:
            i.unitOfMeasure ||
            products.find((p) => p.id === i.productId)?.unitOfMeasure ||
            "PZ",
          notes: i.notes || undefined,
        })),
      });
      setCreateOpen(false);
      resetCreateForm();
      fetchRequisitions();
      fetchSummary();
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (id: string) => {
    try {
      await authFetch("post", `/requisitions/${id}/submit`, {});
      fetchRequisitions();
      fetchSummary();
      if (selectedRequisition?.id === id) {
        const updated = await authFetch<Requisition>(
          "get",
          `/requisitions/${id}`,
        );
        setSelectedRequisition(updated);
      }
    } catch {
      /* silent */
    }
  };

  const handleApprove = async () => {
    if (!selectedRequisition) return;
    setSaving(true);
    try {
      await authFetch("post", `/requisitions/${selectedRequisition.id}/approve`, {
        items: approveItems.map((i) => ({
          itemId: i.itemId,
          approvedQuantity: parseFloat(i.approvedQuantity),
        })),
      });
      setApproveOpen(false);
      fetchPending();
      fetchRequisitions();
      fetchSummary();
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequisition || !rejectReason.trim()) return;
    setSaving(true);
    try {
      await authFetch("post", `/requisitions/${selectedRequisition.id}/reject`, {
        rejectionReason: rejectReason,
      });
      setRejectOpen(false);
      setRejectReason("");
      fetchPending();
      fetchRequisitions();
      fetchSummary();
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  };

  const handleFulfill = async (id: string) => {
    try {
      await authFetch("post", `/requisitions/${id}/fulfill`, {});
      fetchPending();
      fetchRequisitions();
      fetchSummary();
      if (selectedRequisition?.id === id) {
        const updated = await authFetch<Requisition>(
          "get",
          `/requisitions/${id}`,
        );
        setSelectedRequisition(updated);
      }
    } catch {
      /* silent */
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await authFetch("post", `/requisitions/${id}/cancel`, {});
      fetchRequisitions();
      fetchSummary();
      if (selectedRequisition?.id === id) {
        const updated = await authFetch<Requisition>(
          "get",
          `/requisitions/${id}`,
        );
        setSelectedRequisition(updated);
      }
    } catch {
      /* silent */
    }
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const resetCreateForm = () => {
    setFormBranch("");
    setFormPriority("NORMAL");
    setFormDeliveryDate("");
    setFormNotes("");
    setFormItems([
      { productId: "", requestedQuantity: "", unitOfMeasure: "", notes: "" },
    ]);
  };

  const addFormItem = () => {
    setFormItems([
      ...formItems,
      { productId: "", requestedQuantity: "", unitOfMeasure: "", notes: "" },
    ]);
  };

  const removeFormItem = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const updateFormItem = (
    index: number,
    field: string,
    value: string,
  ) => {
    const updated = [...formItems];
    (updated[index] as any)[field] = value;
    // Auto-fill unitOfMeasure from product
    if (field === "productId") {
      const product = products.find((p) => p.id === value);
      if (product) {
        updated[index].unitOfMeasure = product.unitOfMeasure;
      }
    }
    setFormItems(updated);
  };

  const openApproveModal = (req: Requisition) => {
    setSelectedRequisition(req);
    setApproveItems(
      req.items.map((item) => ({
        itemId: item.id,
        approvedQuantity: String(item.requestedQuantity),
      })),
    );
    setApproveOpen(true);
  };

  const openRejectModal = (req: Requisition) => {
    setSelectedRequisition(req);
    setRejectReason("");
    setRejectOpen(true);
  };

  const openDetail = (req: Requisition) => {
    setSelectedRequisition(req);
    setDetailOpen(true);
  };

  const toggleExpanded = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const storeBranches = branches.filter(
    (b) => b.branchType === "TIENDA" || !b.branchType,
  );

  // ---------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------

  const mainColumns = [
    {
      key: "folio",
      header: "Folio",
      render: (r: Requisition) => (
        <span className="font-mono text-xs font-medium">
          REQ-{formatShortId(r.id)}
        </span>
      ),
    },
    {
      key: "requestingBranch",
      header: "Tienda",
      render: (r: Requisition) => (
        <span className="text-sm">{r.requestingBranch.name}</span>
      ),
    },
    {
      key: "createdAt",
      header: "Fecha",
      render: (r: Requisition) => (
        <span className="text-sm text-gray-600">{formatDate(r.createdAt)}</span>
      ),
    },
    {
      key: "priority",
      header: "Prioridad",
      render: (r: Requisition) => {
        const cfg = PRIORITY_CONFIG[r.priority] || PRIORITY_CONFIG.NORMAL;
        return <StatusBadge label={cfg.label} variant={cfg.variant as any} />;
      },
    },
    {
      key: "items",
      header: "Productos",
      render: (r: Requisition) => (
        <span className="text-sm text-gray-600">
          {r.items?.length || 0} producto(s)
        </span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (r: Requisition) => {
        const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.DRAFT;
        return <StatusBadge label={cfg.label} variant={cfg.variant as any} />;
      },
    },
    {
      key: "actions",
      header: "",
      render: (r: Requisition) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openDetail(r);
            }}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title="Ver detalle"
          >
            <Eye className="h-4 w-4" />
          </button>
          {r.status === "DRAFT" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSubmit(r.id);
              }}
              className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
              title="Enviar"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
          {(r.status === "DRAFT" || r.status === "SUBMITTED") && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCancel(r.id);
              }}
              className="p-1.5 rounded hover:bg-red-50 text-red-500"
              title="Cancelar"
            >
              <Ban className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Cargando...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black">
            <ClipboardList className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Requisiciones</h1>
            <p className="text-sm text-gray-500">
              Solicitudes de surtido de tiendas a CEDIS
            </p>
          </div>
        </div>
        <Button onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" />
          Nueva Requisicion
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("mis")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "mis"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <ClipboardList className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Mis Requisiciones
          </button>
          <button
            onClick={() => setActiveTab("aprobar")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "aprobar"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <CheckCircle className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Por Aprobar
            {summary && summary.pendingApproval > 0 && (
              <span className="ml-2 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-red-500 text-white text-xs font-bold px-1.5">
                {summary.pendingApproval}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab 1: Mis Requisiciones */}
      {activeTab === "mis" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="w-40"
            >
              <option value="">Todos los estados</option>
              <option value="DRAFT">Borrador</option>
              <option value="SUBMITTED">Enviada</option>
              <option value="APPROVED">Aprobada</option>
              <option value="FULFILLED">Surtida</option>
              <option value="REJECTED">Rechazada</option>
              <option value="CANCELLED">Cancelada</option>
            </Select>
            <Select
              value={filterBranch}
              onChange={(e) => { setFilterBranch(e.target.value); setPage(1); }}
              className="w-48"
            >
              <option value="">Todas las tiendas</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select
              value={filterPriority}
              onChange={(e) => { setFilterPriority(e.target.value); setPage(1); }}
              className="w-36"
            >
              <option value="">Prioridad</option>
              <option value="URGENT">Urgente</option>
              <option value="HIGH">Alta</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Baja</option>
            </Select>
          </div>

          {/* Table */}
          <DataTable
            columns={mainColumns}
            data={requisitions}
            loading={loading}
            emptyMessage="No hay requisiciones"
            onRowClick={openDetail}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-gray-500">
                Pagina {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Por Aprobar */}
      {activeTab === "aprobar" && (
        <div className="space-y-4">
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-lg border bg-white p-4">
                <div className="flex items-center gap-2 text-blue-600">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase text-gray-500">
                    Pendientes
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {summary.pendingApproval}
                </p>
              </div>
              <div className="rounded-lg border bg-white p-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase text-gray-500">
                    Aprobadas hoy
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {summary.approvedToday}
                </p>
              </div>
              <div className="rounded-lg border bg-white p-4">
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase text-gray-500">
                    Rechazadas
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {summary.rejectedToday}
                </p>
              </div>
              <div className="rounded-lg border bg-white p-4">
                <div className="flex items-center gap-2 text-purple-600">
                  <Truck className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase text-gray-500">
                    Surtidas
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {summary.fulfilledToday}
                </p>
              </div>
            </div>
          )}

          {/* Pending list */}
          {pendingRequisitions.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-gray-400">
              No hay requisiciones pendientes de aprobacion
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequisitions.map((req) => {
                const isExpanded = expandedRows.has(req.id);
                return (
                  <div
                    key={req.id}
                    className="border rounded-lg bg-white overflow-hidden"
                  >
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleExpanded(req.id)}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="font-mono text-xs font-medium text-gray-500">
                          REQ-{formatShortId(req.id)}
                        </span>
                        <span className="text-sm font-medium truncate">
                          {req.requestingBranch.name}
                        </span>
                        <StatusBadge
                          label={
                            PRIORITY_CONFIG[req.priority]?.label || "Normal"
                          }
                          variant={
                            (PRIORITY_CONFIG[req.priority]?.variant ||
                              "blue") as any
                          }
                        />
                        <span className="text-sm text-gray-500 hidden sm:inline">
                          {req.items.length} producto(s)
                        </span>
                        <span className="text-sm text-gray-400 hidden md:inline">
                          {formatDate(req.createdAt)}
                        </span>
                        {req.requestedDeliveryDate && (
                          <span className="text-xs text-orange-600 hidden lg:inline">
                            Entrega: {formatDate(req.requestedDeliveryDate)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            openApproveModal(req);
                          }}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRejectModal(req);
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Rechazar
                        </Button>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t px-4 py-3 bg-gray-50">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-500 uppercase">
                              <th className="pb-2">Producto</th>
                              <th className="pb-2">SKU</th>
                              <th className="pb-2 text-right">
                                Cantidad Solicitada
                              </th>
                              <th className="pb-2">Unidad</th>
                              <th className="pb-2">Notas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {req.items.map((item) => (
                              <tr key={item.id} className="border-t border-gray-200">
                                <td className="py-2 font-medium">
                                  {item.product.name}
                                </td>
                                <td className="py-2 text-gray-500 font-mono text-xs">
                                  {item.product.sku}
                                </td>
                                <td className="py-2 text-right">
                                  {Number(item.requestedQuantity)}
                                </td>
                                <td className="py-2 text-gray-500">
                                  {item.unitOfMeasure}
                                </td>
                                <td className="py-2 text-gray-400">
                                  {item.notes || "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {req.notes && (
                          <p className="mt-2 text-sm text-gray-500">
                            <span className="font-medium">Nota:</span>{" "}
                            {req.notes}
                          </p>
                        )}
                        {/* Fulfill button for approved requisitions viewed here */}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Create Modal                                                       */}
      {/* ----------------------------------------------------------------- */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nueva Requisicion"
        wide
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Sucursal solicitante" required>
              <Select
                value={formBranch}
                onChange={(e) => setFormBranch(e.target.value)}
              >
                <option value="">Seleccionar sucursal</option>
                {storeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Prioridad">
              <Select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
              >
                <option value="LOW">Baja</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Fecha de entrega deseada">
            <Input
              type="date"
              value={formDeliveryDate}
              onChange={(e) => setFormDeliveryDate(e.target.value)}
            />
          </FormField>
          <FormField label="Notas">
            <Textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Notas adicionales para la requisicion..."
            />
          </FormField>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Productos *</label>
              <button
                type="button"
                onClick={addFormItem}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                + Agregar producto
              </button>
            </div>
            <div className="space-y-2">
              {formItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 bg-gray-50 rounded-lg p-3"
                >
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <Select
                      value={item.productId}
                      onChange={(e) =>
                        updateFormItem(index, "productId", e.target.value)
                      }
                      className="sm:col-span-2"
                    >
                      <option value="">Seleccionar producto</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Cantidad"
                      value={item.requestedQuantity}
                      onChange={(e) =>
                        updateFormItem(
                          index,
                          "requestedQuantity",
                          e.target.value,
                        )
                      }
                    />
                    <Input
                      placeholder="Unidad"
                      value={item.unitOfMeasure}
                      onChange={(e) =>
                        updateFormItem(index, "unitOfMeasure", e.target.value)
                      }
                    />
                  </div>
                  {formItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeFormItem(index)}
                      className="mt-1 p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleCreate(false)}
              disabled={saving}
            >
              <Pencil className="h-4 w-4" />
              Guardar Borrador
            </Button>
            <Button onClick={() => handleCreate(true)} disabled={saving}>
              <Send className="h-4 w-4" />
              Enviar
            </Button>
          </div>
        </div>
      </Modal>

      {/* ----------------------------------------------------------------- */}
      {/* Detail Modal                                                       */}
      {/* ----------------------------------------------------------------- */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={
          selectedRequisition
            ? `Requisicion REQ-${formatShortId(selectedRequisition.id)}`
            : "Detalle"
        }
        wide
      >
        {selectedRequisition && (
          <div className="space-y-4">
            {/* Status & Info */}
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge
                label={
                  STATUS_CONFIG[selectedRequisition.status]?.label ||
                  selectedRequisition.status
                }
                variant={
                  (STATUS_CONFIG[selectedRequisition.status]?.variant ||
                    "gray") as any
                }
              />
              <StatusBadge
                label={
                  PRIORITY_CONFIG[selectedRequisition.priority]?.label ||
                  "Normal"
                }
                variant={
                  (PRIORITY_CONFIG[selectedRequisition.priority]?.variant ||
                    "blue") as any
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Tienda:</span>{" "}
                <span className="font-medium">
                  {selectedRequisition.requestingBranch.name}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Surtidor:</span>{" "}
                <span className="font-medium">
                  {selectedRequisition.fulfillingBranch?.name || "Sin asignar"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Solicitante:</span>{" "}
                <span className="font-medium">
                  {selectedRequisition.requestedBy.firstName}{" "}
                  {selectedRequisition.requestedBy.lastName}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Creada:</span>{" "}
                <span className="font-medium">
                  {formatDate(selectedRequisition.createdAt)}
                </span>
              </div>
              {selectedRequisition.requestedDeliveryDate && (
                <div>
                  <span className="text-gray-500">Entrega deseada:</span>{" "}
                  <span className="font-medium">
                    {formatDate(selectedRequisition.requestedDeliveryDate)}
                  </span>
                </div>
              )}
              {selectedRequisition.approvedBy && (
                <div>
                  <span className="text-gray-500">Aprobado por:</span>{" "}
                  <span className="font-medium">
                    {selectedRequisition.approvedBy.firstName}{" "}
                    {selectedRequisition.approvedBy.lastName}
                  </span>
                </div>
              )}
              {selectedRequisition.transferId && (
                <div>
                  <span className="text-gray-500">Transferencia:</span>{" "}
                  <span className="font-mono text-xs font-medium text-blue-600">
                    {selectedRequisition.transferId.slice(-6).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {selectedRequisition.notes && (
              <div className="text-sm">
                <span className="text-gray-500">Notas:</span>{" "}
                {selectedRequisition.notes}
              </div>
            )}

            {selectedRequisition.rejectionReason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                <span className="font-medium text-red-800">
                  Motivo de rechazo:
                </span>{" "}
                <span className="text-red-700">
                  {selectedRequisition.rejectionReason}
                </span>
              </div>
            )}

            {/* Items table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-2">Producto</th>
                    <th className="px-4 py-2 text-right">Cant. Solicitada</th>
                    <th className="px-4 py-2 text-right">Cant. Aprobada</th>
                    <th className="px-4 py-2">Unidad</th>
                    <th className="px-4 py-2">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRequisition.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-4 py-2">
                        <div className="font-medium">{item.product.name}</div>
                        <div className="text-xs text-gray-400 font-mono">
                          {item.product.sku}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {Number(item.requestedQuantity)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {item.approvedQuantity != null
                          ? Number(item.approvedQuantity)
                          : "-"}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {item.unitOfMeasure}
                      </td>
                      <td className="px-4 py-2 text-gray-400">
                        {item.notes || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              {selectedRequisition.status === "DRAFT" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSubmit(selectedRequisition.id)}
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleCancel(selectedRequisition.id)}
                  >
                    <Ban className="h-4 w-4" />
                    Cancelar
                  </Button>
                </>
              )}
              {selectedRequisition.status === "SUBMITTED" && (
                <>
                  <Button
                    size="sm"
                    onClick={() => openApproveModal(selectedRequisition)}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Aprobar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => openRejectModal(selectedRequisition)}
                  >
                    <XCircle className="h-4 w-4" />
                    Rechazar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCancel(selectedRequisition.id)}
                  >
                    <Ban className="h-4 w-4" />
                    Cancelar
                  </Button>
                </>
              )}
              {selectedRequisition.status === "APPROVED" && (
                <Button
                  size="sm"
                  onClick={() => handleFulfill(selectedRequisition.id)}
                >
                  <Truck className="h-4 w-4" />
                  Surtir
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ----------------------------------------------------------------- */}
      {/* Approve Modal                                                      */}
      {/* ----------------------------------------------------------------- */}
      <Modal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Aprobar Requisicion"
        wide
      >
        {selectedRequisition && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Revisa y ajusta las cantidades aprobadas para cada producto.
            </p>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-2">Producto</th>
                    <th className="px-4 py-2 text-right">Solicitada</th>
                    <th className="px-4 py-2 text-right">Aprobada</th>
                    <th className="px-4 py-2">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRequisition.items.map((item, index) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-4 py-2 font-medium">
                        {item.product.name}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {Number(item.requestedQuantity)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-24 text-right ml-auto"
                          value={approveItems[index]?.approvedQuantity || ""}
                          onChange={(e) => {
                            const updated = [...approveItems];
                            updated[index] = {
                              ...updated[index],
                              approvedQuantity: e.target.value,
                            };
                            setApproveItems(updated);
                          }}
                        />
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {item.unitOfMeasure}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setApproveOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleApprove} disabled={saving}>
                <CheckCircle className="h-4 w-4" />
                Confirmar Aprobacion
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ----------------------------------------------------------------- */}
      {/* Reject Modal                                                       */}
      {/* ----------------------------------------------------------------- */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Rechazar Requisicion"
      >
        {selectedRequisition && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Indica el motivo del rechazo para la requisicion de{" "}
              <span className="font-medium">
                {selectedRequisition.requestingBranch.name}
              </span>
              .
            </p>
            <FormField label="Motivo de rechazo" required>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explica por que se rechaza esta requisicion..."
              />
            </FormField>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={saving || !rejectReason.trim()}
              >
                <XCircle className="h-4 w-4" />
                Confirmar Rechazo
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
