"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  BellRing,
  Send,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Package,
  ShoppingCart,
  Landmark,
  Users,
  Clock,
  ClipboardList,
  Bike,
  Settings,
  MessageSquare,
  Filter,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-field";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Notification {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Branch {
  id: string;
  name: string;
}

interface Role {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOTIFICATION_TYPES = [
  { value: "", label: "Todos los tipos" },
  { value: "LOW_STOCK", label: "Stock bajo" },
  { value: "PENDING_ORDER", label: "Orden pendiente" },
  { value: "OVERDUE_PAYABLE", label: "Pago vencido" },
  { value: "PAYROLL_PENDING", label: "Nomina pendiente" },
  { value: "SHIFT_CHANGE", label: "Cambio de turno" },
  { value: "REQUISITION_STATUS", label: "Requisicion" },
  { value: "DELIVERY_UPDATE", label: "Delivery" },
  { value: "SYSTEM", label: "Sistema" },
  { value: "CUSTOM", label: "Personalizado" },
];

const SEVERITY_OPTIONS = [
  { value: "info", label: "Informativo" },
  { value: "warning", label: "Advertencia" },
  { value: "critical", label: "Critico" },
];

const RECIPIENT_TYPES = [
  { value: "user", label: "Usuario especifico" },
  { value: "role", label: "Todos con un rol" },
  { value: "branch", label: "Todos en una sucursal" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  if (hours < 24) return `hace ${hours} hora${hours !== 1 ? "s" : ""}`;
  if (days < 30) return `hace ${days} dia${days !== 1 ? "s" : ""}`;
  return new Date(dateStr).toLocaleDateString("es-MX");
}

function typeIcon(type: string) {
  switch (type) {
    case "LOW_STOCK":
      return Package;
    case "PENDING_ORDER":
      return ShoppingCart;
    case "OVERDUE_PAYABLE":
      return Landmark;
    case "PAYROLL_PENDING":
      return Users;
    case "SHIFT_CHANGE":
      return Clock;
    case "REQUISITION_STATUS":
      return ClipboardList;
    case "DELIVERY_UPDATE":
      return Bike;
    case "SYSTEM":
      return Settings;
    case "CUSTOM":
      return MessageSquare;
    default:
      return Bell;
  }
}

function severityBorderColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "border-l-red-500";
    case "warning":
      return "border-l-yellow-500";
    case "info":
    default:
      return "border-l-blue-500";
  }
}

function severityBadgeColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-700";
    case "warning":
      return "bg-yellow-100 text-yellow-700";
    case "info":
    default:
      return "bg-blue-100 text-blue-700";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotificacionesPage() {
  const { user, authFetch, loading } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<"todas" | "enviar">("todas");

  // --- "Todas" tab state ---
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterType, setFilterType] = useState("");
  const [filterRead, setFilterRead] = useState<string>("");
  const [loadingList, setLoadingList] = useState(false);

  // --- "Enviar" tab state ---
  const [recipientType, setRecipientType] = useState("user");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoleName, setSelectedRoleName] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [sendType, setSendType] = useState("CUSTOM");
  const [sendSeverity, setSendSeverity] = useState("info");
  const [sendTitle, setSendTitle] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendLink, setSendLink] = useState("");
  const [sending, setSending] = useState(false);

  // --- Lookup data ---
  const [users, setUsers] = useState<UserOption[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const isAdmin =
    user?.roles?.some((r) => r.roleName === "ADMIN" || r.roleName === "OWNER") || false;

  // --- Fetch notifications ---
  const fetchNotifications = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "15");
      if (filterType) params.set("type", filterType);
      if (filterRead) params.set("isRead", filterRead);

      const data = await authFetch<{
        notifications: Notification[];
        total: number;
        page: number;
        totalPages: number;
      }>("get", `/notifications?${params.toString()}`);

      setNotifications(data.notifications);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast("Error al cargar notificaciones", "error");
    } finally {
      setLoadingList(false);
    }
  }, [authFetch, page, filterType, filterRead, toast]);

  useEffect(() => {
    if (!loading) fetchNotifications();
  }, [loading, fetchNotifications]);

  // --- Fetch lookup data for "Enviar" tab ---
  useEffect(() => {
    if (!loading && isAdmin && tab === "enviar") {
      authFetch<UserOption[]>("get", "/users")
        .then(setUsers)
        .catch(() => {});
      authFetch<Role[]>("get", "/roles")
        .then(setRoles)
        .catch(() => {});
      authFetch<Branch[]>("get", "/branches")
        .then(setBranches)
        .catch(() => {});
    }
  }, [loading, isAdmin, tab, authFetch]);

  // --- Actions ---
  const handleMarkAsRead = async (id: string) => {
    try {
      await authFetch("post", `/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
        ),
      );
      toast("Notificacion marcada como leida", "success");
    } catch {
      toast("Error al marcar notificacion", "error");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await authFetch("post", "/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast("Todas marcadas como leidas", "success");
    } catch {
      toast("Error al marcar notificaciones", "error");
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await handleMarkAsRead(notification.id);
    }
    if (notification.link) {
      window.location.href = notification.link;
    }
  };

  const handleSend = async () => {
    if (!sendTitle.trim() || !sendMessage.trim()) {
      toast("Titulo y mensaje son requeridos", "error");
      return;
    }

    const body: Record<string, string> = {
      type: sendType,
      severity: sendSeverity,
      title: sendTitle,
      message: sendMessage,
    };
    if (sendLink.trim()) body.link = sendLink;

    if (recipientType === "user") {
      if (!selectedUserId) {
        toast("Selecciona un usuario", "error");
        return;
      }
      body.userId = selectedUserId;
    } else if (recipientType === "role") {
      if (!selectedRoleName) {
        toast("Selecciona un rol", "error");
        return;
      }
      body.roleName = selectedRoleName;
    } else if (recipientType === "branch") {
      if (!selectedBranchId) {
        toast("Selecciona una sucursal", "error");
        return;
      }
      body.branchId = selectedBranchId;
    }

    setSending(true);
    try {
      await authFetch("post", "/notifications/send", body);
      toast("Notificacion enviada", "success");
      setSendTitle("");
      setSendMessage("");
      setSendLink("");
      setSelectedUserId("");
      setSelectedRoleName("");
      setSelectedBranchId("");
    } catch {
      toast("Error al enviar notificacion", "error");
    } finally {
      setSending(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
          <p className="text-sm text-gray-500 mt-1">Centro de notificaciones ({total} total)</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab("todas")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "todas"
              ? "border-black text-black"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <BellRing className="inline-block h-4 w-4 mr-1.5 -mt-0.5" />
          Todas
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab("enviar")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "enviar"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Send className="inline-block h-4 w-4 mr-1.5 -mt-0.5" />
            Enviar
          </button>
        )}
      </div>

      {/* === "Todas" Tab === */}
      {tab === "todas" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <Select
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value);
                  setPage(1);
                }}
                className="!w-48"
              >
                {NOTIFICATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <Select
              value={filterRead}
              onChange={(e) => {
                setFilterRead(e.target.value);
                setPage(1);
              }}
              className="!w-40"
            >
              <option value="">Todas</option>
              <option value="false">No leidas</option>
              <option value="true">Leidas</option>
            </Select>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck className="h-4 w-4" />
              Marcar todas como leidas
            </Button>
          </div>

          {/* List */}
          {loadingList ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
              <Bell className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">No hay notificaciones</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => {
                const Icon = typeIcon(n.type);
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full rounded-lg border bg-white text-left transition-all hover:shadow-sm border-l-4 ${severityBorderColor(n.severity)} ${
                      !n.isRead ? "ring-1 ring-blue-100" : ""
                    }`}
                  >
                    <div className="flex items-start gap-4 p-4">
                      <div
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                          !n.isRead ? "bg-black text-white" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-sm truncate ${
                              !n.isRead
                                ? "font-semibold text-gray-900"
                                : "font-medium text-gray-600"
                            }`}
                          >
                            {n.title}
                          </p>
                          <span
                            className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${severityBadgeColor(n.severity)}`}
                          >
                            {n.severity}
                          </span>
                          {!n.isRead && (
                            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">
                Pagina {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* === "Enviar" Tab === */}
      {tab === "enviar" && isAdmin && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Form */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Enviar Notificacion</h2>

            <FormField label="Destinatario" required>
              <Select value={recipientType} onChange={(e) => setRecipientType(e.target.value)}>
                {RECIPIENT_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </Select>
            </FormField>

            {recipientType === "user" && (
              <FormField label="Usuario" required>
                <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                  <option value="">Seleccionar usuario...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} ({u.email})
                    </option>
                  ))}
                </Select>
              </FormField>
            )}

            {recipientType === "role" && (
              <FormField label="Rol" required>
                <Select
                  value={selectedRoleName}
                  onChange={(e) => setSelectedRoleName(e.target.value)}
                >
                  <option value="">Seleccionar rol...</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}

            {recipientType === "branch" && (
              <FormField label="Sucursal" required>
                <Select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                >
                  <option value="">Seleccionar sucursal...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Tipo" required>
                <Select value={sendType} onChange={(e) => setSendType(e.target.value)}>
                  {NOTIFICATION_TYPES.filter((t) => t.value).map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Severidad" required>
                <Select value={sendSeverity} onChange={(e) => setSendSeverity(e.target.value)}>
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <FormField label="Titulo" required>
              <Input
                value={sendTitle}
                onChange={(e) => setSendTitle(e.target.value)}
                placeholder="Titulo de la notificacion"
              />
            </FormField>

            <FormField label="Mensaje" required>
              <Textarea
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                placeholder="Mensaje de la notificacion"
              />
            </FormField>

            <FormField label="Enlace (opcional)">
              <Input
                value={sendLink}
                onChange={(e) => setSendLink(e.target.value)}
                placeholder="/inventarios"
              />
            </FormField>

            <Button onClick={handleSend} disabled={sending} className="w-full">
              <Send className="h-4 w-4" />
              {sending ? "Enviando..." : "Enviar Notificacion"}
            </Button>
          </div>

          {/* Preview */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Vista Previa</h2>
            <div
              className={`rounded-lg border bg-white border-l-4 ${severityBorderColor(sendSeverity)}`}
            >
              <div className="flex items-start gap-4 p-4">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-black text-white">
                  {(() => {
                    const Icon = typeIcon(sendType);
                    return <Icon className="h-4 w-4" />;
                  })()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {sendTitle || "Titulo de la notificacion"}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${severityBadgeColor(sendSeverity)}`}
                    >
                      {sendSeverity}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {sendMessage || "Mensaje de la notificacion"}
                  </p>
                  {sendLink && <p className="text-[10px] text-blue-500 mt-1">{sendLink}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">hace un momento</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs text-gray-500">
                <strong>Destinatario:</strong>{" "}
                {recipientType === "user" &&
                  (users.find((u) => u.id === selectedUserId)
                    ? `${users.find((u) => u.id === selectedUserId)!.firstName} ${users.find((u) => u.id === selectedUserId)!.lastName}`
                    : "Sin seleccionar")}
                {recipientType === "role" && (selectedRoleName || "Sin seleccionar")}
                {recipientType === "branch" &&
                  (branches.find((b) => b.id === selectedBranchId)?.name || "Sin seleccionar")}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                <strong>Tipo:</strong> {NOTIFICATION_TYPES.find((t) => t.value === sendType)?.label}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
