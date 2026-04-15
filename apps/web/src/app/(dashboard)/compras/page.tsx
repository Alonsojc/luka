"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Send,
  PackageCheck,
  ShoppingCart,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  PackagePlus,
  RefreshCw,
  Eye,
  Check,
} from "lucide-react";
import { exportToCSV } from "@/lib/export-csv";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-field";
import { formatMXN } from "@luka/shared";
import type { Supplier, Product, Branch, PurchaseOrder } from "@luka/shared";

// Local line-item shape used in the create/edit modal
interface LineItem {
  _key: string; // client-side only key
  productId: string;
  quantity: number;
  unitPrice: number;
  unitOfMeasure: string;
}

// Reorder/auto-purchase types
interface ReorderAlert {
  product: {
    id: string;
    sku: string;
    name: string;
    unitOfMeasure: string;
    costPerUnit: string | number;
  };
  branch: { id: string; name: string; branchType: string };
  currentQuantity: number;
  minimumStock: number;
  deficit: number;
  suggestedOrderQty: number;
  preferredSupplier: { id: string; name: string } | null;
  lastPrice: number | null;
}

interface SupplierGroup {
  supplier: { id: string; name: string };
  items: Array<{
    product: { id: string; sku: string; name: string; unitOfMeasure: string };
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
}

interface PreviewData {
  supplierGroups: SupplierGroup[];
  grandTotal: number;
}

interface ReorderSummary {
  totalProductsBelowMinimum: number;
  totalEstimatedValue: number;
  totalSuppliersNeeded: number;
  byBranch: Array<{ branchId: string; branchName: string; count: number }>;
  topSuppliers: Array<{ supplierId: string; supplierName: string; value: number; count: number }>;
}

interface GenerateResult {
  ordersCreated: number;
  totalItems: number;
  totalValue: number;
  orders: Array<{
    id: string;
    supplierId: string;
    supplierName: string;
    itemCount: number;
    total: number;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TABS = ["Ordenes de Compra", "Proveedores", "Reabastecimiento"] as const;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  PARTIALLY_RECEIVED: "Parcial",
  RECEIVED: "Recibida",
  CANCELLED: "Cancelada",
};

const STATUS_VARIANT: Record<string, string> = {
  DRAFT: "gray",
  SENT: "blue",
  PARTIALLY_RECEIVED: "yellow",
  RECEIVED: "green",
  CANCELLED: "red",
};

function num(v: string | number): number {
  return typeof v === "string" ? parseFloat(v) || 0 : isNaN(v) ? 0 : v;
}

let _keyCounter = 0;
function nextKey(): string {
  _keyCounter += 1;
  return `_li_${_keyCounter}`;
}

const EMPTY_SUPPLIER_FORM = {
  name: "",
  rfc: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  paymentTermsDays: 30,
  bankAccount: "",
  clabe: "",
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export default function ComprasPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Ordenes de Compra");

  // ---- Search & Pagination state ----
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);
  // Reset search when tab changes
  useEffect(() => {
    setSearchTerm("");
    setCurrentPage(1);
  }, [activeTab]);

  // Data
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Loading / error
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supplier modal
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState(EMPTY_SUPPLIER_FORM);
  const [supplierErrors, setSupplierErrors] = useState<Record<string, string>>({});

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "supplier" | "po";
    id: string;
    label: string;
  } | null>(null);

