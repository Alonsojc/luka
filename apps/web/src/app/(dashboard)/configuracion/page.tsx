"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Building2,
  Users,
  GitBranch,
  Wifi,
  Loader2,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Download,
  KeyRound,
  Power,
  Settings,
  ScrollText,
  ChevronDown,
  ChevronUp,
  Layers,
  RefreshCw,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-field";
import { exportToCSV } from "@/lib/export-csv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Branch {
  id: string;
  name: string;
}

interface UserBranchRole {
  id: string;
  branchId: string | null;
  role: { id: string; name: string };
  branch: { id: string; name: string } | null;
}

interface UserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
  branchRoles: UserBranchRole[];
}

interface AuditLogRecord {
  id: string;
  organizationId: string;
  userId: string | null;
  userName: string | null;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  description: string;
  changes: Record<string, { old: any; new: any }> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLogRecord[];
  total: number;
  page: number;
  totalPages: number;
}

interface QueueStatus {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface QueueJob {
  id: string;
  name: string;
  status: string;
  data: Record<string, unknown>;
  progress: number;
  attempts: number;
  failedReason: string | null;
  processedOn: string | null;
  finishedOn: string | null;
  duration: number | null;
  timestamp: string | null;
}

interface QueueHealthResponse {
  redis: string;
  error?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: "general", label: "General", icon: Settings },
  { key: "usuarios", label: "Usuarios", icon: Users },
  { key: "bitacora", label: "Bitacora", icon: ScrollText },
  { key: "colas", label: "Colas", icon: Layers },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PAGE_SIZE = 10;

const ROLE_OPTIONS = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "CASHIER", label: "Cashier" },
  { value: "VIEWER", label: "Viewer" },
];

const ROLE_BADGE_STYLES: Record<string, string> = {
  OWNER: "bg-black text-white",
  ADMIN: "bg-gray-800 text-white",
  MANAGER: "bg-gray-600 text-white",
  ACCOUNTANT: "bg-gray-500 text-white",
  CASHIER: "bg-gray-400 text-gray-900",
  VIEWER: "bg-gray-300 text-gray-900",
};

const EMPTY_USER_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "VIEWER",
  branchId: "",
  password: "",
};

type UserForm = typeof EMPTY_USER_FORM;

const MODULE_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "AUTH", label: "AUTH" },
  { value: "USERS", label: "USERS" },
  { value: "INVENTARIOS", label: "INVENTARIOS" },
  { value: "COMPRAS", label: "COMPRAS" },
  { value: "NOMINA", label: "NOMINA" },
  { value: "BANCOS", label: "BANCOS" },
  { value: "FACTURACION", label: "FACTURACION" },
  { value: "CONTABILIDAD", label: "CONTABILIDAD" },
  { value: "CRM", label: "CRM" },
  { value: "REPORTES", label: "REPORTES" },
];

const ACTION_BADGE_STYLES: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
  LOGIN: "bg-gray-100 text-gray-800",
  LOGOUT: "bg-gray-100 text-gray-800",
  EXPORT: "bg-purple-100 text-purple-800",
  XML_GENERATED: "bg-blue-100 text-blue-800",
  CANCEL: "bg-red-100 text-red-800",
};

const QUEUE_DISPLAY_NAMES: Record<string, string> = {
  "corntech-sync": "Corntech Sync",
  "cfdi-timbrado": "CFDI Timbrado",
  "bank-reconciliation": "Conciliacion Bancaria",
};

const QUEUE_DESCRIPTIONS: Record<string, string> = {
  "corntech-sync": "Sincronizacion de ventas, productos y cortes de caja con Corntech POS",
  "cfdi-timbrado": "Timbrado y cancelacion de facturas electronicas (CFDI)",
  "bank-reconciliation": "Conciliacion automatica e importacion de estados de cuenta",
};

const JOB_STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  active: "bg-blue-100 text-blue-800",
  waiting: "bg-gray-100 text-gray-800",
  delayed: "bg-yellow-100 text-yellow-800",
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// ---------------------------------------------------------------------------
// Helper: get primary role from branchRoles
// ---------------------------------------------------------------------------
function getPrimaryRole(branchRoles: UserBranchRole[]): string {
  if (branchRoles.length === 0) return "-";
  return branchRoles[0].role.name;
}

