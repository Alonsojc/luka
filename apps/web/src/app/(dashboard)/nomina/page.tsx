"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-field";
import { StatusBadge, ActiveBadge } from "@/components/ui/status-badge";
import {
  Plus,
  Calculator,
  CheckCircle,
  UserX,
  Eye,
  ArrowLeft,
  Users,
  DollarSign,
  TrendingDown,
  Briefcase,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Shield,
  Upload,
  Clock,
  RefreshCw,
  Settings,
  AlertTriangle,
  Loader2,
  Link2,
  X,
} from "lucide-react";
import { exportToCSV } from "@/lib/export-csv";
import { generatePayrollPDF } from "@/lib/pdf-generator";
import { safeNum } from "@luka/shared";

const TABS = [
  "Empleados",
  "Períodos de Nómina",
  "Detalle de Recibos",
  "CFDI Nómina",
  "SUA / IMSS",
  "Worky",
];

const MONTH_NAMES = [
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

const CONTRACT_TYPES = [
  { value: "PERMANENT", label: "Permanente" },
  { value: "TEMPORARY", label: "Temporal" },
  { value: "SEASONAL", label: "Estacional" },
];

const PAYMENT_FREQUENCIES = [
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quincenal" },
  { value: "MONTHLY", label: "Mensual" },
];

const PAYROLL_STATUS_MAP: Record<string, { label: string; variant: string }> = {
  DRAFT: { label: "Borrador", variant: "gray" },
  CALCULATED: { label: "Calculada", variant: "blue" },
  APPROVED: { label: "Aprobada", variant: "green" },
  STAMPED: { label: "Timbrada", variant: "purple" },
  PAID: { label: "Pagada", variant: "green" },
};

function fmt(v: any): string {
  return safeNum(v).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-MX");
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export default function NominaPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("Empleados");

  // ── Search & Pagination state ──
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

  // ── Employees state ──
  const [employees, setEmployees] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loadingEmp, setLoadingEmp] = useState(true);
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any>(null);
  const [showTermModal, setShowTermModal] = useState(false);
  const [terminatingEmp, setTerminatingEmp] = useState<any>(null);
  const [termDate, setTermDate] = useState("");
  const [empForm, setEmpForm] = useState({
    branchId: "",
    employeeNumber: "",
    firstName: "",
    lastName: "",
    curp: "",
    rfc: "",
    nss: "",
    hireDate: "",
    contractType: "PERMANENT",
    jobPosition: "",
    department: "",
    dailySalary: "",
    paymentFrequency: "BIWEEKLY",
    bankAccount: "",
    clabe: "",
  });

  // ── Payroll periods state ──
  const [periods, setPeriods] = useState<any[]>([]);
  const [loadingPer, setLoadingPer] = useState(true);
  const [showPerModal, setShowPerModal] = useState(false);
  const [perForm, setPerForm] = useState({
    periodType: "BIWEEKLY",
    startDate: "",
    endDate: "",
  });

  // ── Receipts state ──
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingRec, setLoadingRec] = useState(false);

  // ── CFDI Nómina state ──
  const [cfdiPeriodId, setCfdiPeriodId] = useState<string>("");
  const [cfdiReceipts, setCfdiReceipts] = useState<any[]>([]);
  const [loadingCfdi, setLoadingCfdi] = useState(false);
  const [generatingCfdi, setGeneratingCfdi] = useState<string | null>(null);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [cfdiPreviewXml, setCfdiPreviewXml] = useState<string>("");
  const [showCfdiPreview, setShowCfdiPreview] = useState(false);
  const [cfdiPreviewLoading, setCfdiPreviewLoading] = useState(false);

  // ── SUA state ──
  const now = new Date();
  const [suaYear, setSuaYear] = useState(now.getFullYear());
  const [suaMonth, setSuaMonth] = useState(now.getMonth() + 1);
  const [suaMovements, setSuaMovements] = useState<any[]>([]);
  const [suaSummary, setSuaSummary] = useState<any>(null);
  const [suaHistory, setSuaHistory] = useState<any[]>([]);
  const [suaFileContent, setSuaFileContent] = useState("");
  const [loadingSua, setLoadingSua] = useState(false);
  const [suaSection, setSuaSection] = useState<"movements" | "summary" | "export">("movements");

  // ── Worky state ──
  const [workySection, setWorkySection] = useState<"config" | "import" | "history">("config");
  const [workyConfig, setWorkyConfig] = useState<any>(null);
  const [workyConfigForm, setWorkyConfigForm] = useState({
    apiKey: "",
    companyId: "",
    syncFrequency: "MANUAL",
  });
  const [loadingWorky, setLoadingWorky] = useState(false);
  const [workyTestResult, setWorkyTestResult] = useState<any>(null);
  const [workySyncResult, setWorkySyncResult] = useState<any>(null);
  const [workySyncHistory, setWorkySyncHistory] = useState<any[]>([]);
  const [workySyncDetail, setWorkySyncDetail] = useState<any>(null);
  const [showSyncDetailModal, setShowSyncDetailModal] = useState(false);
  const [csvContent, setCsvContent] = useState("");
  const [csvBranchId, setCsvBranchId] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<any>(null);
  const [workySyncing, setWorkySyncing] = useState(false);

  // ── Fetch employees ──
  const fetchEmployees = useCallback(async () => {
    setLoadingEmp(true);
    try {
      const data = await authFetch<any[]>("get", "/nomina/employees");
      setEmployees(data);
    } catch {
      toast("Error al cargar empleados", "error");
    } finally {
      setLoadingEmp(false);
    }
  }, [authFetch, toast]);

  const fetchBranches = useCallback(async () => {
    try {
      const data = await authFetch<any[]>("get", "/branches");
      setBranches(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    }
  }, [authFetch]);

  // ── Fetch periods ──
  const fetchPeriods = useCallback(async () => {
    setLoadingPer(true);
    try {
      const data = await authFetch<any[]>("get", "/nomina/payroll");
      setPeriods(data);
    } catch {
      toast("Error al cargar períodos", "error");
    } finally {
      setLoadingPer(false);
    }
  }, [authFetch, toast]);

  useEffect(() => {
    if (authLoading) return;
    fetchEmployees();
    fetchBranches();
    fetchPeriods();
  }, [authLoading, fetchEmployees, fetchBranches, fetchPeriods]);

  // ── Employee CRUD ──
  function openNewEmp() {
    setEditingEmp(null);
    setEmpForm({
      branchId: branches[0]?.id || "",
      employeeNumber: "",
      firstName: "",
      lastName: "",
      curp: "",
      rfc: "",
      nss: "",
      hireDate: "",
      contractType: "PERMANENT",
      jobPosition: "",
      department: "",
      dailySalary: "",
      paymentFrequency: "BIWEEKLY",
      bankAccount: "",
      clabe: "",
    });
    setShowEmpModal(true);
  }

  function openEditEmp(emp: any) {
    setEditingEmp(emp);
    setEmpForm({
      branchId: emp.branchId || "",
      employeeNumber: emp.employeeNumber || "",
      firstName: emp.firstName || "",
      lastName: emp.lastName || "",
      curp: emp.curp || "",
      rfc: emp.rfc || "",
      nss: emp.nss || "",
      hireDate: emp.hireDate ? emp.hireDate.slice(0, 10) : "",
      contractType: emp.contractType || "PERMANENT",
      jobPosition: emp.jobPosition || "",
      department: emp.department || "",
      dailySalary: String(Number(emp.dailySalary || 0)),
      paymentFrequency: emp.paymentFrequency || "BIWEEKLY",
      bankAccount: emp.bankAccount || "",
      clabe: emp.clabe || "",
    });
    setShowEmpModal(true);
  }

  async function saveEmployee() {
    try {
      if (editingEmp) {
        await authFetch("patch", `/nomina/employees/${editingEmp.id}`, {
          branchId: empForm.branchId,
          jobPosition: empForm.jobPosition,
          department: empForm.department || undefined,
          dailySalary: Number(empForm.dailySalary),
          paymentFrequency: empForm.paymentFrequency,
          bankAccount: empForm.bankAccount || undefined,
          clabe: empForm.clabe || undefined,
        });
        toast("Empleado actualizado");
      } else {
        await authFetch("post", "/nomina/employees", {
          branchId: empForm.branchId,
          employeeNumber: empForm.employeeNumber,
          firstName: empForm.firstName,
          lastName: empForm.lastName,
          curp: empForm.curp || undefined,
          rfc: empForm.rfc || undefined,
          nss: empForm.nss || undefined,
          hireDate: empForm.hireDate,
          contractType: empForm.contractType,
          jobPosition: empForm.jobPosition,
          department: empForm.department || undefined,
          dailySalary: Number(empForm.dailySalary),
          paymentFrequency: empForm.paymentFrequency,
          bankAccount: empForm.bankAccount || undefined,
          clabe: empForm.clabe || undefined,
        });
        toast("Empleado creado");
      }
      setShowEmpModal(false);
      fetchEmployees();
    } catch {
      toast("Error al guardar empleado", "error");
    }
  }

  function openTerminate(emp: any) {
    setTerminatingEmp(emp);
    setTermDate(new Date().toISOString().slice(0, 10));
    setShowTermModal(true);
  }

  async function confirmTerminate() {
    if (!terminatingEmp) return;
    try {
      await authFetch("patch", `/nomina/employees/${terminatingEmp.id}/terminate`, {
        terminationDate: termDate,
      });
      toast("Empleado dado de baja");
      setShowTermModal(false);
      fetchEmployees();
    } catch {
      toast("Error al dar de baja", "error");
    }
  }

  // ── Payroll period actions ──
  async function createPeriod() {
    try {
      await authFetch("post", "/nomina/payroll", perForm);
      toast("Período creado");
      setShowPerModal(false);
      fetchPeriods();
    } catch {
      toast("Error al crear período", "error");
    }
  }

  async function calculatePeriod(id: string) {
    try {
      await authFetch("post", `/nomina/payroll/${id}/calculate`, {});
      toast("Nómina calculada exitosamente");
      fetchPeriods();
    } catch {
      toast("Error al calcular nómina", "error");
    }
  }

  async function approvePeriod(id: string) {
    try {
      await authFetch("patch", `/nomina/payroll/${id}/approve`, {});
      toast("Nómina aprobada");
      fetchPeriods();
    } catch {
      toast("Error al aprobar nómina", "error");
    }
  }

  // ── View receipts ──
  async function viewReceipts(period: any) {
    setLoadingRec(true);
    setSelectedPeriod(period);
    setActiveTab("Detalle de Recibos");
    try {
      const data = await authFetch<any>("get", `/nomina/payroll/${period.id}`);
      setReceipts(data.receipts || []);
    } catch {
      toast("Error al cargar recibos", "error");
      setReceipts([]);
    } finally {
      setLoadingRec(false);
    }
  }

  // ── CFDI Nómina Functions ──
  const fetchCfdiReceipts = useCallback(
    async (periodId: string) => {
      if (!periodId) {
        setCfdiReceipts([]);
        return;
      }
      setLoadingCfdi(true);
      try {
        const data = await authFetch<any[]>("get", `/nomina/cfdi/period/${periodId}`);
        setCfdiReceipts(data);
      } catch {
        toast("Error al cargar datos CFDI", "error");
        setCfdiReceipts([]);
      } finally {
        setLoadingCfdi(false);
      }
    },
    [authFetch, toast],
  );

  async function generateSingleCfdi(receiptId: string) {
    setGeneratingCfdi(receiptId);
    try {
      await authFetch("post", `/nomina/cfdi/generate/${receiptId}`, {});
      toast("CFDI generado exitosamente");
      fetchCfdiReceipts(cfdiPeriodId);
    } catch (err: any) {
      toast(err?.message || "Error al generar CFDI", "error");
    } finally {
      setGeneratingCfdi(null);
    }
  }

  async function generateBatchCfdi() {
    if (!cfdiPeriodId) return;
    setGeneratingBatch(true);
    try {
      const result = await authFetch<any>(
        "post",
        `/nomina/cfdi/generate-batch/${cfdiPeriodId}`,
        {},
      );
      toast(`CFDIs generados: ${result.generated}, Fallidos: ${result.failed}`);
      fetchCfdiReceipts(cfdiPeriodId);
    } catch {
      toast("Error al generar CFDIs en lote", "error");
    } finally {
      setGeneratingBatch(false);
    }
  }

  async function previewCfdiXml(receiptId: string) {
    setCfdiPreviewLoading(true);
    setShowCfdiPreview(true);
    setCfdiPreviewXml("");
    try {
      const xml = await authFetch<string>("get", `/nomina/cfdi/preview/${receiptId}`);
      setCfdiPreviewXml(typeof xml === "string" ? xml : JSON.stringify(xml, null, 2));
    } catch {
      setCfdiPreviewXml("Error al obtener preview del XML");
    } finally {
      setCfdiPreviewLoading(false);
    }
  }

  function downloadXml(xml: string, filename: string) {
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── SUA Functions ──
  const fetchSuaMovements = useCallback(async () => {
    setLoadingSua(true);
    try {
      const data = await authFetch<any[]>(
        "get",
        `/nomina/sua/preview?year=${suaYear}&month=${suaMonth}`,
      );
      setSuaMovements(data);
    } catch {
      toast("Error al cargar movimientos SUA", "error");
      setSuaMovements([]);
    } finally {
      setLoadingSua(false);
    }
  }, [authFetch, toast, suaYear, suaMonth]);

  const fetchSuaSummary = useCallback(async () => {
    setLoadingSua(true);
    try {
      const data = await authFetch<any>(
        "get",
        `/nomina/sua/summary?year=${suaYear}&month=${suaMonth}`,
      );
      setSuaSummary(data);
    } catch {
      toast("Error al cargar resumen de cuotas", "error");
      setSuaSummary(null);
    } finally {
      setLoadingSua(false);
    }
  }, [authFetch, toast, suaYear, suaMonth]);

  const fetchSuaHistory = useCallback(async () => {
    try {
      const data = await authFetch<any[]>("get", "/nomina/sua/history");
      setSuaHistory(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setSuaHistory([]);
    }
  }, [authFetch]);

  async function fetchSuaRawText(path: string): Promise<string> {
    const tokenCookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1];
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token") || tokenCookie || ""}`,
      },
    });
    if (!response.ok) throw new Error("Error al obtener archivo SUA");
    return response.text();
  }

  async function generateSuaFile() {
    try {
      await authFetch("post", `/nomina/sua/generate?year=${suaYear}&month=${suaMonth}`, {});
      toast("Archivo SUA generado exitosamente");
      fetchSuaHistory();
      const content = await fetchSuaRawText(
        `/nomina/sua/download?year=${suaYear}&month=${suaMonth}`,
      );
      setSuaFileContent(content);
    } catch {
      toast("Error al generar archivo SUA", "error");
    }
  }

  async function downloadSuaFile() {
    try {
      const content = await fetchSuaRawText(
        `/nomina/sua/download?year=${suaYear}&month=${suaMonth}`,
      );
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SUA_${suaYear}_${String(suaMonth).padStart(2, "0")}.sua`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast("Error al descargar archivo SUA", "error");
    }
  }

  // Load SUA data when tab is active
  useEffect(() => {
    if (activeTab !== "SUA / IMSS" || authLoading) return;
    if (suaSection === "movements") fetchSuaMovements();
    if (suaSection === "summary") fetchSuaSummary();
    if (suaSection === "export") fetchSuaHistory();
  }, [
    activeTab,
    suaSection,
    suaYear,
    suaMonth,
    authLoading,
    fetchSuaMovements,
    fetchSuaSummary,
    fetchSuaHistory,
  ]);

  // ── Worky Functions ──
  const fetchWorkyConfig = useCallback(async () => {
    try {
      const data = await authFetch<any>("get", "/nomina/worky/config");
      setWorkyConfig(data);
      setWorkyConfigForm({
        apiKey: data.apiKey || "",
        companyId: data.companyId || "",
        syncFrequency: data.syncFrequency || "MANUAL",
      });
    } catch (err) {
      console.error("Worky config not yet created:", err);
    }
  }, [authFetch]);

  const fetchWorkySyncHistory = useCallback(async () => {
    try {
      const data = await authFetch<any[]>("get", "/nomina/worky/sync/history");
      setWorkySyncHistory(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setWorkySyncHistory([]);
    }
  }, [authFetch]);

  async function saveWorkyConfig() {
    setLoadingWorky(true);
    try {
      await authFetch("put", "/nomina/worky/config", workyConfigForm);
      toast("Configuración de Worky guardada");
      fetchWorkyConfig();
    } catch {
      toast("Error al guardar configuración", "error");
    } finally {
      setLoadingWorky(false);
    }
  }

  async function testWorkyConnection() {
    setLoadingWorky(true);
    setWorkyTestResult(null);
    try {
      const result = await authFetch<any>("post", "/nomina/worky/test-connection", {});
      setWorkyTestResult(result);
      if (result.success) {
        toast("Conexión exitosa con Worky");
      } else {
        toast(result.message || "Error de conexión", "error");
      }
    } catch {
      setWorkyTestResult({ success: false, message: "Error al probar conexión" });
      toast("Error al probar conexión", "error");
    } finally {
      setLoadingWorky(false);
    }
  }

  async function syncWorkyEmployees() {
    setWorkySyncing(true);
    setWorkySyncResult(null);
    try {
      const result = await authFetch<any>("post", "/nomina/worky/sync/employees", {});
      setWorkySyncResult(result);
      toast(`Sincronización completada: ${result.created} creados, ${result.updated} actualizados`);
      fetchEmployees();
      fetchWorkySyncHistory();
    } catch {
      toast("Error al sincronizar empleados", "error");
    } finally {
      setWorkySyncing(false);
    }
  }

  async function importWorkyCsv() {
    if (!csvContent || !csvBranchId) {
      toast("Selecciona una sucursal y carga un archivo CSV", "error");
      return;
    }
    setCsvImporting(true);
    setCsvResult(null);
    try {
      const result = await authFetch<any>("post", "/nomina/worky/import/csv", {
        csvContent,
        branchId: csvBranchId,
      });
      setCsvResult(result);
      toast(`Importación completada: ${result.created} creados, ${result.updated} actualizados`);
      fetchEmployees();
      fetchWorkySyncHistory();
    } catch {
      toast("Error al importar CSV", "error");
    } finally {
      setCsvImporting(false);
    }
  }

  function handleCsvFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvContent(ev.target?.result as string);
    };
    reader.readAsText(file);
  }

  async function viewSyncDetail(logId: string) {
    try {
      const data = await authFetch<any>("get", `/nomina/worky/sync/${logId}`);
      setWorkySyncDetail(data);
      setShowSyncDetailModal(true);
    } catch {
      toast("Error al cargar detalle", "error");
    }
  }

  // Load Worky data when tab is active
  useEffect(() => {
    if (activeTab !== "Worky" || authLoading) return;
    fetchWorkyConfig();
    if (workySection === "history") fetchWorkySyncHistory();
  }, [activeTab, workySection, authLoading, fetchWorkyConfig, fetchWorkySyncHistory]);

  if (authLoading) return null;

  const branchMap = Object.fromEntries(branches.map((b: any) => [b.id, b.name]));
  const activeEmployees = employees.filter((e) => e.isActive);
  const totalPayroll = employees.reduce((s, e) => s + Number(e.dailySalary || 0) * 30, 0);

  // ── Search & Pagination logic ──
  const filteredEmployees = searchTerm
    ? employees.filter((e) => {
        const q = normalize(searchTerm);
        const fullName = normalize(`${e.firstName} ${e.lastName}`);
        return (
          fullName.includes(q) ||
          (e.rfc && normalize(e.rfc).includes(q)) ||
          (e.employeeNumber && normalize(e.employeeNumber).includes(q)) ||
          (e.jobPosition && normalize(e.jobPosition).includes(q))
        );
      })
    : employees;

  const totalPagesNomina = Math.ceil(filteredEmployees.length / PAGE_SIZE);
  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const paginationStartNomina =
    filteredEmployees.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const paginationEndNomina = Math.min(currentPage * PAGE_SIZE, filteredEmployees.length);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Nómina</h1>
      </div>

      {/* Summary cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Total Empleados",
            value: String(employees.length),
            icon: Users,
            color: "bg-blue-50 text-blue-600",
          },
          {
            label: "Activos",
            value: String(activeEmployees.length),
            icon: Briefcase,
            color: "bg-green-50 text-green-600",
          },
          {
            label: "Nómina Mensual Est.",
            value: fmt(totalPayroll),
            icon: DollarSign,
            color: "bg-amber-50 text-amber-600",
          },
          {
            label: "Períodos",
            value: String(periods.length),
            icon: TrendingDown,
            color: "bg-purple-50 text-purple-600",
          },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{c.label}</p>
                  <p className="text-lg font-bold text-gray-900">{loadingEmp ? "..." : c.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-gray-200">
        <div className="flex gap-4 sm:gap-6 overflow-x-auto flex-nowrap pb-px -mb-px scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
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

      {/* Search bar (Empleados tab) */}
      {activeTab === "Empleados" && (
        <div className="mt-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, RFC o puesto..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      )}

      {/* ══════════ EMPLEADOS TAB ══════════ */}
      {activeTab === "Empleados" && (
        <div className="mt-4">
          <div className="mb-4 flex justify-end gap-3">
            <button
              onClick={() =>
                exportToCSV(
                  employees.map((e) => ({
                    employeeNumber: e.employeeNumber,
                    name: `${e.firstName} ${e.lastName}`,
                    rfc: e.rfc || "",
                    curp: e.curp || "",
                    branch: branchMap[e.branchId] || "",
                    jobPosition: e.jobPosition || "",
                    dailySalary: Number(e.dailySalary || 0),
                    status: e.isActive ? "Activo" : "Inactivo",
                  })),
                  "empleados",
                  [
                    { key: "employeeNumber", label: "Numero" },
                    { key: "name", label: "Nombre" },
                    { key: "rfc", label: "RFC" },
                    { key: "curp", label: "CURP" },
                    { key: "branch", label: "Sucursal" },
                    { key: "jobPosition", label: "Puesto" },
                    { key: "dailySalary", label: "Salario Diario" },
                    { key: "status", label: "Status" },
                  ],
                )
              }
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>
            <button
              onClick={() => generatePayrollPDF(employees, branchMap)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <FileText className="h-4 w-4" />
              PDF
            </button>
            <Button onClick={openNewEmp}>
              <Plus className="h-4 w-4" /> Nuevo Empleado
            </Button>
          </div>
          <DataTable
            columns={[
              { key: "employeeNumber", header: "# Emp" },
              {
                key: "name",
                header: "Nombre",
                render: (r: any) => `${r.firstName} ${r.lastName}`,
              },
              { key: "jobPosition", header: "Puesto" },
              {
                key: "branchId",
                header: "Sucursal",
                render: (r: any) => branchMap[r.branchId] || "—",
              },
              {
                key: "contractType",
                header: "Contrato",
                render: (r: any) =>
                  CONTRACT_TYPES.find((c) => c.value === r.contractType)?.label || r.contractType,
              },
              {
                key: "dailySalary",
                header: "Salario Diario",
                render: (r: any) => fmt(r.dailySalary),
              },
              {
                key: "hireDate",
                header: "Fecha Ingreso",
                render: (r: any) => fmtDate(r.hireDate),
              },
              {
                key: "isActive",
                header: "Estado",
                render: (r: any) => <ActiveBadge active={r.isActive} />,
              },
              {
                key: "actions",
                header: "Acciones",
                render: (r: any) => (
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditEmp(r);
                      }}
                      className="text-sm font-medium text-black hover:text-gray-700"
                    >
                      Editar
                    </button>
                    {r.isActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openTerminate(r);
                        }}
                        className="text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        Baja
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
            data={paginatedEmployees}
            loading={loadingEmp}
            emptyMessage="No hay empleados registrados"
          />

          {/* Pagination controls */}
          {filteredEmployees.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Mostrando {paginationStartNomina}-{paginationEndNomina} de{" "}
                {filteredEmployees.length}
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
                  onClick={() => setCurrentPage((p) => Math.min(totalPagesNomina, p + 1))}
                  disabled={currentPage === totalPagesNomina}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ PERÍODOS TAB ══════════ */}
      {activeTab === "Períodos de Nómina" && (
        <div className="mt-4">
          <div className="mb-4 flex justify-end">
            <Button
              onClick={() => {
                setPerForm({ periodType: "BIWEEKLY", startDate: "", endDate: "" });
                setShowPerModal(true);
              }}
            >
              <Plus className="h-4 w-4" /> Nuevo Período
            </Button>
          </div>
          <DataTable
            columns={[
              {
                key: "periodType",
                header: "Tipo",
                render: (r: any) =>
                  PAYMENT_FREQUENCIES.find((f) => f.value === r.periodType)?.label || r.periodType,
              },
              {
                key: "startDate",
                header: "Inicio",
                render: (r: any) => fmtDate(r.startDate),
              },
              {
                key: "endDate",
                header: "Fin",
                render: (r: any) => fmtDate(r.endDate),
              },
              {
                key: "status",
                header: "Estado",
                render: (r: any) => {
                  const s = PAYROLL_STATUS_MAP[r.status] || { label: r.status, variant: "gray" };
                  return <StatusBadge label={s.label} variant={s.variant as any} />;
                },
              },
              {
                key: "totalGross",
                header: "Bruto",
                render: (r: any) => fmt(r.totalGross),
              },
              {
                key: "totalDeductions",
                header: "Deducciones",
                render: (r: any) => fmt(r.totalDeductions),
              },
              {
                key: "totalNet",
                header: "Neto",
                render: (r: any) => fmt(r.totalNet),
              },
              {
                key: "_count",
                header: "Recibos",
                render: (r: any) => r._count?.receipts ?? 0,
              },
              {
                key: "actions",
                header: "Acciones",
                render: (r: any) => (
                  <div className="flex gap-2">
                    {r.status === "DRAFT" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          calculatePeriod(r.id);
                        }}
                        className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        <Calculator className="h-3.5 w-3.5" /> Calcular
                      </button>
                    )}
                    {r.status === "CALCULATED" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          approvePeriod(r.id);
                        }}
                        className="flex items-center gap-1 text-sm font-medium text-green-600 hover:text-green-800"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Aprobar
                      </button>
                    )}
                    {r.status !== "DRAFT" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          viewReceipts(r);
                        }}
                        className="flex items-center gap-1 text-sm font-medium text-black hover:text-gray-700"
                      >
                        <Eye className="h-3.5 w-3.5" /> Recibos
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
            data={periods}
            loading={loadingPer}
            emptyMessage="No hay períodos de nómina"
          />
        </div>
      )}

      {/* ══════════ RECIBOS TAB ══════════ */}
      {activeTab === "Detalle de Recibos" && (
        <div className="mt-4">
          {selectedPeriod ? (
            <>
              <div className="mb-4 flex items-center gap-4">
                <button
                  onClick={() => {
                    setActiveTab("Períodos de Nómina");
                    setSelectedPeriod(null);
                  }}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="h-4 w-4" /> Volver a períodos
                </button>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Período:</span> {fmtDate(selectedPeriod.startDate)}{" "}
                  — {fmtDate(selectedPeriod.endDate)}
                  {" · "}
                  {PAYMENT_FREQUENCIES.find((f) => f.value === selectedPeriod.periodType)?.label}
                </div>
              </div>

              {/* Period totals */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Bruto Total", value: fmt(selectedPeriod.totalGross) },
                  { label: "Deducciones", value: fmt(selectedPeriod.totalDeductions) },
                  { label: "Neto Total", value: fmt(selectedPeriod.totalNet) },
                  { label: "Costo Patronal", value: fmt(selectedPeriod.totalEmployerCost) },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-lg border bg-white p-3 text-center shadow-sm"
                  >
                    <p className="text-xs text-gray-500">{c.label}</p>
                    <p className="mt-1 text-lg font-bold text-gray-900">{c.value}</p>
                  </div>
                ))}
              </div>

              <DataTable
                columns={[
                  {
                    key: "employee",
                    header: "Empleado",
                    render: (r: any) =>
                      r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "—",
                  },
                  {
                    key: "branch",
                    header: "Sucursal",
                    render: (r: any) => r.branch?.name || "—",
                  },
                  {
                    key: "daysWorked",
                    header: "Días",
                    render: (r: any) => safeNum(r.daysWorked),
                  },
                  {
                    key: "grossSalary",
                    header: "Bruto",
                    render: (r: any) => fmt(r.grossSalary),
                  },
                  {
                    key: "isrWithheld",
                    header: "ISR",
                    render: (r: any) => fmt(r.isrWithheld),
                  },
                  {
                    key: "imssEmployee",
                    header: "IMSS Emp.",
                    render: (r: any) => fmt(r.imssEmployee),
                  },
                  {
                    key: "netSalary",
                    header: "Neto",
                    render: (r: any) => (
                      <span className="font-semibold text-green-700">{fmt(r.netSalary)}</span>
                    ),
                  },
                  {
                    key: "employerImss",
                    header: "IMSS Patrón",
                    render: (r: any) => fmt(r.employerImss),
                  },
                  {
                    key: "employerRcv",
                    header: "RCV",
                    render: (r: any) => fmt(r.employerRcv),
                  },
                  {
                    key: "employerInfonavit",
                    header: "Infonavit",
                    render: (r: any) => fmt(r.employerInfonavit),
                  },
                ]}
                data={receipts}
                loading={loadingRec}
                emptyMessage="No hay recibos para este período"
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Eye className="h-12 w-12 mb-2" />
              <p>
                Selecciona un período desde la pestaña "Períodos de Nómina" para ver sus recibos
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════ CFDI NÓMINA TAB ══════════ */}
      {activeTab === "CFDI Nómina" && (
        <div className="mt-4">
          {/* Period selector */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <FormField label="Seleccionar Período">
              <Select
                value={cfdiPeriodId}
                onChange={(e) => {
                  setCfdiPeriodId(e.target.value);
                  fetchCfdiReceipts(e.target.value);
                }}
              >
                <option value="">Seleccionar período...</option>
                {periods
                  .filter((p: any) => p.status !== "DRAFT")
                  .map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {fmtDate(p.startDate)} — {fmtDate(p.endDate)} (
                      {PAYMENT_FREQUENCIES.find((f) => f.value === p.periodType)?.label})
                    </option>
                  ))}
              </Select>
            </FormField>
            {cfdiPeriodId && (
              <div className="flex items-center gap-2 pt-5">
                <Button onClick={generateBatchCfdi} disabled={generatingBatch || loadingCfdi}>
                  {generatingBatch ? (
                    <>
                      <Clock className="h-4 w-4 animate-spin" /> Generando...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" /> Generar Todos
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {cfdiPeriodId ? (
            <>
              <DataTable
                columns={[
                  {
                    key: "employeeName",
                    header: "Empleado",
                    render: (r: any) => r.employeeName,
                  },
                  {
                    key: "employeeRfc",
                    header: "RFC",
                    render: (r: any) => r.employeeRfc || "—",
                  },
                  {
                    key: "grossSalary",
                    header: "Sueldo Bruto",
                    render: (r: any) => fmt(r.grossSalary),
                  },
                  {
                    key: "isrWithheld",
                    header: "ISR",
                    render: (r: any) => fmt(r.isrWithheld),
                  },
                  {
                    key: "imssEmployee",
                    header: "IMSS",
                    render: (r: any) => fmt(r.imssEmployee),
                  },
                  {
                    key: "netSalary",
                    header: "Neto",
                    render: (r: any) => (
                      <span className="font-semibold text-green-700">{fmt(r.netSalary)}</span>
                    ),
                  },
                  {
                    key: "cfdiStatus",
                    header: "CFDI",
                    render: (r: any) => {
                      if (!r.cfdiStatus) {
                        return <StatusBadge label="Sin CFDI" variant="gray" />;
                      }
                      if (r.cfdiStatus === "DRAFT") {
                        return <StatusBadge label="Borrador" variant="yellow" />;
                      }
                      if (r.cfdiStatus === "STAMPED") {
                        return <StatusBadge label="Timbrado" variant="green" />;
                      }
                      return <StatusBadge label={r.cfdiStatus} variant="gray" />;
                    },
                  },
                  {
                    key: "actions",
                    header: "Acciones",
                    render: (r: any) => (
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            previewCfdiXml(r.receiptId);
                          }}
                          className="flex items-center gap-1 text-sm font-medium text-black hover:text-gray-700"
                        >
                          <Eye className="h-3.5 w-3.5" /> XML
                        </button>
                        {!r.cfdiStatus && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              generateSingleCfdi(r.receiptId);
                            }}
                            disabled={generatingCfdi === r.receiptId}
                            className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                          >
                            {generatingCfdi === r.receiptId ? (
                              <Clock className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileText className="h-3.5 w-3.5" />
                            )}
                            Generar
                          </button>
                        )}
                        {r.cfdiStatus && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              previewCfdiXml(r.receiptId);
                            }}
                            className="flex items-center gap-1 text-sm font-medium text-green-600 hover:text-green-800"
                          >
                            <Download className="h-3.5 w-3.5" /> Descargar
                          </button>
                        )}
                      </div>
                    ),
                  },
                ]}
                data={cfdiReceipts}
                loading={loadingCfdi}
                emptyMessage="No hay recibos en este período"
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText className="h-12 w-12 mb-2" />
              <p>Selecciona un período para ver y generar CFDIs de nómina</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════ CFDI XML PREVIEW MODAL ══════════ */}
      <Modal
        open={showCfdiPreview}
        onClose={() => setShowCfdiPreview(false)}
        title="Vista Previa CFDI Nómina (XML)"
        wide
      >
        {cfdiPreviewLoading ? (
          <div className="flex items-center justify-center py-12">
            <Clock className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Cargando...</span>
          </div>
        ) : (
          <>
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs text-gray-800">
                {cfdiPreviewXml}
              </pre>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCfdiPreview(false)}>
                Cerrar
              </Button>
              <Button onClick={() => downloadXml(cfdiPreviewXml, `cfdi-nomina-${Date.now()}.xml`)}>
                <Download className="h-4 w-4" /> Descargar XML
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ══════════ SUA / IMSS TAB ══════════ */}
      {activeTab === "SUA / IMSS" && (
        <div className="mt-4">
          {/* Year/Month Selector */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Ano:</label>
              <select
                value={suaYear}
                onChange={(e) => setSuaYear(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Mes:</label>
              <select
                value={suaMonth}
                onChange={(e) => setSuaMonth(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="mb-4 flex gap-2">
            {[
              { key: "movements" as const, label: "Movimientos del Mes", icon: Users },
              { key: "summary" as const, label: "Resumen de Cuotas", icon: DollarSign },
              { key: "export" as const, label: "Exportar Archivo", icon: FileText },
            ].map((st) => {
              const Icon = st.icon;
              return (
                <button
                  key={st.key}
                  onClick={() => setSuaSection(st.key)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    suaSection === st.key
                      ? "bg-black text-white"
                      : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {st.label}
                </button>
              );
            })}
          </div>

          {/* ── Movimientos del Mes ── */}
          {suaSection === "movements" && (
            <div>
              {/* Summary badges */}
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                  <p className="text-xs text-green-600">Altas</p>
                  <p className="text-xl font-bold text-green-700">
                    {suaMovements.filter((m) => m.movementType === "08").length}
                  </p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-xs text-red-600">Bajas</p>
                  <p className="text-xl font-bold text-red-700">
                    {suaMovements.filter((m) => m.movementType === "02").length}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                  <p className="text-xs text-amber-600">Modificaciones</p>
                  <p className="text-xl font-bold text-amber-700">
                    {suaMovements.filter((m) => m.movementType === "07").length}
                  </p>
                </div>
              </div>

              <DataTable
                columns={[
                  { key: "nss", header: "NSS" },
                  {
                    key: "name",
                    header: "Empleado",
                    render: (r: any) => `${r.firstName} ${r.lastName}`,
                  },
                  { key: "curp", header: "CURP" },
                  {
                    key: "movementType",
                    header: "Tipo Movimiento",
                    render: (r: any) => {
                      const variants: Record<string, string> = {
                        "08": "bg-green-100 text-green-700",
                        "02": "bg-red-100 text-red-700",
                        "07": "bg-amber-100 text-amber-700",
                      };
                      return (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[r.movementType] || "bg-gray-100 text-gray-700"}`}
                        >
                          {r.movementLabel}
                        </span>
                      );
                    },
                  },
                  { key: "date", header: "Fecha" },
                  {
                    key: "salary",
                    header: "SBC",
                    render: (r: any) => fmt(r.salary),
                  },
                ]}
                data={suaMovements}
                loading={loadingSua}
                emptyMessage="No hay movimientos para este periodo"
              />
            </div>
          )}

          {/* ── Resumen de Cuotas ── */}
          {suaSection === "summary" && suaSummary && (
            <div>
              {/* KPI Cards */}
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Patronal</p>
                      <p className="text-lg font-bold text-gray-900">
                        {fmt(suaSummary.totalEmployer)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Obrero</p>
                      <p className="text-lg font-bold text-gray-900">
                        {fmt(suaSummary.totalEmployee)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total a Pagar</p>
                      <p className="text-lg font-bold text-gray-900">
                        {fmt(suaSummary.totalContribution)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* By Branch table */}
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                Desglose por Ramo de Seguro
              </h3>
              <DataTable
                columns={[
                  { key: "branchLabel", header: "Ramo" },
                  {
                    key: "employerRate",
                    header: "Tasa Patronal",
                    render: (r: any) => `${(safeNum(r.employerRate) * 100).toFixed(3)}%`,
                  },
                  {
                    key: "employeeRate",
                    header: "Tasa Obrero",
                    render: (r: any) => `${(safeNum(r.employeeRate) * 100).toFixed(3)}%`,
                  },
                  {
                    key: "employerAmount",
                    header: "Monto Patronal",
                    render: (r: any) => fmt(r.employerAmount),
                  },
                  {
                    key: "employeeAmount",
                    header: "Monto Obrero",
                    render: (r: any) => fmt(r.employeeAmount),
                  },
                  {
                    key: "total",
                    header: "Total",
                    render: (r: any) => <span className="font-semibold">{fmt(r.total)}</span>,
                  },
                ]}
                data={suaSummary.byBranch || []}
                loading={loadingSua}
                emptyMessage="No hay datos de cuotas"
              />

              {/* By Employee table */}
              <h3 className="mb-2 mt-6 text-sm font-semibold text-gray-700">
                Desglose por Empleado
              </h3>
              <DataTable
                columns={[
                  { key: "employeeName", header: "Empleado" },
                  { key: "nss", header: "NSS" },
                  {
                    key: "sbc",
                    header: "SBC",
                    render: (r: any) => fmt(r.sbc),
                  },
                  {
                    key: "employerTotal",
                    header: "Patronal",
                    render: (r: any) => fmt(r.employerTotal),
                  },
                  {
                    key: "employeeTotal",
                    header: "Obrero",
                    render: (r: any) => fmt(r.employeeTotal),
                  },
                  {
                    key: "total",
                    header: "Total",
                    render: (r: any) => <span className="font-semibold">{fmt(r.total)}</span>,
                  },
                ]}
                data={suaSummary.byEmployee || []}
                loading={loadingSua}
                emptyMessage="No hay empleados activos"
              />
            </div>
          )}

          {suaSection === "summary" && !suaSummary && !loadingSua && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Shield className="h-12 w-12 mb-2" />
              <p>No hay datos de cuotas para este periodo</p>
            </div>
          )}

          {/* ── Export Section ── */}
          {suaSection === "export" && (
            <div>
              <div className="mb-4 flex gap-3">
                <Button onClick={generateSuaFile}>
                  <Upload className="h-4 w-4" /> Generar Archivo SUA
                </Button>
                <Button variant="outline" onClick={downloadSuaFile}>
                  <Download className="h-4 w-4" /> Descargar .sua
                </Button>
              </div>

              {/* File preview */}
              {suaFileContent && (
                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">
                    Vista previa del archivo
                  </h3>
                  <textarea
                    readOnly
                    value={suaFileContent}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs text-gray-700"
                    rows={Math.min(20, (suaFileContent.split("\n").length || 1) + 2)}
                  />
                </div>
              )}

              {/* History */}
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                Historial de Exportaciones
              </h3>
              <DataTable
                columns={[
                  {
                    key: "period",
                    header: "Periodo",
                    render: (r: any) => `${MONTH_NAMES[r.month - 1]} ${r.year}`,
                  },
                  { key: "movementCount", header: "Movimientos" },
                  {
                    key: "totalEmployer",
                    header: "Total Patronal",
                    render: (r: any) => fmt(r.totalEmployer),
                  },
                  {
                    key: "totalEmployee",
                    header: "Total Obrero",
                    render: (r: any) => fmt(r.totalEmployee),
                  },
                  {
                    key: "totalAmount",
                    header: "Total",
                    render: (r: any) => <span className="font-semibold">{fmt(r.totalAmount)}</span>,
                  },
                  {
                    key: "createdAt",
                    header: "Fecha Generacion",
                    render: (r: any) => fmtDate(r.createdAt),
                  },
                ]}
                data={suaHistory}
                loading={false}
                emptyMessage="No hay exportaciones previas"
              />
            </div>
          )}
        </div>
      )}

      {/* ══════════ WORKY TAB ══════════ */}
      {activeTab === "Worky" && (
        <div className="mt-4">
          {/* Sub-tabs */}
          <div className="mb-4 flex gap-2">
            {[
              { key: "config" as const, label: "Configuracion", icon: Settings },
              { key: "import" as const, label: "Importar", icon: Upload },
              { key: "history" as const, label: "Historial de Sincronizacion", icon: Clock },
            ].map((st) => {
              const Icon = st.icon;
              return (
                <button
                  key={st.key}
                  onClick={() => setWorkySection(st.key)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    workySection === st.key
                      ? "bg-black text-white"
                      : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {st.label}
                </button>
              );
            })}
          </div>

          {/* ── Configuracion ── */}
          {workySection === "config" && (
            <div className="max-w-xl">
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                    <Link2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Conexion con Worky</h3>
                    <p className="text-xs text-gray-500">
                      Configura tu cuenta de Worky para sincronizar empleados
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <FormField label="API Key">
                    <Input
                      type="password"
                      value={workyConfigForm.apiKey}
                      onChange={(e) =>
                        setWorkyConfigForm({ ...workyConfigForm, apiKey: e.target.value })
                      }
                      placeholder="Ingresa tu API Key de Worky"
                    />
                  </FormField>
                  <FormField label="Company ID">
                    <Input
                      value={workyConfigForm.companyId}
                      onChange={(e) =>
                        setWorkyConfigForm({ ...workyConfigForm, companyId: e.target.value })
                      }
                      placeholder="ID de empresa en Worky"
                    />
                  </FormField>
                  <FormField label="Frecuencia de Sincronizacion">
                    <Select
                      value={workyConfigForm.syncFrequency}
                      onChange={(e) =>
                        setWorkyConfigForm({ ...workyConfigForm, syncFrequency: e.target.value })
                      }
                    >
                      <option value="MANUAL">Manual</option>
                      <option value="DAILY">Diario</option>
                      <option value="WEEKLY">Semanal</option>
                    </Select>
                  </FormField>
                </div>

                {workyConfig?.lastSyncAt && (
                  <p className="mt-4 text-xs text-gray-500">
                    Ultima sincronizacion: {fmtDate(workyConfig.lastSyncAt)}
                  </p>
                )}

                <div className="mt-6 flex gap-3">
                  <Button onClick={saveWorkyConfig} disabled={loadingWorky}>
                    {loadingWorky ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Settings className="h-4 w-4" />
                    )}
                    Guardar
                  </Button>
                  <Button variant="outline" onClick={testWorkyConnection} disabled={loadingWorky}>
                    {loadingWorky ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    Probar Conexion
                  </Button>
                </div>

                {/* Test result */}
                {workyTestResult && (
                  <div
                    className={`mt-4 rounded-lg p-3 text-sm ${
                      workyTestResult.success
                        ? "border border-green-200 bg-green-50 text-green-700"
                        : "border border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {workyTestResult.success ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      <span className="font-medium">{workyTestResult.message}</span>
                    </div>
                    {workyTestResult.success && workyTestResult.companyName && (
                      <p className="mt-1 text-xs">
                        Empresa: {workyTestResult.companyName} | Empleados:{" "}
                        {workyTestResult.employeeCount}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Importar ── */}
          {workySection === "import" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Sync from Worky */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Sincronizar desde Worky</h3>
                    <p className="text-xs text-gray-500">
                      Descarga y sincroniza empleados directamente desde la API de Worky
                    </p>
                  </div>
                </div>

                <Button onClick={syncWorkyEmployees} disabled={workySyncing}>
                  {workySyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {workySyncing ? "Sincronizando..." : "Sincronizar Empleados"}
                </Button>

                {/* Sync result */}
                {workySyncResult && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <h4 className="text-sm font-semibold text-gray-700">Resultado</h4>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Total registros:</span>{" "}
                        <span className="font-medium">{workySyncResult.totalRecords}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Creados:</span>{" "}
                        <span className="font-medium text-green-600">
                          {workySyncResult.created}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Actualizados:</span>{" "}
                        <span className="font-medium text-blue-600">{workySyncResult.updated}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Fallidos:</span>{" "}
                        <span className="font-medium text-red-600">{workySyncResult.failed}</span>
                      </div>
                    </div>
                    {workySyncResult.errors?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-red-600">Errores:</p>
                        {workySyncResult.errors.map((err: any, idx: number) => (
                          <p key={idx} className="text-xs text-red-500">
                            {err.employee}: {err.error}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* CSV Import */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Importar CSV</h3>
                    <p className="text-xs text-gray-500">
                      Carga un archivo CSV con datos de empleados
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <FormField label="Sucursal destino" required>
                    <Select value={csvBranchId} onChange={(e) => setCsvBranchId(e.target.value)}>
                      <option value="">Seleccionar sucursal...</option>
                      {branches.map((b: any) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField label="Archivo CSV">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvFileUpload}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-3 file:py-1 file:text-sm file:text-white hover:file:bg-gray-800"
                    />
                  </FormField>

                  {csvContent && (
                    <p className="text-xs text-green-600">
                      Archivo cargado ({csvContent.split("\n").length - 1} filas detectadas)
                    </p>
                  )}

                  <Button
                    onClick={importWorkyCsv}
                    disabled={csvImporting || !csvContent || !csvBranchId}
                  >
                    {csvImporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {csvImporting ? "Importando..." : "Importar"}
                  </Button>
                </div>

                {/* CSV format hint */}
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-700">Formato esperado del CSV:</p>
                  <p className="mt-1 font-mono text-xs text-amber-600">
                    employeeNumber,firstName,lastName,curp,rfc,nss,hireDate,position,department,dailySalary,bankAccount,clabe
                  </p>
                  <p className="mt-1 text-xs text-amber-600">
                    Ejemplo: EMP-001,Juan,Perez
                    Lopez,PELJ900101...,PELJ900101ABC,12345678901,2024-01-15,Pokero,Operaciones,350.00,1234567890,012345678901234567
                  </p>
                </div>

                {/* CSV result */}
                {csvResult && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <h4 className="text-sm font-semibold text-gray-700">
                      Resultado de Importacion
                    </h4>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Total registros:</span>{" "}
                        <span className="font-medium">{csvResult.totalRecords}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Creados:</span>{" "}
                        <span className="font-medium text-green-600">{csvResult.created}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Actualizados:</span>{" "}
                        <span className="font-medium text-blue-600">{csvResult.updated}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Fallidos:</span>{" "}
                        <span className="font-medium text-red-600">{csvResult.failed}</span>
                      </div>
                    </div>
                    {csvResult.errors?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-red-600">Errores:</p>
                        {csvResult.errors.slice(0, 10).map((err: any, idx: number) => (
                          <p key={idx} className="text-xs text-red-500">
                            Fila {err.row}: {err.employee} - {err.error}
                          </p>
                        ))}
                        {csvResult.errors.length > 10 && (
                          <p className="text-xs text-red-400">
                            ...y {csvResult.errors.length - 10} errores mas
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Historial de Sincronizacion ── */}
          {workySection === "history" && (
            <div>
              <DataTable
                columns={[
                  {
                    key: "createdAt",
                    header: "Fecha",
                    render: (r: any) => fmtDate(r.createdAt),
                  },
                  { key: "syncType", header: "Tipo" },
                  {
                    key: "status",
                    header: "Estado",
                    render: (r: any) => {
                      const variants: Record<string, string> = {
                        PENDING: "bg-gray-100 text-gray-700",
                        IN_PROGRESS: "bg-blue-100 text-blue-700",
                        COMPLETED: "bg-green-100 text-green-700",
                        FAILED: "bg-red-100 text-red-700",
                      };
                      const labels: Record<string, string> = {
                        PENDING: "Pendiente",
                        IN_PROGRESS: "En progreso",
                        COMPLETED: "Completado",
                        FAILED: "Fallido",
                      };
                      return (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[r.status] || "bg-gray-100 text-gray-700"}`}
                        >
                          {labels[r.status] || r.status}
                        </span>
                      );
                    },
                  },
                  { key: "totalRecords", header: "Total" },
                  {
                    key: "created",
                    header: "Creados",
                    render: (r: any) => <span className="text-green-600">{r.created}</span>,
                  },
                  {
                    key: "updated",
                    header: "Actualizados",
                    render: (r: any) => <span className="text-blue-600">{r.updated}</span>,
                  },
                  {
                    key: "failed",
                    header: "Fallidos",
                    render: (r: any) => (
                      <span className={r.failed > 0 ? "text-red-600 font-medium" : "text-gray-400"}>
                        {r.failed}
                      </span>
                    ),
                  },
                  {
                    key: "actions",
                    header: "",
                    render: (r: any) => (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          viewSyncDetail(r.id);
                        }}
                        className="text-sm font-medium text-black hover:text-gray-700"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    ),
                  },
                ]}
                data={workySyncHistory}
                loading={false}
                emptyMessage="No hay registros de sincronizacion"
              />
            </div>
          )}
        </div>
      )}

      {/* ══════════ WORKY SYNC DETAIL MODAL ══════════ */}
      <Modal
        open={showSyncDetailModal}
        onClose={() => setShowSyncDetailModal(false)}
        title="Detalle de Sincronizacion"
      >
        {workySyncDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Tipo:</span>{" "}
                <span className="font-medium">{workySyncDetail.syncType}</span>
              </div>
              <div>
                <span className="text-gray-500">Estado:</span>{" "}
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    workySyncDetail.status === "COMPLETED"
                      ? "bg-green-100 text-green-700"
                      : workySyncDetail.status === "FAILED"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {workySyncDetail.status === "COMPLETED"
                    ? "Completado"
                    : workySyncDetail.status === "FAILED"
                      ? "Fallido"
                      : workySyncDetail.status}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Total registros:</span>{" "}
                <span className="font-medium">{workySyncDetail.totalRecords}</span>
              </div>
              <div>
                <span className="text-gray-500">Fecha:</span>{" "}
                <span className="font-medium">{fmtDate(workySyncDetail.createdAt)}</span>
              </div>
              <div>
                <span className="text-gray-500">Creados:</span>{" "}
                <span className="font-medium text-green-600">{workySyncDetail.created}</span>
              </div>
              <div>
                <span className="text-gray-500">Actualizados:</span>{" "}
                <span className="font-medium text-blue-600">{workySyncDetail.updated}</span>
              </div>
              <div>
                <span className="text-gray-500">Omitidos:</span>{" "}
                <span className="font-medium text-gray-500">{workySyncDetail.skipped}</span>
              </div>
              <div>
                <span className="text-gray-500">Fallidos:</span>{" "}
                <span className="font-medium text-red-600">{workySyncDetail.failed}</span>
              </div>
            </div>

            {/* Errors list */}
            {Array.isArray(workySyncDetail.errors) && workySyncDetail.errors.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-red-600">
                  Errores ({workySyncDetail.errors.length})
                </h4>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3">
                  {workySyncDetail.errors.map((err: any, idx: number) => (
                    <div key={idx} className="mb-1 text-xs text-red-700">
                      <span className="font-medium">
                        {err.employee || err.row ? `Fila ${err.row}` : "General"}:
                      </span>{" "}
                      {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={() => setShowSyncDetailModal(false)}>
            Cerrar
          </Button>
        </div>
      </Modal>

      {/* ══════════ EMPLOYEE MODAL ══════════ */}
      <Modal
        open={showEmpModal}
        onClose={() => setShowEmpModal(false)}
        title={editingEmp ? "Editar Empleado" : "Nuevo Empleado"}
        wide
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!editingEmp && (
            <FormField label="# Empleado" required>
              <Input
                value={empForm.employeeNumber}
                onChange={(e) => setEmpForm({ ...empForm, employeeNumber: e.target.value })}
                placeholder="EMP-001"
              />
            </FormField>
          )}
          <FormField label="Nombre(s)" required>
            <Input
              value={empForm.firstName}
              onChange={(e) => setEmpForm({ ...empForm, firstName: e.target.value })}
              disabled={!!editingEmp}
            />
          </FormField>
          <FormField label="Apellidos" required>
            <Input
              value={empForm.lastName}
              onChange={(e) => setEmpForm({ ...empForm, lastName: e.target.value })}
              disabled={!!editingEmp}
            />
          </FormField>
          <FormField label="Sucursal" required>
            <Select
              value={empForm.branchId}
              onChange={(e) => setEmpForm({ ...empForm, branchId: e.target.value })}
            >
              <option value="">Seleccionar...</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Puesto" required>
            <Input
              value={empForm.jobPosition}
              onChange={(e) => setEmpForm({ ...empForm, jobPosition: e.target.value })}
            />
          </FormField>
          <FormField label="Departamento">
            <Input
              value={empForm.department}
              onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })}
            />
          </FormField>
          <FormField label="Salario Diario" required>
            <Input
              type="number"
              step="0.01"
              value={empForm.dailySalary}
              onChange={(e) => setEmpForm({ ...empForm, dailySalary: e.target.value })}
            />
          </FormField>
          <FormField label="Tipo de Contrato">
            <Select
              value={empForm.contractType}
              onChange={(e) => setEmpForm({ ...empForm, contractType: e.target.value })}
              disabled={!!editingEmp}
            >
              {CONTRACT_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Frecuencia de Pago">
            <Select
              value={empForm.paymentFrequency}
              onChange={(e) => setEmpForm({ ...empForm, paymentFrequency: e.target.value })}
            >
              {PAYMENT_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </FormField>
          {!editingEmp && (
            <FormField label="Fecha de Ingreso" required>
              <Input
                type="date"
                value={empForm.hireDate}
                onChange={(e) => setEmpForm({ ...empForm, hireDate: e.target.value })}
              />
            </FormField>
          )}
          <FormField label="CURP">
            <Input
              value={empForm.curp}
              onChange={(e) => setEmpForm({ ...empForm, curp: e.target.value })}
              maxLength={18}
              disabled={!!editingEmp}
            />
          </FormField>
          <FormField label="RFC">
            <Input
              value={empForm.rfc}
              onChange={(e) => setEmpForm({ ...empForm, rfc: e.target.value })}
              maxLength={13}
              disabled={!!editingEmp}
            />
          </FormField>
          <FormField label="NSS (IMSS)">
            <Input
              value={empForm.nss}
              onChange={(e) => setEmpForm({ ...empForm, nss: e.target.value })}
              maxLength={11}
              disabled={!!editingEmp}
            />
          </FormField>
          <FormField label="Cuenta Bancaria">
            <Input
              value={empForm.bankAccount}
              onChange={(e) => setEmpForm({ ...empForm, bankAccount: e.target.value })}
            />
          </FormField>
          <FormField label="CLABE">
            <Input
              value={empForm.clabe}
              onChange={(e) => setEmpForm({ ...empForm, clabe: e.target.value })}
              maxLength={18}
            />
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowEmpModal(false)}>
            Cancelar
          </Button>
          <Button onClick={saveEmployee}>
            {editingEmp ? "Guardar Cambios" : "Crear Empleado"}
          </Button>
        </div>
      </Modal>

      {/* ══════════ TERMINATE MODAL ══════════ */}
      <Modal
        open={showTermModal}
        onClose={() => setShowTermModal(false)}
        title="Dar de Baja Empleado"
      >
        <p className="text-sm text-gray-600">
          ¿Confirmas la baja de{" "}
          <span className="font-semibold">
            {terminatingEmp?.firstName} {terminatingEmp?.lastName}
          </span>
          ?
        </p>
        <div className="mt-4">
          <FormField label="Fecha de Baja" required>
            <Input type="date" value={termDate} onChange={(e) => setTermDate(e.target.value)} />
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowTermModal(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmTerminate}>
            <UserX className="h-4 w-4" /> Confirmar Baja
          </Button>
        </div>
      </Modal>

      {/* ══════════ NEW PERIOD MODAL ══════════ */}
      <Modal
        open={showPerModal}
        onClose={() => setShowPerModal(false)}
        title="Nuevo Período de Nómina"
      >
        <div className="space-y-4">
          <FormField label="Tipo de Período" required>
            <Select
              value={perForm.periodType}
              onChange={(e) => setPerForm({ ...perForm, periodType: e.target.value })}
            >
              {PAYMENT_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Fecha Inicio" required>
            <Input
              type="date"
              value={perForm.startDate}
              onChange={(e) => setPerForm({ ...perForm, startDate: e.target.value })}
            />
          </FormField>
          <FormField label="Fecha Fin" required>
            <Input
              type="date"
              value={perForm.endDate}
              onChange={(e) => setPerForm({ ...perForm, endDate: e.target.value })}
            />
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowPerModal(false)}>
            Cancelar
          </Button>
          <Button onClick={createPeriod}>Crear Período</Button>
        </div>
      </Modal>
    </div>
  );
}