  // PO modal
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poForm, setPoForm] = useState({ supplierId: "", branchId: "", notes: "" });
  const [poItems, setPoItems] = useState<LineItem[]>([]);
  const [poErrors, setPoErrors] = useState<Record<string, string>>({});

  // Reabastecimiento state
  const [reorderAlerts, setReorderAlerts] = useState<ReorderAlert[]>([]);
  const [reorderSummary, setReorderSummary] = useState<ReorderSummary | null>(null);
  const [reorderBranchId, setReorderBranchId] = useState("");
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [reorderLoading, setReorderLoading] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch helpers
  // -----------------------------------------------------------------------

  const fetchAll = useCallback(async () => {
    if (authLoading) return;
    setLoadingData(true);
    setError(null);
    try {
      const [s, o, b, p] = await Promise.all([
        authFetch<Supplier[]>("get", "/compras/suppliers"),
        authFetch<PurchaseOrder[]>("get", "/compras/purchase-orders"),
        authFetch<Branch[]>("get", "/branches"),
        authFetch<Product[]>("get", "/inventarios/products"),
      ]);
      setSuppliers(s);
      setOrders(o);
      setBranches(b);
      setProducts(p);
    } catch (err: any) {
      setError(err?.message ?? "Error al cargar datos");
    } finally {
      setLoadingData(false);
    }
  }, [authFetch, authLoading]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // -----------------------------------------------------------------------
  // Supplier CRUD
  // -----------------------------------------------------------------------

  function openCreateSupplier() {
    setEditingSupplier(null);
    setSupplierForm(EMPTY_SUPPLIER_FORM);
    setSupplierErrors({});
    setSupplierModalOpen(true);
  }

  function openEditSupplier(s: Supplier) {
    setEditingSupplier(s);
    setSupplierForm({
      name: s.name,
      rfc: s.rfc ?? "",
      contactName: s.contactName ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address: s.address ?? "",
      paymentTermsDays: s.paymentTermsDays,
      bankAccount: s.bankAccount ?? "",
      clabe: s.clabe ?? "",
    });
    setSupplierErrors({});
    setSupplierModalOpen(true);
  }

  async function handleSaveSupplier() {
    const errors: Record<string, string> = {};
    if (!supplierForm.name.trim()) errors.name = "Nombre es requerido";
    if (Object.keys(errors).length) {
      setSupplierErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: supplierForm.name.trim(),
        rfc: supplierForm.rfc.trim() || undefined,
        contactName: supplierForm.contactName.trim() || undefined,
        email: supplierForm.email.trim() || undefined,
        phone: supplierForm.phone.trim() || undefined,
        address: supplierForm.address.trim() || undefined,
        paymentTermsDays: Number(supplierForm.paymentTermsDays) || 30,
        bankAccount: supplierForm.bankAccount.trim() || undefined,
        clabe: supplierForm.clabe.trim() || undefined,
      };

      if (editingSupplier) {
        const updated = await authFetch<Supplier>(
          "patch",
          `/compras/suppliers/${editingSupplier.id}`,
          body,
        );
        setSuppliers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      } else {
        const created = await authFetch<Supplier>("post", "/compras/suppliers", body);
        setSuppliers((prev) => [...prev, created]);
      }
      setSupplierModalOpen(false);
    } catch (err: any) {
      setSupplierErrors({ _form: err?.message ?? "Error al guardar" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSupplier(id: string) {
    setSaving(true);
    try {
      await authFetch("delete", `/compras/suppliers/${id}`);
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err?.message ?? "Error al eliminar proveedor");
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Purchase Order CRUD
  // -----------------------------------------------------------------------

  function openCreatePO() {
    setPoForm({ supplierId: "", branchId: "", notes: "" });
    setPoItems([
      { _key: nextKey(), productId: "", quantity: 1, unitPrice: 0, unitOfMeasure: "pza" },
    ]);
    setPoErrors({});
    setPoModalOpen(true);
  }

  function updateLineItem(key: string, field: keyof LineItem, value: string | number) {
    setPoItems((prev) => prev.map((li) => (li._key === key ? { ...li, [field]: value } : li)));
  }

  function removeLineItem(key: string) {
    setPoItems((prev) => prev.filter((li) => li._key !== key));
  }

  function addLineItem() {
    setPoItems((prev) => [
      ...prev,
      { _key: nextKey(), productId: "", quantity: 1, unitPrice: 0, unitOfMeasure: "pza" },
    ]);
  }

  // When product is selected, pre-fill cost & unit
  function handleProductSelect(key: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    setPoItems((prev) =>
      prev.map((li) => {
        if (li._key !== key) return li;
        return {
          ...li,
          productId,
          unitPrice: product ? num(product.costPerUnit) : 0,
          unitOfMeasure: product ? product.unitOfMeasure : li.unitOfMeasure,
        };
      }),
    );
  }

  const poSubtotal = poItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const poIva = poSubtotal * 0.16;
  const poTotal = poSubtotal + poIva;

  async function handleSavePO() {
    const errors: Record<string, string> = {};
    if (!poForm.supplierId) errors.supplierId = "Selecciona un proveedor";
    if (!poForm.branchId) errors.branchId = "Selecciona una sucursal";
    if (poItems.length === 0) errors.items = "Agrega al menos un articulo";
    poItems.forEach((li, i) => {
      if (!li.productId) errors[`item_${i}_product`] = "Producto requerido";
      if (li.quantity <= 0) errors[`item_${i}_qty`] = "Cantidad > 0";
      if (li.unitPrice <= 0) errors[`item_${i}_price`] = "Precio > 0";
    });
    if (Object.keys(errors).length) {
      setPoErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const body = {
        supplierId: poForm.supplierId,
        branchId: poForm.branchId,
        notes: poForm.notes.trim() || undefined,
        items: poItems.map((li) => ({
          productId: li.productId,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          unitOfMeasure: li.unitOfMeasure,
        })),
      };
      const created = await authFetch<PurchaseOrder>("post", "/compras/purchase-orders", body);
      setOrders((prev) => [created, ...prev]);
      setPoModalOpen(false);
    } catch (err: any) {
      setPoErrors({ _form: err?.message ?? "Error al crear orden" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendPO(id: string) {
    try {
      const updated = await authFetch<PurchaseOrder>(
        "patch",
        `/compras/purchase-orders/${id}/send`,
      );
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (err: any) {
      setError(err?.message ?? "Error al enviar orden");
    }
  }

  async function handleReceivePO(id: string) {
    const po = orders.find((o) => o.id === id);
    if (!po) return;
    try {
      const receiveItems = po.items.map((item) => ({
        itemId: item.id,
        receivedQuantity: num(item.quantity) - num(item.receivedQuantity),
      }));
      const updated = await authFetch<PurchaseOrder>(
        "patch",
        `/compras/purchase-orders/${id}/receive`,
        { items: receiveItems },
      );
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (err: any) {
      setError(err?.message ?? "Error al recibir orden");
    }
  }

  async function handleDeletePO(id: string) {
    setSaving(true);
    try {
      await authFetch("delete", `/compras/purchase-orders/${id}`);
      setOrders((prev) => prev.filter((o) => o.id !== id));
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err?.message ?? "Error al cancelar orden");
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Reabastecimiento helpers
  // -----------------------------------------------------------------------

  const fetchReorderAlerts = useCallback(
    async (branchId?: string) => {
      setReorderLoading(true);
      try {
        const query = branchId ? `?branchId=${branchId}` : "";
        const alerts = await authFetch<ReorderAlert[]>("get", `/compras/reorder-alerts${query}`);
        setReorderAlerts(alerts);
        setSelectedAlerts(new Set(alerts.map((a) => a.product.id)));
      } catch (err: any) {
        setError(err?.message ?? "Error al cargar alertas de reabastecimiento");
      } finally {
        setReorderLoading(false);
      }
    },
    [authFetch],
  );

  const fetchReorderSummary = useCallback(async () => {
    try {
      const summary = await authFetch<ReorderSummary>("get", "/compras/reorder-alerts/summary");
      setReorderSummary(summary);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    }
  }, [authFetch, toast]);

  useEffect(() => {
    if (activeTab === "Reabastecimiento" && !authLoading) {
      fetchReorderAlerts(reorderBranchId || undefined);
      fetchReorderSummary();
    }
  }, [activeTab, reorderBranchId, authLoading, fetchReorderAlerts, fetchReorderSummary]);

  function toggleAlertSelection(productId: string) {
    setSelectedAlerts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  function toggleAllAlerts() {
    if (selectedAlerts.size === reorderAlerts.length) {
      setSelectedAlerts(new Set());
    } else {
      setSelectedAlerts(new Set(reorderAlerts.map((a) => a.product.id)));
    }
  }

  async function handlePreview() {
    if (!reorderBranchId) {
      setError("Selecciona una sucursal para la vista previa");
      return;
    }
    setReorderLoading(true);
    try {
      const data = await authFetch<PreviewData>(
        "get",
        `/compras/auto-purchase/preview/${reorderBranchId}`,
      );
      setPreviewData(data);
      setShowPreview(true);
      setGenerateResult(null);
    } catch (err: any) {
      setError(err?.message ?? "Error al generar vista previa");
    } finally {
      setReorderLoading(false);
    }
  }

  async function handleGenerate() {
    if (!reorderBranchId) {
      setError("Selecciona una sucursal para generar ordenes");
      return;
    }
    setReorderLoading(true);
    try {
      const selectedProductIds = Array.from(selectedAlerts);
      const result = await authFetch<GenerateResult>(
        "post",
        `/compras/auto-purchase/generate/${reorderBranchId}`,
        {
          productIds:
            selectedProductIds.length < reorderAlerts.length ? selectedProductIds : undefined,
        },
      );
      setGenerateResult(result);
      setShowPreview(false);
      // Refresh orders list
      const updatedOrders = await authFetch<PurchaseOrder[]>("get", "/compras/purchase-orders");
      setOrders(updatedOrders);
      // Refresh alerts
      await fetchReorderAlerts(reorderBranchId);
    } catch (err: any) {
      setError(err?.message ?? "Error al generar ordenes de compra");
    } finally {
      setReorderLoading(false);
    }
  }

  // Computed reorder KPIs
  const reorderKPIs = useMemo(() => {
    const selected = reorderAlerts.filter((a) => selectedAlerts.has(a.product.id));
    const estimatedValue = selected.reduce((sum, a) => {
      const price = a.lastPrice ?? num(a.product.costPerUnit);
      return sum + a.suggestedOrderQty * price;
    }, 0);
    const supplierSet = new Set(
      selected.filter((a) => a.preferredSupplier).map((a) => a.preferredSupplier!.id),
    );
    return {
      productsBelowMin: reorderAlerts.length,
      estimatedValue,
      suppliersNeeded: supplierSet.size,
    };
  }, [reorderAlerts, selectedAlerts]);

  function getAlertRowClass(alert: ReorderAlert): string {
    if (alert.currentQuantity === 0) return "bg-red-50";
    if (alert.currentQuantity < alert.minimumStock * 0.5) return "bg-orange-50";
    return "bg-yellow-50";
  }

  // -----------------------------------------------------------------------
  // Column definitions
  // -----------------------------------------------------------------------

  const supplierColumns = [
    { key: "name", header: "Nombre" },
    { key: "rfc", header: "RFC", render: (s: Supplier) => s.rfc || "---" },
    { key: "contactName", header: "Contacto", render: (s: Supplier) => s.contactName || "---" },
    { key: "email", header: "Email", render: (s: Supplier) => s.email || "---" },
    { key: "phone", header: "Telefono", render: (s: Supplier) => s.phone || "---" },
    {
      key: "paymentTermsDays",
      header: "Dias Pago",
      render: (s: Supplier) => `${s.paymentTermsDays}d`,
      className: "text-center",
    },
    {
      key: "actions",
      header: "Acciones",
      className: "text-center",
      render: (s: Supplier) => (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => openEditSupplier(s)}
            className="p-1 hover:bg-muted rounded"
            title="Editar"
          >
            <Pencil className="h-4 w-4 text-gray-500" />
          </button>
          <button
            onClick={() => setDeleteTarget({ type: "supplier", id: s.id, label: s.name })}
            className="p-1 hover:bg-red-50 rounded"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </button>
        </div>
      ),
    },
  ];

  const orderColumns = [
    {
      key: "folio",
      header: "#",
      render: (o: PurchaseOrder) => (
        <span className="font-mono">{o.folio ?? o.id.slice(-6).toUpperCase()}</span>
      ),
    },
    {
      key: "supplier",
      header: "Proveedor",
      render: (o: PurchaseOrder) => o.supplier?.name ?? "---",
    },
    {
      key: "branch",
      header: "Sucursal",
      render: (o: PurchaseOrder) => o.branch?.name ?? "---",
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      render: (o: PurchaseOrder) => formatMXN(num(o.total)),
    },
    {
      key: "status",
      header: "Estado",
      className: "text-center",
      render: (o: PurchaseOrder) => (
        <StatusBadge
          label={STATUS_LABEL[o.status] ?? o.status}
          variant={(STATUS_VARIANT[o.status] as any) ?? "gray"}
        />
      ),
    },
    {
      key: "createdAt",
      header: "Fecha",
      render: (o: PurchaseOrder) => new Date(o.createdAt).toLocaleDateString("es-MX"),
    },
    {
      key: "actions",
      header: "Acciones",
      className: "text-center",
      render: (o: PurchaseOrder) => (
        <div className="flex items-center justify-center gap-1">
          {o.status === "DRAFT" && (
            <button
              onClick={() => handleSendPO(o.id)}
              className="p-1 hover:bg-blue-50 rounded"
              title="Enviar"
            >
              <Send className="h-4 w-4 text-blue-600" />
            </button>
          )}
          {(o.status === "SENT" || o.status === "PARTIALLY_RECEIVED") && (
            <button
              onClick={() => handleReceivePO(o.id)}
              className="p-1 hover:bg-green-50 rounded"
              title="Recibir"
            >
              <PackageCheck className="h-4 w-4 text-green-600" />
            </button>
          )}
          {o.status === "DRAFT" && (
            <button
              onClick={() =>
                setDeleteTarget({ type: "po", id: o.id, label: o.folio ?? o.id.slice(-6) })
              }
              className="p-1 hover:bg-red-50 rounded"
              title="Cancelar"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </button>
          )}
        </div>
      ),
    },
  ];

  // -----------------------------------------------------------------------
  // Search & Pagination logic
  // -----------------------------------------------------------------------

  const filteredSuppliers = useMemo(() => {
    if (!searchTerm) return suppliers;
    const q = normalize(searchTerm);
    return suppliers.filter(
      (s) =>
        normalize(s.name || "").includes(q) ||
        (s.rfc && normalize(s.rfc).includes(q)) ||
        (s.contactName && normalize(s.contactName).includes(q)) ||
        (s.email && normalize(s.email).includes(q)),
    );
  }, [suppliers, searchTerm]);

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return orders;
    const q = normalize(searchTerm);
    return orders.filter(
      (o) =>
        (o.folio && normalize(o.folio).includes(q)) ||
        normalize(o.id.slice(-6)).includes(q) ||
        normalize(o.supplier?.name || "").includes(q) ||
        normalize(o.branch?.name || "").includes(q),
    );
  }, [orders, searchTerm]);

  const currentFilteredCompras = activeTab === "Proveedores" ? filteredSuppliers : filteredOrders;
  const totalPagesCompras = Math.ceil(currentFilteredCompras.length / PAGE_SIZE);
  const paginatedSuppliers = filteredSuppliers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const paginationStartCompras =
    currentFilteredCompras.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const paginationEndCompras = Math.min(currentPage * PAGE_SIZE, currentFilteredCompras.length);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (authLoading) {
    return <div className="p-8 text-center text-gray-400">Cargando...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-gray-900">Compras y Proveedores</h1>
        </div>
        <div className="flex gap-3">
          {activeTab === "Proveedores" && (
            <button
              onClick={() =>
                exportToCSV(
                  suppliers.map((s) => ({
                    name: s.name,
                    rfc: s.rfc || "",
                    email: s.email || "",
                    phone: s.phone || "",
                    contactName: s.contactName || "",
                  })),
                  "proveedores",
                  [
                    { key: "name", label: "Nombre" },
                    { key: "rfc", label: "RFC" },
                    { key: "email", label: "Email" },
                    { key: "phone", label: "Telefono" },
                    { key: "contactName", label: "Contacto" },
                  ],
                )
              }
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>
          )}
          {activeTab === "Proveedores" ? (
            <Button onClick={openCreateSupplier}>
              <Plus className="h-4 w-4" />
              Nuevo Proveedor
            </Button>
          ) : activeTab === "Reabastecimiento" ? (
            <Button
              onClick={() => {
                fetchReorderAlerts(reorderBranchId || undefined);
                fetchReorderSummary();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          ) : (
            <Button onClick={openCreatePO}>
              <Plus className="h-4 w-4" />
              Nueva Orden
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-gray-200">
        <div className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-medium"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="mt-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeTab === "Proveedores"
                ? "Buscar por nombre, RFC o contacto..."
                : activeTab === "Reabastecimiento"
                  ? "Buscar por producto o SKU..."
                  : "Buscar por folio o proveedor..."
            }
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
          />
        </div>
      </div>

      {/* Content */}
      <div className="mt-4">
        {activeTab === "Proveedores" ? (
          <DataTable
            columns={supplierColumns}
            data={paginatedSuppliers}
            loading={loadingData}
            emptyMessage="No hay proveedores registrados"
          />
        ) : activeTab === "Reabastecimiento" ? (
          <ReabastecimientoTab
            branches={branches}
            reorderBranchId={reorderBranchId}
            setReorderBranchId={setReorderBranchId}
            reorderAlerts={reorderAlerts}
            reorderKPIs={reorderKPIs}
            reorderSummary={reorderSummary}
            reorderLoading={reorderLoading}
            selectedAlerts={selectedAlerts}
            toggleAlertSelection={toggleAlertSelection}
            toggleAllAlerts={toggleAllAlerts}
            getAlertRowClass={getAlertRowClass}
            handlePreview={handlePreview}
            handleGenerate={handleGenerate}
            showPreview={showPreview}
            setShowPreview={setShowPreview}
            previewData={previewData}
            generateResult={generateResult}
            setGenerateResult={setGenerateResult}
            searchTerm={searchTerm}
          />
        ) : (
          <DataTable
            columns={orderColumns}
            data={paginatedOrders}
            loading={loadingData}
            emptyMessage="No hay ordenes de compra"
          />
        )}

        {/* Pagination controls (not for Reabastecimiento — it has its own layout) */}
        {activeTab !== "Reabastecimiento" && currentFilteredCompras.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Mostrando {paginationStartCompras}-{paginationEndCompras} de{" "}
              {currentFilteredCompras.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPagesCompras, p + 1))}
                disabled={currentPage === totalPagesCompras}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Supplier Create/Edit Modal                                        */}
      {/* ----------------------------------------------------------------- */}
      <Modal
        open={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        title={editingSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}
      >
        <div className="space-y-4">
          {supplierErrors._form && (
            <p className="text-sm text-destructive">{supplierErrors._form}</p>
          )}

          <FormField label="Nombre" required error={supplierErrors.name}>
            <Input
              value={supplierForm.name}
              onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nombre del proveedor"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="RFC">
              <Input
                value={supplierForm.rfc}
                onChange={(e) => setSupplierForm((f) => ({ ...f, rfc: e.target.value }))}
                placeholder="XAXX010101000"
              />
            </FormField>
            <FormField label="Contacto">
              <Input
                value={supplierForm.contactName}
                onChange={(e) => setSupplierForm((f) => ({ ...f, contactName: e.target.value }))}
                placeholder="Nombre de contacto"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Email">
              <Input
                type="email"
                value={supplierForm.email}
                onChange={(e) => setSupplierForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="proveedor@email.com"
              />
            </FormField>
            <FormField label="Telefono">
              <Input
                value={supplierForm.phone}
                onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="33 1234 5678"
              />
            </FormField>
          </div>

          <FormField label="Direccion">
            <Textarea
              value={supplierForm.address}
              onChange={(e) => setSupplierForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Calle, Colonia, Ciudad, CP"
            />
          </FormField>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Dias de Pago">
              <Input
                type="number"
                value={supplierForm.paymentTermsDays}
                onChange={(e) =>
                  setSupplierForm((f) => ({
                    ...f,
                    paymentTermsDays: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </FormField>
            <FormField label="Cuenta Bancaria">
              <Input
                value={supplierForm.bankAccount}
                onChange={(e) => setSupplierForm((f) => ({ ...f, bankAccount: e.target.value }))}
              />
            </FormField>
            <FormField label="CLABE">
              <Input
                value={supplierForm.clabe}
                onChange={(e) => setSupplierForm((f) => ({ ...f, clabe: e.target.value }))}
                placeholder="18 digitos"
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setSupplierModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveSupplier} disabled={saving}>
              {saving ? "Guardando..." : editingSupplier ? "Guardar Cambios" : "Crear Proveedor"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ----------------------------------------------------------------- */}
      {/* Purchase Order Create Modal                                       */}
      {/* ----------------------------------------------------------------- */}
      <Modal
        open={poModalOpen}
        onClose={() => setPoModalOpen(false)}
        title="Nueva Orden de Compra"
        wide
      >
        <div className="space-y-5">
          {poErrors._form && <p className="text-sm text-destructive">{poErrors._form}</p>}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Proveedor" required error={poErrors.supplierId}>
              <Select
                value={poForm.supplierId}
                onChange={(e) => setPoForm((f) => ({ ...f, supplierId: e.target.value }))}
              >
                <option value="">Seleccionar proveedor...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Sucursal" required error={poErrors.branchId}>
              <Select
                value={poForm.branchId}
                onChange={(e) => setPoForm((f) => ({ ...f, branchId: e.target.value }))}
              >
                <option value="">Seleccionar sucursal...</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Notas">
            <Textarea
              value={poForm.notes}
              onChange={(e) => setPoForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notas opcionales..."
            />
          </FormField>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Articulos</h3>
              <Button size="sm" variant="outline" onClick={addLineItem}>
                <Plus className="h-3.5 w-3.5" />
                Agregar Articulo
              </Button>
            </div>

            {poErrors.items && <p className="text-xs text-destructive mb-2">{poErrors.items}</p>}

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-3 py-2 font-medium text-muted-foreground">Producto</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground w-24">Cantidad</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground w-20">Unidad</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground w-32">
                      Precio Unit.
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground w-32 text-right">
                      Subtotal
                    </th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {poItems.map((li, idx) => {
                    const lineSubtotal = li.quantity * li.unitPrice;
                    return (
                      <tr key={li._key} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <Select
                            value={li.productId}
                            onChange={(e) => handleProductSelect(li._key, e.target.value)}
                            className={poErrors[`item_${idx}_product`] ? "border-red-400" : ""}
                          >
                            <option value="">Seleccionar...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.sku} - {p.name}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={li.quantity}
                            onChange={(e) =>
                              updateLineItem(li._key, "quantity", parseFloat(e.target.value) || 0)
                            }
                            className={poErrors[`item_${idx}_qty`] ? "border-red-400" : ""}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={li.unitOfMeasure}
                            onChange={(e) =>
                              updateLineItem(li._key, "unitOfMeasure", e.target.value)
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={li.unitPrice}
                            onChange={(e) =>
                              updateLineItem(li._key, "unitPrice", parseFloat(e.target.value) || 0)
                            }
                            className={poErrors[`item_${idx}_price`] ? "border-red-400" : ""}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatMXN(lineSubtotal)}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeLineItem(li._key)}
                            className="p-1 hover:bg-red-50 rounded"
                            title="Eliminar linea"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {poItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        No hay articulos. Haz clic en &quot;Agregar Articulo&quot;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-3 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMXN(poSubtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA (16%)</span>
                  <span>{formatMXN(poIva)}</span>
                </div>
                <div className="flex justify-between font-semibold text-base border-t pt-1">
                  <span>Total</span>
                  <span>{formatMXN(poTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setPoModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePO} disabled={saving}>
              {saving ? "Guardando..." : "Crear Orden"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ----------------------------------------------------------------- */}
      {/* Delete Confirmation Modal                                         */}
      {/* ----------------------------------------------------------------- */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirmar Eliminacion"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {deleteTarget?.type === "supplier"
              ? `Estas seguro de eliminar al proveedor "${deleteTarget?.label}"? Se marcara como inactivo.`
              : `Estas seguro de cancelar la orden "${deleteTarget?.label}"?`}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === "supplier") {
                  handleDeleteSupplier(deleteTarget.id);
                } else {
                  handleDeletePO(deleteTarget.id);
                }
              }}
            >
              {saving ? "Procesando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reabastecimiento Tab Component
// ---------------------------------------------------------------------------

function ReabastecimientoTab({
  branches,
  reorderBranchId,
  setReorderBranchId,
  reorderAlerts,
  reorderKPIs,
  reorderSummary,
  reorderLoading,
  selectedAlerts,
  toggleAlertSelection,
  toggleAllAlerts,
  getAlertRowClass,
  handlePreview,
  handleGenerate,
  showPreview,
  setShowPreview,
  previewData,
  generateResult,
  setGenerateResult,
  searchTerm,
}: {
  branches: Branch[];
  reorderBranchId: string;
  setReorderBranchId: (id: string) => void;
  reorderAlerts: ReorderAlert[];
  reorderKPIs: { productsBelowMin: number; estimatedValue: number; suppliersNeeded: number };
  reorderSummary: ReorderSummary | null;
  reorderLoading: boolean;
  selectedAlerts: Set<string>;
  toggleAlertSelection: (productId: string) => void;
  toggleAllAlerts: () => void;
  getAlertRowClass: (alert: ReorderAlert) => string;
  handlePreview: () => void;
  handleGenerate: () => void;
  showPreview: boolean;
  setShowPreview: (v: boolean) => void;
  previewData: PreviewData | null;
  generateResult: GenerateResult | null;
  setGenerateResult: (v: GenerateResult | null) => void;
  searchTerm: string;
}) {
  const normalizeStr = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const q = normalizeStr(searchTerm);

  const filteredAlerts = searchTerm
    ? reorderAlerts.filter(
        (a) =>
          normalizeStr(a.product.name).includes(q) ||
          normalizeStr(a.product.sku).includes(q) ||
          (a.preferredSupplier && normalizeStr(a.preferredSupplier.name).includes(q)),
      )
    : reorderAlerts;

  return (
    <div className="space-y-6">
      {/* Branch selector + KPIs */}
      <div className="flex items-end gap-4">
        <div className="w-64">
          <label className="block text-sm font-medium mb-1">Sucursal</label>
          <Select value={reorderBranchId} onChange={(e) => setReorderBranchId(e.target.value)}>
            <option value="">CEDIS (por defecto)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">Productos bajo minimo</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-red-900">{reorderKPIs.productsBelowMin}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-700">
            <ShoppingCart className="h-5 w-5" />
            <span className="text-sm font-medium">Valor estimado de compra</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-900">
            {formatMXN(reorderKPIs.estimatedValue)}
          </p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-2 text-blue-700">
            <PackagePlus className="h-5 w-5" />
            <span className="text-sm font-medium">Proveedores necesarios</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-900">{reorderKPIs.suppliersNeeded}</p>
        </div>
      </div>

      {/* Generate result success message */}
      {generateResult && generateResult.ordersCreated > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-700">
              <Check className="h-5 w-5" />
              <span className="font-medium">
                Se crearon {generateResult.ordersCreated} ordenes de compra (
                {generateResult.totalItems} articulos) por {formatMXN(generateResult.totalValue)}
              </span>
            </div>
            <button
              onClick={() => setGenerateResult(null)}
              className="text-green-600 hover:text-green-800 text-sm font-medium"
            >
              Cerrar
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {generateResult.orders.map((o) => (
              <p key={o.id} className="text-sm text-green-700">
                {o.supplierName}: {o.itemCount} articulos - {formatMXN(o.total)} (OC:{" "}
                {o.id.slice(-6).toUpperCase()})
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Section 1: Alerts Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">Alertas de Reabastecimiento</h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePreview}
              disabled={reorderLoading || selectedAlerts.size === 0 || !reorderBranchId}
            >
              <Eye className="h-4 w-4" />
              Vista Previa
            </Button>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={reorderLoading || selectedAlerts.size === 0 || !reorderBranchId}
            >
              <PackagePlus className="h-4 w-4" />
              Generar Ordenes de Compra
            </Button>
          </div>
        </div>

        {reorderLoading ? (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            Cargando alertas...
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            {reorderAlerts.length === 0
              ? "No hay productos bajo el minimo de stock"
              : "Sin resultados para la busqueda"}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={
                        selectedAlerts.size === reorderAlerts.length && reorderAlerts.length > 0
                      }
                      onChange={toggleAllAlerts}
                      className="rounded"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Producto</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">SKU</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Sucursal</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-right">
                    Stock Actual
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-right">Minimo</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-right">
                    Deficit
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-right">
                    Cant. Sugerida
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Proveedor</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-right">
                    Precio Unit.
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-right">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((alert) => {
                  const unitPrice =
                    (alert.lastPrice ??
                      (typeof alert.product.costPerUnit === "string"
                        ? parseFloat(alert.product.costPerUnit)
                        : alert.product.costPerUnit)) ||
                    0;
                  const lineSubtotal = alert.suggestedOrderQty * unitPrice;
                  return (
                    <tr
                      key={`${alert.branch.id}-${alert.product.id}`}
                      className={`border-b last:border-0 ${getAlertRowClass(alert)}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedAlerts.has(alert.product.id)}
                          onChange={() => toggleAlertSelection(alert.product.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{alert.product.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{alert.product.sku}</td>
                      <td className="px-3 py-2">{alert.branch.name}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        <span
                          className={alert.currentQuantity === 0 ? "text-red-600 font-bold" : ""}
                        >
                          {alert.currentQuantity}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{alert.minimumStock}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-600 font-semibold">
                        {alert.deficit}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-blue-600 font-semibold">
                        {alert.suggestedOrderQty}
                      </td>
                      <td className="px-3 py-2">
                        {alert.preferredSupplier ? (
                          <span className="text-sm">{alert.preferredSupplier.name}</span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Sin proveedor</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{formatMXN(unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatMXN(lineSubtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Preview */}
      {showPreview && previewData && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Vista Previa de Ordenes</h3>
            <button
              onClick={() => setShowPreview(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cerrar vista previa
            </button>
          </div>

          {previewData.supplierGroups.map((group) => (
            <div
              key={group.supplier.id || "__no_supplier__"}
              className="border rounded-lg overflow-hidden"
            >
              <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PackagePlus className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{group.supplier.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({group.items.length} articulos)
                  </span>
                </div>
                <span className="font-semibold">{formatMXN(group.total)}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-4 py-2 font-medium text-muted-foreground">Producto</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">SKU</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground text-right">
                      Cantidad
                    </th>
                    <th className="px-4 py-2 font-medium text-muted-foreground text-right">
                      Precio Unit.
                    </th>
                    <th className="px-4 py-2 font-medium text-muted-foreground text-right">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.product.id} className="border-b last:border-0">
                      <td className="px-4 py-2">{item.product.name}</td>
                      <td className="px-4 py-2 font-mono text-xs">{item.product.sku}</td>
                      <td className="px-4 py-2 text-right">
                        {item.quantity} {item.product.unitOfMeasure}
                      </td>
                      <td className="px-4 py-2 text-right">{formatMXN(item.unitPrice)}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatMXN(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={3}></td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">Subtotal</td>
                    <td className="px-4 py-2 text-right text-sm">{formatMXN(group.subtotal)}</td>
                  </tr>
                  <tr className="bg-muted/30">
                    <td colSpan={3}></td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      IVA (16%)
                    </td>
                    <td className="px-4 py-2 text-right text-sm">{formatMXN(group.tax)}</td>
                  </tr>
                  <tr className="bg-muted/30 font-semibold">
                    <td colSpan={3}></td>
                    <td className="px-4 py-2 text-right text-sm">Total</td>
                    <td className="px-4 py-2 text-right text-sm">{formatMXN(group.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}

          {/* Grand total */}
          <div className="flex justify-end">
            <div className="w-72 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">
                  Total General ({previewData.supplierGroups.length} ordenes)
                </span>
                <span className="text-lg font-bold text-primary">
                  {formatMXN(previewData.grandTotal)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancelar
            </Button>
            <Button onClick={handleGenerate} disabled={reorderLoading}>
              <PackagePlus className="h-4 w-4" />
              {reorderLoading ? "Generando..." : "Confirmar y Generar Ordenes"}
            </Button>
          </div>
        </div>
      )}

      {/* Section 3: Summary Dashboard */}
      {reorderSummary && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-gray-900">Resumen de Reabastecimiento</h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar chart: products below minimum by branch */}
            <div className="border rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Productos bajo minimo por sucursal
              </h4>
              {reorderSummary.byBranch.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
              ) : (
                <div className="space-y-2">
                  {reorderSummary.byBranch.map((b) => {
                    const maxCount = Math.max(...reorderSummary.byBranch.map((x) => x.count));
                    const pct = maxCount > 0 ? (b.count / maxCount) * 100 : 0;
                    return (
                      <div key={b.branchId} className="flex items-center gap-3">
                        <span className="text-sm w-32 truncate text-gray-600">{b.branchName}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                          <div
                            className="bg-red-400 h-full rounded-full flex items-center justify-end pr-2"
                            style={{ width: `${Math.max(pct, 8)}%` }}
                          >
                            <span className="text-xs text-white font-medium">{b.count}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pie chart simulation: reorder value by supplier */}
            <div className="border rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Valor de reorden por proveedor
              </h4>
              {reorderSummary.topSuppliers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const totalValue = reorderSummary.topSuppliers.reduce((s, x) => s + x.value, 0);
                    const colors = [
                      "bg-blue-500",
                      "bg-emerald-500",
                      "bg-amber-500",
                      "bg-violet-500",
                      "bg-rose-500",
                      "bg-cyan-500",
                      "bg-orange-500",
                    ];
                    return (
                      <>
                        {/* Stacked bar */}
                        <div className="flex h-6 rounded-full overflow-hidden">
                          {reorderSummary.topSuppliers.map((sup, i) => {
                            const pct = totalValue > 0 ? (sup.value / totalValue) * 100 : 0;
                            return (
                              <div
                                key={sup.supplierId}
                                className={`${colors[i % colors.length]} transition-all`}
                                style={{ width: `${pct}%` }}
                                title={`${sup.supplierName}: ${formatMXN(sup.value)}`}
                              />
                            );
                          })}
                        </div>
                        {/* Legend */}
                        <div className="space-y-1.5 mt-3">
                          {reorderSummary.topSuppliers.map((sup, i) => {
                            const pct =
                              totalValue > 0 ? ((sup.value / totalValue) * 100).toFixed(1) : "0";
                            return (
                              <div
                                key={sup.supplierId}
                                className="flex items-center justify-between text-sm"
                              >
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-3 h-3 rounded-sm ${colors[i % colors.length]}`}
                                  />
                                  <span className="text-gray-600">{sup.supplierName}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-muted-foreground">{pct}%</span>
                                  <span className="font-medium">{formatMXN(sup.value)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Table: branches ranked by most shortages */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Sucursal</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                    Productos bajo minimo
                  </th>
                </tr>
              </thead>
              <tbody>
                {reorderSummary.byBranch.map((b, idx) => (
                  <tr key={b.branchId} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium">{b.branchName}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          b.count > 10
                            ? "bg-red-100 text-red-700"
                            : b.count > 5
                              ? "bg-amber-100 text-amber-700"
                              : "bg-green-100 text-green-700"
                        }`}
                      >
                        {b.count}
                      </span>
                    </td>
                  </tr>
                ))}
                {reorderSummary.byBranch.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      Todas las sucursales tienen stock adecuado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
