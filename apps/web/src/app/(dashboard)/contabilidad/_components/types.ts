// --------------- types ---------------

export interface Account {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  nature: "DEBIT" | "CREDIT";
  parentAccountId?: string | null;
  satGroupCode?: string | null;
  isDetail: boolean;
}

export interface JournalLine {
  id?: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

export interface JournalEntry {
  id: string;
  entryDate: string;
  type: "DIARIO" | "INGRESO" | "EGRESO";
  description: string;
  status: "DRAFT" | "POSTED" | "REVERSED";
  branchId?: string | null;
  lines?: JournalLine[];
}

export interface Branch {
  id: string;
  name: string;
}

export interface PendingEvent {
  id: string;
  type: string;
  saleSource?: string;
  reference: string;
  amount: number;
  date: string;
  branchName?: string;
}

export interface PendingSummary {
  purchases: number;
  posSales: number;
  corntechSales: number;
  payrolls: number;
  payments: number;
  total: number;
}

export interface PendingResponse {
  summary: PendingSummary;
  events: PendingEvent[];
}

export interface AutoEntry extends JournalEntry {
  referenceType?: string;
  referenceId?: string;
  branch?: { name: string } | null;
  lines?: Array<JournalLine & { account?: { code: string; name: string } }>;
}

export interface BatchResult {
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

export interface DiotRecord {
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

export interface DiotSummary {
  totalSuppliers: number;
  totalAmount: number;
  totalIva16: number;
  totalIva0: number;
  totalExempt: number;
  totalWithheldIva: number;
  totalWithheldIsr: number;
}

export interface DiotHistoryItem {
  year: number;
  month: number;
  generatedAt: string;
  recordCount: number;
  totalAmount: number;
  status: string;
}

export interface IvaCalculation {
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

export interface IsrCalculation {
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

export interface DeclarationSummary {
  year: number;
  month: number;
  iva: IvaCalculation;
  isr: IsrCalculation;
}

export interface AnnualMonth {
  month: number;
  iva: IvaCalculation & { status: string; filedAt: string | null };
  isr: IsrCalculation & { status: string; filedAt: string | null };
}

export interface AnnualSummary {
  year: number;
  months: AnnualMonth[];
}

export interface TaxDeclarationHistory {
  id: string;
  year: number;
  month: number;
  type: string;
  status: string;
  amount: number;
  filedAt: string | null;
  filingReference: string | null;
}

export interface BalanzaRow {
  code: string;
  name: string;
  cargos: number;
  abonos: number;
  saldoFinal: number;
}

// --------------- constants ---------------

export const TABS = [
  "Catalogo de Cuentas",
  "Polizas",
  "Polizas Automaticas",
  "Balanza de Comprobacion",
  "Estados Financieros",
  "DIOT",
  "Declaraciones",
];

export const TYPE_LABELS: Record<Account["type"], string> = {
  ASSET: "Activo",
  LIABILITY: "Pasivo",
  EQUITY: "Capital",
  REVENUE: "Ingreso",
  EXPENSE: "Gasto",
};

export const NATURE_LABELS: Record<Account["nature"], string> = {
  DEBIT: "Deudora",
  CREDIT: "Acreedora",
};

export const STATUS_VARIANT: Record<JournalEntry["status"], "gray" | "green" | "red"> = {
  DRAFT: "gray",
  POSTED: "green",
  REVERSED: "red",
};

export const STATUS_LABEL: Record<JournalEntry["status"], string> = {
  DRAFT: "Borrador",
  POSTED: "Publicada",
  REVERSED: "Reversada",
};

export const ENTRY_TYPE_LABELS: Record<JournalEntry["type"], string> = {
  DIARIO: "Diario",
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  purchase: "Compra",
  sale: "Venta",
  payroll: "Nomina",
  payment: "Pago",
  bank_transaction: "Transaccion Bancaria",
};

export const EVENT_TYPE_VARIANT: Record<string, string> = {
  purchase: "blue",
  sale: "green",
  payroll: "purple",
  payment: "yellow",
  bank_transaction: "gray",
};

export const REF_TYPE_LABELS: Record<string, string> = {
  purchaseOrder: "Compra",
  posSale: "Venta POS",
  corntechSale: "Venta Corntech",
  payrollPeriod: "Nomina",
  payment: "Pago",
  bankTransaction: "Transaccion Bancaria",
};

export const DIOT_OP_LABELS: Record<string, string> = {
  "85": "Servicios profesionales",
  "06": "Compra de bienes",
  "03": "Arrendamiento",
};

// --------------- helpers ---------------

export function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

export function fmt(n: number) {
  return safeNum(n).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

export const emptyAccountForm = (): Omit<Account, "id"> => ({
  code: "",
  name: "",
  type: "ASSET",
  nature: "DEBIT",
  parentAccountId: null,
  satGroupCode: "",
  isDetail: true,
});

export const emptyJournalForm = () => ({
  entryDate: new Date().toISOString().slice(0, 10),
  type: "DIARIO" as JournalEntry["type"],
  description: "",
  branchId: "" as string,
  lines: [{ accountId: "", debit: 0, credit: 0, description: "" }] as JournalLine[],
});

export const months = [
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
