"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Bell,
  Plus,
  Play,
  Pencil,
  Power,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Settings,
  History,
  ListChecks,
  Send,
  Trash2,
  X,
  Eye,
  MessageSquare,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useApiQuery } from "@/hooks/use-api-query";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-field";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Recipient {
  phone: string;
  name: string;
  role?: string;
}

interface AlertRule {
  id: string;
  name: string;
  eventType: string;
  conditions: Record<string, any>;
  recipients: Recipient[];
  messageTemplate: string;
  isActive: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  _count?: { logs: number };
}

interface AlertLog {
  id: string;
  alertRuleId: string;
  recipient: string;
  message: string;
  status: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  alertRule: { id: string; name: string; eventType: string } | null;
}

interface WhatsAppConfig {
  id: string | null;
  organizationId: string;
  provider: string;
  apiKey: string | null;
  apiSecret: string | null;
  phoneNumberId: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = ["Reglas de Alerta", "Historial", "Configuracion"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, typeof Bell> = {
  "Reglas de Alerta": ListChecks,
  Historial: History,
  Configuracion: Settings,
};

const EVENT_TYPES = [
  { value: "STOCK_LOW", label: "Stock Bajo" },
  { value: "LOT_EXPIRING", label: "Lote por Vencer" },
  { value: "REQUISITION_NEW", label: "Nueva Requisicion" },
  { value: "REQUISITION_APPROVED", label: "Requisicion Aprobada" },
  { value: "DELIVERY_NEW", label: "Nuevo Pedido Delivery" },
  { value: "DAILY_SUMMARY", label: "Resumen Diario" },
];

const EVENT_LABEL: Record<string, string> = {};
EVENT_TYPES.forEach((e) => {
  EVENT_LABEL[e.value] = e.label;
});

const EVENT_VARIABLES: Record<string, string[]> = {
  STOCK_LOW: [
    "branchName",
    "productName",
    "sku",
    "currentStock",
    "minimumStock",
    "unit",
  ],
  LOT_EXPIRING: [
    "branchName",
    "productName",
    "lotNumber",
    "expirationDate",
    "daysLeft",
    "quantity",
    "unit",
  ],
  REQUISITION_NEW: [
    "branchName",
    "requestedBy",
    "itemCount",
    "priority",
    "deliveryDate",
  ],
  REQUISITION_APPROVED: ["branchName", "folio", "approvedBy", "itemCount"],
  DELIVERY_NEW: ["branchName", "platform", "customerName", "total"],
  DAILY_SUMMARY: [
    "date",
    "totalSales",
    "pendingRequisitions",
    "lowStockCount",
    "expiringLots",
    "activeTransfers",
  ],
};

const STATUS_VARIANT: Record<string, "green" | "red" | "yellow" | "gray" | "blue"> = {
  SENT: "green",
  DELIVERED: "green",
  FAILED: "red",
  PENDING: "yellow",
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AlertasPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("Reglas de Alerta");

  // Rules (React Query) - endpoint returns { data: AlertRule[] }
  const { data: rulesResponse, isLoading: rulesLoading } = useApiQuery<{ data: AlertRule[] }>(
    "/whatsapp/rules",
    ["alert-rules"],
  );
  const rules = rulesResponse?.data ?? [];

  const [ruleModal, setRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    eventType: "STOCK_LOW",
    conditions: {} as Record<string, any>,
    recipients: [{ phone: "", name: "", role: "" }] as Recipient[],
    messageTemplate: "",
    isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);
  const [previewModal, setPreviewModal] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("");

  // Logs (React Query)
  const [logsPage, setLogsPage] = useState(1);
  const [logFilterRule, setLogFilterRule] = useState("");
  const [logFilterStatus, setLogFilterStatus] = useState("");

  const logsQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(logsPage));
    params.set("limit", "25");
    if (logFilterRule) params.set("ruleId", logFilterRule);
    if (logFilterStatus) params.set("status", logFilterStatus);
    return params.toString();
  }, [logsPage, logFilterRule, logFilterStatus]);

  const { data: logsResponse, isLoading: logsLoading } = useApiQuery<{
    data: AlertLog[];
    total: number;
    page: number;
    totalPages: number;
  }>(
    `/whatsapp/logs?${logsQueryString}`,
    ["alert-logs", logsQueryString],
    { enabled: tab === "Historial" },
  );
  const logs = logsResponse?.data ?? [];
  const logsTotalPages = logsResponse?.totalPages ?? 1;
  const logsTotal = logsResponse?.total ?? 0;

  // Config (React Query)
  const { data: config, isLoading: configLoading } = useApiQuery<WhatsAppConfig>(
    "/whatsapp/config",
    ["whatsapp-config"],
    { enabled: tab === "Configuracion" },
  );
  const [configForm, setConfigForm] = useState({
    provider: "mock",
    apiKey: "",
    apiSecret: "",
    phoneNumberId: "",
    isActive: false,
  });
  const [configSaving, setConfigSaving] = useState(false);

  // Sync configForm when config data arrives
  useEffect(() => {
    if (config) {
      setConfigForm({
        provider: config.provider || "mock",
        apiKey: config.apiKey || "",
        apiSecret: config.apiSecret || "",
        phoneNumberId: config.phoneNumberId || "",
        isActive: config.isActive ?? false,
      });
    }
  }, [config]);

  // Templates (React Query)
  const { data: templates = {} } = useApiQuery<Record<string, string>>(
    "/whatsapp/templates",
    ["whatsapp-templates"],
  );

  // Checking alerts
  const [checking, setChecking] = useState(false);

  // -------------------------------------------------------------------------
  // Rule CRUD
  // -------------------------------------------------------------------------

  function openNewRule() {
    setEditingRule(null);
    const defaultTemplate = templates["STOCK_LOW"] || "";
    setRuleForm({
      name: "",
      eventType: "STOCK_LOW",
      conditions: {},
      recipients: [{ phone: "", name: "", role: "" }],
      messageTemplate: defaultTemplate,
      isActive: true,
    });
    setRuleModal(true);
  }

  function openEditRule(rule: AlertRule) {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      eventType: rule.eventType,
      conditions: (rule.conditions as Record<string, any>) || {},
      recipients:
        (rule.recipients as Recipient[])?.length > 0
          ? (rule.recipients as Recipient[])
          : [{ phone: "", name: "", role: "" }],
      messageTemplate: rule.messageTemplate,
      isActive: rule.isActive,
    });
    setRuleModal(true);
  }

  async function saveRule() {
    if (!ruleForm.name.trim()) {
      toast("El nombre es requerido", "error");
      return;
    }
    if (!ruleForm.messageTemplate.trim()) {
      toast("La plantilla de mensaje es requerida", "error");
      return;
    }
    const validRecipients = ruleForm.recipients.filter(
      (r) => r.phone.trim() && r.name.trim(),
    );
    if (validRecipients.length === 0) {
      toast("Agrega al menos un destinatario", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: ruleForm.name.trim(),
        eventType: ruleForm.eventType,
        conditions: ruleForm.conditions,
        recipients: validRecipients,
        messageTemplate: ruleForm.messageTemplate,
        isActive: ruleForm.isActive,
      };

      if (editingRule) {
        await authFetch("patch", `/whatsapp/rules/${editingRule.id}`, payload);
        toast("Regla actualizada");
      } else {
        await authFetch("post", "/whatsapp/rules", payload);
        toast("Regla creada");
      }

      setRuleModal(false);
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    } catch {
      toast("Error al guardar regla", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: AlertRule) {
    try {
      await authFetch("patch", `/whatsapp/rules/${rule.id}`, {
        isActive: !rule.isActive,
      });
      toast(rule.isActive ? "Regla desactivada" : "Regla activada");
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    } catch {
      toast("Error al cambiar estado", "error");
    }
  }

  async function deleteRule(rule: AlertRule) {
    if (!confirm(`Desactivar regla "${rule.name}"?`)) return;
    try {
      await authFetch("delete", `/whatsapp/rules/${rule.id}`);
      toast("Regla desactivada");
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    } catch {
      toast("Error al desactivar regla", "error");
    }
  }

  async function testRule(rule: AlertRule) {
    setTestingRuleId(rule.id);
    try {
      const res = await authFetch<{ results: any[]; message: string }>(
        "post",
        `/whatsapp/rules/${rule.id}/test`,
      );
      setPreviewMessage(res.message || "");
      setPreviewModal(true);
      toast(
        `Test enviado a ${res.results?.length || 0} destinatario(s)`,
        "success",
      );
    } catch {
      toast("Error al enviar test", "error");
    } finally {
      setTestingRuleId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Check alerts
  // -------------------------------------------------------------------------

  async function checkAlerts() {
    setChecking(true);
    try {
      const res = await authFetch<{
        stockAlerts: { triggered: number; lowStockCount?: number };
        expirationAlerts: { triggered: number };
        dailySummary: { triggered: number };
      }>("post", "/whatsapp/check-alerts");

      const total =
        (res.stockAlerts?.triggered || 0) +
        (res.expirationAlerts?.triggered || 0) +
        (res.dailySummary?.triggered || 0);

      toast(
        total > 0
          ? `${total} alerta(s) disparada(s)`
          : "Sin alertas pendientes",
        total > 0 ? "success" : "info",
      );
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
      if (tab === "Historial") queryClient.invalidateQueries({ queryKey: ["alert-logs"] });
    } catch {
      toast("Error al verificar alertas", "error");
    } finally {
      setChecking(false);
    }
  }

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------

  async function saveConfig() {
    setConfigSaving(true);
    try {
      await authFetch("put", "/whatsapp/config", configForm);
      toast("Configuracion guardada");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] });
    } catch {
      toast("Error al guardar configuracion", "error");
    } finally {
      setConfigSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Recipient helpers
  // -------------------------------------------------------------------------

  function addRecipient() {
    setRuleForm((f) => ({
      ...f,
      recipients: [...f.recipients, { phone: "", name: "", role: "" }],
    }));
  }

  function removeRecipient(idx: number) {
    setRuleForm((f) => ({
      ...f,
      recipients: f.recipients.filter((_, i) => i !== idx),
    }));
  }

  function updateRecipient(
    idx: number,
    field: keyof Recipient,
    value: string,
  ) {
    setRuleForm((f) => ({
      ...f,
      recipients: f.recipients.map((r, i) =>
        i === idx ? { ...r, [field]: value } : r,
      ),
    }));
  }

  // -------------------------------------------------------------------------
  // When event type changes, auto-fill template
  // -------------------------------------------------------------------------

  function handleEventTypeChange(eventType: string) {
    const tpl = templates[eventType] || "";
    setRuleForm((f) => ({
      ...f,
      eventType,
      messageTemplate: f.messageTemplate ? f.messageTemplate : tpl,
      conditions: {},
    }));
  }

  // -------------------------------------------------------------------------
  // Format helpers
  // -------------------------------------------------------------------------

  function formatDate(d: string | null) {
    if (!d) return "-";
    return new Date(d).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function truncate(str: string, max: number) {
    if (str.length <= max) return str;
    return str.slice(0, max) + "...";
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alertas WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configura reglas de alerta y notificaciones por WhatsApp
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={checkAlerts}
            disabled={checking}
          >
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Verificando..." : "Verificar Alertas"}
          </Button>
          {tab === "Reglas de Alerta" && (
            <Button onClick={openNewRule}>
              <Plus className="h-4 w-4" />
              Nueva Regla
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => {
          const Icon = TAB_ICONS[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t}
            </button>
          );
        })}
      </div>

      {/* Tab: Reglas de Alerta */}
      {tab === "Reglas de Alerta" && (
        <DataTable
          columns={[
            {
              key: "name",
              header: "Nombre",
              render: (r: AlertRule) => (
                <span className="font-medium">{r.name}</span>
              ),
            },
            {
              key: "eventType",
              header: "Evento",
              render: (r: AlertRule) => (
                <StatusBadge
                  label={EVENT_LABEL[r.eventType] || r.eventType}
                  variant="blue"
                />
              ),
            },
            {
              key: "recipients",
              header: "Destinatarios",
              render: (r: AlertRule) => {
                const count = (r.recipients as Recipient[])?.length || 0;
                return (
                  <span className="text-gray-600">{count} destinatario{count !== 1 ? "s" : ""}</span>
                );
              },
            },
            {
              key: "lastTriggeredAt",
              header: "Ultima ejecucion",
              render: (r: AlertRule) => (
                <span className="text-gray-500 text-xs">
                  {formatDate(r.lastTriggeredAt)}
                </span>
              ),
            },
            {
              key: "isActive",
              header: "Estado",
              render: (r: AlertRule) => (
                <StatusBadge
                  label={r.isActive ? "Activa" : "Inactiva"}
                  variant={r.isActive ? "green" : "red"}
                />
              ),
            },
            {
              key: "actions",
              header: "Acciones",
              render: (r: AlertRule) => (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      testRule(r);
                    }}
                    disabled={testingRuleId === r.id}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50"
                    title="Enviar test"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditRule(r);
                    }}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRule(r);
                    }}
                    className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
                      r.isActive
                        ? "text-green-600 hover:text-red-500"
                        : "text-gray-400 hover:text-green-600"
                    }`}
                    title={r.isActive ? "Desactivar" : "Activar"}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRule(r);
                    }}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ]}
          data={rules}
          loading={rulesLoading}
          emptyMessage="No hay reglas de alerta configuradas"
        />
      )}

      {/* Tab: Historial */}
      {tab === "Historial" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-48">
              <Select
                value={logFilterRule}
                onChange={(e) => {
                  setLogFilterRule(e.target.value);
                  setLogsPage(1);
                }}
              >
                <option value="">Todas las reglas</option>
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select
                value={logFilterStatus}
                onChange={(e) => {
                  setLogFilterStatus(e.target.value);
                  setLogsPage(1);
                }}
              >
                <option value="">Todos los estados</option>
                <option value="SENT">Enviado</option>
                <option value="FAILED">Fallido</option>
                <option value="PENDING">Pendiente</option>
              </Select>
            </div>
            <span className="text-sm text-gray-500">
              {logsTotal} registro{logsTotal !== 1 ? "s" : ""}
            </span>
          </div>

          <DataTable
            columns={[
              {
                key: "createdAt",
                header: "Fecha",
                render: (l: AlertLog) => (
                  <span className="text-xs text-gray-600">
                    {formatDate(l.createdAt)}
                  </span>
                ),
              },
              {
                key: "alertRule",
                header: "Regla",
                render: (l: AlertLog) => (
                  <div>
                    <span className="font-medium text-sm">
                      {l.alertRule?.name || "-"}
                    </span>
                    {l.alertRule?.eventType && (
                      <span className="ml-2">
                        <StatusBadge
                          label={EVENT_LABEL[l.alertRule.eventType] || l.alertRule.eventType}
                          variant="blue"
                        />
                      </span>
                    )}
                  </div>
                ),
              },
              {
                key: "recipient",
                header: "Destinatario",
                render: (l: AlertLog) => (
                  <span className="text-sm">{l.recipient}</span>
                ),
              },
              {
                key: "status",
                header: "Estado",
                render: (l: AlertLog) => (
                  <StatusBadge
                    label={l.status}
                    variant={STATUS_VARIANT[l.status] || "gray"}
                  />
                ),
              },
              {
                key: "message",
                header: "Mensaje",
                render: (l: AlertLog) => (
                  <span
                    className="text-xs text-gray-500 cursor-pointer hover:text-gray-700"
                    title={l.message}
                  >
                    {truncate(l.message, 60)}
                  </span>
                ),
              },
            ]}
            data={logs}
            loading={logsLoading}
            emptyMessage="No hay registros de alertas"
          />

          {/* Pagination */}
          {logsTotalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                disabled={logsPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-600">
                Pagina {logsPage} de {logsTotalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLogsPage((p) => Math.min(logsTotalPages, p + 1))
                }
                disabled={logsPage >= logsTotalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Configuracion */}
      {tab === "Configuracion" && (
        <div className="max-w-xl space-y-6">
          {configLoading ? (
            <div className="text-center py-8 text-gray-400">Cargando...</div>
          ) : (
            <>
              <div className="border rounded-lg p-6 space-y-4 bg-white">
                <h3 className="text-lg font-semibold">Proveedor WhatsApp</h3>

                <FormField label="Proveedor">
                  <Select
                    value={configForm.provider}
                    onChange={(e) =>
                      setConfigForm((f) => ({ ...f, provider: e.target.value }))
                    }
                  >
                    <option value="mock">Mock (desarrollo)</option>
                    <option value="twilio">Twilio</option>
                    <option value="meta">Meta WhatsApp Business</option>
                  </Select>
                </FormField>

                {configForm.provider !== "mock" && (
                  <>
                    <FormField label="API Key">
                      <Input
                        type="password"
                        value={configForm.apiKey}
                        onChange={(e) =>
                          setConfigForm((f) => ({
                            ...f,
                            apiKey: e.target.value,
                          }))
                        }
                        placeholder="Tu API key"
                      />
                    </FormField>

                    <FormField label="API Secret">
                      <Input
                        type="password"
                        value={configForm.apiSecret}
                        onChange={(e) =>
                          setConfigForm((f) => ({
                            ...f,
                            apiSecret: e.target.value,
                          }))
                        }
                        placeholder="Tu API secret"
                      />
                    </FormField>

                    <FormField label="Phone Number ID">
                      <Input
                        value={configForm.phoneNumberId}
                        onChange={(e) =>
                          setConfigForm((f) => ({
                            ...f,
                            phoneNumberId: e.target.value,
                          }))
                        }
                        placeholder="ID del numero de telefono"
                      />
                    </FormField>
                  </>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={configForm.isActive}
                      onChange={(e) =>
                        setConfigForm((f) => ({
                          ...f,
                          isActive: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span className="text-sm font-medium">
                      WhatsApp activo
                    </span>
                  </label>
                  <StatusBadge
                    label={configForm.isActive ? "Activo" : "Inactivo"}
                    variant={configForm.isActive ? "green" : "red"}
                  />
                </div>

                {configForm.provider === "mock" && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                    En modo mock los mensajes se registran en el historial pero
                    no se envian realmente. Ideal para desarrollo y pruebas.
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={saveConfig} disabled={configSaving}>
                  {configSaving ? "Guardando..." : "Guardar Configuracion"}
                </Button>
                {config?.updatedAt && (
                  <span className="text-xs text-gray-400">
                    Ultima actualizacion: {formatDate(config.updatedAt)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal: New / Edit Rule */}
      <Modal
        open={ruleModal}
        onClose={() => setRuleModal(false)}
        title={editingRule ? "Editar Regla" : "Nueva Regla de Alerta"}
        wide
      >
        <div className="space-y-4">
          <FormField label="Nombre" required>
            <Input
              value={ruleForm.name}
              onChange={(e) =>
                setRuleForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Ej: Alerta stock bajo CEDIS"
            />
          </FormField>

          <FormField label="Tipo de Evento" required>
            <Select
              value={ruleForm.eventType}
              onChange={(e) => handleEventTypeChange(e.target.value)}
            >
              {EVENT_TYPES.map((et) => (
                <option key={et.value} value={et.value}>
                  {et.label}
                </option>
              ))}
            </Select>
          </FormField>

          {/* Dynamic conditions */}
          {(ruleForm.eventType === "LOT_EXPIRING") && (
            <FormField label="Dias de anticipacion">
              <Input
                type="number"
                min={1}
                max={90}
                value={ruleForm.conditions.daysAhead ?? 7}
                onChange={(e) =>
                  setRuleForm((f) => ({
                    ...f,
                    conditions: {
                      ...f.conditions,
                      daysAhead: parseInt(e.target.value) || 7,
                    },
                  }))
                }
                placeholder="7"
              />
            </FormField>
          )}

          {/* Recipients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">
                Destinatarios <span className="text-destructive">*</span>
              </label>
              <Button variant="ghost" size="sm" onClick={addRecipient}>
                <Plus className="h-3 w-3" /> Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {ruleForm.recipients.map((r, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={r.name}
                    onChange={(e) =>
                      updateRecipient(idx, "name", e.target.value)
                    }
                    placeholder="Nombre"
                    className="flex-1"
                  />
                  <Input
                    value={r.phone}
                    onChange={(e) =>
                      updateRecipient(idx, "phone", e.target.value)
                    }
                    placeholder="+52 55 1234 5678"
                    className="flex-1"
                  />
                  <Input
                    value={r.role || ""}
                    onChange={(e) =>
                      updateRecipient(idx, "role", e.target.value)
                    }
                    placeholder="Rol (opcional)"
                    className="w-32"
                  />
                  {ruleForm.recipients.length > 1 && (
                    <button
                      onClick={() => removeRecipient(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Message template */}
          <FormField label="Plantilla de Mensaje" required>
            <Textarea
              value={ruleForm.messageTemplate}
              onChange={(e) =>
                setRuleForm((f) => ({
                  ...f,
                  messageTemplate: e.target.value,
                }))
              }
              rows={6}
              placeholder="Escribe tu plantilla con variables {{variable}}"
            />
          </FormField>

          {/* Variable hints */}
          {EVENT_VARIABLES[ruleForm.eventType] && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-600 mb-1">
                Variables disponibles:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_VARIABLES[ruleForm.eventType].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() =>
                      setRuleForm((f) => ({
                        ...f,
                        messageTemplate: f.messageTemplate + `{{${v}}}`,
                      }))
                    }
                    className="px-2 py-0.5 bg-white border rounded text-xs text-gray-700 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                Usa *texto* para negritas y _texto_ para cursiva en WhatsApp
              </p>
            </div>
          )}

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ruleForm.isActive}
              onChange={(e) =>
                setRuleForm((f) => ({ ...f, isActive: e.target.checked }))
              }
              className="rounded"
            />
            <span className="text-sm">Regla activa</span>
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setRuleModal(false)}>
              Cancelar
            </Button>
            <Button onClick={saveRule} disabled={saving}>
              {saving
                ? "Guardando..."
                : editingRule
                  ? "Actualizar Regla"
                  : "Crear Regla"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Preview Test Message */}
      <Modal
        open={previewModal}
        onClose={() => setPreviewModal(false)}
        title="Vista Previa del Mensaje"
      >
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <MessageSquare className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <pre className="text-sm whitespace-pre-wrap font-sans text-gray-800 flex-1">
                {previewMessage}
              </pre>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Este es el mensaje que se envia como test a los destinatarios.
          </p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setPreviewModal(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
