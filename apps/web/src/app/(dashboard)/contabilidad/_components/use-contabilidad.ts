"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import type {
  Account,
  JournalEntry,
  JournalLine,
  Branch,
  PendingResponse,
  PendingEvent,
  AutoEntry,
  BatchResult,
  DiotRecord,
  DiotSummary,
  DiotHistoryItem,
  DeclarationSummary,
  AnnualSummary,
  BalanzaRow,
} from "./types";
import {
  emptyAccountForm,
  emptyJournalForm,
  safeNum,
  fmt,
  TABS,
  TYPE_LABELS,
  NATURE_LABELS,
  STATUS_VARIANT,
  STATUS_LABEL,
  ENTRY_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_VARIANT,
  REF_TYPE_LABELS,
  DIOT_OP_LABELS,
  months,
} from "./types";

export function useContabilidad() {
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
  // BALANZA DATA
  // ============================================================

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

  // ============================================================
  // ESTADOS FINANCIEROS helpers
  // ============================================================

  function groupByType(t: Account["type"]) {
    return accounts.filter((a) => a.type === t);
  }

  // ============================================================
  // RETURN
  // ============================================================

  return {
    // auth
    authLoading,

    // tabs
    activeTab,
    setActiveTab,

    // accounts
    accounts,
    accountsLoading,
    accountModalOpen,
    setAccountModalOpen,
    editingAccount,
    accountForm,
    setAccountForm,
    accountSaving,
    openCreateAccount,
    openEditAccount,
    saveAccount,
    deleteTarget,
    setDeleteTarget,
    deleting,
    deleteAccount,

    // journal entries
    entries,
    entriesLoading,
    journalModalOpen,
    setJournalModalOpen,
    journalForm,
    setJournalForm,
    journalSaving,
    openCreateEntry,
    saveJournalEntry,
    postEntry,
    reverseEntry,
    addLine,
    removeLine,
    updateLine,
    totalDebit,
    totalCredit,
    balanced,

    // branches
    branches,

    // balanza
    currentYear,
    balanzaYear,
    setBalanzaYear,
    balanzaMonth,
    setBalanzaMonth,
    balanzaData,

    // estados financieros
    groupByType,

    // auto-polizas
    pendingData,
    pendingLoading,
    autoEntries,
    autoEntriesLoading,
    generating,
    batchGenerating,
    batchResult,
    autoDetailEntry,
    setAutoDetailEntry,
    generateSinglePoliza,
    generateAllPolizas,
    fetchAutoEntries,

    // DIOT
    diotYear,
    setDiotYear,
    diotMonth,
    setDiotMonth,
    diotRecords,
    diotSummary,
    diotHistory,
    diotPreviewLoading,
    diotGenerating,
    diotDownloading,
    diotHistoryLoading,
    fetchDiotPreview,
    fetchDiotHistory,
    generateDiot,
    downloadDiot,

    // Declaraciones
    declYear,
    setDeclYear,
    declMonth,
    setDeclMonth,
    declSummary,
    declSummaryLoading,
    declAnnual,
    declAnnualLoading,
    declFilingModalOpen,
    setDeclFilingModalOpen,
    declFilingType,
    declFilingRef,
    setDeclFilingRef,
    declFilingSaving,
    fetchDeclSummary,
    fetchDeclAnnual,
    openFilingModal,
    submitFiling,
  };
}
