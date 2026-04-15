"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  Star,
  Megaphone,
  ArrowUpCircle,
  ArrowDownCircle,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { exportToCSV } from "@/lib/export-csv";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, Input, Select } from "@/components/ui/form-field";
import type { Branch } from "@luka/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  rfc: string | null;
  preferredBranchId: string | null;
  preferredBranch?: Branch | null;
  tier: "GOLD" | "SILVER" | "BRONZE" | "REGULAR";
  loyaltyPoints: number;
  totalPointsEarned: number;
  registeredAt: string;
}

interface LoyaltyTransaction {
  id: string;
  customerId: string;
  branchId: string;
  branch?: { name: string };
  type: "EARN" | "REDEEM" | "ADJUST";
  points: number;
  referenceType?: string | null;
  referenceId?: string | null;
  createdAt: string;
}

interface Promotion {
  id: string;
  name: string;
  type: "POINTS_MULTIPLIER" | "DISCOUNT" | "BONUS_POINTS";
  conditions?: Record<string, unknown> | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  applicableBranches?: string[] | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "lealtad", label: "Lealtad", icon: Star },
  { key: "promociones", label: "Promociones", icon: Megaphone },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const TIER_VARIANT: Record<string, "yellow" | "gray" | "purple" | "blue"> = {
  GOLD: "yellow",
  SILVER: "gray",
  BRONZE: "purple",
  REGULAR: "blue",
};

const TIER_LABEL: Record<string, string> = {
  GOLD: "Gold",
  SILVER: "Silver",
  BRONZE: "Bronze",
  REGULAR: "Regular",
};

const PROMO_TYPE_LABEL: Record<string, string> = {
  POINTS_MULTIPLIER: "Multiplicador de Puntos",
  DISCOUNT: "Descuento",
  BONUS_POINTS: "Puntos Bonus",
};

const EMPTY_CUSTOMER_FORM = {
  name: "",
  email: "",
  phone: "",
  rfc: "",
  preferredBranchId: "",
};

const EMPTY_PROMO_FORM = {
  name: "",
  type: "POINTS_MULTIPLIER" as Promotion["type"],
  startDate: "",
  endDate: "",
  isActive: true,
};

