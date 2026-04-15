"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, Input, Select } from "@/components/ui/form-field";
import {
  Plus,
  Pencil,
  Trash2,
  Landmark,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle,
  XCircle,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Upload,
  RefreshCw,
} from "lucide-react";
import { exportToCSV } from "@/lib/export-csv";
import { safeNum } from "@luka/shared";
import type { BankAccount, Transaction, Branch, Supplier } from "@luka/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Payable {
  id: string;
  supplierId: string;
  branchId: string;
  invoiceNumber: string;
  amount: number;
  balanceDue: number;
  dueDate: string;
  status: string;
  supplier?: { id: string; name: string };
  branch?: { id: string; name: string };
}

interface Receivable {
  id: string;
  branchId: string;
  customerName?: string;
  cfdi?: string;
  amount: number;
  balanceDue: number;
  dueDate: string;
  status: string;
  branch?: { id: string; name: string };
}

interface ReconciliationSummary {
  total: number;
  reconciled: number;
  unreconciled: number;
  percentage: number;
  reconciledAmount: number;
  pendingAmount: number;
}

interface RecTransaction {
  id: string;
  bankAccountId: string;
  transactionDate: string;
  amount: number;
  type: "credit" | "debit";
  reference: string | null;
  description: string | null;
  isReconciled: boolean;
  reconciledWithType: string | null;
  reconciledWithId: string | null;
  importedFrom: string | null;
}

interface MatchCandidate {
  id: string;
  invoiceNumber?: string;
  amount: number;
  balanceDue: number;
  dueDate: string;
  status: string;
  supplier?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TABS = [
  "Cuentas Bancarias",
  "Movimientos",
  "Cuentas por Pagar",
  "Cuentas por Cobrar",
  "Conciliacion",
  "Flujo de Efectivo",
];

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(safeNum(n));

const statusVariant = (s: string): string => {
  switch (s) {
    case "PENDING":
      return "yellow";
    case "PARTIALLY_PAID":
      return "blue";
    case "PAID":
      return "green";
    case "OVERDUE":
      return "red";
    case "CANCELLED":
      return "gray";
    default:
      return "gray";
  }
};

const statusLabel = (s: string): string => {
  switch (s) {
    case "PENDING":
      return "Pendiente";
    case "PARTIALLY_PAID":
      return "Parcial";
    case "PAID":
      return "Pagado";
    case "OVERDUE":
      return "Vencido";
    case "CANCELLED":
      return "Cancelado";
    default:
      return s;
  }
};

const isOverdue = (dueDate: string, status: string) => {
  if (status === "PAID" || status === "CANCELLED") return false;
  return new Date(dueDate) < new Date();
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export default function BancosPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("Cuentas Bancarias");

  // ---- Search & Pagination state ----
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

  // Shared data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Cuentas Bancarias
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountModal, setAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [accountForm, setAccountForm] = useState({
    bankName: "",
    accountNumber: "",
    clabe: "",
    branchId: "",
    currency: "MXN",
    currentBalance: 0,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Movimientos
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txModal, setTxModal] = useState(false);
  const [txForm, setTxForm] = useState({
    bankAccountId: "",
    transactionDate: "",
    amount: 0,
    type: "credit" as "credit" | "debit",
    reference: "",
    description: "",
  });

  // Cuentas por Pagar
  const [payables, setPayables] = useState<Payable[]>([]);
  const [payablesLoading, setPayablesLoading] = useState(true);
  const [cxpModal, setCxpModal] = useState(false);
  const [cxpForm, setCxpForm] = useState({
    supplierId: "",
    branchId: "",
    invoiceNumber: "",
    amount: 0,
    dueDate: "",
  });
  const [paymentModal, setPaymentModal] = useState<{
    type: "cxp" | "cxc";
    id: string;
    balanceDue: number;
  } | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    paymentDate: "",
    paymentMethod: "Transferencia",
  });

  // Cuentas por Cobrar
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [receivablesLoading, setReceivablesLoading] = useState(true);
  const [cxcModal, setCxcModal] = useState(false);
  const [cxcForm, setCxcForm] = useState({
    branchId: "",
    amount: 0,
    dueDate: "",
  });

