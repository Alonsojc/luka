"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  X as XIcon,
  Store,
  Warehouse,
  Package,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ActiveBadge, StatusBadge } from "@/components/ui/status-badge";
import { FormField, Input, Select } from "@/components/ui/form-field";

// =============== Types ===============

interface LegalEntity {
  id: string;
  name: string;
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  address: string | null;
  postalCode: string | null;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  branches?: Branch[];
  _count?: { branches: number };
}

interface Branch {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  branchType: string;
  isActive: boolean;
  legalEntityId: string | null;
  legalEntity?: { id: string; name: string; rfc: string } | null;
}

interface LegalEntityForm {
  name: string;
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  address: string;
  postalCode: string;
}

// =============== Constants ===============

const EMPTY_FORM: LegalEntityForm = {
  name: "",
  rfc: "",
  razonSocial: "",
  regimenFiscal: "",
  address: "",
  postalCode: "",
};

const REQUIRED_FIELDS: (keyof LegalEntityForm)[] = [
  "name",
  "rfc",
  "razonSocial",
  "regimenFiscal",
];

const REGIMEN_FISCAL_OPTIONS = [
  { value: "601", label: "601 - General de Ley Personas Morales" },
  { value: "603", label: "603 - Personas Morales con Fines no Lucrativos" },
  { value: "605", label: "605 - Sueldos y Salarios e Ingresos Asimilados" },
  { value: "606", label: "606 - Arrendamiento" },
  { value: "607", label: "607 - Regimen de Enajenacion o Adquisicion de Bienes" },
  { value: "608", label: "608 - Demas Ingresos" },
  { value: "610", label: "610 - Residentes en el Extranjero sin EP" },
  { value: "611", label: "611 - Ingresos por Dividendos" },
  { value: "612", label: "612 - Personas Fisicas con Actividades Empresariales" },
  { value: "614", label: "614 - Ingresos por Intereses" },
  { value: "616", label: "616 - Sin Obligaciones Fiscales" },
  { value: "620", label: "620 - Sociedades Cooperativas de Produccion" },
  { value: "621", label: "621 - Incorporacion Fiscal" },
  { value: "622", label: "622 - Actividades Agricolas, Ganaderas, Silvicolas y Pesqueras" },
  { value: "623", label: "623 - Opcional para Grupos de Sociedades" },
  { value: "624", label: "624 - Coordinados" },
  { value: "625", label: "625 - Regimen de las Actividades Empresariales con Ingresos a traves de Plataformas" },
  { value: "626", label: "626 - Regimen Simplificado de Confianza" },
];

