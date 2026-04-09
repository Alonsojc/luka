"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Activity,
  Users,
  BarChart3,
  Clock,
  ChevronDown,
  ChevronUp,
  Filter,
  History,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-field";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLog {
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
  user?: { id: string; firstName: string; lastName: string; email: string } | null;
}

interface PaginatedLogs {
  logs: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
}

interface AuditStats {
  totalActions: number;
  activeUsers: number;
  topModule: string;
  peakHour: string;
  byModule: Array<{ module: string; count: number }>;
  byAction: Array<{ action: string; count: number }>;
  byUser: Array<{ userId: string | null; userName: string | null; count: number }>;
  dailyActivity: Array<{ date: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODULES = [
  "INVENTARIOS",
  "COMPRAS",
  "NOMINA",
  "BANCOS",
  "FACTURACION",
  "CONTABILIDAD",
  "CRM",
  "REPORTES",
  "INVERSIONISTAS",
  "USERS",
  "AUTH",
  "MERMA",
  "DELIVERY",
  "REQUISITIONS",
  "LOYALTY",
];

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "EXPORT"];

const ENTITY_TYPES = [
  { value: "Product", label: "Producto" },
  { value: "Supplier", label: "Proveedor" },
  { value: "Employee", label: "Empleado" },
  { value: "PurchaseOrder", label: "Orden de Compra" },
  { value: "BankAccount", label: "Cuenta Bancaria" },
  { value: "Customer", label: "Cliente" },
  { value: "Branch", label: "Sucursal" },
  { value: "User", label: "Usuario" },
  { value: "Invoice", label: "Factura" },
];

type Tab = "actividad" | "estadisticas" | "buscar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function actionBadge(action: string) {
  const map: Record<string, string> = {
    CREATE: "bg-green-100 text-green-800",
    UPDATE: "bg-blue-100 text-blue-800",
    DELETE: "bg-red-100 text-red-800",
    LOGIN: "bg-gray-100 text-gray-800",
    LOGOUT: "bg-gray-100 text-gray-600",
    EXPORT: "bg-purple-100 text-purple-800",
  };
  return map[action] || "bg-gray-100 text-gray-700";
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function userInitials(log: AuditLog): string {
  if (log.user) {
    return (log.user.firstName.charAt(0) + log.user.lastName.charAt(0)).toUpperCase();
  }
  if (log.userName) {
    const parts = log.userName.split(" ");
    return parts.length >= 2
      ? (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
      : log.userName.charAt(0).toUpperCase();
  }
  return "?";
}

function userName(log: AuditLog): string {
  if (log.user) return `${log.user.firstName} ${log.user.lastName}`;
  return log.userName || "Sistema";
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AuditoriaPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("actividad");

  if (authLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Auditoria
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Registro de actividad y cambios en el sistema
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: "actividad" as Tab, label: "Actividad", icon: Activity },
          { key: "estadisticas" as Tab, label: "Estadisticas", icon: BarChart3 },
          { key: "buscar" as Tab, label: "Buscar Entidad", icon: Search },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === "actividad" && <ActividadTab authFetch={authFetch} />}
      {tab === "estadisticas" && <EstadisticasTab authFetch={authFetch} />}
      {tab === "buscar" && <BuscarEntidadTab authFetch={authFetch} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actividad Tab
// ---------------------------------------------------------------------------

function ActividadTab({
  authFetch,
}: {
  authFetch: <T>(method: "get" | "post" | "patch" | "put" | "delete", path: string, body?: unknown) => Promise<T>;
}) {
  const [data, setData] = useState<PaginatedLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterModule, setFilterModule] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (filterModule) params.set("module", filterModule);
      if (filterAction) params.set("action", filterAction);
      if (filterStartDate) params.set("startDate", filterStartDate);
      if (filterEndDate) params.set("endDate", filterEndDate);

      const result = await authFetch<PaginatedLogs>("get", `/audit?${params.toString()}`);
      setData(result);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [authFetch, page, filterModule, filterAction, filterStartDate, filterEndDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const clearFilters = () => {
    setFilterModule("");
    setFilterAction("");
    setFilterStartDate("");
    setFilterEndDate("");
    setPage(1);
  };

  const hasFilters = filterModule || filterAction || filterStartDate || filterEndDate;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex w-full items-center justify-between px-5 py-3"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Filter className="h-4 w-4" />
            Filtros
            {hasFilters && (
              <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-bold text-white">
                Activos
              </span>
            )}
          </div>
          {filtersOpen ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {filtersOpen && (
          <div className="border-t border-gray-100 px-5 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Modulo</label>
                <Select
                  value={filterModule}
                  onChange={(e) => { setFilterModule(e.target.value); setPage(1); }}
                >
                  <option value="">Todos</option>
                  {MODULES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Accion</label>
                <Select
                  value={filterAction}
                  onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
                >
                  <option value="">Todas</option>
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
                <Input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => { setFilterStartDate(e.target.value); setPage(1); }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
                <Input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => { setFilterEndDate(e.target.value); setPage(1); }}
                />
              </div>
            </div>
            {hasFilters && (
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : !data || data.logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No se encontraron registros de auditoria
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50/50">
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Fecha</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Usuario</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Accion</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Modulo</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Descripcion</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Entidad</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((log) => (
                    <LogRow
                      key={log.id}
                      log={log}
                      expanded={expandedId === log.id}
                      onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-500">
                {data.total} registros &middot; Pagina {data.page} de {data.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= (data.totalPages || 1)}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log Row with expand/collapse for changes diff
// ---------------------------------------------------------------------------

function LogRow({
  log,
  expanded,
  onToggle,
}: {
  log: AuditLog;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasChanges = log.changes && Object.keys(log.changes).length > 0;

  return (
    <>
      <tr
        onClick={hasChanges ? onToggle : undefined}
        className={`border-b border-gray-50 transition-colors ${
          hasChanges ? "cursor-pointer hover:bg-gray-50" : ""
        }`}
      >
        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
          {formatDate(log.createdAt)}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white flex-shrink-0">
              {userInitials(log)}
            </div>
            <span className="text-sm text-gray-900 truncate max-w-[120px]">
              {userName(log)}
            </span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${actionBadge(log.action)}`}>
            {log.action}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-700">{log.module}</td>
        <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
          {log.description}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
          {log.entityType && (
            <span>
              {log.entityType}
              {log.entityId && <span className="text-gray-300"> #{log.entityId.slice(0, 8)}</span>}
            </span>
          )}
          {hasChanges && (
            <span className="ml-2 inline-block">
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5 text-gray-400 inline" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-gray-400 inline" />
              )}
            </span>
          )}
        </td>
      </tr>

      {/* Expanded diff view */}
      {expanded && hasChanges && (
        <tr>
          <td colSpan={6} className="bg-gray-50 px-4 py-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
                Cambios
              </p>
              <div className="space-y-2">
                {Object.entries(log.changes!).map(([field, change]) => (
                  <div key={field} className="flex items-start gap-3 text-sm">
                    <span className="font-medium text-gray-700 min-w-[120px]">{field}</span>
                    <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 line-through text-xs">
                      {change.old !== null && change.old !== undefined ? String(change.old) : "null"}
                    </span>
                    <span className="text-gray-400">&rarr;</span>
                    <span className="rounded bg-green-50 px-2 py-0.5 text-green-700 text-xs">
                      {change.new !== null && change.new !== undefined ? String(change.new) : "null"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Estadisticas Tab
// ---------------------------------------------------------------------------

function EstadisticasTab({
  authFetch,
}: {
  authFetch: <T>(method: "get" | "post" | "patch" | "put" | "delete", path: string, body?: unknown) => Promise<T>;
}) {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const qs = params.toString();
      const result = await authFetch<AuditStats>("get", `/audit/stats${qs ? `?${qs}` : ""}`);
      setStats(result);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [authFetch, startDate, endDate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">
        No se pudieron cargar las estadisticas
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date range */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Acciones"
          value={stats.totalActions.toLocaleString("es-MX")}
          icon={Activity}
        />
        <KpiCard
          title="Usuarios Activos"
          value={stats.activeUsers}
          icon={Users}
        />
        <KpiCard
          title="Modulo Mas Activo"
          value={stats.topModule}
          icon={BarChart3}
        />
        <KpiCard
          title="Hora Pico"
          value={stats.peakHour}
          icon={Clock}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bar chart: actions by module */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Acciones por Modulo</h3>
          {stats.byModule.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.byModule}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="module"
                  tick={{ fontSize: 11 }}
                  angle={-35}
                  textAnchor="end"
                  height={70}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#000000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Line chart: daily activity */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Actividad Diaria (ultimos 30 dias)</h3>
          {stats.dailyActivity.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats.dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatShortDate(v)}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(v) => formatShortDate(String(v))}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#000000"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top Users Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Top 10 Usuarios por Actividad</h3>
        </div>
        {stats.byUser.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Sin datos</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50/50">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">#</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Usuario</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {stats.byUser.map((u, i) => (
                <tr key={u.userId || i} className="border-b border-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{u.userName || u.userId || "Desconocido"}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right font-medium">
                    {u.count.toLocaleString("es-MX")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card (local)
// ---------------------------------------------------------------------------

function KpiCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buscar Entidad Tab
// ---------------------------------------------------------------------------

function BuscarEntidadTab({
  authFetch,
}: {
  authFetch: <T>(method: "get" | "post" | "patch" | "put" | "delete", path: string, body?: unknown) => Promise<T>;
}) {
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [results, setResults] = useState<AuditLog[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const search = async () => {
    if (!entityType || !entityId.trim()) return;
    setLoading(true);
    setResults(null);
    try {
      const data = await authFetch<AuditLog[]>(
        "get",
        `/audit/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId.trim())}`,
      );
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Buscar Historial de Entidad</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de Entidad</label>
            <Select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="">Seleccionar...</option>
              {ENTITY_TYPES.map((et) => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">ID de Entidad</label>
            <Input
              type="text"
              placeholder="Ej: clxyz123abc..."
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
            />
          </div>
          <Button onClick={search} disabled={!entityType || !entityId.trim() || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </Button>
        </div>
      </div>

      {/* Timeline Results */}
      {results !== null && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              Historial de {entityType} #{entityId.slice(0, 8)}
              <span className="ml-2 text-gray-400 font-normal">({results.length} registros)</span>
            </h3>
          </div>

          {results.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No se encontraron cambios para esta entidad
            </div>
          ) : (
            <div className="p-5">
              <div className="relative border-l-2 border-gray-200 pl-6 space-y-6">
                {results.map((log) => {
                  const hasChanges = log.changes && Object.keys(log.changes).length > 0;
                  const isExpanded = expandedId === log.id;

                  return (
                    <div key={log.id} className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-gray-200 bg-white">
                        <div className={`h-2 w-2 rounded-full ${
                          log.action === "CREATE" ? "bg-green-500" :
                          log.action === "DELETE" ? "bg-red-500" :
                          "bg-blue-500"
                        }`} />
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${actionBadge(log.action)}`}>
                            {log.action}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDate(log.createdAt)}
                          </span>
                          <span className="text-xs text-gray-400">por</span>
                          <div className="flex items-center gap-1">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-[8px] font-bold text-white">
                              {userInitials(log)}
                            </div>
                            <span className="text-xs font-medium text-gray-700">
                              {userName(log)}
                            </span>
                          </div>
                        </div>

                        <p className="text-sm text-gray-600">{log.description}</p>

                        {hasChanges && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                            className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                          >
                            <History className="h-3.5 w-3.5" />
                            {isExpanded ? "Ocultar cambios" : "Ver cambios"}
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        )}

                        {isExpanded && hasChanges && (
                          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                            {Object.entries(log.changes!).map(([field, change]) => (
                              <div key={field} className="flex items-start gap-3 text-sm">
                                <span className="font-medium text-gray-700 min-w-[100px] text-xs">{field}</span>
                                <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 line-through text-xs">
                                  {change.old !== null && change.old !== undefined ? String(change.old) : "null"}
                                </span>
                                <span className="text-gray-400">&rarr;</span>
                                <span className="rounded bg-green-50 px-2 py-0.5 text-green-700 text-xs">
                                  {change.new !== null && change.new !== undefined ? String(change.new) : "null"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