  // Conciliacion
  const [recAccountId, setRecAccountId] = useState("");
  const [recSummary, setRecSummary] = useState<ReconciliationSummary | null>(null);
  const [recTransactions, setRecTransactions] = useState<RecTransaction[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recFilter, setRecFilter] = useState<"all" | "reconciled" | "unreconciled">("all");
  const [recAutoLoading, setRecAutoLoading] = useState(false);
  // Import modal
  const [importModal, setImportModal] = useState(false);
  const [importMode, setImportMode] = useState<"csv" | "manual">("csv");
  const [csvPreview, setCsvPreview] = useState<
    Array<{
      date: string;
      amount: number;
      type: "credit" | "debit";
      reference: string;
      description: string;
    }>
  >([]);
  const [manualImportForm, setManualImportForm] = useState({
    date: "",
    amount: 0,
    type: "credit" as "credit" | "debit",
    reference: "",
    description: "",
  });
  const [importLoading, setImportLoading] = useState(false);
  // Manual reconcile modal
  const [reconcileModal, setReconcileModal] = useState<RecTransaction | null>(null);
  const [matchSearch, setMatchSearch] = useState("");
  const [matchCandidates, setMatchCandidates] = useState<{
    payables: MatchCandidate[];
    receivables: MatchCandidate[];
  }>({ payables: [], receivables: [] });
  const [matchLoading, setMatchLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const data = await authFetch<BankAccount[]>("get", "/bancos/accounts");
      setAccounts(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    } finally {
      setAccountsLoading(false);
    }
  }, [authFetch]);

  const fetchTransactions = useCallback(
    async (accountId: string) => {
      if (!accountId) {
        setTransactions([]);
        return;
      }
      setTxLoading(true);
      try {
        const data = await authFetch<Transaction[]>(
          "get",
          `/bancos/transactions/account/${accountId}`,
        );
        setTransactions(data);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
        setTransactions([]);
      } finally {
        setTxLoading(false);
      }
    },
    [authFetch],
  );

  const fetchPayables = useCallback(async () => {
    setPayablesLoading(true);
    try {
      const data = await authFetch<Payable[]>("get", "/bancos/payable");
      setPayables(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    } finally {
      setPayablesLoading(false);
    }
  }, [authFetch]);

  const fetchReceivables = useCallback(async () => {
    setReceivablesLoading(true);
    try {
      const data = await authFetch<Receivable[]>("get", "/bancos/receivable");
      setReceivables(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    } finally {
      setReceivablesLoading(false);
    }
  }, [authFetch]);

  const fetchBranchesAndSuppliers = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([
        authFetch<Branch[]>("get", "/branches"),
        authFetch<Supplier[]>("get", "/compras/suppliers").catch(() => [] as Supplier[]),
      ]);
      setBranches(b);
      setSuppliers(s);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    }
  }, [authFetch]);

  // Reconciliation fetchers
  const fetchRecSummary = useCallback(
    async (accountId: string) => {
      if (!accountId) {
        setRecSummary(null);
        return;
      }
      try {
        const data = await authFetch<ReconciliationSummary>(
          "get",
          `/bancos/accounts/${accountId}/reconciliation-summary`,
        );
        setRecSummary(data);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
        setRecSummary(null);
      }
    },
    [authFetch],
  );

  const fetchRecTransactions = useCallback(
    async (accountId: string) => {
      if (!accountId) {
        setRecTransactions([]);
        return;
      }
      setRecLoading(true);
      try {
        const data = await authFetch<RecTransaction[]>(
          "get",
          `/bancos/transactions/account/${accountId}`,
        );
        setRecTransactions(data);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
        setRecTransactions([]);
      } finally {
        setRecLoading(false);
      }
    },
    [authFetch],
  );

  const triggerAutoReconcile = useCallback(async () => {
    if (!recAccountId) return;
    setRecAutoLoading(true);
    try {
      await authFetch("post", `/bancos/accounts/${recAccountId}/reconcile`);
      await Promise.all([fetchRecSummary(recAccountId), fetchRecTransactions(recAccountId)]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al actualizar", "error");
    } finally {
      setRecAutoLoading(false);
    }
  }, [authFetch, recAccountId, fetchRecSummary, fetchRecTransactions]);

  const handleImportCSV = useCallback(async () => {
    if (!recAccountId || csvPreview.length === 0) return;
    setImportLoading(true);
    try {
      await authFetch("post", `/bancos/accounts/${recAccountId}/import`, {
        transactions: csvPreview,
      });
      setCsvPreview([]);
      setImportModal(false);
      await Promise.all([
        fetchRecSummary(recAccountId),
        fetchRecTransactions(recAccountId),
        fetchAccounts(),
      ]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setImportLoading(false);
    }
  }, [authFetch, recAccountId, csvPreview, fetchRecSummary, fetchRecTransactions, fetchAccounts]);

  const handleImportManual = useCallback(async () => {
    if (!recAccountId || !manualImportForm.date || !manualImportForm.amount) return;
    setImportLoading(true);
    try {
      await authFetch("post", `/bancos/accounts/${recAccountId}/import`, {
        transactions: [manualImportForm],
      });
      setManualImportForm({ date: "", amount: 0, type: "credit", reference: "", description: "" });
      setImportModal(false);
      await Promise.all([
        fetchRecSummary(recAccountId),
        fetchRecTransactions(recAccountId),
        fetchAccounts(),
      ]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setImportLoading(false);
    }
  }, [
    authFetch,
    recAccountId,
    manualImportForm,
    fetchRecSummary,
    fetchRecTransactions,
    fetchAccounts,
  ]);

  const handleManualReconcile = useCallback(
    async (transactionId: string, type: string, entityId: string) => {
      try {
        await authFetch("post", `/bancos/transactions/${transactionId}/reconcile`, {
          type,
          entityId,
        });
        setReconcileModal(null);
        await Promise.all([fetchRecSummary(recAccountId), fetchRecTransactions(recAccountId)]);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Error al actualizar", "error");
      }
    },
    [authFetch, recAccountId, fetchRecSummary, fetchRecTransactions],
  );

  const handleUnreconcile = useCallback(
    async (transactionId: string) => {
      try {
        await authFetch("post", `/bancos/transactions/${transactionId}/unreconcile`);
        await Promise.all([fetchRecSummary(recAccountId), fetchRecTransactions(recAccountId)]);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Error al actualizar", "error");
      }
    },
    [authFetch, recAccountId, fetchRecSummary, fetchRecTransactions],
  );

  const searchMatches = useCallback(
    async (amount?: number, reference?: string) => {
      setMatchLoading(true);
      try {
        const params = new URLSearchParams();
        if (amount) params.set("amount", String(amount));
        if (reference) params.set("reference", reference);
        const data = await authFetch<{ payables: MatchCandidate[]; receivables: MatchCandidate[] }>(
          "get",
          `/bancos/reconciliation/search-matches?${params.toString()}`,
        );
        setMatchCandidates(data);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
        setMatchCandidates({ payables: [], receivables: [] });
      } finally {
        setMatchLoading(false);
      }
    },
    [authFetch],
  );

  // Load reconciliation data when account changes
  useEffect(() => {
    if (recAccountId) {
      fetchRecSummary(recAccountId);
      fetchRecTransactions(recAccountId);
    } else {
      setRecSummary(null);
      setRecTransactions([]);
    }
  }, [recAccountId, fetchRecSummary, fetchRecTransactions]);

  // CSV parsing helper
  const parseCSV = useCallback((text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return;
    const rows: Array<{
      date: string;
      amount: number;
      type: "credit" | "debit";
      reference: string;
      description: string;
    }> = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 3) continue;
      const amount = Math.abs(parseFloat(cols[1]) || 0);
      if (amount === 0) continue;
      const rawType = (cols[2] || "").toLowerCase();
      rows.push({
        date: cols[0] || "",
        amount,
        type: rawType === "debit" || rawType === "debito" ? "debit" : "credit",
        reference: cols[3] || "",
        description: cols[4] || "",
      });
    }
    setCsvPreview(rows);
  }, []);

  // Initial data load
  useEffect(() => {
    if (authLoading) return;
    fetchAccounts();
    fetchPayables();
    fetchReceivables();
    fetchBranchesAndSuppliers();
  }, [authLoading, fetchAccounts, fetchPayables, fetchReceivables, fetchBranchesAndSuppliers]);

  // Fetch transactions when account selection changes
  useEffect(() => {
    if (selectedAccountId) {
      fetchTransactions(selectedAccountId);
    } else {
      setTransactions([]);
    }
  }, [selectedAccountId, fetchTransactions]);

  // ---------------------------------------------------------------------------
  // Account CRUD
  // ---------------------------------------------------------------------------

  const openCreateAccount = () => {
    setEditingAccount(null);
    setAccountForm({
      bankName: "",
      accountNumber: "",
      clabe: "",
      branchId: "",
      currency: "MXN",
      currentBalance: 0,
    });
    setAccountModal(true);
  };

  const openEditAccount = (a: BankAccount) => {
    setEditingAccount(a);
    setAccountForm({
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      clabe: a.clabe,
      branchId: a.branchId || "",
      currency: a.currency,
      currentBalance: a.currentBalance,
    });
    setAccountModal(true);
  };

  const saveAccount = async () => {
    const body = {
      ...accountForm,
      branchId: accountForm.branchId || null,
      currentBalance: Number(accountForm.currentBalance),
    };
    try {
      if (editingAccount) {
        await authFetch("patch", `/bancos/accounts/${editingAccount.id}`, body);
      } else {
        await authFetch("post", "/bancos/accounts", body);
      }
      setAccountModal(false);
      fetchAccounts();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    }
  };

  const deleteAccount = async (id: string) => {
    try {
      await authFetch("delete", `/bancos/accounts/${id}`);
      setDeleteConfirm(null);
      fetchAccounts();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al eliminar", "error");
    }
  };

  // ---------------------------------------------------------------------------
  // Transaction CRUD
  // ---------------------------------------------------------------------------

  const openCreateTx = () => {
    setTxForm({
      bankAccountId: selectedAccountId,
      transactionDate: new Date().toISOString().slice(0, 10),
      amount: 0,
      type: "credit",
      reference: "",
      description: "",
    });
    setTxModal(true);
  };

  const saveTx = async () => {
    try {
      await authFetch("post", "/bancos/transactions", {
        ...txForm,
        amount: Number(txForm.amount),
      });
      setTxModal(false);
      fetchTransactions(selectedAccountId);
      fetchAccounts(); // balance may change
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    }
  };

  const reconcileTx = async (id: string) => {
    try {
      await authFetch("patch", `/bancos/transactions/${id}/reconcile`, {});
      fetchTransactions(selectedAccountId);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al actualizar", "error");
    }
  };

  // ---------------------------------------------------------------------------
  // CxP CRUD
  // ---------------------------------------------------------------------------

  const openCreateCxP = () => {
    setCxpForm({ supplierId: "", branchId: "", invoiceNumber: "", amount: 0, dueDate: "" });
    setCxpModal(true);
  };

  const saveCxP = async () => {
    try {
      await authFetch("post", "/bancos/payable", {
        ...cxpForm,
        amount: Number(cxpForm.amount),
      });
      setCxpModal(false);
      fetchPayables();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    }
  };

  // ---------------------------------------------------------------------------
  // CxC CRUD
  // ---------------------------------------------------------------------------

  const openCreateCxC = () => {
    setCxcForm({ branchId: "", amount: 0, dueDate: "" });
    setCxcModal(true);
  };

  const saveCxC = async () => {
    try {
      await authFetch("post", "/bancos/receivable", {
        ...cxcForm,
        amount: Number(cxcForm.amount),
      });
      setCxcModal(false);
      fetchReceivables();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    }
  };

  // ---------------------------------------------------------------------------
  // Payment
  // ---------------------------------------------------------------------------

  const openPayment = (type: "cxp" | "cxc", id: string, balanceDue: number) => {
    setPaymentModal({ type, id, balanceDue });
    setPaymentForm({
      amount: balanceDue,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: "Transferencia",
    });
  };

  const savePayment = async () => {
    if (!paymentModal) return;
    const endpoint =
      paymentModal.type === "cxp"
        ? `/bancos/payable/${paymentModal.id}/payment`
        : `/bancos/receivable/${paymentModal.id}/payment`;
    try {
      await authFetch("post", endpoint, {
        amount: Number(paymentForm.amount),
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod,
      });
      setPaymentModal(null);
      if (paymentModal.type === "cxp") fetchPayables();
      else fetchReceivables();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    }
  };

  // ---------------------------------------------------------------------------
  // Column definitions
  // ---------------------------------------------------------------------------

  const accountColumns = [
    { key: "bankName", header: "Banco" },
    { key: "accountNumber", header: "Numero de Cuenta" },
    { key: "clabe", header: "CLABE" },
    {
      key: "branchId",
      header: "Sucursal",
      render: (row: BankAccount) => (row.branch ? row.branch.name : "Corporativa"),
    },
    {
      key: "currentBalance",
      header: "Saldo",
      render: (row: BankAccount) => fmtMXN(row.currentBalance),
      className: "text-right",
    },
    { key: "currency", header: "Moneda" },
    {
      key: "actions",
      header: "Acciones",
      render: (row: BankAccount) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openEditAccount(row)}
            className="p-1 hover:bg-gray-100 rounded"
            title="Editar"
          >
            <Pencil className="h-4 w-4 text-gray-500" />
          </button>
          <button
            onClick={() => setDeleteConfirm(row.id)}
            className="p-1 hover:bg-red-50 rounded"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </button>
        </div>
      ),
    },
  ];

  const txColumns = [
    {
      key: "transactionDate",
      header: "Fecha",
      render: (row: Transaction) => new Date(row.transactionDate).toLocaleDateString("es-MX"),
    },
    {
      key: "type",
      header: "Tipo",
      render: (row: Transaction) => (
        <StatusBadge
          label={row.type === "credit" ? "Credito" : "Debito"}
          variant={row.type === "credit" ? "green" : "red"}
        />
      ),
    },
    {
      key: "amount",
      header: "Monto",
      render: (row: Transaction) => {
        const signed = row.type === "debit" ? -row.amount : row.amount;
        return (
          <span className={row.type === "debit" ? "text-red-600" : "text-green-600"}>
            {fmtMXN(signed)}
          </span>
        );
      },
      className: "text-right",
    },
    { key: "reference", header: "Referencia" },
    { key: "description", header: "Descripcion" },
    {
      key: "reconciled",
      header: "Conciliado",
      render: (row: Transaction) => (
        <StatusBadge
          label={row.reconciled ? "Si" : "No"}
          variant={row.reconciled ? "green" : "gray"}
        />
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (row: Transaction) =>
        !row.reconciled ? (
          <button
            onClick={() => reconcileTx(row.id)}
            className="p-1 hover:bg-green-50 rounded"
            title="Conciliar"
          >
            <CheckCircle className="h-4 w-4 text-green-600" />
          </button>
        ) : null,
    },
  ];

  const payableColumns = [
    {
      key: "supplier",
      header: "Proveedor",
      render: (row: Payable) => row.supplier?.name || "N/A",
    },
    {
      key: "branch",
      header: "Sucursal",
      render: (row: Payable) => row.branch?.name || "N/A",
    },
    { key: "invoiceNumber", header: "# Factura" },
    {
      key: "amount",
      header: "Monto",
      render: (row: Payable) => fmtMXN(row.amount),
      className: "text-right",
    },
    {
      key: "balanceDue",
      header: "Saldo Pendiente",
      render: (row: Payable) => fmtMXN(row.balanceDue),
      className: "text-right",
    },
    {
      key: "dueDate",
      header: "Vencimiento",
      render: (row: Payable) => {
        const overdue = isOverdue(row.dueDate, row.status);
        return (
          <span className={overdue ? "text-red-600 font-semibold" : ""}>
            {new Date(row.dueDate).toLocaleDateString("es-MX")}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Estado",
      render: (row: Payable) => {
        const displayStatus = isOverdue(row.dueDate, row.status) ? "OVERDUE" : row.status;
        return (
          <StatusBadge label={statusLabel(displayStatus)} variant={statusVariant(displayStatus)} />
        );
      },
    },
    {
      key: "actions",
      header: "Acciones",
      render: (row: Payable) =>
        row.status !== "PAID" && row.status !== "CANCELLED" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => openPayment("cxp", row.id, row.balanceDue)}
          >
            <DollarSign className="h-3.5 w-3.5" />
            Registrar Pago
          </Button>
        ) : null,
    },
  ];

  const receivableColumns = [
    {
      key: "customerName",
      header: "Cliente",
      render: (row: Receivable) => row.customerName || "N/A",
    },
    {
      key: "branch",
      header: "Sucursal",
      render: (row: Receivable) => row.branch?.name || "N/A",
    },
    {
      key: "cfdi",
      header: "CFDI",
      render: (row: Receivable) => row.cfdi || "N/A",
    },
    {
      key: "amount",
      header: "Monto",
      render: (row: Receivable) => fmtMXN(row.amount),
      className: "text-right",
    },
    {
      key: "balanceDue",
      header: "Saldo Pendiente",
      render: (row: Receivable) => fmtMXN(row.balanceDue),
      className: "text-right",
    },
    {
      key: "dueDate",
      header: "Vencimiento",
      render: (row: Receivable) => {
        const overdue = isOverdue(row.dueDate, row.status);
        return (
          <span className={overdue ? "text-red-600 font-semibold" : ""}>
            {new Date(row.dueDate).toLocaleDateString("es-MX")}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Estado",
      render: (row: Receivable) => {
        const displayStatus = isOverdue(row.dueDate, row.status) ? "OVERDUE" : row.status;
        return (
          <StatusBadge label={statusLabel(displayStatus)} variant={statusVariant(displayStatus)} />
        );
      },
    },
    {
      key: "actions",
      header: "Acciones",
      render: (row: Receivable) =>
        row.status !== "PAID" && row.status !== "CANCELLED" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => openPayment("cxc", row.id, row.balanceDue)}
          >
            <DollarSign className="h-3.5 w-3.5" />
            Registrar Pago
          </Button>
        ) : null,
    },
  ];

  // ---------------------------------------------------------------------------
  // Cash flow calculations
  // ---------------------------------------------------------------------------

  const totalBancos = accounts.reduce((sum, a) => sum + safeNum(a.currentBalance), 0);
  const totalCxC = receivables
    .filter((r) => r.status !== "PAID" && r.status !== "CANCELLED")
    .reduce((sum, r) => sum + safeNum(r.balanceDue), 0);
  const totalCxP = payables
    .filter((p) => p.status !== "PAID" && p.status !== "CANCELLED")
    .reduce((sum, p) => sum + safeNum(p.balanceDue), 0);
  const flujoNeto = totalBancos + totalCxC - totalCxP;

  // ---------------------------------------------------------------------------
  // Search & Pagination logic
  // ---------------------------------------------------------------------------

  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return transactions;
    const q = normalize(searchTerm);
    return transactions.filter(
      (t) => normalize(t.description || "").includes(q) || normalize(t.reference || "").includes(q),
    );
  }, [transactions, searchTerm]);

  const filteredPayables = useMemo(() => {
    if (!searchTerm) return payables;
    const q = normalize(searchTerm);
    return payables.filter(
      (p) =>
        (p.supplier?.name && normalize(p.supplier.name).includes(q)) ||
        normalize(p.invoiceNumber || "").includes(q) ||
        (p.branch?.name && normalize(p.branch.name).includes(q)),
    );
  }, [payables, searchTerm]);

  const filteredReceivables = useMemo(() => {
    if (!searchTerm) return receivables;
    const q = normalize(searchTerm);
    return receivables.filter(
      (r) =>
        (r.customerName && normalize(r.customerName).includes(q)) ||
        (r.cfdi && normalize(r.cfdi).includes(q)) ||
        (r.branch?.name && normalize(r.branch.name).includes(q)),
    );
  }, [receivables, searchTerm]);

  const filteredRecTransactions = useMemo(() => {
    let list = recTransactions;
    if (recFilter === "reconciled") list = list.filter((t) => t.isReconciled);
    else if (recFilter === "unreconciled") list = list.filter((t) => !t.isReconciled);
    if (!searchTerm) return list;
    const q = normalize(searchTerm);
    return list.filter(
      (t) => normalize(t.description || "").includes(q) || normalize(t.reference || "").includes(q),
    );
  }, [recTransactions, recFilter, searchTerm]);

  const currentFilteredBancos =
    activeTab === "Movimientos"
      ? filteredTransactions
      : activeTab === "Cuentas por Pagar"
        ? filteredPayables
        : activeTab === "Cuentas por Cobrar"
          ? filteredReceivables
          : activeTab === "Conciliacion"
            ? filteredRecTransactions
            : [];

  const totalPagesBancos = Math.ceil(currentFilteredBancos.length / PAGE_SIZE);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const paginatedPayables = filteredPayables.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const paginatedReceivables = filteredReceivables.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const paginatedRecTransactions = filteredRecTransactions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const paginationStartBancos =
    currentFilteredBancos.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const paginationEndBancos = Math.min(currentPage * PAGE_SIZE, currentFilteredBancos.length);

  // ---------------------------------------------------------------------------
  // Guard
  // ---------------------------------------------------------------------------

  if (authLoading) return null;

  // ---------------------------------------------------------------------------
  // Render helpers per tab
  // ---------------------------------------------------------------------------

  const addButtonLabel: Record<string, string> = {
    "Cuentas Bancarias": "Nueva Cuenta",
    Movimientos: "Nuevo Movimiento",
    "Cuentas por Pagar": "Nueva CxP",
    "Cuentas por Cobrar": "Nueva CxC",
  };

  const addButtonAction: Record<string, () => void> = {
    "Cuentas Bancarias": openCreateAccount,
    Movimientos: openCreateTx,
    "Cuentas por Pagar": openCreateCxP,
    "Cuentas por Cobrar": openCreateCxC,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <Landmark className="h-5 w-5 text-black" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Bancos</h1>
        </div>
        <div className="flex gap-3">
          {activeTab === "Movimientos" && selectedAccountId && (
            <button
              onClick={() =>
                exportToCSV(
                  transactions.map((t) => ({
                    date: new Date(t.transactionDate).toLocaleDateString("es-MX"),
                    type: t.type === "credit" ? "Credito" : "Debito",
                    description: t.description,
                    reference: t.reference,
                    amount: t.type === "debit" ? -t.amount : t.amount,
                    account: accounts.find((a) => a.id === t.bankAccountId)?.bankName ?? "",
                  })),
                  "movimientos",
                  [
                    { key: "date", label: "Fecha" },
                    { key: "type", label: "Tipo" },
                    { key: "description", label: "Descripcion" },
                    { key: "reference", label: "Referencia" },
                    { key: "amount", label: "Monto" },
                    { key: "account", label: "Cuenta" },
                  ],
                )
              }
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>
          )}
          {activeTab === "Conciliacion" && recAccountId && (
            <>
              <button
                onClick={() => setImportModal(true)}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Upload className="h-4 w-4" />
                Importar Transacciones
              </button>
              <button
                onClick={triggerAutoReconcile}
                disabled={recAutoLoading}
                className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${recAutoLoading ? "animate-spin" : ""}`} />
                {recAutoLoading ? "Conciliando..." : "Auto-Conciliar"}
              </button>
            </>
          )}
          {activeTab !== "Flujo de Efectivo" && activeTab !== "Conciliacion" && (
            <Button
              onClick={addButtonAction[activeTab]}
              disabled={activeTab === "Movimientos" && !selectedAccountId}
            >
              <Plus className="h-4 w-4" />
              {addButtonLabel[activeTab]}
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

      {/* Search bar for Movimientos, CxP, CxC, Conciliacion tabs */}
      {(activeTab === "Movimientos" ||
        activeTab === "Cuentas por Pagar" ||
        activeTab === "Cuentas por Cobrar" ||
        activeTab === "Conciliacion") && (
        <div className="mt-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeTab === "Movimientos"
                  ? "Buscar por descripcion o referencia..."
                  : activeTab === "Cuentas por Pagar"
                    ? "Buscar por proveedor o factura..."
                    : activeTab === "Conciliacion"
                      ? "Buscar por referencia o descripcion..."
                      : "Buscar por cliente o CFDI..."
              }
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="mt-4">
        {/* ================================================================ */}
        {/* TAB 1 : Cuentas Bancarias                                       */}
        {/* ================================================================ */}
        {activeTab === "Cuentas Bancarias" && (
          <DataTable
            columns={accountColumns}
            data={accounts}
            loading={accountsLoading}
            emptyMessage="No hay cuentas bancarias registradas."
          />
        )}

        {/* ================================================================ */}
        {/* TAB 2 : Movimientos                                             */}
        {/* ================================================================ */}
        {activeTab === "Movimientos" && (
          <>
            <div className="mb-4 max-w-sm">
              <FormField label="Cuenta bancaria">
                <Select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                >
                  <option value="">Seleccionar cuenta...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bankName} - {a.accountNumber}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            {selectedAccountId ? (
              <>
                <DataTable
                  columns={txColumns}
                  data={paginatedTransactions}
                  loading={txLoading}
                  emptyMessage="No hay movimientos para esta cuenta."
                />

                {/* Pagination controls */}
                {filteredTransactions.length > 0 && (
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      Mostrando {paginationStartBancos}-{paginationEndBancos} de{" "}
                      {filteredTransactions.length}
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
                        onClick={() => setCurrentPage((p) => Math.min(totalPagesBancos, p + 1))}
                        disabled={currentPage === totalPagesBancos}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="border rounded-lg p-8 text-center text-gray-500">
                Selecciona una cuenta bancaria para ver sus movimientos.
              </div>
            )}
          </>
        )}

        {/* ================================================================ */}
        {/* TAB 3 : Cuentas por Pagar                                       */}
        {/* ================================================================ */}
        {activeTab === "Cuentas por Pagar" && (
          <>
            <DataTable
              columns={payableColumns}
              data={paginatedPayables}
              loading={payablesLoading}
              emptyMessage="No hay cuentas por pagar."
            />

            {/* Pagination controls */}
            {filteredPayables.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Mostrando {paginationStartBancos}-{paginationEndBancos} de{" "}
                  {filteredPayables.length}
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
                    onClick={() => setCurrentPage((p) => Math.min(totalPagesBancos, p + 1))}
                    disabled={currentPage === totalPagesBancos}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ================================================================ */}
        {/* TAB 4 : Cuentas por Cobrar                                      */}
        {/* ================================================================ */}
        {activeTab === "Cuentas por Cobrar" && (
          <>
            <DataTable
              columns={receivableColumns}
              data={paginatedReceivables}
              loading={receivablesLoading}
              emptyMessage="No hay cuentas por cobrar."
            />

            {/* Pagination controls */}
            {filteredReceivables.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Mostrando {paginationStartBancos}-{paginationEndBancos} de{" "}
                  {filteredReceivables.length}
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
                    onClick={() => setCurrentPage((p) => Math.min(totalPagesBancos, p + 1))}
                    disabled={currentPage === totalPagesBancos}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ================================================================ */}
        {/* TAB 5 : Conciliacion                                            */}
        {/* ================================================================ */}
        {activeTab === "Conciliacion" && (
          <>
            {/* Account selector */}
            <div className="mb-6 max-w-sm">
              <FormField label="Cuenta bancaria">
                <Select value={recAccountId} onChange={(e) => setRecAccountId(e.target.value)}>
                  <option value="">Seleccionar cuenta...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bankName} - {a.accountNumber}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            {recAccountId ? (
              <>
                {/* KPI Cards */}
                {recSummary && (
                  <div className="mb-6">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-500">Total Transacciones</p>
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                            <Landmark className="h-5 w-5 text-gray-600" />
                          </div>
                        </div>
                        <p className="mt-3 text-2xl font-bold text-gray-900">{recSummary.total}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-500">Conciliadas</p>
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          </div>
                        </div>
                        <p className="mt-3 text-2xl font-bold text-gray-900">
                          {recSummary.reconciled}
                        </p>
                        <p className="text-xs text-gray-500">
                          {fmtMXN(recSummary.reconciledAmount)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-500">Pendientes</p>
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                            <XCircle className="h-5 w-5 text-red-600" />
                          </div>
                        </div>
                        <p className="mt-3 text-2xl font-bold text-gray-900">
                          {recSummary.unreconciled}
                        </p>
                        <p className="text-xs text-gray-500">{fmtMXN(recSummary.pendingAmount)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-500">% Conciliacion</p>
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                            <RefreshCw className="h-5 w-5 text-blue-600" />
                          </div>
                        </div>
                        <p className="mt-3 text-2xl font-bold text-gray-900">
                          {recSummary.percentage}%
                        </p>
                        <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                          <div
                            className="h-2 rounded-full bg-black transition-all"
                            style={{ width: `${recSummary.percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Filters */}
                <div className="mb-4 flex items-center gap-3">
                  {(["all", "reconciled", "unreconciled"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setRecFilter(f);
                        setCurrentPage(1);
                      }}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        recFilter === f
                          ? "bg-black text-white"
                          : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {f === "all" ? "Todas" : f === "reconciled" ? "Conciliadas" : "Pendientes"}
                    </button>
                  ))}
                </div>

                {/* Transactions table */}
                {recLoading ? (
                  <div className="border rounded-lg p-8 text-center text-gray-500">
                    Cargando transacciones...
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Fecha
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Referencia
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Descripcion
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                              Monto
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Tipo
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Estado
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Vinculado a
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Acciones
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {paginatedRecTransactions.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                                No hay transacciones.
                              </td>
                            </tr>
                          ) : (
                            paginatedRecTransactions.map((t) => (
                              <tr key={t.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {new Date(t.transactionDate).toLocaleDateString("es-MX")}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {t.reference || "-"}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {t.description || "-"}
                                </td>
                                <td className="px-4 py-3 text-sm text-right">
                                  <span
                                    className={
                                      t.type === "debit" ? "text-red-600" : "text-green-600"
                                    }
                                  >
                                    {fmtMXN(t.type === "debit" ? -t.amount : t.amount)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <StatusBadge
                                    label={t.type === "credit" ? "Credito" : "Debito"}
                                    variant={t.type === "credit" ? "green" : "red"}
                                  />
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <StatusBadge
                                    label={t.isReconciled ? "Conciliada" : "Pendiente"}
                                    variant={t.isReconciled ? "green" : "yellow"}
                                  />
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {t.isReconciled && t.reconciledWithType
                                    ? t.reconciledWithType === "payable"
                                      ? "CxP"
                                      : t.reconciledWithType === "receivable"
                                        ? "CxC"
                                        : "Pago"
                                    : "-"}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <div className="flex items-center gap-2">
                                    {!t.isReconciled && (
                                      <button
                                        onClick={() => {
                                          setReconcileModal(t);
                                          searchMatches(t.amount, t.reference || undefined);
                                        }}
                                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                      >
                                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                        Conciliar
                                      </button>
                                    )}
                                    {t.isReconciled && (
                                      <button
                                        onClick={() => handleUnreconcile(t.id)}
                                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-red-50 transition-colors"
                                      >
                                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                                        Desconciliar
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {filteredRecTransactions.length > 0 && (
                      <div className="mt-4 flex items-center justify-between">
                        <p className="text-sm text-gray-500">
                          Mostrando {paginationStartBancos}-{paginationEndBancos} de{" "}
                          {filteredRecTransactions.length}
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
                            onClick={() => setCurrentPage((p) => Math.min(totalPagesBancos, p + 1))}
                            disabled={currentPage === totalPagesBancos}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="border rounded-lg p-8 text-center text-gray-500">
                Selecciona una cuenta bancaria para ver la conciliacion.
              </div>
            )}
          </>
        )}

        {/* ================================================================ */}
        {/* TAB 6 : Flujo de Efectivo                                       */}
        {/* ================================================================ */}
        {activeTab === "Flujo de Efectivo" && (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  title: "Total en Bancos",
                  value: fmtMXN(totalBancos),
                  icon: Landmark,
                  color: "blue",
                },
                {
                  title: "CxC Pendiente",
                  value: fmtMXN(totalCxC),
                  icon: ArrowDownCircle,
                  color: "green",
                },
                {
                  title: "CxP Pendiente",
                  value: fmtMXN(totalCxP),
                  icon: ArrowUpCircle,
                  color: "red",
                },
                {
                  title: "Flujo Neto",
                  value: fmtMXN(flujoNeto),
                  icon: flujoNeto >= 0 ? TrendingUp : TrendingDown,
                  color: flujoNeto >= 0 ? "green" : "red",
                },
              ].map((stat) => {
                const Icon = stat.icon;
                const bgMap: Record<string, string> = {
                  blue: "bg-blue-50",
                  green: "bg-green-50",
                  red: "bg-red-50",
                };
                const textMap: Record<string, string> = {
                  blue: "text-blue-600",
                  green: "text-green-600",
                  red: "text-red-600",
                };
                return (
                  <div
                    key={stat.title}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${bgMap[stat.color]}`}
                      >
                        <Icon className={`h-5 w-5 ${textMap[stat.color]}`} />
                      </div>
                    </div>
                    <p className="mt-3 text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                );
              })}
            </div>

            <h2 className="mt-8 text-lg font-semibold text-gray-900">Saldos por Cuenta</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                      <Landmark className="h-4 w-4 text-black" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{a.bankName}</p>
                      <p className="text-xs text-gray-500">{a.accountNumber}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xl font-bold text-gray-900">{fmtMXN(a.currentBalance)}</p>
                  <p className="text-xs text-gray-500">
                    {a.currency} &middot; {a.branch ? a.branch.name : "Corporativa"}
                  </p>
                </div>
              ))}
              {accounts.length === 0 && (
                <p className="text-sm text-gray-500 col-span-full">
                  No hay cuentas bancarias registradas.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ================================================================== */}
      {/* MODALS                                                             */}
      {/* ================================================================== */}

      {/* Account create / edit */}
      <Modal
        open={accountModal}
        onClose={() => setAccountModal(false)}
        title={editingAccount ? "Editar Cuenta Bancaria" : "Nueva Cuenta Bancaria"}
      >
        <div className="space-y-4">
          <FormField label="Banco" required>
            <Input
              value={accountForm.bankName}
              onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })}
              placeholder="Ej: BBVA"
            />
          </FormField>
          <FormField label="Numero de Cuenta" required>
            <Input
              value={accountForm.accountNumber}
              onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
              placeholder="Ej: 0123456789"
            />
          </FormField>
          <FormField label="CLABE" required>
            <Input
              value={accountForm.clabe}
              onChange={(e) => setAccountForm({ ...accountForm, clabe: e.target.value })}
              placeholder="18 digitos"
            />
          </FormField>
          <FormField label="Sucursal">
            <Select
              value={accountForm.branchId}
              onChange={(e) => setAccountForm({ ...accountForm, branchId: e.target.value })}
            >
              <option value="">Corporativa</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Moneda">
            <Select
              value={accountForm.currency}
              onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })}
            >
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </Select>
          </FormField>
          <FormField label="Saldo Actual" required>
            <Input
              type="number"
              step="0.01"
              value={accountForm.currentBalance}
              onChange={(e) =>
                setAccountForm({ ...accountForm, currentBalance: Number(e.target.value) })
              }
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setAccountModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveAccount}
              disabled={!accountForm.bankName || !accountForm.accountNumber || !accountForm.clabe}
            >
              {editingAccount ? "Guardar Cambios" : "Crear Cuenta"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Confirmar Eliminacion"
      >
        <p className="text-sm text-gray-600 mb-6">
          Esta seguro de que desea eliminar esta cuenta bancaria? Esta accion no se puede deshacer.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteConfirm && deleteAccount(deleteConfirm)}
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </Button>
        </div>
      </Modal>

      {/* Transaction create */}
      <Modal open={txModal} onClose={() => setTxModal(false)} title="Nuevo Movimiento">
        <div className="space-y-4">
          <FormField label="Cuenta Bancaria" required>
            <Select
              value={txForm.bankAccountId}
              onChange={(e) => setTxForm({ ...txForm, bankAccountId: e.target.value })}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bankName} - {a.accountNumber}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Fecha" required>
            <Input
              type="date"
              value={txForm.transactionDate}
              onChange={(e) => setTxForm({ ...txForm, transactionDate: e.target.value })}
            />
          </FormField>
          <FormField label="Monto" required>
            <Input
              type="number"
              step="0.01"
              value={txForm.amount}
              onChange={(e) => setTxForm({ ...txForm, amount: Number(e.target.value) })}
            />
          </FormField>
          <FormField label="Tipo" required>
            <Select
              value={txForm.type}
              onChange={(e) => setTxForm({ ...txForm, type: e.target.value as "credit" | "debit" })}
            >
              <option value="credit">Credito</option>
              <option value="debit">Debito</option>
            </Select>
          </FormField>
          <FormField label="Referencia">
            <Input
              value={txForm.reference}
              onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })}
              placeholder="Ej: REF-001"
            />
          </FormField>
          <FormField label="Descripcion">
            <Input
              value={txForm.description}
              onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
              placeholder="Descripcion del movimiento"
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setTxModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveTx}
              disabled={!txForm.bankAccountId || !txForm.transactionDate || !txForm.amount}
            >
              Crear Movimiento
            </Button>
          </div>
        </div>
      </Modal>

      {/* CxP create */}
      <Modal open={cxpModal} onClose={() => setCxpModal(false)} title="Nueva Cuenta por Pagar">
        <div className="space-y-4">
          <FormField label="Proveedor" required>
            <Select
              value={cxpForm.supplierId}
              onChange={(e) => setCxpForm({ ...cxpForm, supplierId: e.target.value })}
            >
              <option value="">Seleccionar proveedor...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Sucursal" required>
            <Select
              value={cxpForm.branchId}
              onChange={(e) => setCxpForm({ ...cxpForm, branchId: e.target.value })}
            >
              <option value="">Seleccionar sucursal...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Numero de Factura" required>
            <Input
              value={cxpForm.invoiceNumber}
              onChange={(e) => setCxpForm({ ...cxpForm, invoiceNumber: e.target.value })}
              placeholder="Ej: FAC-001"
            />
          </FormField>
          <FormField label="Monto" required>
            <Input
              type="number"
              step="0.01"
              value={cxpForm.amount}
              onChange={(e) => setCxpForm({ ...cxpForm, amount: Number(e.target.value) })}
            />
          </FormField>
          <FormField label="Fecha de Vencimiento" required>
            <Input
              type="date"
              value={cxpForm.dueDate}
              onChange={(e) => setCxpForm({ ...cxpForm, dueDate: e.target.value })}
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setCxpModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveCxP}
              disabled={
                !cxpForm.supplierId ||
                !cxpForm.branchId ||
                !cxpForm.invoiceNumber ||
                !cxpForm.amount ||
                !cxpForm.dueDate
              }
            >
              Crear CxP
            </Button>
          </div>
        </div>
      </Modal>

      {/* CxC create */}
      <Modal open={cxcModal} onClose={() => setCxcModal(false)} title="Nueva Cuenta por Cobrar">
        <div className="space-y-4">
          <FormField label="Sucursal" required>
            <Select
              value={cxcForm.branchId}
              onChange={(e) => setCxcForm({ ...cxcForm, branchId: e.target.value })}
            >
              <option value="">Seleccionar sucursal...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Monto" required>
            <Input
              type="number"
              step="0.01"
              value={cxcForm.amount}
              onChange={(e) => setCxcForm({ ...cxcForm, amount: Number(e.target.value) })}
            />
          </FormField>
          <FormField label="Fecha de Vencimiento" required>
            <Input
              type="date"
              value={cxcForm.dueDate}
              onChange={(e) => setCxcForm({ ...cxcForm, dueDate: e.target.value })}
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setCxcModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveCxC}
              disabled={!cxcForm.branchId || !cxcForm.amount || !cxcForm.dueDate}
            >
              Crear CxC
            </Button>
          </div>
        </div>
      </Modal>

      {/* Payment modal (shared for CxP and CxC) */}
      <Modal
        open={!!paymentModal}
        onClose={() => setPaymentModal(null)}
        title={paymentModal?.type === "cxp" ? "Registrar Pago (CxP)" : "Registrar Pago (CxC)"}
      >
        <div className="space-y-4">
          <FormField label="Monto del Pago" required>
            <Input
              type="number"
              step="0.01"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
            />
          </FormField>
          <FormField label="Fecha de Pago" required>
            <Input
              type="date"
              value={paymentForm.paymentDate}
              onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
            />
          </FormField>
          <FormField label="Metodo de Pago" required>
            <Select
              value={paymentForm.paymentMethod}
              onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
            >
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Cheque">Cheque</option>
            </Select>
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setPaymentModal(null)}>
              Cancelar
            </Button>
            <Button
              onClick={savePayment}
              disabled={!paymentForm.amount || !paymentForm.paymentDate}
            >
              <DollarSign className="h-4 w-4" />
              Registrar Pago
            </Button>
          </div>
        </div>
      </Modal>

      {/* Import transactions modal */}
      <Modal
        open={importModal}
        onClose={() => {
          setImportModal(false);
          setCsvPreview([]);
        }}
        title="Importar Transacciones"
      >
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setImportMode("csv");
                setCsvPreview([]);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                importMode === "csv"
                  ? "bg-black text-white"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Archivo CSV
            </button>
            <button
              onClick={() => {
                setImportMode("manual");
                setCsvPreview([]);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                importMode === "manual"
                  ? "bg-black text-white"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Entrada Manual
            </button>
          </div>

          {importMode === "csv" ? (
            <>
              <div>
                <p className="mb-2 text-xs text-gray-500">
                  Formato CSV: fecha, monto, tipo (credit/debit), referencia, descripcion
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const text = ev.target?.result as string;
                      if (text) parseCSV(text);
                    };
                    reader.readAsText(file);
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>

              {csvPreview.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700">
                    {csvPreview.length} transacciones detectadas:
                  </p>
                  <div className="max-h-60 overflow-auto rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Fecha</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Monto</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Tipo</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">
                            Referencia
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">
                            Descripcion
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {csvPreview.slice(0, 20).map((row, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2">{row.date}</td>
                            <td className="px-3 py-2 text-right">{fmtMXN(row.amount)}</td>
                            <td className="px-3 py-2">
                              <StatusBadge
                                label={row.type === "credit" ? "Credito" : "Debito"}
                                variant={row.type === "credit" ? "green" : "red"}
                              />
                            </td>
                            <td className="px-3 py-2">{row.reference || "-"}</td>
                            <td className="px-3 py-2">{row.description || "-"}</td>
                          </tr>
                        ))}
                        {csvPreview.length > 20 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-2 text-center text-gray-500">
                              ...y {csvPreview.length - 20} mas
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setImportModal(false);
                    setCsvPreview([]);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleImportCSV}
                  disabled={csvPreview.length === 0 || importLoading}
                >
                  <Upload className="h-4 w-4" />
                  {importLoading ? "Importando..." : `Importar ${csvPreview.length} transacciones`}
                </Button>
              </div>
            </>
          ) : (
            <>
              <FormField label="Fecha" required>
                <Input
                  type="date"
                  value={manualImportForm.date}
                  onChange={(e) =>
                    setManualImportForm({ ...manualImportForm, date: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Monto" required>
                <Input
                  type="number"
                  step="0.01"
                  value={manualImportForm.amount}
                  onChange={(e) =>
                    setManualImportForm({ ...manualImportForm, amount: Number(e.target.value) })
                  }
                />
              </FormField>
              <FormField label="Tipo" required>
                <Select
                  value={manualImportForm.type}
                  onChange={(e) =>
                    setManualImportForm({
                      ...manualImportForm,
                      type: e.target.value as "credit" | "debit",
                    })
                  }
                >
                  <option value="credit">Credito</option>
                  <option value="debit">Debito</option>
                </Select>
              </FormField>
              <FormField label="Referencia">
                <Input
                  value={manualImportForm.reference}
                  onChange={(e) =>
                    setManualImportForm({ ...manualImportForm, reference: e.target.value })
                  }
                  placeholder="Ej: REF-001"
                />
              </FormField>
              <FormField label="Descripcion">
                <Input
                  value={manualImportForm.description}
                  onChange={(e) =>
                    setManualImportForm({ ...manualImportForm, description: e.target.value })
                  }
                  placeholder="Descripcion de la transaccion"
                />
              </FormField>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setImportModal(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleImportManual}
                  disabled={!manualImportForm.date || !manualImportForm.amount || importLoading}
                >
                  <Upload className="h-4 w-4" />
                  {importLoading ? "Importando..." : "Importar Transaccion"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Manual reconcile modal */}
      <Modal
        open={!!reconcileModal}
        onClose={() => {
          setReconcileModal(null);
          setMatchSearch("");
          setMatchCandidates({ payables: [], receivables: [] });
        }}
        title="Conciliar Transaccion"
      >
        {reconcileModal && (
          <div className="space-y-4">
            {/* Transaction info */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(reconcileModal.transactionDate).toLocaleDateString("es-MX")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {reconcileModal.description || reconcileModal.reference || "Sin descripcion"}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-lg font-bold ${reconcileModal.type === "debit" ? "text-red-600" : "text-green-600"}`}
                  >
                    {fmtMXN(
                      reconcileModal.type === "debit"
                        ? -reconcileModal.amount
                        : reconcileModal.amount,
                    )}
                  </p>
                  <StatusBadge
                    label={reconcileModal.type === "credit" ? "Credito" : "Debito"}
                    variant={reconcileModal.type === "credit" ? "green" : "red"}
                  />
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={matchSearch}
                onChange={(e) => setMatchSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    searchMatches(reconcileModal.amount, matchSearch || undefined);
                  }
                }}
                placeholder="Buscar por referencia... (Enter para buscar)"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
              />
            </div>
            <button
              onClick={() => searchMatches(reconcileModal.amount, matchSearch || undefined)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              Buscar Coincidencias
            </button>

            {/* Results */}
            {matchLoading ? (
              <div className="text-center text-sm text-gray-500 py-4">Buscando...</div>
            ) : (
              <div className="max-h-60 overflow-auto space-y-2">
                {matchCandidates.payables.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                      Cuentas por Pagar
                    </p>
                    {matchCandidates.payables.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-gray-200 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => handleManualReconcile(reconcileModal.id, "payable", p.id)}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {p.supplier?.name || "Proveedor"} - {p.invoiceNumber || "Sin factura"}
                          </p>
                          <p className="text-xs text-gray-500">
                            Vence: {new Date(p.dueDate).toLocaleDateString("es-MX")} |{" "}
                            {p.branch?.name || ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">{fmtMXN(p.balanceDue)}</p>
                          <p className="text-xs text-gray-500">{statusLabel(p.status)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {matchCandidates.receivables.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                      Cuentas por Cobrar
                    </p>
                    {matchCandidates.receivables.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-lg border border-gray-200 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => handleManualReconcile(reconcileModal.id, "receivable", r.id)}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {r.customer?.name || "Cliente"} - CxC
                          </p>
                          <p className="text-xs text-gray-500">
                            Vence: {new Date(r.dueDate).toLocaleDateString("es-MX")} |{" "}
                            {r.branch?.name || ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">{fmtMXN(r.balanceDue)}</p>
                          <p className="text-xs text-gray-500">{statusLabel(r.status)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {matchCandidates.payables.length === 0 &&
                  matchCandidates.receivables.length === 0 && (
                    <div className="text-center text-sm text-gray-500 py-4">
                      No se encontraron coincidencias. Intenta buscar con otro criterio.
                    </div>
                  )}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setReconcileModal(null);
                  setMatchSearch("");
                  setMatchCandidates({ payables: [], receivables: [] });
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