const EMPTY_POINTS_FORM = {
  customerId: "",
  branchId: "",
  points: "",
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("es-MX");
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function CRMPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("clientes");

  // ---- Search & Pagination state ----
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Reset page when search changes
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);
  // Reset search when tab changes
  useEffect(() => { setSearchTerm(""); setCurrentPage(1); }, [activeTab]);

  // ---- Shared (React Query) ----
  const { data: branches = [] } = useApiQuery<Branch[]>("/branches", ["branches"]);

  // ---- Customers (React Query) ----
  const { data: customers = [], isLoading: customersLoading } = useApiQuery<Customer[]>(
    "/crm/customers",
    ["crm-customers"],
    { enabled: activeTab === "clientes" || activeTab === "lealtad" },
  );
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState({ ...EMPTY_CUSTOMER_FORM });
  const [customerSaving, setCustomerSaving] = useState(false);
  const [deleteCustomerConfirm, setDeleteCustomerConfirm] = useState<Customer | null>(null);

  // ---- Loyalty (React Query) ----
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const { data: loyaltyTxns = [], isLoading: loyaltyLoading } = useApiQuery<LoyaltyTransaction[]>(
    `/crm/loyalty/customer/${selectedCustomerId}`,
    ["crm-loyalty", selectedCustomerId],
    { enabled: activeTab === "lealtad" && !!selectedCustomerId },
  );
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  const [pointsModalMode, setPointsModalMode] = useState<"earn" | "redeem">("earn");
  const [pointsForm, setPointsForm] = useState({ ...EMPTY_POINTS_FORM });
  const [pointsSaving, setPointsSaving] = useState(false);

  // ---- Promotions (React Query) ----
  const { data: promotions = [], isLoading: promotionsLoading } = useApiQuery<Promotion[]>(
    "/crm/promotions",
    ["crm-promotions"],
    { enabled: activeTab === "promociones" },
  );
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [promoForm, setPromoForm] = useState({ ...EMPTY_PROMO_FORM });
  const [promoSaving, setPromoSaving] = useState(false);
  const [deletePromoConfirm, setDeletePromoConfirm] = useState<Promotion | null>(null);

  // =======================================================================
  // Customer CRUD handlers
  // =======================================================================

  function openCreateCustomer() {
    setEditingCustomer(null);
    setCustomerForm({ ...EMPTY_CUSTOMER_FORM });
    setCustomerModalOpen(true);
  }

  function openEditCustomer(customer: Customer) {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      rfc: customer.rfc ?? "",
      preferredBranchId: customer.preferredBranchId ?? "",
    });
    setCustomerModalOpen(true);
  }

  async function handleSaveCustomer() {
    setCustomerSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: customerForm.name.trim(),
        email: customerForm.email.trim() || undefined,
        phone: customerForm.phone.trim() || undefined,
        rfc: customerForm.rfc.trim() || undefined,
        preferredBranchId: customerForm.preferredBranchId || undefined,
      };

      if (editingCustomer) {
        await authFetch<Customer>(
          "patch",
          `/crm/customers/${editingCustomer.id}`,
          payload,
        );
        toast("Cliente actualizado");
      } else {
        await authFetch<Customer>("post", "/crm/customers", payload);
        toast("Cliente creado");
      }
      setCustomerModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
    } catch (err: any) {
      toast(err?.message ?? "Error al guardar cliente", "error");
    } finally {
      setCustomerSaving(false);
    }
  }

  async function handleDeleteCustomer() {
    if (!deleteCustomerConfirm) return;
    try {
      await authFetch("delete", `/crm/customers/${deleteCustomerConfirm.id}`);
      toast("Cliente eliminado");
      setDeleteCustomerConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
    } catch (err: any) {
      toast(err?.message ?? "Error al eliminar cliente", "error");
      setDeleteCustomerConfirm(null);
    }
  }

  // =======================================================================
  // Loyalty handlers
  // =======================================================================

  function openPointsModal(mode: "earn" | "redeem") {
    setPointsModalMode(mode);
    setPointsForm({
      customerId: selectedCustomerId,
      branchId: "",
      points: "",
    });
    setPointsModalOpen(true);
  }

  async function handlePointsSubmit() {
    setPointsSaving(true);
    const endpoint =
      pointsModalMode === "earn" ? "/crm/loyalty/earn" : "/crm/loyalty/redeem";
    try {
      await authFetch("post", endpoint, {
        customerId: pointsForm.customerId,
        branchId: pointsForm.branchId,
        points: Number(pointsForm.points),
      });
      toast(
        pointsModalMode === "earn"
          ? "Puntos acreditados"
          : "Puntos canjeados",
      );
      setPointsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["crm-loyalty"] });
      queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
    } catch (err: any) {
      toast(err?.message ?? "Error al procesar puntos", "error");
    } finally {
      setPointsSaving(false);
    }
  }

  // =======================================================================
  // Promotion CRUD handlers
  // =======================================================================

  function openCreatePromo() {
    setEditingPromo(null);
    setPromoForm({ ...EMPTY_PROMO_FORM });
    setPromoModalOpen(true);
  }

  function openEditPromo(promo: Promotion) {
    setEditingPromo(promo);
    setPromoForm({
      name: promo.name,
      type: promo.type,
      startDate: promo.startDate ? promo.startDate.slice(0, 10) : "",
      endDate: promo.endDate ? promo.endDate.slice(0, 10) : "",
      isActive: promo.isActive,
    });
    setPromoModalOpen(true);
  }

  async function handleSavePromo() {
    setPromoSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: promoForm.name.trim(),
        type: promoForm.type,
        startDate: promoForm.startDate,
        endDate: promoForm.endDate,
        isActive: promoForm.isActive,
      };

      if (editingPromo) {
        await authFetch<Promotion>(
          "patch",
          `/crm/promotions/${editingPromo.id}`,
          payload,
        );
        toast("Promocion actualizada");
      } else {
        await authFetch<Promotion>("post", "/crm/promotions", payload);
        toast("Promocion creada");
      }
      setPromoModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["crm-promotions"] });
    } catch (err: any) {
      toast(err?.message ?? "Error al guardar promocion", "error");
    } finally {
      setPromoSaving(false);
    }
  }

  async function handleDeletePromo() {
    if (!deletePromoConfirm) return;
    try {
      await authFetch("delete", `/crm/promotions/${deletePromoConfirm.id}`);
      toast("Promocion eliminada");
      setDeletePromoConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["crm-promotions"] });
    } catch (err: any) {
      toast(err?.message ?? "Error al eliminar promocion", "error");
      setDeletePromoConfirm(null);
    }
  }

  // =======================================================================
  // Search & Pagination logic
  // =======================================================================

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const q = normalize(searchTerm);
    return customers.filter(
      (c) =>
        normalize(c.name || '').includes(q) ||
        (c.email && normalize(c.email).includes(q)) ||
        (c.phone && normalize(c.phone).includes(q)) ||
        (c.rfc && normalize(c.rfc).includes(q)),
    );
  }, [customers, searchTerm]);

  const totalPagesCRM = Math.ceil(filteredCustomers.length / PAGE_SIZE);
  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const paginationStartCRM = filteredCustomers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const paginationEndCRM = Math.min(currentPage * PAGE_SIZE, filteredCustomers.length);

  // =======================================================================
  // Summary cards data
  // =======================================================================

  const totalCustomers = customers.length;
  const goldCustomers = customers.filter((c) => c.tier === "GOLD").length;
  const activePromotions = promotions.filter((p) => p.isActive).length;
  const totalPointsCirculating = customers.reduce(
    (sum, c) => sum + (c.loyaltyPoints ?? 0),
    0,
  );

  // =======================================================================
  // Column definitions
  // =======================================================================

  const customerColumns = [
    {
      key: "name",
      header: "Nombre",
      render: (r: Customer) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "email",
      header: "Email",
      render: (r: Customer) => r.email || "---",
    },
    {
      key: "phone",
      header: "Telefono",
      render: (r: Customer) => r.phone || "---",
    },
    {
      key: "rfc",
      header: "RFC",
      render: (r: Customer) => r.rfc || "---",
    },
    {
      key: "loyaltyPoints",
      header: "Puntos",
      className: "text-right",
      render: (r: Customer) => (r.loyaltyPoints ?? 0).toLocaleString("es-MX"),
    },
    {
      key: "tier",
      header: "Tier",
      className: "text-center",
      render: (r: Customer) => (
        <StatusBadge
          label={TIER_LABEL[r.tier] ?? r.tier}
          variant={TIER_VARIANT[r.tier] ?? "blue"}
        />
      ),
    },
    {
      key: "registeredAt",
      header: "Registro",
      render: (r: Customer) => fmtDate(r.registeredAt),
    },
    {
      key: "actions",
      header: "Acciones",
      className: "text-center",
      render: (r: Customer) => (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEditCustomer(r);
            }}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteCustomerConfirm(r);
            }}
            className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-red-50 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const loyaltyColumns = [
    {
      key: "type",
      header: "Tipo",
      render: (r: LoyaltyTransaction) => {
        const variant =
          r.type === "EARN" ? "green" : r.type === "REDEEM" ? "red" : "blue";
        const label =
          r.type === "EARN"
            ? "Acumulado"
            : r.type === "REDEEM"
              ? "Canjeado"
              : "Ajuste";
        return <StatusBadge label={label} variant={variant as any} />;
      },
    },
    {
      key: "points",
      header: "Puntos",
      className: "text-right",
      render: (r: LoyaltyTransaction) => {
        const sign = r.type === "REDEEM" ? "-" : "+";
        const color =
          r.type === "REDEEM" ? "text-red-600" : "text-green-600";
        return (
          <span className={`font-medium ${color}`}>
            {sign}
            {Math.abs(r.points).toLocaleString("es-MX")}
          </span>
        );
      },
    },
    {
      key: "branch",
      header: "Sucursal",
      render: (r: LoyaltyTransaction) => r.branch?.name ?? "---",
    },
    {
      key: "referenceType",
      header: "Referencia",
      render: (r: LoyaltyTransaction) => r.referenceType || "---",
    },
    {
      key: "createdAt",
      header: "Fecha",
      render: (r: LoyaltyTransaction) => fmtDate(r.createdAt),
    },
  ];

  const promoColumns = [
    {
      key: "name",
      header: "Nombre",
      render: (r: Promotion) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "type",
      header: "Tipo",
      render: (r: Promotion) => PROMO_TYPE_LABEL[r.type] ?? r.type,
    },
    {
      key: "startDate",
      header: "Inicio",
      render: (r: Promotion) => fmtDate(r.startDate),
    },
    {
      key: "endDate",
      header: "Fin",
      render: (r: Promotion) => fmtDate(r.endDate),
    },
    {
      key: "isActive",
      header: "Estado",
      className: "text-center",
      render: (r: Promotion) => (
        <StatusBadge
          label={r.isActive ? "Activa" : "Inactiva"}
          variant={r.isActive ? "green" : "red"}
        />
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      className: "text-center",
      render: (r: Promotion) => (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEditPromo(r);
            }}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeletePromoConfirm(r);
            }}
            className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-red-50 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
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

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">CRM y Lealtad</h1>
        <div className="flex gap-3">
          {activeTab === "clientes" && (
            <>
              <button
                onClick={() => exportToCSV(
                  customers.map(c => ({
                    name: c.name,
                    email: c.email || "",
                    phone: c.phone || "",
                    tier: c.tier,
                    loyaltyPoints: c.loyaltyPoints ?? 0,
                    registeredAt: new Date(c.registeredAt).toLocaleDateString("es-MX"),
                  })),
                  "clientes",
                  [
                    { key: "name", label: "Nombre" },
                    { key: "email", label: "Email" },
                    { key: "phone", label: "Telefono" },
                    { key: "tier", label: "Tier" },
                    { key: "loyaltyPoints", label: "Puntos" },
                    { key: "registeredAt", label: "Registro" },
                  ]
                )}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                Exportar
              </button>
              <Button onClick={openCreateCustomer}>
                <Plus className="h-4 w-4" />
                Nuevo Cliente
              </Button>
            </>
          )}
          {activeTab === "promociones" && (
            <Button onClick={openCreatePromo}>
              <Plus className="h-4 w-4" />
              Nueva Promocion
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-muted-foreground">Total Clientes</p>
          <p className="mt-1 text-2xl font-bold">
            {totalCustomers.toLocaleString("es-MX")}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-muted-foreground">Clientes Gold</p>
          <p className="mt-1 text-2xl font-bold">
            {goldCustomers.toLocaleString("es-MX")}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-muted-foreground">Promociones Activas</p>
          <p className="mt-1 text-2xl font-bold">
            {activePromotions.toLocaleString("es-MX")}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-muted-foreground">Puntos en Circulacion</p>
          <p className="mt-1 text-2xl font-bold">
            {totalPointsCirculating.toLocaleString("es-MX")}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-border">
        <div className="flex gap-6">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
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

      {/* Search bar (Clientes tab) */}
      {activeTab === "clientes" && (
        <div className="mt-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, email o telefono..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="mt-4">
        {/* ============================================================ */}
        {/* CLIENTES TAB                                                 */}
        {/* ============================================================ */}
        {activeTab === "clientes" && (
          <>
            <DataTable
              columns={customerColumns}
              data={paginatedCustomers}
              loading={customersLoading}
              emptyMessage="No hay clientes registrados"
            />

            {/* Pagination controls */}
            {filteredCustomers.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Mostrando {paginationStartCRM}-{paginationEndCRM} de {filteredCustomers.length}
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
                    onClick={() => setCurrentPage((p) => Math.min(totalPagesCRM, p + 1))}
                    disabled={currentPage === totalPagesCRM}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* LEALTAD TAB                                                  */}
        {/* ============================================================ */}
        {activeTab === "lealtad" && (
          <div className="space-y-4">
            <div className="flex items-end gap-4">
              <div className="max-w-sm flex-1">
                <FormField label="Cliente">
                  <Select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    <option value="">Seleccionar cliente...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.email ? `(${c.email})` : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>

              {selectedCustomerId && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => openPointsModal("earn")}>
                    <ArrowUpCircle className="h-4 w-4" />
                    Acumular Puntos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openPointsModal("redeem")}
                  >
                    <ArrowDownCircle className="h-4 w-4" />
                    Canjear Puntos
                  </Button>
                </div>
              )}
            </div>

            {selectedCustomer && (
              <div className="flex items-center gap-6 rounded-lg border bg-white p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-medium">{selectedCustomer.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tier</p>
                  <StatusBadge
                    label={TIER_LABEL[selectedCustomer.tier] ?? selectedCustomer.tier}
                    variant={TIER_VARIANT[selectedCustomer.tier] ?? "blue"}
                  />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Puntos Disponibles</p>
                  <p className="text-lg font-bold">
                    {(selectedCustomer.loyaltyPoints ?? 0).toLocaleString("es-MX")}
                  </p>
                </div>
              </div>
            )}

            {selectedCustomerId ? (
              <DataTable
                columns={loyaltyColumns}
                data={loyaltyTxns}
                loading={loyaltyLoading}
                emptyMessage="No hay transacciones de lealtad"
              />
            ) : (
              <div className="rounded-lg border p-8 text-center text-muted-foreground">
                Selecciona un cliente para ver su historial de lealtad
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* PROMOCIONES TAB                                              */}
        {/* ============================================================ */}
        {activeTab === "promociones" && (
          <DataTable
            columns={promoColumns}
            data={promotions}
            loading={promotionsLoading}
            emptyMessage="No hay promociones registradas"
          />
        )}
      </div>

      {/* ================================================================ */}
      {/* Customer Create / Edit Modal                                     */}
      {/* ================================================================ */}
      <Modal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        title={editingCustomer ? "Editar Cliente" : "Nuevo Cliente"}
      >
        <div className="space-y-4">
          <FormField label="Nombre" required>
            <Input
              value={customerForm.name}
              onChange={(e) =>
                setCustomerForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Nombre completo"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Email">
              <Input
                type="email"
                value={customerForm.email}
                onChange={(e) =>
                  setCustomerForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="correo@email.com"
              />
            </FormField>
            <FormField label="Telefono">
              <Input
                value={customerForm.phone}
                onChange={(e) =>
                  setCustomerForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="33 1234 5678"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="RFC">
              <Input
                value={customerForm.rfc}
                onChange={(e) =>
                  setCustomerForm((f) => ({ ...f, rfc: e.target.value }))
                }
                placeholder="XAXX010101000"
              />
            </FormField>
            <FormField label="Sucursal Preferida">
              <Select
                value={customerForm.preferredBranchId}
                onChange={(e) =>
                  setCustomerForm((f) => ({
                    ...f,
                    preferredBranchId: e.target.value,
                  }))
                }
              >
                <option value="">Sin preferencia</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setCustomerModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCustomer}
              disabled={customerSaving || !customerForm.name.trim()}
            >
              {customerSaving
                ? "Guardando..."
                : editingCustomer
                  ? "Actualizar"
                  : "Crear"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================ */}
      {/* Customer Delete Confirmation Modal                               */}
      {/* ================================================================ */}
      <Modal
        open={!!deleteCustomerConfirm}
        onClose={() => setDeleteCustomerConfirm(null)}
        title="Confirmar Eliminacion"
      >
        <p className="text-sm text-muted-foreground mb-6">
          Estas seguro de que deseas eliminar al cliente{" "}
          <strong className="text-foreground">
            {deleteCustomerConfirm?.name}
          </strong>
          ? Esta accion no se puede deshacer.
        </p>
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setDeleteCustomerConfirm(null)}
          >
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDeleteCustomer}>
            Eliminar
          </Button>
        </div>
      </Modal>

      {/* ================================================================ */}
      {/* Points Earn / Redeem Modal                                       */}
      {/* ================================================================ */}
      <Modal
        open={pointsModalOpen}
        onClose={() => setPointsModalOpen(false)}
        title={
          pointsModalMode === "earn" ? "Acumular Puntos" : "Canjear Puntos"
        }
      >
        <div className="space-y-4">
          <FormField label="Sucursal" required>
            <Select
              value={pointsForm.branchId}
              onChange={(e) =>
                setPointsForm((f) => ({ ...f, branchId: e.target.value }))
              }
            >
              <option value="">Seleccionar sucursal...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Puntos" required>
            <Input
              type="number"
              min="1"
              value={pointsForm.points}
              onChange={(e) =>
                setPointsForm((f) => ({ ...f, points: e.target.value }))
              }
              placeholder="Cantidad de puntos"
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setPointsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePointsSubmit}
              disabled={
                pointsSaving ||
                !pointsForm.branchId ||
                !pointsForm.points ||
                Number(pointsForm.points) <= 0
              }
            >
              {pointsSaving
                ? "Procesando..."
                : pointsModalMode === "earn"
                  ? "Acumular"
                  : "Canjear"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================ */}
      {/* Promotion Create / Edit Modal                                    */}
      {/* ================================================================ */}
      <Modal
        open={promoModalOpen}
        onClose={() => setPromoModalOpen(false)}
        title={editingPromo ? "Editar Promocion" : "Nueva Promocion"}
      >
        <div className="space-y-4">
          <FormField label="Nombre" required>
            <Input
              value={promoForm.name}
              onChange={(e) =>
                setPromoForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Nombre de la promocion"
            />
          </FormField>

          <FormField label="Tipo" required>
            <Select
              value={promoForm.type}
              onChange={(e) =>
                setPromoForm((f) => ({
                  ...f,
                  type: e.target.value as Promotion["type"],
                }))
              }
            >
              <option value="POINTS_MULTIPLIER">
                Multiplicador de Puntos
              </option>
              <option value="DISCOUNT">Descuento</option>
              <option value="BONUS_POINTS">Puntos Bonus</option>
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Fecha Inicio" required>
              <Input
                type="date"
                value={promoForm.startDate}
                onChange={(e) =>
                  setPromoForm((f) => ({ ...f, startDate: e.target.value }))
                }
              />
            </FormField>
            <FormField label="Fecha Fin" required>
              <Input
                type="date"
                value={promoForm.endDate}
                onChange={(e) =>
                  setPromoForm((f) => ({ ...f, endDate: e.target.value }))
                }
              />
            </FormField>
          </div>

          {editingPromo && (
            <FormField label="Estado">
              <Select
                value={promoForm.isActive ? "true" : "false"}
                onChange={(e) =>
                  setPromoForm((f) => ({
                    ...f,
                    isActive: e.target.value === "true",
                  }))
                }
              >
                <option value="true">Activa</option>
                <option value="false">Inactiva</option>
              </Select>
            </FormField>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setPromoModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSavePromo}
              disabled={
                promoSaving ||
                !promoForm.name.trim() ||
                !promoForm.startDate ||
                !promoForm.endDate
              }
            >
              {promoSaving
                ? "Guardando..."
                : editingPromo
                  ? "Actualizar"
                  : "Crear"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================ */}
      {/* Promotion Delete Confirmation Modal                              */}
      {/* ================================================================ */}
      <Modal
        open={!!deletePromoConfirm}
        onClose={() => setDeletePromoConfirm(null)}
        title="Confirmar Eliminacion"
      >
        <p className="text-sm text-muted-foreground mb-6">
          Estas seguro de que deseas eliminar la promocion{" "}
          <strong className="text-foreground">
            {deletePromoConfirm?.name}
          </strong>
          ? Esta accion no se puede deshacer.
        </p>
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setDeletePromoConfirm(null)}
          >
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDeletePromo}>
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
