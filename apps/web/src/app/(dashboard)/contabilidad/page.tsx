"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  FileSpreadsheet,
  CheckCircle,
  RotateCcw,
  Wand2,
  FileCheck,
  AlertCircle,
  Loader2,
  Download,
  Eye,
  FileText,
  Calculator,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, Input, Select } from "@/components/ui/form-field";

// --------------- types ---------------

interface Account {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  nature: "DEBIT" | "CREDIT";
  parentAccountId?: string | null;
  satGroupCode?: string | null;
  isDetail: boolean;
}

interface JournalLine {
  id?: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

interface JournalEntry {
  id: string;
  entryDate: string;
  type: "DIARIO" | "INGRESO" | "EGRESO";
  description: string;
  status: "DRAFT" | "POSTED" | "REVERSED";
  branchId?: string | null;
  lines?: JournalLine[];
}

interface Branch {
  id: string;
  name: string;
}

interface PendingEvent {
  id: string;
  type: string;
  saleSource?: string;
  reference: string;
  amount: number;
  date: string;
  branchName?: string;
}

interface PendingSummary {
  purchases: number;
  posSales: number;
  corntechSales: number;
  payrolls: number;
  payments: number;
  total: number;
}

interface PendingResponse {
  summary: PendingSummary;
  events: PendingEvent[];
}

interface AutoEntry extends JournalEntry {
  referenceType?: string;
  referenceId?: string;
  branch?: { name: string } | null;
  lines?: Array<JournalLine & { account?: { code: string; name: string } }>;
}

interface BatchResult {
  total: number;
  success: number;
  failed: number;
  results: Array<{
    type: string;
    referenceId: string;
    success: boolean;
    entryId?: string;
    error?: string;
  }>;
}

interface DiotRecord {
  supplierRfc: string;
  supplierName: string;
  operationType: string;
  totalPaid: number;
  iva16: number;
  iva0: number;
  exempt: number;
  withheldIva: number;
  withheldIsr: number;
}

interface DiotSummary {
  totalSuppliers: number;
  totalAmount: number;
  totalIva16: number;
  totalIva0: number;
  totalExempt: number;
  totalWithheldIva: number;
  totalWithheldIsr: number;
}

interface DiotHistoryItem {
  year: number;
  month: number;
  generatedAt: string;
  recordCount: number;
  totalAmount: number;
  status: string;
}

interface IvaCalculation {
  ivaCausado: number;
  ivaAcreditable: number;
  ivaRetenido: number;
  ivaPagar: number;
  ivaFavor: number;
  details: { ingresos: number; gastos: number; retenciones: number };
  status?: string;
  filedAt?: string | null;
  filingReference?: string | null;
}

interface IsrCalculation {
  ingresosAcumulados: number;
  deduccionesAcumuladas: number;
  utilidadFiscal: number;
  isrCausado: number;
  isrPagadoPrevio: number;
  isrPagar: number;
  details: {
    ingresosMensuales: Array<{ month: number; amount: number }>;
    deduccionesMensuales: Array<{ month: number; amount: number }>;
  };
  status?: string;
  filedAt?: string | null;
  filingReference?: string | null;
}

interface DeclarationSummary {
  year: number;
  month: number;
  iva: IvaCalculation;
  isr: IsrCalculation;
}

interface AnnualMonth {
  month: number;
  iva: IvaCalculation & { status: string; filedAt: string | null };
  isr: IsrCalculation & { status: string; filedAt: string | null };
}

interface AnnualSummary {
  year: number;
  months: AnnualMonth[];
}

interface TaxDeclarationHistory {
  id: string;
  year: number;
  month: number;
  type: string;
  status: string;
  amount: number;
  filedAt: string | null;
  filingReference: string | null;
}

// --------------- constants ---------------

const TABS = [
  "Catalogo de Cuentas",
  "Polizas",
  "Polizas Automaticas",
  "Balanza de Comprobacion",
  "Estados Financieros",
  "DIOT",
  "Declaraciones",
];

const TYPE_LABELS: Record<Account["type"], string> = {
  ASSET: "Activo",
  LIABILITY: "Pasivo",
  EQUITY: "Capital",
  REVENUE: "Ingreso",
  EXPENSE: "Gasto",
};

const NATURE_LABELS: Record<Account["nature"], string> = {
  DEBIT: "Deudora",
  CREDIT: "Acreedora",
};

const STATUS_VARIANT: Record<JournalEntry["status"], "gray" | "green" | "red"> = {
  DRAFT: "gray",
  POSTED: "green",
  REVERSED: "red",
};

const STATUS_LABEL: Record<JournalEntry["status"], string> = {
  DRAFT: "Borrador",
  POSTED: "Publicada",
  REVERSED: "Reversada",
};

const ENTRY_TYPE_LABELS: Record<JournalEntry["type"], string> = {
  DIARIO: "Diario",
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  purchase: "Compra",
  sale: "Venta",
  payroll: "Nomina",
  payment: "Pago",
  bank_transaction: "Transaccion Bancaria",
};

const EVENT_TYPE_VARIANT: Record<string, string> = {
  purchase: "blue",
  sale: "green",
  payroll: "purple",
  payment: "yellow",
  bank_transaction: "gray",
};

const REF_TYPE_LABELS: Record<string, string> = {
  purchaseOrder: "Compra",
  posSale: "Venta POS",
  corntechSale: "Venta Corntech",
  payrollPeriod: "Nomina",
  payment: "Pago",
  bankTransaction: "Transaccion Bancaria",
};

const DIOT_OP_LABELS: Record<string, string> = {
  "85": "Servicios profesionales",
  "06": "Compra de bienes",
  "03": "Arrendamiento",
};

// --------------- helpers ---------------

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function fmt(n: number) {
  return safeNum(n).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

const emptyAccountForm = (): Omit<Account, "id"> => ({
  code: "",
  name: "",
  type: "ASSET",
  nature: "DEBIT",
  parentAccountId: null,
  satGroupCode: "",
  isDetail: true,
});

const emptyJournalForm = () => ({
  entryDate: new Date().toISOString().slice(0, 10),
  type: "DIARIO" as JournalEntry["type"],
  description: "",
  branchId: "" as string,
  lines: [{ accountId: "", debit: 0, credit: 0, description: "" }] as JournalLine[],
});

// ============================================================
// PAGE COMPONENT
// ============================================================

export default function ContabilidadPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(TABS[0]);

  // ---- shared data ----
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);