function getPrimaryBranch(branchRoles: UserBranchRole[]): string {
  if (branchRoles.length === 0) return "-";
  if (!branchRoles[0].branch) return "Todas";
  return branchRoles[0].branch.name;
}

function getPrimaryBranchId(branchRoles: UserBranchRole[]): string {
  if (branchRoles.length === 0) return "";
  return branchRoles[0].branchId || "";
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ConfiguracionPage() {
  const { user, authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [branchCount, setBranchCount] = useState<number | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);

  // ---- Users state ----
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [userForm, setUserForm] = useState<UserForm>({ ...EMPTY_USER_FORM });
  const [userSaving, setUserSaving] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  // ---- Audit state ----
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditModule, setAuditModule] = useState("");
  const [auditStartDate, setAuditStartDate] = useState("");
  const [auditEndDate, setAuditEndDate] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // ---- Queues state ----
  const [queues, setQueues] = useState<QueueStatus[]>([]);
  const [queuesLoading, setQueuesLoading] = useState(false);
  const [queueHealth, setQueueHealth] = useState<QueueHealthResponse | null>(null);
  const [recentJobs, setRecentJobs] = useState<(QueueJob & { queue: string })[]>([]);
  const [recentJobsLoading, setRecentJobsLoading] = useState(false);
  const [queueActionLoading, setQueueActionLoading] = useState<string | null>(null);

  // ---- Search & Pagination ----
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    setSearchTerm("");
    setCurrentPage(1);
    setAuditPage(1);
  }, [activeTab]);

  // ---- Fetch branches ----
  const fetchBranches = useCallback(async () => {
    setBranchesLoading(true);
    try {
      const data = await authFetch<Branch[]>("get", "/branches");
      setBranches(data);
      setBranchCount(data.length);
    } catch {
      toast("Error al cargar sucursales", "error");
      setBranchCount(null);
    } finally {
      setBranchesLoading(false);
    }
  }, [authFetch, toast]);

  // ---- Fetch users ----
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await authFetch<UserRecord[]>("get", "/users");
      setUsers(data);
    } catch {
      toast("Error al cargar usuarios", "error");
    } finally {
      setUsersLoading(false);
    }
  }, [authFetch, toast]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchBranches();
  }, [authLoading, user, fetchBranches]);

  // ---- Fetch audit logs ----
  const fetchAuditLogs = useCallback(
    async (page = 1) => {
      setAuditLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "20");
        if (auditModule) params.set("module", auditModule);
        if (auditStartDate) params.set("startDate", new Date(auditStartDate).toISOString());
        if (auditEndDate) {
          const end = new Date(auditEndDate);
          end.setHours(23, 59, 59, 999);
          params.set("endDate", end.toISOString());
        }
        const data = await authFetch<AuditLogsResponse>("get", `/audit?${params.toString()}`);
        setAuditLogs(data.logs);
        setAuditTotal(data.total);
        setAuditPage(data.page);
        setAuditTotalPages(data.totalPages);
      } catch {
        toast("Error al cargar bitacora", "error");
      } finally {
        setAuditLoading(false);
      }
    },
    [authFetch, toast, auditModule, auditStartDate, auditEndDate],
  );

  useEffect(() => {
    if (authLoading || !user) return;
    if (activeTab === "usuarios") {
      fetchUsers();
    }
  }, [authLoading, user, activeTab, fetchUsers]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (activeTab === "bitacora") {
      fetchAuditLogs(1);
    }
  }, [authLoading, user, activeTab, fetchAuditLogs]);

  // ---- Fetch queues ----
  const fetchQueues = useCallback(async () => {
    setQueuesLoading(true);
    try {
      const [statusData, healthData] = await Promise.all([
        authFetch<QueueStatus[]>("get", "/queues"),
        authFetch<QueueHealthResponse>("get", "/queues/health"),
      ]);
      setQueues(statusData);
      setQueueHealth(healthData);
    } catch {
      toast("Error al cargar estado de colas", "error");
    } finally {
      setQueuesLoading(false);
    }
  }, [authFetch, toast]);

  const fetchRecentJobs = useCallback(async () => {
    setRecentJobsLoading(true);
    try {
      const queueNames = ["corntech-sync", "cfdi-timbrado", "bank-reconciliation"];
      const allJobs: (QueueJob & { queue: string })[] = [];

      const results = await Promise.all(
        queueNames.map((name) =>
          authFetch<{ jobs: QueueJob[] }>("get", `/queues/${name}/jobs?limit=10`),
        ),
      );

      results.forEach((result, i) => {
        result.jobs.forEach((job) => {
          allJobs.push({ ...job, queue: queueNames[i] });
        });
      });

      // Sort by timestamp descending
      allJobs.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
      });

      setRecentJobs(allJobs.slice(0, 20));
    } catch {
      // Silently fail for jobs
    } finally {
      setRecentJobsLoading(false);
    }
  }, [authFetch]);

  const handleRetryFailed = useCallback(
    async (queueName: string) => {
      setQueueActionLoading(`retry-${queueName}`);
      try {
        const result = await authFetch<{ retried: number }>(
          "post",
          `/queues/${queueName}/retry-failed`,
        );
        toast(`${result.retried} jobs reintentados`);
        fetchQueues();
        fetchRecentJobs();
      } catch {
        toast("Error al reintentar jobs", "error");
      } finally {
        setQueueActionLoading(null);
      }
    },
    [authFetch, toast, fetchQueues, fetchRecentJobs],
  );

  const handleCleanQueue = useCallback(
    async (queueName: string) => {
      setQueueActionLoading(`clean-${queueName}`);
      try {
        const result = await authFetch<{ cleaned: { total: number } }>(
          "post",
          `/queues/${queueName}/clean`,
        );
        toast(`${result.cleaned.total} jobs limpiados`);
        fetchQueues();
        fetchRecentJobs();
      } catch {
        toast("Error al limpiar cola", "error");
      } finally {
        setQueueActionLoading(null);
      }
    },
    [authFetch, toast, fetchQueues, fetchRecentJobs],
  );

  useEffect(() => {
    if (authLoading || !user) return;
    if (activeTab === "colas") {
      fetchQueues();
      fetchRecentJobs();
    }
  }, [authLoading, user, activeTab, fetchQueues, fetchRecentJobs]);

  // ---- Computed roles for display ----
  const uniqueRoles = useMemo(() => {
    if (!user) return [];
    const roleNames = user.roles.map((r) => r.roleName);
    return [...new Set(roleNames)];
  }, [user]);

  // ---- Users search & pagination ----
  const filteredUsers = useMemo(() => {
    if (!searchTerm) return users;
    const q = normalize(searchTerm);
    return users.filter(
      (u) =>
        normalize(u.firstName || "").includes(q) ||
        normalize(u.lastName || "").includes(q) ||
        normalize(u.email || "").includes(q) ||
        normalize(getPrimaryRole(u.branchRoles)).includes(q) ||
        normalize(getPrimaryBranch(u.branchRoles)).includes(q),
    );
  }, [users, searchTerm]);

  const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const paginationStart = filteredUsers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const paginationEnd = Math.min(currentPage * PAGE_SIZE, filteredUsers.length);

  // ---- User modal handlers ----
  function openCreateUser() {
    setEditingUser(null);
    setUserForm({ ...EMPTY_USER_FORM });
    setUserModalOpen(true);
  }

  function openEditUser(u: UserRecord) {
    setEditingUser(u);
    setUserForm({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone || "",
      role: getPrimaryRole(u.branchRoles),
      branchId: getPrimaryBranchId(u.branchRoles),
      password: "",
    });
    setUserModalOpen(true);
  }

  async function handleSaveUser() {
    if (!userForm.firstName.trim() || !userForm.lastName.trim() || !userForm.email.trim()) {
      toast("Nombre, apellido y email son requeridos", "error");
      return;
    }
    if (!editingUser && !userForm.password.trim()) {
      toast("La contrasena es requerida para nuevos usuarios", "error");
      return;
    }

    setUserSaving(true);
    try {
      if (editingUser) {
        const payload: Record<string, unknown> = {
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          email: userForm.email,
          phone: userForm.phone || undefined,
          role: userForm.role,
          branchId: userForm.branchId || undefined,
        };
        await authFetch("patch", `/users/${editingUser.id}`, payload);
        // If password was provided on edit, also change it
        if (userForm.password.trim()) {
          await authFetch("patch", `/users/${editingUser.id}/password`, {
            password: userForm.password,
          });
        }
        toast("Usuario actualizado");
      } else {
        await authFetch("post", "/users", {
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          email: userForm.email,
          phone: userForm.phone || undefined,
          password: userForm.password,
          role: userForm.role,
          branchId: userForm.branchId || undefined,
        });
        toast("Usuario creado");
      }
      setUserModalOpen(false);
      fetchUsers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al guardar usuario";
      toast(message, "error");
    } finally {
      setUserSaving(false);
    }
  }

  // ---- Toggle active ----
  async function handleToggleActive(u: UserRecord) {
    try {
      await authFetch("patch", `/users/${u.id}`, {
        isActive: !u.isActive,
      });
      toast(u.isActive ? "Usuario desactivado" : "Usuario activado");
      fetchUsers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al cambiar estado";
      toast(message, "error");
    }
  }

  // ---- Password reset ----
  function openPasswordModal(u: UserRecord) {
    setPasswordTarget(u);
    setNewPassword("");
    setPasswordModalOpen(true);
  }

  async function handleChangePassword() {
    if (!passwordTarget || !newPassword.trim()) {
      toast("La contrasena es requerida", "error");
      return;
    }
    setPasswordSaving(true);
    try {
      await authFetch("patch", `/users/${passwordTarget.id}/password`, {
        password: newPassword,
      });
      toast("Contrasena actualizada");
      setPasswordModalOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al cambiar contrasena";
      toast(message, "error");
    } finally {
      setPasswordSaving(false);
    }
  }

  // ---- Export ----
  function handleExportUsers() {
    exportToCSV(
      filteredUsers.map((u) => ({
        nombre: `${u.firstName} ${u.lastName}`,
        email: u.email,
        rol: getPrimaryRole(u.branchRoles),
        sucursal: getPrimaryBranch(u.branchRoles),
        estado: u.isActive ? "Activo" : "Inactivo",
      })),
      "usuarios",
      [
        { key: "nombre", label: "Nombre" },
        { key: "email", label: "Email" },
        { key: "rol", label: "Rol" },
        { key: "sucursal", label: "Sucursal" },
        { key: "estado", label: "Estado" },
      ],
    );
  }

  // ---- Column definitions ----
  const userColumns = [
    {
      key: "name",
      header: "Nombre",
      render: (r: UserRecord) => (
        <span className="font-medium">
          {r.firstName} {r.lastName}
        </span>
      ),
    },
    { key: "email", header: "Email" },
    {
      key: "role",
      header: "Rol",
      render: (r: UserRecord) => {
        const roleName = getPrimaryRole(r.branchRoles);
        const style = ROLE_BADGE_STYLES[roleName] || "bg-gray-200 text-gray-900";
        return (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
          >
            {roleName}
          </span>
        );
      },
    },
    {
      key: "branch",
      header: "Sucursal",
      render: (r: UserRecord) => getPrimaryBranch(r.branchRoles),
    },
    {
      key: "isActive",
      header: "Estado",
      render: (r: UserRecord) =>
        r.isActive ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Activo
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
            Inactivo
          </span>
        ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (r: UserRecord) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEditUser(r);
            }}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openPasswordModal(r);
            }}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Cambiar contrasena"
          >
            <KeyRound className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleActive(r);
            }}
            className={`rounded p-1.5 ${
              r.isActive
                ? "text-red-500 hover:bg-red-50 hover:text-red-700"
                : "text-green-500 hover:bg-green-50 hover:text-green-700"
            }`}
            title={r.isActive ? "Desactivar" : "Activar"}
          >
            <Power className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  // ---- Loading ----
  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuracion</h1>
          <p className="mt-1 text-sm text-gray-500">
            Administra la configuracion general del sistema
          </p>
        </div>
        {activeTab === "usuarios" && (
          <div className="flex gap-3">
            <button
              onClick={handleExportUsers}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>
            <Button onClick={openCreateUser}>
              <Plus className="h-4 w-4" />
              Nuevo Usuario
            </Button>
          </div>
        )}
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

      {/* ================================================================ */}
      {/* General Tab                                                       */}
      {/* ================================================================ */}
      {activeTab === "general" && (
        <div className="mt-6 space-y-6">
          {/* Organizacion */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-4 border-b border-gray-200 px-6 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <Building2 className="h-5 w-5 text-black" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">Organizacion</h2>
                <p className="text-sm text-gray-500">Informacion general de la organizacion</p>
              </div>
            </div>
            <div className="px-6 py-4">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Nombre de Organizacion
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">
                    Organizacion de {user.firstName} {user.lastName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    ID de Organizacion
                  </dt>
                  <dd className="mt-1 text-sm font-mono font-medium text-gray-900">
                    {user.organizationId}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Correo del Administrador
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">{user.email}</dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-800">
                  La configuracion de certificados PAC y CSD para facturacion electronica estara
                  disponible en esta seccion proximamente.
                </p>
              </div>
            </div>
          </div>

          {/* Usuarios y Roles */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-4 border-b border-gray-200 px-6 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <Users className="h-5 w-5 text-black" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">Usuarios y Roles</h2>
                <p className="text-sm text-gray-500">
                  Gestion de accesos, permisos y roles del sistema
                </p>
              </div>
            </div>
            <div className="px-6 py-4">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Usuario Actual
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Roles Asignados
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">{uniqueRoles.length}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Total de Asignaciones
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">{user.roles.length}</dd>
                </div>
              </dl>
              {uniqueRoles.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {uniqueRoles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-900"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sucursales */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-4 border-b border-gray-200 px-6 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <GitBranch className="h-5 w-5 text-black" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">Sucursales</h2>
                <p className="text-sm text-gray-500">Sucursales registradas en la organizacion</p>
              </div>
            </div>
            <div className="px-6 py-4">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Total de Sucursales
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">
                    {branchesLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    ) : branchCount !== null ? (
                      branchCount
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Error al cargar
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Integracion Corntech */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-4 border-b border-gray-200 px-6 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <Wifi className="h-5 w-5 text-black" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">Integracion Corntech</h2>
                <p className="text-sm text-gray-500">
                  Sincronizacion con el POS Corntech de cada sucursal
                </p>
              </div>
            </div>
            <div className="px-6 py-4">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Estado
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-gray-500">
                    Pendiente de configuracion
                  </dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-sm text-gray-600">
                  La integracion con Corntech POS sera habilitada en la Fase 4 del proyecto. Aqui
                  podras configurar la sincronizacion de ventas, inventarios y cortes de caja por
                  sucursal.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Usuarios Tab                                                      */}
      {/* ================================================================ */}
      {activeTab === "usuarios" && (
        <div className="mt-6">
          {/* Search bar */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, email o rol..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
            />
          </div>

          {/* Users table */}
          <div className="mt-4">
            <DataTable
              columns={userColumns}
              data={paginatedUsers}
              loading={usersLoading}
              emptyMessage="No hay usuarios registrados"
            />
          </div>

          {/* Pagination controls */}
          {filteredUsers.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Mostrando {paginationStart}-{paginationEnd} de {filteredUsers.length}
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
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Bitacora Tab                                                      */}
      {/* ================================================================ */}
      {activeTab === "bitacora" && (
        <div className="mt-6">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Modulo</label>
              <select
                value={auditModule}
                onChange={(e) => {
                  setAuditModule(e.target.value);
                  setAuditPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              >
                {MODULE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Desde</label>
              <input
                type="date"
                value={auditStartDate}
                onChange={(e) => {
                  setAuditStartDate(e.target.value);
                  setAuditPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Hasta</label>
              <input
                type="date"
                value={auditEndDate}
                onChange={(e) => {
                  setAuditEndDate(e.target.value);
                  setAuditPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              />
            </div>
            {(auditModule || auditStartDate || auditEndDate) && (
              <button
                onClick={() => {
                  setAuditModule("");
                  setAuditStartDate("");
                  setAuditEndDate("");
                  setAuditPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Audit table */}
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Fecha/Hora
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Usuario
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Modulo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Accion
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Descripcion
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Detalles
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {auditLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
                    </td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      No hay registros en la bitacora
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <>
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                          {new Date(log.createdAt).toLocaleDateString("es-MX", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}{" "}
                          {new Date(log.createdAt).toLocaleTimeString("es-MX", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                          {log.userName || log.userId || "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-white">
                            {log.module}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ACTION_BADGE_STYLES[log.action] || "bg-gray-100 text-gray-800"}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td
                          className="max-w-xs truncate px-4 py-3 text-sm text-gray-600"
                          title={log.description}
                        >
                          {log.description}
                        </td>
                        <td className="px-4 py-3">
                          {log.changes ? (
                            <button
                              onClick={() =>
                                setExpandedLogId(expandedLogId === log.id ? null : log.id)
                              }
                              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            >
                              {expandedLogId === log.id ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                              Ver
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                      {expandedLogId === log.id && log.changes && (
                        <tr key={`${log.id}-details`}>
                          <td colSpan={6} className="bg-gray-50 px-6 py-4">
                            <div className="space-y-2">
                              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                                Cambios realizados
                              </p>
                              <div className="grid gap-2">
                                {Object.entries(log.changes).map(([field, change]) => (
                                  <div
                                    key={field}
                                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm"
                                  >
                                    <span className="font-medium text-gray-700 min-w-[120px]">
                                      {field}
                                    </span>
                                    <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 line-through">
                                      {String(change.old ?? "-")}
                                    </span>
                                    <span className="text-gray-400">&rarr;</span>
                                    <span className="rounded bg-green-50 px-2 py-0.5 text-green-700">
                                      {String(change.new ?? "-")}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Audit Pagination */}
          {auditTotal > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Mostrando {(auditPage - 1) * 20 + 1}-{Math.min(auditPage * 20, auditTotal)} de{" "}
                {auditTotal}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const prev = Math.max(1, auditPage - 1);
                    setAuditPage(prev);
                    fetchAuditLogs(prev);
                  }}
                  disabled={auditPage === 1}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-gray-600">
                  {auditPage} / {auditTotalPages}
                </span>
                <button
                  onClick={() => {
                    const next = Math.min(auditTotalPages, auditPage + 1);
                    setAuditPage(next);
                    fetchAuditLogs(next);
                  }}
                  disabled={auditPage === auditTotalPages}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Colas Tab                                                          */}
      {/* ================================================================ */}
      {activeTab === "colas" && (
        <div className="mt-6 space-y-6">
          {/* Redis status */}
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                queueHealth?.redis === "connected" ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-gray-600">
              Redis: {queueHealth?.redis === "connected" ? "Conectado" : "Desconectado"}
            </span>
            {queuesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
            <button
              onClick={() => {
                fetchQueues();
                fetchRecentJobs();
              }}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Actualizar
            </button>
          </div>

          {/* Queue cards */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {queues.map((q) => (
              <div key={q.name} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-5 py-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {QUEUE_DISPLAY_NAMES[q.name] || q.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">{QUEUE_DESCRIPTIONS[q.name] || ""}</p>
                </div>
                <div className="px-5 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">En espera</p>
                        <p className="text-sm font-semibold text-gray-900">{q.waiting}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-xs text-gray-500">Activos</p>
                        <p className="text-sm font-semibold text-gray-900">{q.active}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-xs text-gray-500">Completados (24h)</p>
                        <p className="text-sm font-semibold text-gray-900">{q.completed}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <div>
                        <p className="text-xs text-gray-500">Fallidos</p>
                        <p className="text-sm font-semibold text-gray-900">{q.failed}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleRetryFailed(q.name)}
                      disabled={queueActionLoading === `retry-${q.name}` || q.failed === 0}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {queueActionLoading === `retry-${q.name}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Reintentar Fallidos
                    </button>
                    <button
                      onClick={() => handleCleanQueue(q.name)}
                      disabled={queueActionLoading === `clean-${q.name}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {queueActionLoading === `clean-${q.name}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Limpiar
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!queuesLoading && queues.length === 0 && (
              <div className="col-span-3 rounded-xl border border-gray-200 bg-white p-8 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">
                  No se pudo cargar el estado de las colas. Verifica la conexion a Redis.
                </p>
              </div>
            )}
          </div>

          {/* Recent jobs table */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">Jobs Recientes</h3>
              <p className="text-sm text-gray-500">Ultimos 20 jobs procesados en todas las colas</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Cola
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Job
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Duracion
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Intentos
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Fecha
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {recentJobsLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
                      </td>
                    </tr>
                  ) : recentJobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                        No hay jobs recientes
                      </td>
                    </tr>
                  ) : (
                    recentJobs.map((job) => (
                      <tr key={`${job.queue}-${job.id}`} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-white">
                            {QUEUE_DISPLAY_NAMES[job.queue] || job.queue}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                          {job.name}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${JOB_STATUS_STYLES[job.status] || "bg-gray-100 text-gray-800"}`}
                          >
                            {job.status === "completed"
                              ? "Completado"
                              : job.status === "failed"
                                ? "Fallido"
                                : job.status === "active"
                                  ? "Activo"
                                  : job.status === "waiting"
                                    ? "En espera"
                                    : job.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                          {job.duration != null ? `${job.duration}ms` : "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                          {job.attempts}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                          {job.timestamp
                            ? new Date(job.timestamp).toLocaleDateString("es-MX", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              }) +
                              " " +
                              new Date(job.timestamp).toLocaleTimeString("es-MX", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Create / Edit User Modal                                          */}
      {/* ================================================================ */}
      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? "Editar Usuario" : "Nuevo Usuario"}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Nombre" required>
              <Input
                value={userForm.firstName}
                onChange={(e) => setUserForm((f) => ({ ...f, firstName: e.target.value }))}
                placeholder="Nombre"
              />
            </FormField>
            <FormField label="Apellido" required>
              <Input
                value={userForm.lastName}
                onChange={(e) => setUserForm((f) => ({ ...f, lastName: e.target.value }))}
                placeholder="Apellido"
              />
            </FormField>
          </div>

          <FormField label="Correo electronico" required>
            <Input
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="correo@ejemplo.com"
            />
          </FormField>

          <FormField label="Telefono">
            <Input
              type="tel"
              value={userForm.phone}
              onChange={(e) => setUserForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="(opcional)"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Rol" required>
              <Select
                value={userForm.role}
                onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Sucursal">
              <Select
                value={userForm.branchId}
                onChange={(e) => setUserForm((f) => ({ ...f, branchId: e.target.value }))}
              >
                <option value="">Todas (org-wide)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField
            label={editingUser ? "Contrasena (dejar vacio para no cambiar)" : "Contrasena"}
            required={!editingUser}
          >
            <Input
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={editingUser ? "Dejar vacio para no cambiar" : "Contrasena del usuario"}
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setUserModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveUser} disabled={userSaving}>
              {userSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : editingUser ? (
                "Guardar Cambios"
              ) : (
                "Crear Usuario"
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================ */}
      {/* Change Password Modal                                             */}
      {/* ================================================================ */}
      <Modal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        title={`Cambiar contrasena: ${passwordTarget?.firstName ?? ""} ${passwordTarget?.lastName ?? ""}`}
      >
        <div className="space-y-4">
          <FormField label="Nueva contrasena" required>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nueva contrasena"
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setPasswordModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleChangePassword} disabled={passwordSaving}>
              {passwordSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Cambiar Contrasena"
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