const TABS = [
  { key: "razones-sociales", label: "Razones Sociales" },
  { key: "vista-org", label: "Vista Organizacional" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// =============== Helpers ===============

function branchTypeBadge(type: string) {
  switch (type) {
    case "CEDIS":
      return <StatusBadge label="CEDIS" variant="blue" />;
    case "ALMACEN":
      return <StatusBadge label="ALMACEN" variant="purple" />;
    default:
      return <StatusBadge label="TIENDA" variant="gray" />;
  }
}

function branchTypeIcon(type: string) {
  switch (type) {
    case "CEDIS":
      return <Warehouse className="h-4 w-4 text-blue-600" />;
    case "ALMACEN":
      return <Package className="h-4 w-4 text-purple-600" />;
    default:
      return <Store className="h-4 w-4 text-gray-500" />;
  }
}

// =============== Component ===============

export default function RazonesSocialesPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("razones-sociales");

  // ---------- Legal Entities state ----------
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<LegalEntity | null>(
    null,
  );

  // ---------- Form state ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<LegalEntity | null>(null);
  const [form, setForm] = useState<LegalEntityForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<keyof LegalEntityForm, string>>
  >({});
  const [saving, setSaving] = useState(false);

  // ---------- Delete state ----------
  const [deleteTarget, setDeleteTarget] = useState<LegalEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---------- Assign branch state ----------
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string>("");

  // --------------- Fetch data ---------------
  const fetchEntities = useCallback(async () => {
    try {
      setLoading(true);
      const data = await authFetch<LegalEntity[]>("get", "/legal-entities");
      setEntities(data);
    } catch {
      // auth redirect handled
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const fetchBranches = useCallback(async () => {
    try {
      const data = await authFetch<Branch[]>("get", "/branches");
      setBranches(data);
    } catch {
      // silent
    }
  }, [authFetch]);

  const fetchEntityDetail = useCallback(
    async (id: string) => {
      try {
        const data = await authFetch<LegalEntity>(
          "get",
          `/legal-entities/${id}`,
        );
        setSelectedEntity(data);
      } catch {
        // silent
      }
    },
    [authFetch],
  );

  useEffect(() => {
    if (!authLoading) {
      fetchEntities();
      fetchBranches();
    }
  }, [authLoading, fetchEntities, fetchBranches]);

  // --------------- Form helpers ---------------
  const openCreateModal = () => {
    setEditingEntity(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const openEditModal = (entity: LegalEntity) => {
    setEditingEntity(entity);
    setForm({
      name: entity.name,
      rfc: entity.rfc,
      razonSocial: entity.razonSocial,
      regimenFiscal: entity.regimenFiscal,
      address: entity.address ?? "",
      postalCode: entity.postalCode ?? "",
    });
    setErrors({});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEntity(null);
  };

  const updateField = (field: keyof LegalEntityForm, value: string) => {
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
    const newErrors: Partial<Record<keyof LegalEntityForm, string>> = {};
    for (const field of REQUIRED_FIELDS) {
      if (!form[field].trim()) {
        newErrors[field] = "Este campo es requerido";
      }
    }
    // RFC format validation
    if (form.rfc && !/^[A-Z&]{3,4}\d{6}[A-Z0-9]{3}$/.test(form.rfc)) {
      newErrors.rfc = "Formato de RFC invalido";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --------------- CRUD handlers ---------------
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      for (const [key, value] of Object.entries(form)) {
        const trimmed = value.trim();
        if (trimmed) body[key] = trimmed;
      }

      if (editingEntity) {
        await authFetch<LegalEntity>(
          "patch",
          `/legal-entities/${editingEntity.id}`,
          body,
        );
      } else {
        await authFetch<LegalEntity>("post", "/legal-entities", body);
      }
      closeModal();
      await fetchEntities();
      if (selectedEntity) {
        await fetchEntityDetail(selectedEntity.id);
      }
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
      await authFetch<void>("delete", `/legal-entities/${deleteTarget.id}`);
      setDeleteTarget(null);
      if (selectedEntity?.id === deleteTarget.id) {
        setSelectedEntity(null);
      }
      await fetchEntities();
    } catch {
      // errors handled globally
    } finally {
      setDeleting(false);
    }
  };

  const handleAssignBranch = async () => {
    if (!selectedEntity || !assignTarget) return;
    try {
      await authFetch<Branch>(
        "post",
        `/legal-entities/${selectedEntity.id}/branches/${assignTarget}`,
      );
      setAssignModalOpen(false);
      setAssignTarget("");
      await fetchEntityDetail(selectedEntity.id);
      await fetchBranches();
      await fetchEntities();
    } catch {
      // errors handled globally
    }
  };

  const handleUnassignBranch = async (branchId: string) => {
    if (!selectedEntity) return;
    try {
      await authFetch<Branch>(
        "delete",
        `/legal-entities/${selectedEntity.id}/branches/${branchId}`,
      );
      await fetchEntityDetail(selectedEntity.id);
      await fetchBranches();
      await fetchEntities();
    } catch {
      // errors handled globally
    }
  };

  // --------------- Computed ---------------
  const unassignedBranches = branches.filter((b) => !b.legalEntityId);

  const regimenLabel = (code: string) => {
    const option = REGIMEN_FISCAL_OPTIONS.find((o) => o.value === code);
    return option ? option.label : code;
  };

  // --------------- Table columns ---------------
  const columns = [
    {
      key: "name",
      header: "Nombre",
      render: (row: LegalEntity) => (
        <span className="font-medium">{row.name}</span>
      ),
    },
    { key: "rfc", header: "RFC" },
    {
      key: "regimenFiscal",
      header: "Regimen Fiscal",
      render: (row: LegalEntity) => (
        <span className="text-xs">{regimenLabel(row.regimenFiscal)}</span>
      ),
    },
    {
      key: "branches",
      header: "Sucursales",
      className: "text-center",
      render: (row: LegalEntity) => (
        <span className="inline-flex items-center justify-center bg-gray-100 rounded-full h-6 w-6 text-xs font-medium">
          {row._count?.branches ?? 0}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Estado",
      className: "text-center",
      render: (row: LegalEntity) => <ActiveBadge active={row.isActive} />,
    },
    {
      key: "actions",
      header: "Acciones",
      render: (row: LegalEntity) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openEditModal(row);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  // ========== DETAIL VIEW ==========
  if (selectedEntity) {
    return (
      <div>
        <button
          onClick={() => setSelectedEntity(null)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Razones Sociales
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {selectedEntity.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              RFC: {selectedEntity.rfc} | {selectedEntity.razonSocial}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openEditModal(selectedEntity)}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          </div>
        </div>

        {/* Entity Info Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Razon Social</p>
            <p className="text-sm font-medium">{selectedEntity.razonSocial}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">
              Regimen Fiscal
            </p>
            <p className="text-sm font-medium">
              {regimenLabel(selectedEntity.regimenFiscal)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Direccion</p>
            <p className="text-sm font-medium">
              {selectedEntity.address || "Sin direccion"}
              {selectedEntity.postalCode
                ? `, CP ${selectedEntity.postalCode}`
                : ""}
            </p>
          </div>
        </div>

        {/* CSD Certificate Section */}
        <div className="border rounded-lg p-4 mb-8">
          <h3 className="text-sm font-semibold mb-2">
            Certificado de Sello Digital (CSD)
          </h3>
          <p className="text-xs text-muted-foreground">
            Los certificados CSD se utilizan para firmar CFDIs. Sube el
            certificado (.cer), la llave (.key) y la contrasena para habilitar
            la facturacion electronica con esta razon social.
          </p>
          <div className="mt-3 flex gap-3">
            <div className="flex-1 border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
              Certificado (.cer) - Proximamente
            </div>
            <div className="flex-1 border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
              Llave (.key) - Proximamente
            </div>
          </div>
        </div>

        {/* Assigned Branches */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Sucursales Asignadas</h2>
          <Button
            size="sm"
            onClick={() => {
              setAssignTarget("");
              setAssignModalOpen(true);
            }}
            disabled={unassignedBranches.length === 0}
          >
            <Plus className="h-4 w-4" />
            Asignar Sucursal
          </Button>
        </div>

        {selectedEntity.branches && selectedEntity.branches.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                    Sucursal
                  </th>
                  <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                    Codigo
                  </th>
                  <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                    Ciudad
                  </th>
                  <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                    Tipo
                  </th>
                  <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedEntity.branches.map((branch) => (
                  <tr
                    key={branch.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium">
                      {branch.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {branch.code}
                    </td>
                    <td className="px-4 py-3 text-sm">{branch.city}</td>
                    <td className="px-4 py-3">{branchTypeBadge(branch.branchType)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnassignBranch(branch.id)}
                      >
                        <XIcon className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            No hay sucursales asignadas a esta razon social
          </div>
        )}

        {/* Assign Branch Modal */}
        <Modal
          open={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          title="Asignar Sucursal"
        >
          <p className="text-sm text-muted-foreground mb-4">
            Selecciona una sucursal sin asignar para vincularla a{" "}
            <span className="font-medium text-foreground">
              {selectedEntity.name}
            </span>
            .
          </p>
          {unassignedBranches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todas las sucursales ya estan asignadas.
            </p>
          ) : (
            <FormField label="Sucursal">
              <Select
                value={assignTarget}
                onChange={(e) => setAssignTarget(e.target.value)}
              >
                <option value="">Seleccionar sucursal...</option>
                {unassignedBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code}) - {b.city} [{b.branchType}]
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setAssignModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleAssignBranch} disabled={!assignTarget}>
              Asignar
            </Button>
          </div>
        </Modal>

        {/* Edit Modal (reused) */}
        <Modal
          open={modalOpen}
          onClose={closeModal}
          title={editingEntity ? "Editar Razon Social" : "Nueva Razon Social"}
          wide
        >
          {renderForm()}
        </Modal>
      </div>
    );
  }

  // ========== MAIN VIEW ==========
  function renderForm() {
    return (
      <>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Nombre" required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Food Now, S.A. de C.V."
            />
          </FormField>

          <FormField label="RFC" required error={errors.rfc}>
            <Input
              value={form.rfc}
              onChange={(e) =>
                updateField("rfc", e.target.value.toUpperCase())
              }
              placeholder="FNO150101ABC"
              maxLength={13}
            />
          </FormField>

          <div className="col-span-2">
            <FormField label="Razon Social" required error={errors.razonSocial}>
              <Input
                value={form.razonSocial}
                onChange={(e) => updateField("razonSocial", e.target.value)}
                placeholder="Food Now, S.A. de C.V."
              />
            </FormField>
          </div>

          <FormField
            label="Regimen Fiscal"
            required
            error={errors.regimenFiscal}
          >
            <Select
              value={form.regimenFiscal}
              onChange={(e) => updateField("regimenFiscal", e.target.value)}
            >
              <option value="">Seleccionar regimen...</option>
              {REGIMEN_FISCAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Codigo Postal" error={errors.postalCode}>
            <Input
              value={form.postalCode}
              onChange={(e) => updateField("postalCode", e.target.value)}
              placeholder="11560"
              maxLength={5}
            />
          </FormField>

          <div className="col-span-2">
            <FormField label="Direccion" error={errors.address}>
              <Input
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="Av. Presidente Masaryk 123, Col. Polanco"
              />
            </FormField>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={closeModal}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? "Guardando..."
              : editingEntity
                ? "Guardar Cambios"
                : "Crear Razon Social"}
          </Button>
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Razones Sociales</h1>
        {activeTab === "razones-sociales" && (
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Nueva Razon Social
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

      {/* ========== RAZONES SOCIALES TAB ========== */}
      {activeTab === "razones-sociales" && (
        <div className="mt-6">
          <DataTable
            columns={columns}
            data={entities}
            loading={loading}
            emptyMessage="No hay razones sociales registradas"
            onRowClick={(entity) => fetchEntityDetail(entity.id)}
          />
        </div>
      )}

      {/* ========== VISTA ORGANIZACIONAL TAB ========== */}
      {activeTab === "vista-org" && (
        <OrgTreeView
          entities={entities}
          branches={branches}
          onAssign={async (branchId: string, entityId: string) => {
            try {
              await authFetch<Branch>(
                "post",
                `/legal-entities/${entityId}/branches/${branchId}`,
              );
              await fetchEntities();
              await fetchBranches();
            } catch {
              // silent
            }
          }}
          onUnassign={async (branchId: string, entityId: string) => {
            try {
              await authFetch<Branch>(
                "delete",
                `/legal-entities/${entityId}/branches/${branchId}`,
              );
              await fetchEntities();
              await fetchBranches();
            } catch {
              // silent
            }
          }}
        />
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingEntity ? "Editar Razon Social" : "Nueva Razon Social"}
        wide
      >
        {renderForm()}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Desactivar Razon Social"
      >
        <p className="text-sm text-muted-foreground">
          Esta seguro que desea desactivar la razon social{" "}
          <span className="font-semibold text-foreground">
            {deleteTarget?.name}
          </span>
          ? Las sucursales asignadas no seran desvinculadas.
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
            {deleting ? "Desactivando..." : "Desactivar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// =============== Org Tree View Component ===============

function OrgTreeView({
  entities,
  branches,
  onAssign,
  onUnassign,
}: {
  entities: LegalEntity[];
  branches: Branch[];
  onAssign: (branchId: string, entityId: string) => Promise<void>;
  onUnassign: (branchId: string, entityId: string) => Promise<void>;
}) {
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(
    new Set(entities.map((e) => e.id)),
  );
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [reassignModal, setReassignModal] = useState<{
    branch: Branch;
    fromEntityId: string | null;
  } | null>(null);
  const [reassignTarget, setReassignTarget] = useState("");

  const toggleEntity = (id: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const cedisBranches = branches.filter((b) => b.branchType === "CEDIS");
  const entityBranches = (entityId: string) =>
    branches.filter((b) => b.legalEntityId === entityId);
  const unassignedBranches = branches.filter(
    (b) => !b.legalEntityId && b.branchType !== "CEDIS",
  );

  const handleReassign = async () => {
    if (!reassignModal) return;
    const { branch, fromEntityId } = reassignModal;

    // Unassign from current entity
    if (fromEntityId) {
      await onUnassign(branch.id, fromEntityId);
    }
    // Assign to new entity
    if (reassignTarget) {
      await onAssign(branch.id, reassignTarget);
    }
    setReassignModal(null);
    setReassignTarget("");
  };

  return (
    <div className="mt-6">
      <div className="border rounded-lg p-6 bg-white">
        {/* Organization Root */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Luka Poke House</h3>
            <p className="text-xs text-muted-foreground">Organizacion</p>
          </div>
        </div>

        <div className="ml-5 border-l-2 border-gray-200 pl-6 space-y-4">
          {/* CEDIS (shared, not under any entity) */}
          {cedisBranches.map((branch) => (
            <div
              key={branch.id}
              className="flex items-center gap-3 py-2 px-3 rounded-lg bg-blue-50 border border-blue-200"
            >
              {branchTypeIcon("CEDIS")}
              <span className="text-sm font-medium">{branch.name}</span>
              {branchTypeBadge("CEDIS")}
              <span className="text-xs text-muted-foreground ml-auto">
                {branch.city}
              </span>
            </div>
          ))}

          {/* Legal Entities */}
          {entities.map((entity) => {
            const entityBranchesList = entityBranches(entity.id);
            const isExpanded = expandedEntities.has(entity.id);

            return (
              <div key={entity.id}>
                <button
                  onClick={() => toggleEntity(entity.id)}
                  className="flex items-center gap-3 w-full py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                  <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{entity.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      (Razon Social)
                    </span>
                  </div>
                  {!entity.isActive && (
                    <StatusBadge label="Inactiva" variant="red" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    RFC: {entity.rfc}
                  </span>
                  <span className="bg-gray-100 rounded-full px-2 py-0.5 text-xs font-medium text-gray-600">
                    {entityBranchesList.length}
                  </span>
                </button>

                {isExpanded && (
                  <div className="ml-12 mt-1 space-y-1">
                    {entityBranchesList.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 px-3">
                        Sin sucursales asignadas
                      </p>
                    ) : (
                      entityBranchesList.map((branch) => (
                        <div
                          key={branch.id}
                          className="flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-gray-50 transition-colors group"
                        >
                          {branchTypeIcon(branch.branchType)}
                          <span className="text-sm">{branch.name}</span>
                          {branchTypeBadge(branch.branchType)}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {branch.city}
                          </span>
                          <button
                            onClick={() =>
                              setReassignModal({
                                branch,
                                fromEntityId: entity.id,
                              })
                            }
                            className="text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                            title="Reasignar sucursal"
                          >
                            Reasignar
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned */}
          <div>
            <button
              onClick={() => setShowUnassigned(!showUnassigned)}
              className="flex items-center gap-3 w-full py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              {showUnassigned ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
              <div className="h-8 w-8 rounded-lg bg-yellow-50 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-yellow-600" />
              </div>
              <span className="text-sm font-medium text-yellow-700">
                Sin asignar
              </span>
              <span className="bg-yellow-100 rounded-full px-2 py-0.5 text-xs font-medium text-yellow-700">
                {unassignedBranches.length}
              </span>
            </button>

            {showUnassigned && (
              <div className="ml-12 mt-1 space-y-1">
                {unassignedBranches.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 px-3">
                    Todas las sucursales estan asignadas
                  </p>
                ) : (
                  unassignedBranches.map((branch) => (
                    <div
                      key={branch.id}
                      className="flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      {branchTypeIcon(branch.branchType)}
                      <span className="text-sm">{branch.name}</span>
                      {branchTypeBadge(branch.branchType)}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {branch.city}
                      </span>
                      <button
                        onClick={() =>
                          setReassignModal({
                            branch,
                            fromEntityId: null,
                          })
                        }
                        className="text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                        title="Asignar a razon social"
                      >
                        Asignar
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reassign Modal */}
      <Modal
        open={!!reassignModal}
        onClose={() => {
          setReassignModal(null);
          setReassignTarget("");
        }}
        title={
          reassignModal?.fromEntityId
            ? "Reasignar Sucursal"
            : "Asignar Sucursal"
        }
      >
        {reassignModal && (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {reassignModal.fromEntityId
                ? `Reasignar "${reassignModal.branch.name}" a otra razon social.`
                : `Asignar "${reassignModal.branch.name}" a una razon social.`}
            </p>
            <FormField label="Razon Social destino">
              <Select
                value={reassignTarget}
                onChange={(e) => setReassignTarget(e.target.value)}
              >
                <option value="">Seleccionar razon social...</option>
                {entities
                  .filter(
                    (e) =>
                      e.isActive && e.id !== reassignModal.fromEntityId,
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.rfc})
                    </option>
                  ))}
              </Select>
            </FormField>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setReassignModal(null);
                  setReassignTarget("");
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleReassign} disabled={!reassignTarget}>
                {reassignModal.fromEntityId ? "Reasignar" : "Asignar"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