  // ---- account modal ----
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm());
  const [accountSaving, setAccountSaving] = useState(false);

  // ---- delete confirm ----
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---- journal modal ----
  const [journalModalOpen, setJournalModalOpen] = useState(false);
  const [journalForm, setJournalForm] = useState(emptyJournalForm());
  const [journalSaving, setJournalSaving] = useState(false);

  // ---- balanza selectors ----
  const currentYear = new Date().getFullYear();
  const [balanzaYear, setBalanzaYear] = useState(currentYear);
  const [balanzaMonth, setBalanzaMonth] = useState(new Date().getMonth() + 1);

  // ---- auto-polizas ----
  const [pendingData, setPendingData] = useState<PendingResponse | null>(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [autoEntries, setAutoEntries] = useState<AutoEntry[]>([]);
  const [autoEntriesLoading, setAutoEntriesLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [autoDetailEntry, setAutoDetailEntry] = useState<AutoEntry | null>(null);

  // ---- DIOT ----
  const [diotYear, setDiotYear] = useState(currentYear);
  const [diotMonth, setDiotMonth] = useState(new Date().getMonth() + 1);
  const [diotRecords, setDiotRecords] = useState<DiotRecord[]>([]);
  const [diotSummary, setDiotSummary] = useState<DiotSummary | null>(null);
  const [diotHistory, setDiotHistory] = useState<DiotHistoryItem[]>([]);
  const [diotPreviewLoading, setDiotPreviewLoading] = useState(false);
  const [diotGenerating, setDiotGenerating] = useState(false);
  const [diotDownloading, setDiotDownloading] = useState(false);
  const [diotHistoryLoading, setDiotHistoryLoading] = useState(false);

  // ---- Declaraciones ----
  const [declYear, setDeclYear] = useState(currentYear);
  const [declMonth, setDeclMonth] = useState(new Date().getMonth() + 1);
  const [declSummary, setDeclSummary] = useState<DeclarationSummary | null>(null);
  const [declSummaryLoading, setDeclSummaryLoading] = useState(false);
  const [declAnnual, setDeclAnnual] = useState<AnnualSummary | null>(null);
  const [declAnnualLoading, setDeclAnnualLoading] = useState(false);
  const [declFilingModalOpen, setDeclFilingModalOpen] = useState(false);
  const [declFilingType, setDeclFilingType] = useState<string>("");
  const [declFilingRef, setDeclFilingRef] = useState("");
  const [declFilingSaving, setDeclFilingSaving] = useState(false);

  // ============================================================
  // FETCH helpers
  // ============================================================

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const data = await authFetch<Account[]>("get", "/contabilidad/accounts");
      const sorted = (Array.isArray(data) ? data : []).sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true })
      );
      setAccounts(sorted);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  }, [authFetch]);

  const fetchEntries = useCallback(async () => {
    setEntriesLoading(true);
    try {
      const data = await authFetch<JournalEntry[]>("get", "/contabilidad/journal-entries");
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }, [authFetch]);

  const fetchBranches = useCallback(async () => {
    try {
      const data = await authFetch<Branch[]>("get", "/branches");
      setBranches(Array.isArray(data) ? data : []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setBranches([]);
    }
  }, [authFetch]);

  const fetchPendingEvents = useCallback(async () => {
    setPendingLoading(true);
    try {
      const data = await authFetch<PendingResponse>("get", "/contabilidad/auto-polizas/pending");
      setPendingData(data && typeof data === "object" ? data : null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setPendingData(null);
    } finally {
      setPendingLoading(false);
    }
  }, [authFetch]);

  const fetchAutoEntries = useCallback(async () => {
    setAutoEntriesLoading(true);
    try {
      const data = await authFetch<AutoEntry[]>("get", "/contabilidad/auto-polizas/recent");
      setAutoEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setAutoEntries([]);
    } finally {
      setAutoEntriesLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (authLoading) return;
    fetchAccounts();
    fetchEntries();
    fetchBranches();
    fetchPendingEvents();
    fetchAutoEntries();
  }, [authLoading, fetchAccounts, fetchEntries, fetchBranches, fetchPendingEvents, fetchAutoEntries]);

  // ============================================================
  // ACCOUNT CRUD
  // ============================================================

  function openCreateAccount() {
    setEditingAccount(null);
    setAccountForm(emptyAccountForm());
    setAccountModalOpen(true);
  }

  function openEditAccount(acc: Account) {
    setEditingAccount(acc);
    setAccountForm({
      code: acc.code,
      name: acc.name,
      type: acc.type,
      nature: acc.nature,
      parentAccountId: acc.parentAccountId ?? null,
      satGroupCode: acc.satGroupCode ?? "",
      isDetail: acc.isDetail,
    });
    setAccountModalOpen(true);
  }

  async function saveAccount() {
    setAccountSaving(true);
    try {
      const payload = {
        ...accountForm,
        parentAccountId: accountForm.parentAccountId || null,
        satGroupCode: accountForm.satGroupCode || null,
      };
      if (editingAccount) {
        await authFetch("patch", `/contabilidad/accounts/${editingAccount.id}`, payload);
      } else {
        await authFetch("post", "/contabilidad/accounts", payload);
      }
      setAccountModalOpen(false);
      fetchAccounts();
    } catch (err: any) {
      alert(err?.message || "Error al guardar cuenta");
    } finally {
      setAccountSaving(false);
    }
  }

  async function deleteAccount() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await authFetch("delete", `/contabilidad/accounts/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchAccounts();
    } catch (err: any) {
      alert(err?.message || "Error al eliminar cuenta");
    } finally {
      setDeleting(false);
    }
  }

  // ============================================================
  // JOURNAL ENTRY CRUD
  // ============================================================

  function openCreateEntry() {
    setJournalForm(emptyJournalForm());
    setJournalModalOpen(true);
  }

  async function saveJournalEntry() {
    setJournalSaving(true);
    try {
      const payload = {
        entryDate: journalForm.entryDate,
        type: journalForm.type,
        description: journalForm.description,
        branchId: journalForm.branchId || null,
        lines: journalForm.lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description,
        })),
      };
      await authFetch("post", "/contabilidad/journal-entries", payload);
      setJournalModalOpen(false);
      fetchEntries();
    } catch (err: any) {
      alert(err?.message || "Error al guardar poliza");
    } finally {
      setJournalSaving(false);
    }
  }

  async function postEntry(id: string) {
    try {
      await authFetch("patch", `/contabilidad/journal-entries/${id}/post`);
      fetchEntries();
    } catch (err: any) {
      alert(err?.message || "Error al publicar poliza");
    }
  }

  async function reverseEntry(id: string) {
    try {
      await authFetch("patch", `/contabilidad/journal-entries/${id}/reverse`);
      fetchEntries();
    } catch (err: any) {
      alert(err?.message || "Error al reversar poliza");
    }
  }

  // ============================================================
  // AUTO-POLIZAS ACTIONS
  // ============================================================

  async function generateSinglePoliza(event: PendingEvent) {
    setGenerating(event.id);
    try {
      await authFetch("post", "/contabilidad/auto-polizas/generate", {
        type: event.type,
        referenceId: event.id,
        saleSource: event.saleSource || undefined,
      });
      fetchPendingEvents();
      fetchAutoEntries();
      fetchEntries();
    } catch (err: any) {
      alert(err?.message || "Error al generar poliza");
    } finally {
      setGenerating(null);
    }
  }

  async function generateAllPolizas() {
    setBatchGenerating(true);
    setBatchResult(null);
    try {
      const result = await authFetch<BatchResult>(
        "post",
        "/contabilidad/auto-polizas/generate-batch",
        {}
      );
      setBatchResult(result);
      fetchPendingEvents();
      fetchAutoEntries();
      fetchEntries();
    } catch (err: any) {
      alert(err?.message || "Error al generar polizas en lote");
    } finally {
      setBatchGenerating(false);
    }
  }

  // ============================================================
  // DIOT ACTIONS
  // ============================================================

  async function fetchDiotPreview() {
    setDiotPreviewLoading(true);
    try {
      const [records, summary] = await Promise.all([
        authFetch<DiotRecord[]>(
          "get",
          `/contabilidad/diot/preview?year=${diotYear}&month=${diotMonth}`,
        ),
        authFetch<DiotSummary>(
          "get",
          `/contabilidad/diot/summary?year=${diotYear}&month=${diotMonth}`,
        ),
      ]);
      setDiotRecords(Array.isArray(records) ? records : []);
      setDiotSummary(summary && typeof summary === "object" ? summary : null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setDiotRecords([]);
      setDiotSummary(null);
    } finally {
      setDiotPreviewLoading(false);
    }
  }

  async function fetchDiotHistory() {
    setDiotHistoryLoading(true);
    try {
      const data = await authFetch<DiotHistoryItem[]>(
        "get",
        "/contabilidad/diot/history",
      );
      setDiotHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setDiotHistory([]);
    } finally {
      setDiotHistoryLoading(false);
    }
  }

  async function generateDiot() {
    setDiotGenerating(true);
    try {
      await authFetch(
        "post",
        `/contabilidad/diot/generate?year=${diotYear}&month=${diotMonth}`,
      );
      // Refresh preview after generating
      await fetchDiotPreview();
      await fetchDiotHistory();
    } catch (err: any) {
      alert(err?.message || "Error al generar DIOT");
    } finally {
      setDiotGenerating(false);
    }
  }

  async function downloadDiot() {
    setDiotDownloading(true);
    try {
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("token="))
        ?.split("=")[1];
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const url = `${baseUrl}/contabilidad/diot/download?year=${diotYear}&month=${diotMonth}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || token || ""}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message || "Error al descargar DIOT",
        );
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `DIOT_${diotYear}_${String(diotMonth).padStart(2, "0")}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert(err?.message || "Error al descargar DIOT");
    } finally {
      setDiotDownloading(false);
    }
  }

  // ============================================================
  // DECLARATIONS ACTIONS
  // ============================================================

  const fetchDeclSummary = useCallback(async () => {
    setDeclSummaryLoading(true);
    try {
      const data = await authFetch<DeclarationSummary>(
        "get",
        `/contabilidad/declarations/summary?year=${declYear}&month=${declMonth}`,
      );
      setDeclSummary(data && typeof data === "object" ? data : null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setDeclSummary(null);
    } finally {
      setDeclSummaryLoading(false);
    }
  }, [authFetch, declYear, declMonth]);

  const fetchDeclAnnual = useCallback(async () => {
    setDeclAnnualLoading(true);
    try {
      const data = await authFetch<AnnualSummary>(
        "get",
        `/contabilidad/declarations/annual?year=${declYear}`,
      );
      setDeclAnnual(data && typeof data === "object" ? data : null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setDeclAnnual(null);
    } finally {
      setDeclAnnualLoading(false);
    }
  }, [authFetch, declYear]);

  function openFilingModal(type: string) {
    setDeclFilingType(type);
    setDeclFilingRef("");
    setDeclFilingModalOpen(true);
  }

  async function submitFiling() {
    setDeclFilingSaving(true);
    try {
      await authFetch("post", "/contabilidad/declarations/mark-filed", {
        year: declYear,
        month: declMonth,
        type: declFilingType,
        filingReference: declFilingRef || undefined,
      });
      setDeclFilingModalOpen(false);
      fetchDeclSummary();
      fetchDeclAnnual();
    } catch (err: any) {
      alert(err?.message || "Error al marcar como presentada");
    } finally {
      setDeclFilingSaving(false);
    }
  }

  // ---- journal lines helpers ----

  function addLine() {
    setJournalForm((prev) => ({
      ...prev,
      lines: [...prev.lines, { accountId: "", debit: 0, credit: 0, description: "" }],
    }));
  }

  function removeLine(idx: number) {
    setJournalForm((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== idx),
    }));
  }

  function updateLine(idx: number, field: keyof JournalLine, value: string | number) {
    setJournalForm((prev) => ({
      ...prev,
      lines: prev.lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)),
    }));
  }

  const totalDebit = journalForm.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = journalForm.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  // ============================================================
  // COLUMN DEFINITIONS
  // ============================================================

  const accountColumns = [
    { key: "code", header: "Codigo" },
    { key: "name", header: "Nombre" },
    {
      key: "type",
      header: "Tipo",
      render: (row: Account) => (
        <StatusBadge label={TYPE_LABELS[row.type]} variant="blue" />
      ),
    },
    {
      key: "nature",
      header: "Naturaleza",
      render: (row: Account) => (
        <StatusBadge
          label={NATURE_LABELS[row.nature]}
          variant={row.nature === "DEBIT" ? "blue" : "purple"}
        />
      ),
    },
    {
      key: "parentAccountId",
      header: "Cuenta Padre",
      render: (row: Account) => {
        if (!row.parentAccountId) return <span className="text-gray-400">-</span>;
        const parent = accounts.find((a) => a.id === row.parentAccountId);
        return parent ? `${parent.code} - ${parent.name}` : row.parentAccountId;
      },
    },
    {
      key: "isDetail",
      header: "Es Detalle",
      render: (row: Account) =>
        row.isDetail ? (
          <StatusBadge label="Si" variant="green" />
        ) : (
          <StatusBadge label="No" variant="gray" />
        ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (row: Account) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openEditAccount(row);
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
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  const entryColumns = [
    {
      key: "entryDate",
      header: "Fecha",
      render: (row: JournalEntry) => new Date(row.entryDate).toLocaleDateString("es-MX"),
    },
    {
      key: "type",
      header: "Tipo",
      render: (row: JournalEntry) => (
        <StatusBadge label={ENTRY_TYPE_LABELS[row.type]} variant="blue" />
      ),
    },
    { key: "description", header: "Descripcion" },
    {
      key: "status",
      header: "Estado",
      render: (row: JournalEntry) => (
        <StatusBadge label={STATUS_LABEL[row.status]} variant={STATUS_VARIANT[row.status]} />
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (row: JournalEntry) => (
        <div className="flex gap-1">
          {row.status === "DRAFT" && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                postEntry(row.id);
              }}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Publicar
            </Button>
          )}
          {row.status === "POSTED" && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                reverseEntry(row.id);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reversar
            </Button>
          )}
        </div>
      ),
    },
  ];

  // ============================================================
  // BALANZA DATA
  // ============================================================

  // Aggregate debits/credits per account from POSTED journal entries in the selected period
  const balanzaData = useMemo(() => {
    const periodEntries = entries.filter((e) => {
      if (e.status !== "POSTED") return false;
      const d = new Date(e.entryDate);
      return d.getFullYear() === balanzaYear && d.getMonth() + 1 === balanzaMonth;
    });

    const map = new Map<string, { debit: number; credit: number }>();
    for (const entry of periodEntries) {
      for (const line of entry.lines || []) {
        const prev = map.get(line.accountId) || { debit: 0, credit: 0 };
        prev.debit += safeNum(line.debit);
        prev.credit += safeNum(line.credit);
        map.set(line.accountId, prev);
      }
    }

    return accounts
      .filter((a) => a.isDetail)
      .map((a) => {
        const totals = map.get(a.id) || { debit: 0, credit: 0 };
        const saldoFinal = a.nature === "DEBIT"
          ? totals.debit - totals.credit
          : totals.credit - totals.debit;
        return { ...a, cargos: totals.debit, abonos: totals.credit, saldoFinal };
      })
      .filter((a) => a.cargos > 0 || a.abonos > 0);
  }, [entries, accounts, balanzaYear, balanzaMonth]);

  interface BalanzaRow { code: string; name: string; cargos: number; abonos: number; saldoFinal: number }

  const balanzaColumns = [
    { key: "code", header: "Codigo" },
    { key: "name", header: "Nombre" },
    {
      key: "saldoInicial",
      header: "Saldo Inicial",
      render: () => fmt(0),
      className: "text-right",
    },
    { key: "cargos", header: "Cargos", render: (r: BalanzaRow) => fmt(r.cargos), className: "text-right" },
    { key: "abonos", header: "Abonos", render: (r: BalanzaRow) => fmt(r.abonos), className: "text-right" },
    { key: "saldoFinal", header: "Saldo Final", render: (r: BalanzaRow) => fmt(r.saldoFinal), className: "text-right" },
  ];

  const months = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  // ============================================================
  // ESTADOS FINANCIEROS helpers
  // ============================================================

  function groupByType(t: Account["type"]) {
    return accounts.filter((a) => a.type === t);
  }

  // ============================================================
  // RENDER
  // ============================================================

  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Contabilidad</h1>
        <div className="flex gap-3">
          {activeTab === TABS[0] && (
            <Button variant="primary" onClick={openCreateAccount}>
              <Plus className="h-4 w-4" />
              Nueva Cuenta
            </Button>
          )}
          {activeTab === TABS[1] && (
            <Button variant="primary" onClick={openCreateEntry}>
              <Plus className="h-4 w-4" />
              Nueva Poliza
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
                  ? "border-black text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {/* ================== CATALOGO DE CUENTAS ================== */}
        {activeTab === TABS[0] && (
          <DataTable
            columns={accountColumns}
            data={accounts}
            loading={accountsLoading}
            emptyMessage="No hay cuentas registradas"
          />
        )}

        {/* ================== POLIZAS ================== */}
        {activeTab === TABS[1] && (
          <DataTable
            columns={entryColumns}
            data={entries}
            loading={entriesLoading}
            emptyMessage="No hay polizas registradas"
          />
        )}

        {/* ================== POLIZAS AUTOMATICAS ================== */}
        {activeTab === TABS[2] && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                {
                  label: "Compras sin poliza",
                  count: pendingData?.summary.purchases ?? 0,
                  icon: <AlertCircle className="h-5 w-5 text-blue-500" />,
                },
                {
                  label: "Ventas sin poliza",
                  count:
                    (pendingData?.summary.posSales ?? 0) +
                    (pendingData?.summary.corntechSales ?? 0),
                  icon: <AlertCircle className="h-5 w-5 text-green-500" />,
                },
                {
                  label: "Nominas sin poliza",
                  count: pendingData?.summary.payrolls ?? 0,
                  icon: <AlertCircle className="h-5 w-5 text-purple-500" />,
                },
                {
                  label: "Pagos sin poliza",
                  count: pendingData?.summary.payments ?? 0,
                  icon: <AlertCircle className="h-5 w-5 text-yellow-500" />,
                },
                {
                  label: "Total pendientes",
                  count: pendingData?.summary.total ?? 0,
                  icon: <FileCheck className="h-5 w-5 text-gray-500" />,
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="border rounded-xl bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {card.icon}
                    <span className="text-xs text-gray-500 font-medium">
                      {card.label}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {pendingLoading ? "-" : card.count}
                  </p>
                </div>
              ))}
            </div>

            {/* Generate All Button + Batch Result */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Eventos Pendientes
              </h3>
              <Button
                variant="primary"
                onClick={generateAllPolizas}
                disabled={
                  batchGenerating ||
                  !pendingData ||
                  pendingData.summary.total === 0
                }
              >
                {batchGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {batchGenerating ? "Generando..." : "Generar Todas"}
              </Button>
            </div>

            {batchResult && (
              <div
                className={`rounded-lg border p-4 text-sm ${
                  batchResult.failed > 0
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-green-50 border-green-200"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {batchResult.failed > 0 ? (
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                  ) : (
                    <FileCheck className="h-4 w-4 text-green-600" />
                  )}
                  <span className="font-medium">
                    Resultado: {batchResult.success} polizas generadas
                    {batchResult.failed > 0 &&
                      `, ${batchResult.failed} con errores`}
                  </span>
                </div>
                {batchResult.failed > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-yellow-700">
                    {batchResult.results
                      .filter((r) => !r.success)
                      .map((r) => (
                        <li key={r.referenceId}>
                          {EVENT_TYPE_LABELS[r.type] || r.type}:{" "}
                          {r.error}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}

            {/* Pending Events Table */}
            {pendingLoading ? (
              <div className="border rounded-lg p-8 text-center text-gray-500">
                Cargando eventos pendientes...
              </div>
            ) : (
              <DataTable
                columns={[
                  {
                    key: "type",
                    header: "Tipo",
                    render: (row: PendingEvent) => (
                      <StatusBadge
                        label={EVENT_TYPE_LABELS[row.type] || row.type}
                        variant={
                          (EVENT_TYPE_VARIANT[row.type] as any) || "gray"
                        }
                      />
                    ),
                  },
                  { key: "reference", header: "Referencia" },
                  {
                    key: "amount",
                    header: "Monto",
                    render: (row: PendingEvent) => (
                      <span className="font-mono">{fmt(row.amount)}</span>
                    ),
                    className: "text-right",
                  },
                  {
                    key: "date",
                    header: "Fecha",
                    render: (row: PendingEvent) =>
                      new Date(row.date).toLocaleDateString("es-MX"),
                  },
                  {
                    key: "branchName",
                    header: "Sucursal",
                    render: (row: PendingEvent) => (
                      <span className="text-gray-500">
                        {row.branchName || "-"}
                      </span>
                    ),
                  },
                  {
                    key: "actions",
                    header: "Accion",
                    render: (row: PendingEvent) => (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          generateSinglePoliza(row);
                        }}
                        disabled={generating === row.id}
                      >
                        {generating === row.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                        {generating === row.id ? "Generando..." : "Generar"}
                      </Button>
                    ),
                  },
                ]}
                data={pendingData?.events || []}
                emptyMessage="No hay eventos pendientes de poliza"
              />
            )}

            {/* Recently Generated Auto-Entries */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Polizas Generadas Recientemente
              </h3>
              {autoEntriesLoading ? (
                <div className="border rounded-lg p-8 text-center text-gray-500">
                  Cargando...
                </div>
              ) : (
                <DataTable
                  columns={[
                    {
                      key: "entryDate",
                      header: "Fecha",
                      render: (row: AutoEntry) =>
                        new Date(row.entryDate).toLocaleDateString("es-MX"),
                    },
                    {
                      key: "type",
                      header: "Tipo",
                      render: (row: AutoEntry) => (
                        <StatusBadge
                          label={ENTRY_TYPE_LABELS[row.type]}
                          variant="blue"
                        />
                      ),
                    },
                    {
                      key: "referenceType",
                      header: "Origen",
                      render: (row: AutoEntry) => (
                        <StatusBadge
                          label={
                            REF_TYPE_LABELS[row.referenceType || ""] ||
                            row.referenceType ||
                            "-"
                          }
                          variant="gray"
                        />
                      ),
                    },
                    { key: "description", header: "Descripcion" },
                    {
                      key: "totalDebit",
                      header: "Cargo",
                      render: (row: AutoEntry) => {
                        const total = (row.lines || []).reduce(
                          (s, l) => s + safeNum(l.debit),
                          0
                        );
                        return (
                          <span className="font-mono">{fmt(total)}</span>
                        );
                      },
                      className: "text-right",
                    },
                    {
                      key: "totalCredit",
                      header: "Abono",
                      render: (row: AutoEntry) => {
                        const total = (row.lines || []).reduce(
                          (s, l) => s + safeNum(l.credit),
                          0
                        );
                        return (
                          <span className="font-mono">{fmt(total)}</span>
                        );
                      },
                      className: "text-right",
                    },
                    {
                      key: "status",
                      header: "Estado",
                      render: (row: AutoEntry) => (
                        <StatusBadge
                          label={STATUS_LABEL[row.status]}
                          variant={STATUS_VARIANT[row.status]}
                        />
                      ),
                    },
                  ]}
                  data={autoEntries}
                  emptyMessage="No hay polizas automaticas generadas"
                  onRowClick={(row) => setAutoDetailEntry(row)}
                />
              )}
            </div>
          </div>
        )}

        {/* ================== BALANZA DE COMPROBACION ================== */}
        {activeTab === TABS[3] && (
          <div>
            <div className="flex gap-4 mb-4">
              <FormField label="Ano">
                <Select
                  value={balanzaYear}
                  onChange={(e) => setBalanzaYear(Number(e.target.value))}
                >
                  {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Mes">
                <Select
                  value={balanzaMonth}
                  onChange={(e) => setBalanzaMonth(Number(e.target.value))}
                >
                  {months.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <p className="text-sm text-gray-500 mb-2">
              Periodo: {months[balanzaMonth - 1]} {balanzaYear}
            </p>

            <DataTable
              columns={balanzaColumns}
              data={balanzaData}
              loading={accountsLoading || entriesLoading}
              emptyMessage="No hay movimientos en este periodo"
            />
          </div>
        )}

        {/* ================== ESTADOS FINANCIEROS ================== */}
        {activeTab === TABS[4] && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Estado de Resultados */}
            <div className="border rounded-xl bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Estado de Resultados</h3>
              </div>

              <div className="space-y-4">
                {/* Ingresos */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">
                    Ingresos
                  </h4>
                  {groupByType("REVENUE").length === 0 && (
                    <p className="text-xs text-gray-400">Sin cuentas de ingreso</p>
                  )}
                  {groupByType("REVENUE").map((a) => (
                    <div key={a.id} className="flex justify-between text-sm py-1">
                      <span>
                        {a.code} - {a.name}
                      </span>
                      <span className="font-mono">{fmt(0)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t mt-1 pt-1">
                    <span>Total Ingresos</span>
                    <span className="font-mono">{fmt(0)}</span>
                  </div>
                </div>

                {/* Gastos */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">
                    Gastos
                  </h4>
                  {groupByType("EXPENSE").length === 0 && (
                    <p className="text-xs text-gray-400">Sin cuentas de gasto</p>
                  )}
                  {groupByType("EXPENSE").map((a) => (
                    <div key={a.id} className="flex justify-between text-sm py-1">
                      <span>
                        {a.code} - {a.name}
                      </span>
                      <span className="font-mono">{fmt(0)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t mt-1 pt-1">
                    <span>Total Gastos</span>
                    <span className="font-mono">{fmt(0)}</span>
                  </div>
                </div>

                {/* Utilidad */}
                <div className="flex justify-between text-base font-bold border-t-2 pt-2">
                  <span>Utilidad Neta</span>
                  <span className="font-mono">{fmt(0)}</span>
                </div>
              </div>
            </div>

            {/* Estado de Situacion Financiera */}
            <div className="border rounded-xl bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Estado de Situacion Financiera</h3>
              </div>

              <div className="space-y-4">
                {/* Activos */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">
                    Activos
                  </h4>
                  {groupByType("ASSET").length === 0 && (
                    <p className="text-xs text-gray-400">Sin cuentas de activo</p>
                  )}
                  {groupByType("ASSET").map((a) => (
                    <div key={a.id} className="flex justify-between text-sm py-1">
                      <span>
                        {a.code} - {a.name}
                      </span>
                      <span className="font-mono">{fmt(0)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t mt-1 pt-1">
                    <span>Total Activos</span>
                    <span className="font-mono">{fmt(0)}</span>
                  </div>
                </div>

                {/* Pasivos */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">
                    Pasivos
                  </h4>
                  {groupByType("LIABILITY").length === 0 && (
                    <p className="text-xs text-gray-400">Sin cuentas de pasivo</p>
                  )}
                  {groupByType("LIABILITY").map((a) => (
                    <div key={a.id} className="flex justify-between text-sm py-1">
                      <span>
                        {a.code} - {a.name}
                      </span>
                      <span className="font-mono">{fmt(0)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t mt-1 pt-1">
                    <span>Total Pasivos</span>
                    <span className="font-mono">{fmt(0)}</span>
                  </div>
                </div>

                {/* Capital */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">
                    Capital
                  </h4>
                  {groupByType("EQUITY").length === 0 && (
                    <p className="text-xs text-gray-400">Sin cuentas de capital</p>
                  )}
                  {groupByType("EQUITY").map((a) => (
                    <div key={a.id} className="flex justify-between text-sm py-1">
                      <span>
                        {a.code} - {a.name}
                      </span>
                      <span className="font-mono">{fmt(0)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t mt-1 pt-1">
                    <span>Total Capital</span>
                    <span className="font-mono">{fmt(0)}</span>
                  </div>
                </div>

                {/* Pasivo + Capital */}
                <div className="flex justify-between text-base font-bold border-t-2 pt-2">
                  <span>Pasivo + Capital</span>
                  <span className="font-mono">{fmt(0)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================== DIOT ================== */}
        {activeTab === TABS[5] && (
          <div className="space-y-6">
            {/* Period Selector */}
            <div className="flex items-end gap-4">
              <FormField label="Ano">
                <Select
                  value={diotYear}
                  onChange={(e) => setDiotYear(Number(e.target.value))}
                >
                  {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(
                    (y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ),
                  )}
                </Select>
              </FormField>
              <FormField label="Mes">
                <Select
                  value={diotMonth}
                  onChange={(e) => setDiotMonth(Number(e.target.value))}
                >
                  {months.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              </FormField>
              <Button
                variant="outline"
                onClick={fetchDiotPreview}
                disabled={diotPreviewLoading}
              >
                {diotPreviewLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {diotPreviewLoading ? "Cargando..." : "Vista Previa"}
              </Button>
              <Button
                variant="primary"
                onClick={generateDiot}
                disabled={diotGenerating}
              >
                {diotGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {diotGenerating ? "Generando..." : "Generar DIOT"}
              </Button>
              <Button
                variant="outline"
                onClick={downloadDiot}
                disabled={diotDownloading}
              >
                {diotDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {diotDownloading ? "Descargando..." : "Descargar .txt"}
              </Button>
            </div>

            <p className="text-sm text-gray-500">
              Periodo: {months[diotMonth - 1]} {diotYear}
            </p>

            {/* Summary Cards */}
            {diotSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: "Total Proveedores",
                    value: diotSummary.totalSuppliers.toString(),
                    icon: <FileCheck className="h-5 w-5 text-blue-500" />,
                  },
                  {
                    label: "Total Pagado",
                    value: fmt(diotSummary.totalAmount),
                    icon: <Calculator className="h-5 w-5 text-green-500" />,
                  },
                  {
                    label: "IVA Acreditable (16%)",
                    value: fmt(diotSummary.totalIva16),
                    icon: <Calculator className="h-5 w-5 text-purple-500" />,
                  },
                  {
                    label: "Retenciones (IVA + ISR)",
                    value: fmt(
                      diotSummary.totalWithheldIva +
                        diotSummary.totalWithheldIsr,
                    ),
                    icon: <Calculator className="h-5 w-5 text-yellow-500" />,
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="border rounded-xl bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {card.icon}
                      <span className="text-xs text-gray-500 font-medium">
                        {card.label}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {card.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* DIOT Preview Table */}
            {diotPreviewLoading ? (
              <div className="border rounded-lg p-8 text-center text-gray-500">
                Cargando vista previa...
              </div>
            ) : diotRecords.length > 0 ? (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Detalle por Proveedor
                </h3>
                <DataTable
                  columns={[
                    {
                      key: "supplierRfc",
                      header: "RFC",
                      render: (row: DiotRecord) => (
                        <span className="font-mono text-xs">
                          {row.supplierRfc}
                        </span>
                      ),
                    },
                    { key: "supplierName", header: "Proveedor" },
                    {
                      key: "operationType",
                      header: "Tipo Operacion",
                      render: (row: DiotRecord) => (
                        <StatusBadge
                          label={
                            DIOT_OP_LABELS[row.operationType] ||
                            row.operationType
                          }
                          variant="blue"
                        />
                      ),
                    },
                    {
                      key: "totalPaid",
                      header: "Total Pagado",
                      render: (row: DiotRecord) => (
                        <span className="font-mono">{fmt(row.totalPaid)}</span>
                      ),
                      className: "text-right",
                    },
                    {
                      key: "iva16",
                      header: "IVA 16%",
                      render: (row: DiotRecord) => (
                        <span className="font-mono">{fmt(row.iva16)}</span>
                      ),
                      className: "text-right",
                    },
                    {
                      key: "iva0",
                      header: "IVA 0%",
                      render: (row: DiotRecord) => (
                        <span className="font-mono">{fmt(row.iva0)}</span>
                      ),
                      className: "text-right",
                    },
                    {
                      key: "exempt",
                      header: "Exento",
                      render: (row: DiotRecord) => (
                        <span className="font-mono">{fmt(row.exempt)}</span>
                      ),
                      className: "text-right",
                    },
                    {
                      key: "withheldIsr",
                      header: "ISR Retenido",
                      render: (row: DiotRecord) => (
                        <span className="font-mono">
                          {fmt(row.withheldIsr)}
                        </span>
                      ),
                      className: "text-right",
                    },
                    {
                      key: "withheldIva",
                      header: "IVA Retenido",
                      render: (row: DiotRecord) => (
                        <span className="font-mono">
                          {fmt(row.withheldIva)}
                        </span>
                      ),
                      className: "text-right",
                    },
                  ]}
                  data={diotRecords}
                  emptyMessage="Sin registros"
                />
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center text-gray-400">
                Seleccione un periodo y presione &quot;Vista Previa&quot; para ver
                los datos de la DIOT.
              </div>
            )}

            {/* DIOT History */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">
                  Historial de Periodos
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchDiotHistory}
                  disabled={diotHistoryLoading}
                >
                  {diotHistoryLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Actualizar
                </Button>
              </div>
              {diotHistoryLoading ? (
                <div className="border rounded-lg p-8 text-center text-gray-500">
                  Cargando historial...
                </div>
              ) : (
                <DataTable
                  columns={[
                    {
                      key: "period",
                      header: "Periodo",
                      render: (row: DiotHistoryItem) =>
                        `${months[row.month - 1]} ${row.year}`,
                    },
                    {
                      key: "recordCount",
                      header: "Registros",
                      render: (row: DiotHistoryItem) => (
                        <span className="font-mono">{row.recordCount}</span>
                      ),
                    },
                    {
                      key: "totalAmount",
                      header: "Monto Total",
                      render: (row: DiotHistoryItem) => (
                        <span className="font-mono">
                          {fmt(row.totalAmount)}
                        </span>
                      ),
                      className: "text-right",
                    },
                    {
                      key: "status",
                      header: "Estado",
                      render: (row: DiotHistoryItem) => (
                        <StatusBadge
                          label={
                            row.status === "available"
                              ? "Disponible"
                              : row.status
                          }
                          variant={
                            row.status === "available" ? "green" : "gray"
                          }
                        />
                      ),
                    },
                  ]}
                  data={diotHistory}
                  emptyMessage="No hay datos historicos. Presione 'Actualizar' para cargar."
                />
              )}
            </div>
          </div>
        )}

        {/* ================== DECLARACIONES ================== */}
        {activeTab === TABS[6] && (
          <div className="space-y-6">
            {/* Period Selector */}
            <div className="flex items-end gap-4">
              <FormField label="Ano">
                <Select
                  value={declYear}
                  onChange={(e) => setDeclYear(Number(e.target.value))}
                >
                  {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(
                    (y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ),
                  )}
                </Select>
              </FormField>
              <FormField label="Mes">
                <Select
                  value={declMonth}
                  onChange={(e) => setDeclMonth(Number(e.target.value))}
                >
                  {months.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              </FormField>
              <Button
                variant="outline"
                onClick={() => {
                  fetchDeclSummary();
                  fetchDeclAnnual();
                }}
                disabled={declSummaryLoading}
              >
                {declSummaryLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="h-4 w-4" />
                )}
                {declSummaryLoading ? "Calculando..." : "Calcular"}
              </Button>
            </div>

            {/* IVA + ISR cards side by side */}
            {declSummary && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* IVA Provisional */}
                <div className="border rounded-xl bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <h3 className="text-lg font-semibold">IVA Provisional</h3>
                    </div>
                    <StatusBadge
                      label={
                        declSummary.iva.status === "FILED"
                          ? "Presentada"
                          : declSummary.iva.status === "CALCULATED"
                            ? "Calculada"
                            : "Pendiente"
                      }
                      variant={
                        declSummary.iva.status === "FILED"
                          ? "green"
                          : declSummary.iva.status === "CALCULATED"
                            ? "yellow"
                            : "gray"
                      }
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span className="text-gray-600">Ingresos del mes</span>
                      <span className="font-mono font-medium">
                        {fmt(declSummary.iva.details.ingresos)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span className="text-gray-600">IVA Causado (16%)</span>
                      <span className="font-mono font-medium text-red-600">
                        {fmt(declSummary.iva.ivaCausado)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span className="text-gray-600">Gastos deducibles del mes</span>
                      <span className="font-mono font-medium">
                        {fmt(declSummary.iva.details.gastos)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span className="text-gray-600">IVA Acreditable</span>
                      <span className="font-mono font-medium text-green-600">
                        {fmt(declSummary.iva.ivaAcreditable)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span className="text-gray-600">IVA Retenido</span>
                      <span className="font-mono font-medium">
                        {fmt(declSummary.iva.ivaRetenido)}
                      </span>
                    </div>

                    <div className="border-t-2 pt-2 mt-2">
                      {declSummary.iva.ivaPagar > 0 ? (
                        <div className="flex justify-between text-base font-bold">
                          <span>IVA a Pagar</span>
                          <span className="font-mono text-red-600">
                            {fmt(declSummary.iva.ivaPagar)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-base font-bold">
                          <span>IVA a Favor</span>
                          <span className="font-mono text-green-600">
                            {fmt(declSummary.iva.ivaFavor)}
                          </span>
                        </div>
                      )}
                    </div>

                    {declSummary.iva.filingReference && (
                      <p className="text-xs text-gray-500 mt-2">
                        Acuse SAT: {declSummary.iva.filingReference}
                      </p>
                    )}

                    {declSummary.iva.status !== "FILED" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => openFilingModal("IVA_PROVISIONAL")}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Marcar como Presentada
                      </Button>
                    )}
                  </div>
                </div>

                {/* ISR Provisional */}
                <div className="border rounded-xl bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-purple-600" />
                      <h3 className="text-lg font-semibold">ISR Provisional</h3>
                    </div>
                    <StatusBadge
                      label={
                        declSummary.isr.status === "FILED"
                          ? "Presentada"
                          : declSummary.isr.status === "CALCULATED"
                            ? "Calculada"
                            : "Pendiente"
                      }
                      variant={
                        declSummary.isr.status === "FILED"
                          ? "green"
                          : declSummary.isr.status === "CALCULATED"
                            ? "yellow"
                            : "gray"
                      }
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span className="text-gray-600">Ingresos acumulados (Ene-{months[declMonth - 1]})</span>
                      <span className="font-mono font-medium">
                        {fmt(declSummary.isr.ingresosAcumulados)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span className="text-gray-600">Deducciones acumuladas</span>
                      <span className="font-mono font-medium">
                        {fmt(declSummary.isr.deduccionesAcumuladas)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span className="text-gray-600">Utilidad fiscal</span>
                      <span className="font-mono font-medium">
                        {fmt(declSummary.isr.utilidadFiscal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span className="text-gray-600">ISR causado (30%)</span>
                      <span className="font-mono font-medium text-red-600">
                        {fmt(declSummary.isr.isrCausado)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span className="text-gray-600">ISR pagado previo</span>
                      <span className="font-mono font-medium text-green-600">
                        {fmt(declSummary.isr.isrPagadoPrevio)}
                      </span>
                    </div>

                    <div className="border-t-2 pt-2 mt-2">
                      <div className="flex justify-between text-base font-bold">
                        <span>ISR a Pagar</span>
                        <span className="font-mono text-red-600">
                          {fmt(declSummary.isr.isrPagar)}
                        </span>
                      </div>
                    </div>

                    {declSummary.isr.filingReference && (
                      <p className="text-xs text-gray-500 mt-2">
                        Acuse SAT: {declSummary.isr.filingReference}
                      </p>
                    )}

                    {declSummary.isr.status !== "FILED" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => openFilingModal("ISR_PROVISIONAL")}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Marcar como Presentada
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Annual Summary Table */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Resumen Anual {declYear}
              </h3>
              {declAnnualLoading ? (
                <div className="border rounded-lg p-8 text-center text-gray-500">
                  Calculando resumen anual...
                </div>
              ) : declAnnual ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Mes</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">IVA a Pagar</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">IVA a Favor</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600">IVA Estado</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">ISR a Pagar</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600">ISR Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {declAnnual.months.map((row) => (
                        <tr key={row.month} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{months[row.month - 1]}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.iva.ivaPagar > 0 ? (
                              <span className="text-red-600">{fmt(row.iva.ivaPagar)}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.iva.ivaFavor > 0 ? (
                              <span className="text-green-600">{fmt(row.iva.ivaFavor)}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <StatusBadge
                              label={
                                row.iva.status === "FILED"
                                  ? "Presentada"
                                  : row.iva.status === "CALCULATED"
                                    ? "Calculada"
                                    : "Pendiente"
                              }
                              variant={
                                row.iva.status === "FILED"
                                  ? "green"
                                  : row.iva.status === "CALCULATED"
                                    ? "yellow"
                                    : "gray"
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.isr.isrPagar > 0 ? (
                              <span className="text-red-600">{fmt(row.isr.isrPagar)}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <StatusBadge
                              label={
                                row.isr.status === "FILED"
                                  ? "Presentada"
                                  : row.isr.status === "CALCULATED"
                                    ? "Calculada"
                                    : "Pendiente"
                              }
                              variant={
                                row.isr.status === "FILED"
                                  ? "green"
                                  : row.isr.status === "CALCULATED"
                                    ? "yellow"
                                    : "gray"
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t font-semibold">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right font-mono text-red-600">
                          {fmt(
                            declAnnual.months.reduce(
                              (s, r) => s + r.iva.ivaPagar,
                              0,
                            ),
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-green-600">
                          {fmt(
                            declAnnual.months.reduce(
                              (s, r) => s + r.iva.ivaFavor,
                              0,
                            ),
                          )}
                        </td>
                        <td></td>
                        <td className="px-3 py-2 text-right font-mono text-red-600">
                          {fmt(
                            declAnnual.months.reduce(
                              (s, r) => s + r.isr.isrPagar,
                              0,
                            ),
                          )}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="border rounded-lg p-8 text-center text-gray-500">
                  Presione &quot;Calcular&quot; para ver el resumen.
                </div>
              )}
            </div>

            {/* Monthly trend chart (simple bar visualization) */}
            {declAnnual && (
              <div className="border rounded-xl bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Tendencia Mensual ISR / IVA
                </h3>
                <div className="space-y-3">
                  {declAnnual.months.map((row) => {
                    const maxVal = Math.max(
                      ...declAnnual.months.map((r) =>
                        Math.max(r.iva.ivaPagar, r.isr.isrPagar),
                      ),
                      1,
                    );
                    const ivaWidth = Math.max(
                      (row.iva.ivaPagar / maxVal) * 100,
                      0,
                    );
                    const isrWidth = Math.max(
                      (row.isr.isrPagar / maxVal) * 100,
                      0,
                    );
                    return (
                      <div key={row.month} className="flex items-center gap-3">
                        <span className="w-12 text-xs text-gray-500 text-right shrink-0">
                          {months[row.month - 1].slice(0, 3)}
                        </span>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 rounded bg-blue-500 transition-all"
                              style={{ width: `${ivaWidth}%`, minWidth: ivaWidth > 0 ? "4px" : "0" }}
                            />
                            {row.iva.ivaPagar > 0 && (
                              <span className="text-xs text-gray-500 font-mono">
                                {fmt(row.iva.ivaPagar)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 rounded bg-purple-500 transition-all"
                              style={{ width: `${isrWidth}%`, minWidth: isrWidth > 0 ? "4px" : "0" }}
                            />
                            {row.isr.isrPagar > 0 && (
                              <span className="text-xs text-gray-500 font-mono">
                                {fmt(row.isr.isrPagar)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-6 mt-4 text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-500" />
                    <span>IVA a Pagar</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-purple-500" />
                    <span>ISR a Pagar</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================== ACCOUNT CREATE / EDIT MODAL ================== */}
      <Modal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        title={editingAccount ? "Editar Cuenta" : "Nueva Cuenta"}
      >
        <div className="space-y-4">
          <FormField label="Codigo" required>
            <Input
              value={accountForm.code}
              onChange={(e) => setAccountForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="100.01"
            />
          </FormField>

          <FormField label="Nombre" required>
            <Input
              value={accountForm.name}
              onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Caja y Bancos"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Tipo" required>
              <Select
                value={accountForm.type}
                onChange={(e) =>
                  setAccountForm((f) => ({ ...f, type: e.target.value as Account["type"] }))
                }
              >
                <option value="ASSET">Activo</option>
                <option value="LIABILITY">Pasivo</option>
                <option value="EQUITY">Capital</option>
                <option value="REVENUE">Ingreso</option>
                <option value="EXPENSE">Gasto</option>
              </Select>
            </FormField>

            <FormField label="Naturaleza" required>
              <Select
                value={accountForm.nature}
                onChange={(e) =>
                  setAccountForm((f) => ({ ...f, nature: e.target.value as Account["nature"] }))
                }
              >
                <option value="DEBIT">Deudora</option>
                <option value="CREDIT">Acreedora</option>
              </Select>
            </FormField>
          </div>

          <FormField label="Cuenta Padre">
            <Select
              value={accountForm.parentAccountId ?? ""}
              onChange={(e) =>
                setAccountForm((f) => ({ ...f, parentAccountId: e.target.value || null }))
              }
            >
              <option value="">-- Ninguna --</option>
              {accounts
                .filter((a) => a.id !== editingAccount?.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))}
            </Select>
          </FormField>

          <FormField label="Codigo de Grupo SAT">
            <Input
              value={accountForm.satGroupCode ?? ""}
              onChange={(e) => setAccountForm((f) => ({ ...f, satGroupCode: e.target.value }))}
              placeholder="Opcional"
            />
          </FormField>

          <div className="flex items-center gap-2">
            <input
              id="isDetail"
              type="checkbox"
              checked={accountForm.isDetail}
              onChange={(e) => setAccountForm((f) => ({ ...f, isDetail: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="isDetail" className="text-sm font-medium">
              Es cuenta de detalle
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setAccountModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={saveAccount}
              disabled={accountSaving || !accountForm.code || !accountForm.name}
            >
              {accountSaving ? "Guardando..." : editingAccount ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================== DELETE CONFIRM MODAL ================== */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirmar Eliminacion"
      >
        <p className="text-sm text-gray-600 mb-4">
          Esta seguro de que desea eliminar la cuenta{" "}
          <strong>
            {deleteTarget?.code} - {deleteTarget?.name}
          </strong>
          ? Esta accion no se puede deshacer.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={deleteAccount} disabled={deleting}>
            {deleting ? "Eliminando..." : "Eliminar"}
          </Button>
        </div>
      </Modal>

      {/* ================== JOURNAL ENTRY CREATE MODAL ================== */}
      <Modal
        open={journalModalOpen}
        onClose={() => setJournalModalOpen(false)}
        title="Nueva Poliza"
        wide
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Fecha" required>
              <Input
                type="date"
                value={journalForm.entryDate}
                onChange={(e) => setJournalForm((f) => ({ ...f, entryDate: e.target.value }))}
              />
            </FormField>

            <FormField label="Tipo" required>
              <Select
                value={journalForm.type}
                onChange={(e) =>
                  setJournalForm((f) => ({
                    ...f,
                    type: e.target.value as JournalEntry["type"],
                  }))
                }
              >
                <option value="DIARIO">Diario</option>
                <option value="INGRESO">Ingreso</option>
                <option value="EGRESO">Egreso</option>
              </Select>
            </FormField>
          </div>

          <FormField label="Descripcion" required>
            <Input
              value={journalForm.description}
              onChange={(e) => setJournalForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descripcion de la poliza"
            />
          </FormField>

          <FormField label="Sucursal">
            <Select
              value={journalForm.branchId}
              onChange={(e) => setJournalForm((f) => ({ ...f, branchId: e.target.value }))}
            >
              <option value="">-- Ninguna --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Lineas de la Poliza</h4>
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-3 w-3 mr-1" />
                Agregar Linea
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Cuenta</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-28">Cargo</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-28">Abono</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Descripcion</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {journalForm.lines.map((line, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <Select
                          value={line.accountId}
                          onChange={(e) => updateLine(idx, "accountId", e.target.value)}
                        >
                          <option value="">Seleccionar cuenta</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} - {a.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.debit || ""}
                          onChange={(e) => updateLine(idx, "debit", Number(e.target.value) || 0)}
                          className="text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.credit || ""}
                          onChange={(e) => updateLine(idx, "credit", Number(e.target.value) || 0)}
                          className="text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(idx, "description", e.target.value)}
                          placeholder="Detalle"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {journalForm.lines.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(idx)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t">
                    <td className="px-3 py-2 text-right font-semibold">Totales</td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold ${
                        !balanced ? "text-red-600" : ""
                      }`}
                    >
                      {fmt(totalDebit)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold ${
                        !balanced ? "text-red-600" : ""
                      }`}
                    >
                      {fmt(totalCredit)}
                    </td>
                    <td colSpan={2} className="px-3 py-2">
                      {!balanced && (
                        <span className="text-xs text-red-600 font-medium">
                          Cargos y abonos no cuadran (diferencia:{" "}
                          {fmt(Math.abs(totalDebit - totalCredit))})
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setJournalModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={saveJournalEntry}
              disabled={
                journalSaving ||
                !journalForm.description ||
                !journalForm.entryDate ||
                journalForm.lines.some((l) => !l.accountId) ||
                !balanced ||
                totalDebit === 0
              }
            >
              {journalSaving ? "Guardando..." : "Crear Poliza"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================== AUTO-ENTRY DETAIL MODAL ================== */}
      <Modal
        open={!!autoDetailEntry}
        onClose={() => setAutoDetailEntry(null)}
        title="Detalle de Poliza Automatica"
        wide
      >
        {autoDetailEntry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Fecha:</span>{" "}
                <span className="font-medium">
                  {new Date(autoDetailEntry.entryDate).toLocaleDateString("es-MX")}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Tipo:</span>{" "}
                <StatusBadge
                  label={ENTRY_TYPE_LABELS[autoDetailEntry.type]}
                  variant="blue"
                />
              </div>
              <div>
                <span className="text-gray-500">Origen:</span>{" "}
                <StatusBadge
                  label={
                    REF_TYPE_LABELS[autoDetailEntry.referenceType || ""] ||
                    autoDetailEntry.referenceType ||
                    "-"
                  }
                  variant="gray"
                />
              </div>
              <div>
                <span className="text-gray-500">Estado:</span>{" "}
                <StatusBadge
                  label={STATUS_LABEL[autoDetailEntry.status]}
                  variant={STATUS_VARIANT[autoDetailEntry.status]}
                />
              </div>
              {autoDetailEntry.branch && (
                <div>
                  <span className="text-gray-500">Sucursal:</span>{" "}
                  <span className="font-medium">
                    {autoDetailEntry.branch.name}
                  </span>
                </div>
              )}
            </div>

            <div>
              <span className="text-sm text-gray-500">Descripcion:</span>
              <p className="text-sm font-medium mt-1">
                {autoDetailEntry.description}
              </p>
            </div>

            {/* Lines table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-3 py-2 font-medium text-gray-600">
                      Cuenta
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">
                      Descripcion
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-32">
                      Cargo
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-32">
                      Abono
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(autoDetailEntry.lines || []).map((line, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-gray-500">
                          {line.account?.code}
                        </span>{" "}
                        {line.account?.name}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {line.description || "-"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {safeNum(line.debit) > 0 ? fmt(safeNum(line.debit)) : "-"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {safeNum(line.credit) > 0
                          ? fmt(safeNum(line.credit))
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t font-semibold">
                    <td colSpan={2} className="px-3 py-2 text-right">
                      Totales
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(
                        (autoDetailEntry.lines || []).reduce(
                          (s, l) => s + safeNum(l.debit),
                          0
                        )
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(
                        (autoDetailEntry.lines || []).reduce(
                          (s, l) => s + safeNum(l.credit),
                          0
                        )
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              {autoDetailEntry.status === "DRAFT" && (
                <Button
                  variant="primary"
                  onClick={async () => {
                    await postEntry(autoDetailEntry.id);
                    setAutoDetailEntry(null);
                    fetchAutoEntries();
                  }}
                >
                  <CheckCircle className="h-4 w-4" />
                  Publicar
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setAutoDetailEntry(null)}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================== DECLARATION FILING MODAL ================== */}
      <Modal
        open={declFilingModalOpen}
        onClose={() => setDeclFilingModalOpen(false)}
        title={`Marcar ${declFilingType === "IVA_PROVISIONAL" ? "IVA" : "ISR"} como Presentada`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Registrar que la declaracion provisional de{" "}
            <strong>
              {declFilingType === "IVA_PROVISIONAL" ? "IVA" : "ISR"}
            </strong>{" "}
            de <strong>{months[declMonth - 1]} {declYear}</strong> fue presentada
            ante el SAT.
          </p>

          <FormField label="Numero de Acuse SAT (opcional)">
            <Input
              value={declFilingRef}
              onChange={(e) => setDeclFilingRef(e.target.value)}
              placeholder="Ej. 12345678901234"
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeclFilingModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={submitFiling}
              disabled={declFilingSaving}
            >
              {declFilingSaving ? "Guardando..." : "Confirmar Presentacion"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
