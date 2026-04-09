"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ActiveBadge, StatusBadge } from "@/components/ui/status-badge";
import { FormField, Input, Select } from "@/components/ui/form-field";
import { MEXICAN_STATES } from "@luka/shared";

// =============== Types ===============

interface LegalEntityRef {
  id: string;
  name: string;
  rfc: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  address: string;
  postalCode: string;
  phone: string | null;
  email: string | null;
  timezone: string;
  isActive: boolean;
  corntechBranchId: string | null;
  legalEntityId: string | null;
  legalEntity: LegalEntityRef | null;
  createdAt: string;
  updatedAt: string;
}

interface LegalEntityOption {
  id: string;
  name: string;
  rfc: string;
}

interface BranchForm {
  name: string;
  code: string;
  city: string;
  state: string;
  address: string;
  postalCode: string;
  phone: string;
  email: string;
  corntechBranchId: string;
  legalEntityId: string;
}

interface BranchSyncStatus {
  branchId: string;
  branchName: string;
  branchCity: string;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  todaySalesCount: number;
  todaySalesTotal: number;
}

interface DailySummaryRow {
  branchId: string;
  paymentMethod: string;
  _sum: { total: number | null; tax: number | null; subtotal: number | null };
  _count: number;
}

interface SyncLogEntry {
  id: string;
  branchId: string;
  syncType: string;
  status: string;
  recordsTotal: number;
  recordsSynced: number;
  recordsFailed: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  branch: { name: string; city: string };
}

// =============== Constants ===============

const EMPTY_FORM: BranchForm = {
  name: "",
  code: "",
  city: "",
  state: "",
  address: "",
  postalCode: "",
  phone: "",
  email: "",
  corntechBranchId: "",
  legalEntityId: "",
};

const REQUIRED_FIELDS: (keyof BranchForm)[] = [
  "name",
  "code",
  "city",
  "state",
  "address",
  "postalCode",
];

const TABS = [
  { key: "sucursales", label: "Sucursales" },
  { key: "pos-sync", label: "POS Sync" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// =============== Helpers ===============

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(safeNum(value));
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "Nunca";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(dateStr));
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function syncStatusColor(status: string): "green" | "yellow" | "red" | "gray" {
  switch (status) {
    case "SUCCESS":
      return "green";
    case "PARTIAL":
    case "RUNNING":
      return "yellow";
    case "FAILED":
      return "red";
    default:
      return "gray";
  }
}

function syncDotColor(status: string, lastSyncAt: string | null): string {
  if (!lastSyncAt || status === "NEVER") return "bg-gray-400";
  const hoursSince =
    (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
  if (status === "FAILED") return "bg-red-500";
  if (hoursSince > 24) return "bg-yellow-500";
  return "bg-green-500";
}

// =============== Component ===============

export default function SucursalesPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("sucursales");

  // ---------- Branches state ----------
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<keyof BranchForm, string>>
  >({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---------- Legal Entities state ----------
  const [legalEntities, setLegalEntities] = useState<LegalEntityOption[]>([]);
  const [filterLegalEntity, setFilterLegalEntity] = useState<string>("all");

  // ---------- POS Sync state ----------
  const [syncStatuses, setSyncStatuses] = useState<BranchSyncStatus[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [summaryDate, setSummaryDate] = useState(todayISO());
  const [dailySummary, setDailySummary] = useState<DailySummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // --------------- Fetch branches ---------------
  const fetchBranches = useCallback(async () => {
    try {
      setLoading(true);
      const data = await authFetch<Branch[]>("get", "/branches");
      setBranches(data);
    } catch {
      // auth redirect handled by authFetch
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const fetchLegalEntities = useCallback(async () => {
    try {
      const data = await authFetch<LegalEntityOption[]>(
        "get",
        "/legal-entities",
      );
      setLegalEntities(data);
    } catch {
      // silent
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading) {
      fetchBranches();
      fetchLegalEntities();
    }
  }, [authLoading, fetchBranches, fetchLegalEntities]);

  // --------------- POS Sync data fetchers ---------------
  const fetchSyncStatus = useCallback(async () => {
    try {
      setSyncLoading(true);
      const data = await authFetch<BranchSyncStatus[]>(
        "get",
        "/corntech/sync/status",
      );
      setSyncStatuses(data);
    } catch {
      setSyncStatuses([]);
    } finally {
      setSyncLoading(false);
    }
  }, [authFetch]);

  const fetchDailySummary = useCallback(
    async (date: string) => {
      try {
        setSummaryLoading(true);
        const data = await authFetch<DailySummaryRow[]>(
          "get",
          `/corntech/sales/summary?date=${date}`,
        );
        setDailySummary(data);
      } catch {
        setDailySummary([]);
      } finally {
        setSummaryLoading(false);
      }
    },
    [authFetch],
  );

  const fetchSyncLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const data = await authFetch<SyncLogEntry[]>(
        "get",
        "/corntech/sync/logs?limit=30",
      );
      setSyncLogs(data);
    } catch {
      setSyncLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [authFetch]);

  // Load POS Sync data when tab is active
  useEffect(() => {
    if (activeTab === "pos-sync" && !authLoading) {
      fetchSyncStatus();
      fetchDailySummary(summaryDate);
      fetchSyncLogs();
    }
  }, [
    activeTab,
    authLoading,
    fetchSyncStatus,
    fetchDailySummary,
    fetchSyncLogs,
    summaryDate,
  ]);

  // --------------- Form helpers ---------------
  const openCreateModal = () => {
    setEditingBranch(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setForm({
      name: branch.name,
      code: branch.code,
      city: branch.city,
      state: branch.state,
      address: branch.address,
      postalCode: branch.postalCode,
      phone: branch.phone ?? "",
      email: branch.email ?? "",
      corntechBranchId: branch.corntechBranchId ?? "",
      legalEntityId: branch.legalEntityId ?? "",
    });
    setErrors({});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingBranch(null);
  };

  const updateField = (field: keyof BranchForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof BranchForm, string>> = {};
    for (const field of REQUIRED_FIELDS) {
      if (!form[field].trim()) {
        newErrors[field] = "Este campo es requerido";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --------------- CRUD handlers ---------------
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(form)) {
        if (key === "legalEntityId") {
          // Send null to unassign, or the ID to assign
          body[key] = value.trim() || null;
        } else {
          const trimmed = value.trim();
          if (trimmed) body[key] = trimmed;
        }
      }

      if (editingBranch) {
        await authFetch<Branch>(
          "patch",
          `/branches/${editingBranch.id}`,
          body,
        );
      } else {
        await authFetch<Branch>("post", "/branches", body);
      }
      closeModal();
      await fetchBranches();
    } catch {
      // errors handled globally
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await authFetch<void>("delete", `/branches/${deleteTarget.id}`);
      setDeleteTarget(null);
      await fetchBranches();
    } catch {
      // errors handled globally
    } finally {
      setDeleting(false);
    }
  };

  // --------------- Filtered branches ---------------
  const filteredBranches =
    filterLegalEntity === "all"
      ? branches
      : filterLegalEntity === "unassigned"
        ? branches.filter((b) => !b.legalEntityId)
        : branches.filter((b) => b.legalEntityId === filterLegalEntity);

  // --------------- Table columns ---------------
  const columns = [
    { key: "code", header: "Codigo" },
    { key: "name", header: "Nombre" },
    {
      key: "legalEntity",
      header: "Razon Social",
      render: (row: Branch) => (
        <span className={row.legalEntity ? "text-sm" : "text-sm text-muted-foreground italic"}>
          {row.legalEntity?.name ?? "Sin asignar"}
        </span>
      ),
    },
    { key: "city", header: "Ciudad" },
    {
      key: "state",
      header: "Estado",
      render: (row: Branch) =>
        (MEXICAN_STATES as Record<string, string>)[row.state] ?? row.state,
    },
    { key: "postalCode", header: "CP" },
    {
      key: "isActive",
      header: "Activa",
      className: "text-center",
      render: (row: Branch) => <ActiveBadge active={row.isActive} />,
    },
    {
      key: "actions",
      header: "Acciones",
      render: (row: Branch) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEditModal(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteTarget(row)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  // --------------- POS Sync: build summary table data ---------------
  const buildSummaryTable = () => {
    // Group daily summary by branchId
    const branchMap = new Map<
      string,
      {
        branchName: string;
        cash: number;
        card: number;
        transfer: number;
        total: number;
      }
    >();

    for (const row of dailySummary) {
      const status = syncStatuses.find((s) => s.branchId === row.branchId);
      const branchName = status?.branchName ?? row.branchId;
      if (!branchMap.has(row.branchId)) {
        branchMap.set(row.branchId, {
          branchName,
          cash: 0,
          card: 0,
          transfer: 0,
          total: 0,
        });
      }
      const entry = branchMap.get(row.branchId)!;
      const amount = Number(row._sum.total ?? 0);
      const method = (row.paymentMethod || "").toUpperCase();
      if (method === "CASH" || method === "EFECTIVO") {
        entry.cash += amount;
      } else if (method === "CARD" || method === "TARJETA") {
        entry.card += amount;
      } else if (method === "TRANSFER" || method === "TRANSFERENCIA") {
        entry.transfer += amount;
      }
      entry.total += amount;
    }

    return Array.from(branchMap.values());
  };

  const summaryRows = buildSummaryTable();
  const summaryTotals = summaryRows.reduce(
    (acc, r) => ({
      cash: acc.cash + r.cash,
      card: acc.card + r.card,
      transfer: acc.transfer + r.transfer,
      total: acc.total + r.total,
    }),
    { cash: 0, card: 0, transfer: 0, total: 0 },
  );

  // --------------- Sync Log columns ---------------
  const syncLogColumns = [
    {
      key: "startedAt",
      header: "Fecha",
      render: (row: SyncLogEntry) => formatDateTime(row.startedAt),
    },
    {
      key: "branch",
      header: "Sucursal",
      render: (row: SyncLogEntry) => row.branch?.name ?? row.branchId,
    },
    { key: "syncType", header: "Tipo" },
    {
      key: "status",
      header: "Estado",
      render: (row: SyncLogEntry) => (
        <StatusBadge
          label={row.status}
          variant={syncStatusColor(row.status)}
        />
      ),
    },
    {
      key: "records",
      header: "Registros",
      render: (row: SyncLogEntry) =>
        `${row.recordsSynced}/${row.recordsTotal}` +
        (row.recordsFailed > 0 ? ` (${row.recordsFailed} fallidos)` : ""),
    },
    {
      key: "errorMessage",
      header: "Errores",
      render: (row: SyncLogEntry) => (
        <span
          className="max-w-xs truncate block text-xs text-muted-foreground"
          title={row.errorMessage ?? ""}
        >
          {row.errorMessage ?? "-"}
        </span>
      ),
    },
  ];

  // --------------- Render ---------------
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sucursales</h1>
        {activeTab === "sucursales" && (
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Nueva Sucursal
          </Button>
        )}
        {activeTab === "pos-sync" && (
          <Button
            variant="outline"
            onClick={() => {
              fetchSyncStatus();
              fetchDailySummary(summaryDate);
              fetchSyncLogs();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        )}
      </div>

      {/* Tab Bar */}
      <div className="mt-4 flex border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-black text-black"
                : "border-transparent text-muted-foreground hover:text-black hover:border-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========== SUCURSALES TAB ========== */}
      {activeTab === "sucursales" && (
        <div className="mt-6">
          {/* Filter by Legal Entity */}
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm font-medium text-muted-foreground">
              Filtrar por Razon Social:
            </label>
            <select
              value={filterLegalEntity}
              onChange={(e) => setFilterLegalEntity(e.target.value)}
              className="border rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Todas</option>
              <option value="unassigned">Sin asignar</option>
              {legalEntities.map((le) => (
                <option key={le.id} value={le.id}>
                  {le.name} ({le.rfc})
                </option>
              ))}
            </select>
          </div>
          <DataTable columns={columns} data={filteredBranches} loading={loading} />
        </div>
      )}

      {/* ========== POS SYNC TAB ========== */}
      {activeTab === "pos-sync" && (
        <div className="mt-6 space-y-8">
          {/* --- Sync Status Cards --- */}
          <section>
            <h2 className="text-lg font-semibold mb-4">
              Estado de Sincronizacion
            </h2>
            {syncLoading ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                Cargando...
              </div>
            ) : syncStatuses.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                No hay sucursales registradas
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {syncStatuses.map((s) => (
                  <div
                    key={s.branchId}
                    className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${syncDotColor(s.lastSyncStatus, s.lastSyncAt)}`}
                        />
                        <span className="font-medium text-sm">
                          {s.branchName}
                        </span>
                      </div>
                      <StatusBadge
                        label={s.lastSyncStatus}
                        variant={syncStatusColor(s.lastSyncStatus)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {s.branchCity}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Ultima sync
                        </p>
                        <p className="font-medium">
                          {formatDateTime(s.lastSyncAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Ventas hoy
                        </p>
                        <p className="font-medium">
                          {s.todaySalesCount} ventas
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-xs">
                          Total hoy
                        </p>
                        <p className="font-semibold text-base">
                          {formatCurrency(s.todaySalesTotal)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        className="w-full text-xs"
                      >
                        Sincronizar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* --- Daily Sales Summary --- */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Resumen de Ventas</h2>
              <input
                type="date"
                value={summaryDate}
                onChange={(e) => setSummaryDate(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm"
              />
            </div>
            {summaryLoading ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                Cargando...
              </div>
            ) : summaryRows.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                No hay ventas para esta fecha
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                        Sucursal
                      </th>
                      <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                        Efectivo
                      </th>
                      <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                        Tarjeta
                      </th>
                      <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                        Transferencia
                      </th>
                      <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row) => (
                      <tr
                        key={row.branchName}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm font-medium">
                          {row.branchName}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {formatCurrency(row.cash)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {formatCurrency(row.card)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {formatCurrency(row.transfer)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">
                          {formatCurrency(row.total)}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-muted/50 font-semibold">
                      <td className="px-4 py-3 text-sm">Total</td>
                      <td className="px-4 py-3 text-sm text-right">
                        {formatCurrency(summaryTotals.cash)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {formatCurrency(summaryTotals.card)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {formatCurrency(summaryTotals.transfer)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {formatCurrency(summaryTotals.total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* --- Sync Log History --- */}
          <section>
            <h2 className="text-lg font-semibold mb-4">
              Historial de Sincronizacion
            </h2>
            <DataTable
              columns={syncLogColumns}
              data={syncLogs}
              loading={logsLoading}
              emptyMessage="No hay registros de sincronizacion"
            />
          </section>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingBranch ? "Editar Sucursal" : "Nueva Sucursal"}
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Nombre" required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Luka Centro"
            />
          </FormField>

          <FormField label="Codigo" required error={errors.code}>
            <Input
              value={form.code}
              onChange={(e) => updateField("code", e.target.value)}
              placeholder="SUC-001"
            />
          </FormField>

          <FormField label="Ciudad" required error={errors.city}>
            <Input
              value={form.city}
              onChange={(e) => updateField("city", e.target.value)}
              placeholder="Guadalajara"
            />
          </FormField>

          <FormField label="Estado" required error={errors.state}>
            <Select
              value={form.state}
              onChange={(e) => updateField("state", e.target.value)}
            >
              <option value="">Seleccionar estado...</option>
              {Object.entries(MEXICAN_STATES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="col-span-2">
            <FormField label="Direccion" required error={errors.address}>
              <Input
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="Av. Vallarta 1234, Col. Centro"
              />
            </FormField>
          </div>

          <FormField label="Codigo Postal" required error={errors.postalCode}>
            <Input
              value={form.postalCode}
              onChange={(e) => updateField("postalCode", e.target.value)}
              placeholder="44100"
            />
          </FormField>

          <FormField label="Telefono" error={errors.phone}>
            <Input
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              placeholder="33 1234 5678"
            />
          </FormField>

          <FormField label="Email" error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="sucursal@luka.mx"
            />
          </FormField>

          <FormField label="Razon Social">
            <Select
              value={form.legalEntityId}
              onChange={(e) => updateField("legalEntityId", e.target.value)}
            >
              <option value="">Sin asignar</option>
              {legalEntities.map((le) => (
                <option key={le.id} value={le.id}>
                  {le.name} ({le.rfc})
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Corntech Branch ID" error={errors.corntechBranchId}>
            <Input
              value={form.corntechBranchId}
              onChange={(e) => updateField("corntechBranchId", e.target.value)}
              placeholder="ID externo (opcional)"
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={closeModal}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? "Guardando..."
              : editingBranch
                ? "Guardar Cambios"
                : "Crear Sucursal"}
          </Button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar Sucursal"
      >
        <p className="text-sm text-muted-foreground">
          Esta seguro que desea eliminar la sucursal{" "}
          <span className="font-semibold text-foreground">
            {deleteTarget?.name}
          </span>
          ? Esta accion desactivara la sucursal.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Eliminando..." : "Eliminar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
