"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  Package,
  Warehouse,
  DollarSign,
  Store,
  RefreshCw,
  FileSpreadsheet,
  Banknote,
  Clock,
  Download,
  ClipboardCheck,
  AlertTriangle,
  ExternalLink,
  Check,
  CheckCircle2,
  Ban,
  RotateCcw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { useApiQuery } from "@/hooks/use-api-query";
import { getApiUrl } from "@/lib/api-url";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { exportToCSV } from "@/lib/export-csv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface SalesByBranch {
  branchId: string;
  branchName: string;
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
}

interface SalesByProduct {
  productId: string;
  productName: string;
  quantitySold: number;
  totalRevenue: number;
  averagePrice: number;
}

interface SalesTrend {
  date: string;
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
}

interface InventoryValuation {
  productId: string;
  productName: string;
  sku: string;
  currentQuantity: number;
  costPerUnit: number;
  totalValue: number;
  branchName?: string;
}

// --- Financial report types ---

interface PnlData {
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  operatingExpenses: {
    labor: number;
    rent: number;
    utilities: number;
    marketing: number;
    maintenance: number;
    other: number;
    total: number;
  };
  operatingIncome: number;
  otherIncome: number;
  otherExpenses: number;
  netIncome: number;
  margins: {
    grossMargin: number;
    operatingMargin: number;
    netMargin: number;
  };
}

interface CashFlowData {
  operatingActivities: {
    cashFromSales: number;
    cashToSuppliers: number;
    cashForPayroll: number;
    netOperating: number;
  };
  investingActivities: number;
  financingActivities: number;
  netCashFlow: number;
  beginningBalance: number;
  endingBalance: number;
}

interface AgingDetail {
  customerId?: string | null;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber: string | null;
  amount: number;
  balanceDue: number;
  dueDate: string;
  ageDays: number;
  bucket: string;
}

interface AgingData {
  total: number;
  buckets: {
    current: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
  };
  details: AgingDetail[];
}

interface PosInventoryReconciliationRow {
  branchName: string;
  productSku: string;
  productName: string;
  soldQuantity: number;
  deductedQuantity: number;
  difference: number;
  revenue: number;
  actualCost: number;
  status: string;
}

interface CedisTransferReconciliationRow {
  transferId: string;
  status: string;
  transferStatus: string;
  fromBranchName: string;
  toBranchName: string;
  productSku: string;
  productName: string;
  requestedQuantity: number;
  sentQuantity: number;
  receivedQuantity: number;
  difference: number;
}

interface FoodCostReconciliationRow {
  productSku: string;
  productName: string;
  recipeName: string | null;
  quantitySold: number;
  revenue: number;
  theoreticalCost: number;
  actualCost: number;
  costDifference: number;
  theoreticalFoodCostPct: number;
  actualFoodCostPct: number;
  status: string;
}

interface DeliveryNetRevenueReconciliationRow {
  orderId: string;
  platform: string;
  externalOrderId: string | null;
  branchName: string;
  grossRevenue: number;
  deliveryFee: number;
  platformFee: number;
  recordedNetRevenue: number;
  recalculatedNetRevenue: number;
  delta: number;
  feePct: number;
  status: string;
}

type ReconciliationReviewStatus = "OPEN" | "REVIEWED" | "RESOLVED" | "IGNORED";
type InventoryReviewFilter = "ALL" | ReconciliationReviewStatus;

interface ReconciliationIssueReview {
  status: ReconciliationReviewStatus;
  note: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  resolvedAt: string | null;
  ignoredAt: string | null;
  updatedAt: string | null;
}

interface ReconciliationReviewSummary {
  openCount: number;
  reviewedCount: number;
  resolvedCount: number;
  ignoredCount: number;
}

interface InventoryIntegrityStockRow {
  type: "LOT_STOCK_BALANCE";
  fingerprint: string;
  review: ReconciliationIssueReview;
  branchId: string | null;
  branchName: string;
  branchCode: string | null;
  productId: string | null;
  productSku: string | null;
  productName: string;
  unitOfMeasure: string | null;
  stockQuantity: number;
  lotQuantity: number;
  difference: number;
  status: string;
}

interface InventoryIntegrityTerminalLotIssue {
  type: "TERMINAL_LOT_WITH_STOCK";
  fingerprint: string;
  review: ReconciliationIssueReview;
  lotId: string;
  lotNumber: string;
  status: string;
  lotStatus: string;
  branchId: string;
  branchName: string;
  branchCode: string | null;
  productId: string;
  productSku: string | null;
  productName: string;
  unitOfMeasure: string | null;
  quantity: number;
  updatedAt: string;
}

interface InventoryIntegrityTransferLotIssue {
  type: "TRANSFER_LOT_ALLOCATION";
  fingerprint: string;
  review: ReconciliationIssueReview;
  allocationId: string;
  transferId: string;
  status: string;
  transferStatus: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  productId: string;
  productSku: string | null;
  productName: string;
  unitOfMeasure: string | null;
  lotNumber: string;
  allocatedQuantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
  expirationDate: string;
}

interface InventoryIntegrityStalledRequisition {
  type: "APPROVED_REQUISITION_WITH_OPEN_TRANSFER";
  fingerprint: string;
  review: ReconciliationIssueReview;
  requisitionId: string;
  status: string;
  requisitionStatus: string;
  priority: string;
  transferId: string | null;
  transferStatus: string;
  requestingBranchId: string;
  requestingBranchName: string;
  fulfillingBranchId: string | null;
  fulfillingBranchName: string | null;
  itemCount: number;
  requestedQuantity: number;
  transferLineCount: number;
  updatedAt: string;
}

type InventoryIntegrityIssue =
  | InventoryIntegrityStockRow
  | InventoryIntegrityTerminalLotIssue
  | InventoryIntegrityTransferLotIssue
  | InventoryIntegrityStalledRequisition;

interface InventoryIntegrityReconciliation {
  summary: {
    stockPairCount: number;
    stockMismatchCount: number;
    terminalLotCount: number;
    transferLotIssueCount: number;
    stalledRequisitionCount: number;
    issueCount: number;
    review?: ReconciliationReviewSummary;
    [key: string]: number | ReconciliationReviewSummary | undefined;
  };
  stockRows: InventoryIntegrityStockRow[];
  stockMismatches: InventoryIntegrityStockRow[];
  terminalLots: InventoryIntegrityTerminalLotIssue[];
  transferLotAllocations: InventoryIntegrityTransferLotIssue[];
  stalledRequisitions: InventoryIntegrityStalledRequisition[];
  issues: InventoryIntegrityIssue[];
}

interface ReconciliationSection<T> {
  summary: Record<string, number>;
  rows: T[];
  issues: T[];
}

interface OperationalReconciliationData {
  period: {
    startDate: string;
    endDate: string;
    branchId: string | null;
  };
  status: "OK" | "REVIEW_REQUIRED";
  issueCount: number;
  posInventory: ReconciliationSection<PosInventoryReconciliationRow>;
  cedisTransfers: ReconciliationSection<CedisTransferReconciliationRow>;
  foodCost: ReconciliationSection<FoodCostReconciliationRow>;
  deliveryNetRevenue: ReconciliationSection<DeliveryNetRevenueReconciliationRow> & {
    byPlatform: Array<{
      platform: string;
      orderCount: number;
      grossRevenue: number;
      recalculatedNetRevenue: number;
      feePct: number;
    }>;
  };
  inventoryIntegrity: InventoryIntegrityReconciliation;
}

interface ReconciliationIssueRow {
  id: string;
  area: string;
  status: string;
  branch: string;
  reference: string;
  product: string;
  difference: string;
  impact: string;
  severity: "critical" | "warning";
}

interface InventoryIntegrityTableRow {
  id: string;
  fingerprint: string;
  issueArea: string;
  issueType: string;
  issueStatus: string;
  branchId: string | null;
  branchName: string;
  referenceId: string | null;
  productId: string | null;
  productSku: string | null;
  type: string;
  status: string;
  branch: string;
  reference: string;
  product: string;
  systemStock: string;
  lotStock: string;
  difference: string;
  action: string;
  actionHref: string;
  reviewStatus: ReconciliationReviewStatus;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function formatMXN(value: unknown): string {
  return safeNum(value).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

function formatNumber(value: unknown): string {
  return safeNum(value).toLocaleString("es-MX");
}

function formatPct(value: unknown): string {
  return `${safeNum(value).toFixed(1)}%`;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    OK: "OK",
    REVIEW_REQUIRED: "Revisar",
    MISSING_DEDUCTION: "Sin descuento",
    QUANTITY_MISMATCH: "Diferencia",
    ORPHAN_DEDUCTION: "Descuento huerfano",
    PENDING_RECEIPT: "Por recibir",
    RECEIVED_SHORT: "Recibido menor",
    MISSING_RECIPE: "Sin receta",
    MISSING_RECIPE_COST: "Sin costo",
    COST_MISMATCH: "Costo distinto",
    NET_REVENUE_MISMATCH: "Neto distinto",
    NEGATIVE_NET_REVENUE: "Neto negativo",
    STOCK_WITHOUT_LOTS: "Stock sin lotes",
    LOTS_WITHOUT_STOCK: "Lotes sin stock",
    LOT_STOCK_MISMATCH: "Stock/lote distinto",
    TERMINAL_LOT_WITH_STOCK: "Lote cerrado con stock",
    IN_TRANSIT_LOT_PENDING: "Lote en transito",
    RECEIVED_ALLOCATION_SHORT: "Recepcion lote corta",
    LINKED_TRANSFER_MISSING: "Transfer faltante",
    TRANSFER_NOT_SHIPPED: "Transfer sin envio",
    TRANSFER_NOT_RECEIVED: "Transfer sin recepcion",
    REQUISITION_STATUS_NOT_CLOSED: "Req. abierta",
    TRANSFER_CANCELLED_REQUISITION_OPEN: "Transfer cancelada",
  };
  return labels[status] ?? status;
}

function statusVariant(status: string): "green" | "red" | "yellow" | "gray" {
  if (status === "OK") return "green";
  if (
    [
      "MISSING_DEDUCTION",
      "NET_REVENUE_MISMATCH",
      "NEGATIVE_NET_REVENUE",
      "MISSING_RECIPE",
      "MISSING_RECIPE_COST",
      "STOCK_WITHOUT_LOTS",
      "LOTS_WITHOUT_STOCK",
      "LOT_STOCK_MISMATCH",
      "TERMINAL_LOT_WITH_STOCK",
      "RECEIVED_ALLOCATION_SHORT",
      "LINKED_TRANSFER_MISSING",
      "REQUISITION_STATUS_NOT_CLOSED",
      "TRANSFER_CANCELLED_REQUISITION_OPEN",
    ].includes(status)
  ) {
    return "red";
  }
  if (
    [
      "REVIEW_REQUIRED",
      "PENDING_RECEIPT",
      "IN_TRANSIT_LOT_PENDING",
      "TRANSFER_NOT_SHIPPED",
      "TRANSFER_NOT_RECEIVED",
    ].includes(status)
  ) {
    return "yellow";
  }
  return "gray";
}

function reviewStatusLabel(status: ReconciliationReviewStatus): string {
  const labels: Record<ReconciliationReviewStatus, string> = {
    OPEN: "Abierta",
    REVIEWED: "Revisada",
    RESOLVED: "Resuelta",
    IGNORED: "Ignorada",
  };
  return labels[status];
}

function inventoryReviewFilterLabel(status: InventoryReviewFilter): string {
  if (status === "ALL") return "Todas";
  return reviewStatusLabel(status);
}

function inventoryReviewSearchLabel(status: InventoryReviewFilter): string {
  if (status === "ALL") return "integridad";
  return inventoryReviewFilterLabel(status).toLowerCase();
}

function inventoryReviewEmptyMessage(status: InventoryReviewFilter): string {
  if (status === "ALL") return "No hay incidencias de integridad de inventario";
  return `No hay incidencias ${inventoryReviewFilterLabel(
    status,
  ).toLowerCase()} de integridad de inventario`;
}

function reviewStatusVariant(
  status: ReconciliationReviewStatus,
): "green" | "red" | "yellow" | "gray" {
  if (status === "RESOLVED") return "green";
  if (status === "IGNORED") return "gray";
  if (status === "REVIEWED") return "yellow";
  return "red";
}

function formatQty(value: unknown): string {
  return safeNum(value).toLocaleString("es-MX", {
    maximumFractionDigits: 4,
  });
}

/** Get the first day of the current month as YYYY-MM-DD */
function getFirstDayOfMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Get today as YYYY-MM-DD */
function getToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: "ventas-sucursal", label: "Ventas por Sucursal", icon: Store },
  { key: "ventas-producto", label: "Ventas por Producto", icon: Package },
  { key: "inventario", label: "Valuacion de Inventario", icon: Warehouse },
  { key: "reconciliacion-operativa", label: "Reconciliacion Operativa", icon: ClipboardCheck },
  { key: "tendencias", label: "Tendencias", icon: TrendingUp },
  { key: "estado-resultados", label: "Estado de Resultados", icon: FileSpreadsheet },
  { key: "flujo-efectivo", label: "Flujo de Efectivo", icon: Banknote },
  { key: "antiguedad-saldos", label: "Antiguedad de Saldos", icon: Clock },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

// ---------------------------------------------------------------------------
// Reusable sub-components (module-level to avoid re-creation on every render)
// ---------------------------------------------------------------------------

function MetricCard({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string;
  value: string;
  sub: string;
  icon: typeof DollarSign;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
          <Icon className="h-5 w-5 text-black" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{sub}</p>
    </div>
  );
}

function DateFilters({
  showBranch,
  branchValue,
  onBranchChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  branches,
  onRefresh,
}: {
  showBranch?: boolean;
  branchValue?: string;
  onBranchChange?: (id: string) => void;
  startDate: string;
  onStartDateChange: (v: string) => void;
  endDate: string;
  onEndDateChange: (v: string) => void;
  branches: Branch[];
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-44">
        <FormField label="Fecha Inicio">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </FormField>
      </div>
      <div className="w-44">
        <FormField label="Fecha Fin">
          <Input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
        </FormField>
      </div>
      {showBranch && (
        <div className="w-52">
          <FormField label="Sucursal">
            <Select value={branchValue ?? ""} onChange={(e) => onBranchChange?.(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      )}
      <Button onClick={onRefresh} variant="outline" size="md">
        <RefreshCw className="h-4 w-4" />
        Consultar
      </Button>
    </div>
  );
}

function BranchRequiredFilters({
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  branches,
  selectedBranchId,
  onBranchChange,
  onRefresh,
}: {
  startDate: string;
  onStartDateChange: (v: string) => void;
  endDate: string;
  onEndDateChange: (v: string) => void;
  branches: Branch[];
  selectedBranchId: string;
  onBranchChange: (v: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-44">
        <FormField label="Fecha Inicio">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </FormField>
      </div>
      <div className="w-44">
        <FormField label="Fecha Fin">
          <Input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
        </FormField>
      </div>
      <div className="w-52">
        <FormField label="Sucursal" required>
          <Select value={selectedBranchId} onChange={(e) => onBranchChange(e.target.value)}>
            {branches.length === 0 && <option value="">Cargando sucursales...</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <Button onClick={onRefresh} variant="outline" size="md">
        <RefreshCw className="h-4 w-4" />
        Consultar
      </Button>
    </div>
  );
}

/** P&L line item row */
function PnlRow({
  label,
  amount,
  margin,
  bold,
  indent,
  negative,
}: {
  label: string;
  amount: number;
  margin?: number;
  bold?: boolean;
  indent?: boolean;
  negative?: boolean;
}) {
  return (
    <tr className={bold ? "bg-gray-50 font-semibold" : ""}>
      <td className={`py-2 pr-4 ${indent ? "pl-8" : "pl-4"} text-sm text-gray-700`}>
        {negative && amount !== 0 ? `(-) ${label}` : label}
      </td>
      <td className="py-2 px-4 text-right text-sm text-gray-900">{formatMXN(amount)}</td>
      <td className="py-2 px-4 text-right text-sm text-gray-500">
        {margin !== undefined ? formatPct(margin) : ""}
      </td>
    </tr>
  );
}

function ReconciliationAreaPanel({
  title,
  issueCount,
  primaryMetric,
  secondaryMetric,
  icon: Icon,
}: {
  title: string;
  issueCount: number;
  primaryMetric: string;
  secondaryMetric: string;
  icon: typeof AlertTriangle;
}) {
  const hasIssues = issueCount > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <div className="mt-2">
            <StatusBadge
              label={hasIssues ? `${issueCount} incidencia(s)` : "OK"}
              variant={hasIssues ? "yellow" : "green"}
            />
          </div>
        </div>
        <div className={`rounded-lg p-2 ${hasIssues ? "bg-yellow-50" : "bg-green-50"}`}>
          <Icon className={`h-5 w-5 ${hasIssues ? "text-yellow-700" : "text-green-700"}`} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500">Total</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{primaryMetric}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Diferencia</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{secondaryMetric}</p>
        </div>
      </div>
    </div>
  );
}

function buildReconciliationIssues(
  data: OperationalReconciliationData | null,
): ReconciliationIssueRow[] {
  if (!data) return [];

  const rows: ReconciliationIssueRow[] = [];

  data.posInventory.issues.forEach((issue, index) => {
    rows.push({
      id: `pos-${index}`,
      area: "POS vs Inventario",
      status: issue.status,
      branch: issue.branchName,
      reference: issue.productSku,
      product: issue.productName,
      difference: `${formatQty(issue.difference)} und`,
      impact: formatMXN(issue.actualCost || issue.revenue),
      severity: issue.status === "MISSING_DEDUCTION" ? "critical" : "warning",
    });
  });

  data.cedisTransfers.issues.forEach((issue, index) => {
    rows.push({
      id: `transfer-${index}`,
      area: "CEDIS vs Sucursal",
      status: issue.status,
      branch: `${issue.fromBranchName} -> ${issue.toBranchName}`,
      reference: issue.transferId,
      product: issue.productName,
      difference: `${formatQty(issue.difference)} und`,
      impact: `${formatQty(issue.sentQuantity)} enviadas`,
      severity: issue.status === "RECEIVED_SHORT" ? "critical" : "warning",
    });
  });

  data.foodCost.issues.forEach((issue, index) => {
    rows.push({
      id: `food-cost-${index}`,
      area: "Food Cost",
      status: issue.status,
      branch: "Todas",
      reference: issue.productSku,
      product: issue.productName,
      difference: formatMXN(issue.costDifference),
      impact: `${formatPct(issue.actualFoodCostPct)} real`,
      severity: issue.status === "COST_MISMATCH" ? "warning" : "critical",
    });
  });

  data.deliveryNetRevenue.issues.forEach((issue, index) => {
    rows.push({
      id: `delivery-${index}`,
      area: "Delivery Neto",
      status: issue.status,
      branch: issue.branchName,
      reference: issue.externalOrderId || issue.orderId,
      product: issue.platform,
      difference: formatMXN(issue.delta),
      impact: `${formatPct(issue.feePct)} comision`,
      severity: "critical",
    });
  });

  data.inventoryIntegrity?.stockMismatches.forEach((issue, index) => {
    rows.push({
      id: `inventory-stock-${index}`,
      area: "Integridad Inventario",
      status: issue.status,
      branch: issue.branchName,
      reference: issue.productSku || "SIN_SKU",
      product: issue.productName,
      difference: `${formatQty(issue.difference)} ${issue.unitOfMeasure || "und"}`,
      impact: `${formatQty(issue.stockQuantity)} sistema / ${formatQty(issue.lotQuantity)} lotes`,
      severity: "critical",
    });
  });

  data.inventoryIntegrity?.terminalLots.forEach((issue, index) => {
    rows.push({
      id: `inventory-terminal-${index}`,
      area: "Integridad Inventario",
      status: issue.status,
      branch: issue.branchName,
      reference: issue.lotNumber,
      product: issue.productName,
      difference: `${formatQty(issue.quantity)} ${issue.unitOfMeasure || "und"}`,
      impact: issue.lotStatus,
      severity: "critical",
    });
  });

  data.inventoryIntegrity?.transferLotAllocations.forEach((issue, index) => {
    rows.push({
      id: `inventory-transfer-lot-${index}`,
      area: "Integridad Inventario",
      status: issue.status,
      branch: `${issue.fromBranchName} -> ${issue.toBranchName}`,
      reference: issue.transferId,
      product: issue.productName,
      difference: `${formatQty(issue.pendingQuantity)} ${issue.unitOfMeasure || "und"}`,
      impact: issue.lotNumber,
      severity: issue.status === "RECEIVED_ALLOCATION_SHORT" ? "critical" : "warning",
    });
  });

  data.inventoryIntegrity?.stalledRequisitions.forEach((issue, index) => {
    rows.push({
      id: `inventory-requisition-${index}`,
      area: "Integridad Inventario",
      status: issue.status,
      branch: `${issue.fulfillingBranchName || "CEDIS"} -> ${issue.requestingBranchName}`,
      reference: issue.requisitionId,
      product: `${formatNumber(issue.itemCount)} partida(s)`,
      difference: issue.transferStatus,
      impact: `${formatQty(issue.requestedQuantity)} solicitadas`,
      severity: issue.status === "TRANSFER_NOT_RECEIVED" ? "warning" : "critical",
    });
  });

  return rows;
}

function inventoryActionLabel(status: string): string {
  const labels: Record<string, string> = {
    STOCK_WITHOUT_LOTS: "Reconstruir lote",
    LOTS_WITHOUT_STOCK: "Ajustar lote",
    LOT_STOCK_MISMATCH: "Reconciliar par",
    TERMINAL_LOT_WITH_STOCK: "Cerrar en cero",
    IN_TRANSIT_LOT_PENDING: "Confirmar recepcion",
    RECEIVED_ALLOCATION_SHORT: "Auditar recepcion",
    LINKED_TRANSFER_MISSING: "Revisar liga",
    TRANSFER_NOT_SHIPPED: "Enviar transfer",
    TRANSFER_NOT_RECEIVED: "Recibir transfer",
    REQUISITION_STATUS_NOT_CLOSED: "Cerrar req.",
    TRANSFER_CANCELLED_REQUISITION_OPEN: "Reabrir/cancelar",
  };
  return labels[status] ?? "Revisar";
}

function buildQueryHref(path: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

function inventoryActionHref(issue: InventoryIntegrityIssue): string {
  if (issue.type === "LOT_STOCK_BALANCE") {
    return buildQueryHref("/inventarios/lotes", {
      branchId: issue.branchId ?? undefined,
      productId: issue.productId ?? undefined,
      search: issue.productSku || issue.productName,
    });
  }

  if (issue.type === "TERMINAL_LOT_WITH_STOCK") {
    return buildQueryHref("/inventarios/lotes", {
      branchId: issue.branchId,
      productId: issue.productId,
      status: issue.lotStatus,
      search: issue.lotNumber,
    });
  }

  if (issue.type === "TRANSFER_LOT_ALLOCATION") {
    return buildQueryHref("/inventarios", {
      tab: "transferencias",
      transferId: issue.transferId,
    });
  }

  if (
    issue.transferId &&
    [
      "TRANSFER_NOT_SHIPPED",
      "TRANSFER_NOT_RECEIVED",
      "TRANSFER_CANCELLED_REQUISITION_OPEN",
    ].includes(issue.status)
  ) {
    return buildQueryHref("/inventarios", {
      tab: "transferencias",
      transferId: issue.transferId,
    });
  }

  return buildQueryHref("/requisiciones", {
    requisitionId: issue.requisitionId,
  });
}

function buildInventoryIntegrityRows(
  data: OperationalReconciliationData | null,
): InventoryIntegrityTableRow[] {
  if (!data?.inventoryIntegrity) return [];

  const rows: InventoryIntegrityTableRow[] = [];

  data.inventoryIntegrity.stockMismatches.forEach((issue, index) => {
    rows.push({
      id: `stock-${index}`,
      fingerprint: issue.fingerprint,
      issueArea: "INVENTORY_INTEGRITY",
      issueType: issue.type,
      issueStatus: issue.status,
      branchId: issue.branchId,
      branchName: issue.branchName,
      referenceId: issue.productSku || issue.productId,
      productId: issue.productId,
      productSku: issue.productSku,
      type: "Stock vs lotes",
      status: issue.status,
      branch: issue.branchName,
      reference: issue.productSku || "SIN_SKU",
      product: issue.productName,
      systemStock: `${formatQty(issue.stockQuantity)} ${issue.unitOfMeasure || "und"}`,
      lotStock: `${formatQty(issue.lotQuantity)} ${issue.unitOfMeasure || "und"}`,
      difference: `${formatQty(issue.difference)} ${issue.unitOfMeasure || "und"}`,
      action: inventoryActionLabel(issue.status),
      actionHref: inventoryActionHref(issue),
      reviewStatus: issue.review.status,
      reviewNote: issue.review.note,
      reviewedByName: issue.review.reviewedByName,
      reviewedAt: issue.review.reviewedAt,
    });
  });

  data.inventoryIntegrity.terminalLots.forEach((issue, index) => {
    rows.push({
      id: `terminal-${index}`,
      fingerprint: issue.fingerprint,
      issueArea: "INVENTORY_INTEGRITY",
      issueType: issue.type,
      issueStatus: issue.status,
      branchId: issue.branchId,
      branchName: issue.branchName,
      referenceId: issue.lotId,
      productId: issue.productId,
      productSku: issue.productSku,
      type: "Lote terminal",
      status: issue.status,
      branch: issue.branchName,
      reference: issue.lotNumber,
      product: issue.productName,
      systemStock: "-",
      lotStock: `${formatQty(issue.quantity)} ${issue.unitOfMeasure || "und"}`,
      difference: `${formatQty(issue.quantity)} ${issue.unitOfMeasure || "und"}`,
      action: inventoryActionLabel(issue.status),
      actionHref: inventoryActionHref(issue),
      reviewStatus: issue.review.status,
      reviewNote: issue.review.note,
      reviewedByName: issue.review.reviewedByName,
      reviewedAt: issue.review.reviewedAt,
    });
  });

  data.inventoryIntegrity.transferLotAllocations.forEach((issue, index) => {
    rows.push({
      id: `transfer-lot-${index}`,
      fingerprint: issue.fingerprint,
      issueArea: "INVENTORY_INTEGRITY",
      issueType: issue.type,
      issueStatus: issue.status,
      branchId: issue.toBranchId,
      branchName: `${issue.fromBranchName} -> ${issue.toBranchName}`,
      referenceId: issue.transferId,
      productId: issue.productId,
      productSku: issue.productSku,
      type: "Transfer lotes",
      status: issue.status,
      branch: `${issue.fromBranchName} -> ${issue.toBranchName}`,
      reference: issue.transferId,
      product: issue.productName,
      systemStock: `${formatQty(issue.allocatedQuantity)} enviada`,
      lotStock: `${formatQty(issue.receivedQuantity)} recibida`,
      difference: `${formatQty(issue.pendingQuantity)} pendiente`,
      action: inventoryActionLabel(issue.status),
      actionHref: inventoryActionHref(issue),
      reviewStatus: issue.review.status,
      reviewNote: issue.review.note,
      reviewedByName: issue.review.reviewedByName,
      reviewedAt: issue.review.reviewedAt,
    });
  });

  data.inventoryIntegrity.stalledRequisitions.forEach((issue, index) => {
    rows.push({
      id: `requisition-${index}`,
      fingerprint: issue.fingerprint,
      issueArea: "INVENTORY_INTEGRITY",
      issueType: issue.type,
      issueStatus: issue.status,
      branchId: issue.requestingBranchId,
      branchName: issue.requestingBranchName,
      referenceId: issue.requisitionId,
      productId: null,
      productSku: null,
      type: "Requisicion",
      status: issue.status,
      branch: `${issue.fulfillingBranchName || "CEDIS"} -> ${issue.requestingBranchName}`,
      reference: issue.requisitionId,
      product: `${formatNumber(issue.itemCount)} partida(s)`,
      systemStock: `${formatQty(issue.requestedQuantity)} solicitadas`,
      lotStock: `${formatNumber(issue.transferLineCount)} linea(s) transfer`,
      difference: issue.transferStatus,
      action: inventoryActionLabel(issue.status),
      actionHref: inventoryActionHref(issue),
      reviewStatus: issue.review.status,
      reviewNote: issue.review.note,
      reviewedByName: issue.review.reviewedByName,
      reviewedAt: issue.review.reviewedAt,
    });
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ReportesPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("ventas-sucursal");

  // ---- Shared state ----
  const { data: branches = [], isSuccess: branchesLoaded } = useApiQuery<Branch[]>("/branches", [
    "branches",
  ]);

  // ---- Date filters ----
  const [startDate, setStartDate] = useState(getFirstDayOfMonth);
  const [endDate, setEndDate] = useState(getToday);

  // ---- Ventas por Sucursal ----
  const [salesByBranch, setSalesByBranch] = useState<SalesByBranch[]>([]);
  const [salesByBranchLoading, setSalesByBranchLoading] = useState(false);

  // ---- Ventas por Producto ----
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [salesByProduct, setSalesByProduct] = useState<SalesByProduct[]>([]);
  const [salesByProductLoading, setSalesByProductLoading] = useState(false);

  // ---- Inventario ----
  const [inventoryBranchId, setInventoryBranchId] = useState("");
  const [inventoryData, setInventoryData] = useState<InventoryValuation[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // ---- Reconciliacion Operativa ----
  const [reconciliationBranchId, setReconciliationBranchId] = useState("");
  const [reconciliationData, setReconciliationData] =
    useState<OperationalReconciliationData | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [inventoryReviewFilter, setInventoryReviewFilter] = useState<InventoryReviewFilter>("OPEN");

  // ---- Tendencias ----
  const [trendsBranchId, setTrendsBranchId] = useState("");
  const [trendsData, setTrendsData] = useState<SalesTrend[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);

  // ---- Estado de Resultados (P&L) ----
  const [pnlBranchId, setPnlBranchId] = useState("");
  const [pnlData, setPnlData] = useState<PnlData | null>(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlExporting, setPnlExporting] = useState(false);

  // ---- Flujo de Efectivo ----
  const [cashFlowData, setCashFlowData] = useState<CashFlowData | null>(null);
  const [cashFlowLoading, setCashFlowLoading] = useState(false);

  // ---- Antiguedad de Saldos ----
  const [agingType, setAgingType] = useState<"receivable" | "payable">("receivable");
  const [agingData, setAgingData] = useState<AgingData | null>(null);
  const [agingLoading, setAgingLoading] = useState(false);
  const [agingExporting, setAgingExporting] = useState(false);

  // =======================================================================
  // Set default branch when branches load
  // =======================================================================

  useEffect(() => {
    if (branches.length > 0) {
      setSelectedBranchId((prev) => prev || branches[0].id);
    }
  }, [branches]);

  // =======================================================================
  // Data-fetching functions (existing)
  // =======================================================================

  const fetchSalesByBranch = useCallback(async () => {
    setSalesByBranchLoading(true);
    try {
      const data = await authFetch<SalesByBranch[]>(
        "get",
        `/reportes/sales/by-branch?startDate=${startDate}&endDate=${endDate}`,
      );
      setSalesByBranch(data);
    } catch {
      toast("Error al cargar ventas por sucursal", "error");
    } finally {
      setSalesByBranchLoading(false);
    }
  }, [authFetch, startDate, endDate, toast]);

  const fetchSalesByProduct = useCallback(
    async (branchId: string) => {
      if (!branchId) return;
      setSalesByProductLoading(true);
      try {
        const data = await authFetch<SalesByProduct[]>(
          "get",
          `/reportes/sales/by-product/${branchId}?startDate=${startDate}&endDate=${endDate}`,
        );
        setSalesByProduct(data);
      } catch {
        toast("Error al cargar ventas por producto", "error");
      } finally {
        setSalesByProductLoading(false);
      }
    },
    [authFetch, startDate, endDate, toast],
  );

  const fetchInventory = useCallback(
    async (branchId?: string) => {
      setInventoryLoading(true);
      try {
        const qs = branchId ? `?branchId=${branchId}` : "";
        const data = await authFetch<any>("get", `/reportes/inventory/valuation${qs}`);
        setInventoryData(Array.isArray(data) ? data : (data.items ?? []));
      } catch {
        toast("Error al cargar valuacion de inventario", "error");
      } finally {
        setInventoryLoading(false);
      }
    },
    [authFetch, toast],
  );

  const fetchOperationalReconciliation = useCallback(async () => {
    setReconciliationLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (reconciliationBranchId) params.set("branchId", reconciliationBranchId);
      const data = await authFetch<OperationalReconciliationData>(
        "get",
        `/reportes/operational-reconciliation?${params.toString()}`,
      );
      setReconciliationData(data);
    } catch {
      toast("Error al cargar reconciliacion operativa", "error");
    } finally {
      setReconciliationLoading(false);
    }
  }, [authFetch, startDate, endDate, reconciliationBranchId, toast]);

  const fetchTrends = useCallback(
    async (branchId?: string) => {
      setTrendsLoading(true);
      try {
        const params = new URLSearchParams({
          startDate,
          endDate,
        });
        if (branchId) params.set("branchId", branchId);
        const data = await authFetch<SalesTrend[]>(
          "get",
          `/reportes/sales/trends?${params.toString()}`,
        );
        setTrendsData(data);
      } catch {
        toast("Error al cargar tendencias", "error");
      } finally {
        setTrendsLoading(false);
      }
    },
    [authFetch, startDate, endDate, toast],
  );

  // =======================================================================
  // Data-fetching functions (new financial reports)
  // =======================================================================

  const fetchPnl = useCallback(async () => {
    setPnlLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (pnlBranchId) params.set("branchId", pnlBranchId);
      const data = await authFetch<PnlData>("get", `/reportes/financial/pnl?${params.toString()}`);
      setPnlData(data);
    } catch {
      toast("Error al cargar estado de resultados", "error");
    } finally {
      setPnlLoading(false);
    }
  }, [authFetch, startDate, endDate, pnlBranchId, toast]);

  const fetchCashFlow = useCallback(async () => {
    setCashFlowLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const data = await authFetch<CashFlowData>(
        "get",
        `/reportes/financial/cash-flow?${params.toString()}`,
      );
      setCashFlowData(data);
    } catch {
      toast("Error al cargar flujo de efectivo", "error");
    } finally {
      setCashFlowLoading(false);
    }
  }, [authFetch, startDate, endDate, toast]);

  const fetchAging = useCallback(
    async (type: "receivable" | "payable") => {
      setAgingLoading(true);
      try {
        const data = await authFetch<AgingData>("get", `/reportes/financial/aging/${type}`);
        setAgingData(data);
      } catch {
        toast("Error al cargar antiguedad de saldos", "error");
      } finally {
        setAgingLoading(false);
      }
    },
    [authFetch, toast],
  );

  // =======================================================================
  // Download helpers (same pattern as DIOT download)
  // =======================================================================

  async function downloadCSV(url: string, fallbackFilename: string) {
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1];
    const baseUrl = getApiUrl();
    const response = await fetch(`${baseUrl}${url}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token") || token || ""}`,
      },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.message || "Error al descargar");
    }
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fallbackFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }

  async function handleExportPnl() {
    setPnlExporting(true);
    try {
      await downloadCSV(
        `/reportes/financial/export/pnl?startDate=${startDate}&endDate=${endDate}`,
        `Estado_Resultados_${startDate}_${endDate}.csv`,
      );
    } catch (err: any) {
      toast(err?.message || "Error al exportar", "error");
    } finally {
      setPnlExporting(false);
    }
  }

  async function handleExportAging() {
    setAgingExporting(true);
    try {
      const label = agingType === "receivable" ? "CxC" : "CxP";
      await downloadCSV(
        `/reportes/financial/export/aging/${agingType}`,
        `Antiguedad_${label}_${new Date().toISOString().split("T")[0]}.csv`,
      );
    } catch (err: any) {
      toast(err?.message || "Error al exportar", "error");
    } finally {
      setAgingExporting(false);
    }
  }

  // =======================================================================
  // Load data when tab changes
  // =======================================================================

  useEffect(() => {
    if (authLoading || !branchesLoaded) return;

    if (activeTab === "ventas-sucursal") {
      fetchSalesByBranch();
    } else if (activeTab === "ventas-producto" && selectedBranchId) {
      fetchSalesByProduct(selectedBranchId);
    } else if (activeTab === "inventario") {
      fetchInventory(inventoryBranchId || undefined);
    } else if (activeTab === "reconciliacion-operativa") {
      fetchOperationalReconciliation();
    } else if (activeTab === "tendencias") {
      fetchTrends(trendsBranchId || undefined);
    } else if (activeTab === "estado-resultados") {
      fetchPnl();
    } else if (activeTab === "flujo-efectivo") {
      fetchCashFlow();
    } else if (activeTab === "antiguedad-saldos") {
      fetchAging(agingType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, authLoading, branchesLoaded]);

  // Refetch Ventas por Producto when branch changes
  useEffect(() => {
    if (activeTab === "ventas-producto" && selectedBranchId && branchesLoaded) {
      fetchSalesByProduct(selectedBranchId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  // Refetch aging when type toggles
  useEffect(() => {
    if (activeTab === "antiguedad-saldos" && branchesLoaded) {
      fetchAging(agingType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agingType]);

  // =======================================================================
  // Manual refresh handlers (triggered by "Consultar" button)
  // =======================================================================

  function handleRefresh() {
    if (activeTab === "ventas-sucursal") {
      fetchSalesByBranch();
    } else if (activeTab === "ventas-producto") {
      fetchSalesByProduct(selectedBranchId);
    } else if (activeTab === "inventario") {
      fetchInventory(inventoryBranchId || undefined);
    } else if (activeTab === "reconciliacion-operativa") {
      fetchOperationalReconciliation();
    } else if (activeTab === "tendencias") {
      fetchTrends(trendsBranchId || undefined);
    } else if (activeTab === "estado-resultados") {
      fetchPnl();
    } else if (activeTab === "flujo-efectivo") {
      fetchCashFlow();
    } else if (activeTab === "antiguedad-saldos") {
      fetchAging(agingType);
    }
  }

  // =======================================================================
  // Summary metric computations (existing)
  // =======================================================================

  const salesByBranchMetrics = {
    totalSales: salesByBranch.reduce((sum, r) => sum + safeNum(r.totalSales), 0),
    totalOrders: salesByBranch.reduce((sum, r) => sum + safeNum(r.totalOrders), 0),
    avgTicket:
      salesByBranch.length > 0
        ? salesByBranch.reduce((sum, r) => sum + safeNum(r.averageTicket), 0) / salesByBranch.length
        : 0,
    branchCount: salesByBranch.length,
  };

  const salesByProductMetrics = {
    totalRevenue: salesByProduct.reduce((sum, r) => sum + safeNum(r.totalRevenue), 0),
    totalQty: salesByProduct.reduce((sum, r) => sum + safeNum(r.quantitySold), 0),
    productCount: salesByProduct.length,
    topProduct:
      salesByProduct.length > 0
        ? [...salesByProduct].sort((a, b) => safeNum(b.totalRevenue) - safeNum(a.totalRevenue))[0]
            .productName
        : "-",
  };

  const inventoryMetrics = {
    totalValue: inventoryData.reduce((sum, r) => sum + safeNum(r.totalValue), 0),
    totalItems: inventoryData.length,
    totalUnits: inventoryData.reduce((sum, r) => sum + safeNum(r.currentQuantity), 0),
  };

  const reconciliationIssues = useMemo(
    () => buildReconciliationIssues(reconciliationData),
    [reconciliationData],
  );
  const inventoryIntegrityRows = useMemo(
    () => buildInventoryIntegrityRows(reconciliationData),
    [reconciliationData],
  );
  const filteredInventoryIntegrityRows = useMemo(() => {
    if (inventoryReviewFilter === "ALL") return inventoryIntegrityRows;
    return inventoryIntegrityRows.filter((row) => row.reviewStatus === inventoryReviewFilter);
  }, [inventoryIntegrityRows, inventoryReviewFilter]);

  const reconciliationMetrics = {
    issueCount: reconciliationData?.issueCount ?? 0,
    posIssueCount: reconciliationData?.posInventory.summary.issueCount ?? 0,
    transferIssueCount: reconciliationData?.cedisTransfers.summary.issueCount ?? 0,
    inventoryIntegrityIssueCount: reconciliationData?.inventoryIntegrity.summary.issueCount ?? 0,
    inventoryStockMismatchCount:
      reconciliationData?.inventoryIntegrity.summary.stockMismatchCount ?? 0,
    terminalLotCount: reconciliationData?.inventoryIntegrity.summary.terminalLotCount ?? 0,
    transferLotIssueCount:
      reconciliationData?.inventoryIntegrity.summary.transferLotIssueCount ?? 0,
    stalledRequisitionCount:
      reconciliationData?.inventoryIntegrity.summary.stalledRequisitionCount ?? 0,
    reviewOpenCount: reconciliationData?.inventoryIntegrity.summary.review?.openCount ?? 0,
    reviewReviewedCount: reconciliationData?.inventoryIntegrity.summary.review?.reviewedCount ?? 0,
    reviewResolvedCount: reconciliationData?.inventoryIntegrity.summary.review?.resolvedCount ?? 0,
    reviewIgnoredCount: reconciliationData?.inventoryIntegrity.summary.review?.ignoredCount ?? 0,
    stockPairCount: reconciliationData?.inventoryIntegrity.summary.stockPairCount ?? 0,
    saleCount: reconciliationData?.posInventory.summary.saleCount ?? 0,
    transferCount: reconciliationData?.cedisTransfers.summary.transferCount ?? 0,
    deliveryOrders: reconciliationData?.deliveryNetRevenue.summary.orderCount ?? 0,
    deliveryNetRevenue: reconciliationData?.deliveryNetRevenue.summary.recalculatedNetRevenue ?? 0,
  };
  const inventoryReviewFilterOptions: Array<{
    status: InventoryReviewFilter;
    label: string;
    count: number;
  }> = [
    {
      status: "OPEN",
      label: "Abiertas",
      count: reconciliationMetrics.reviewOpenCount,
    },
    {
      status: "REVIEWED",
      label: "Revisadas",
      count: reconciliationMetrics.reviewReviewedCount,
    },
    {
      status: "RESOLVED",
      label: "Resueltas",
      count: reconciliationMetrics.reviewResolvedCount,
    },
    {
      status: "IGNORED",
      label: "Ignoradas",
      count: reconciliationMetrics.reviewIgnoredCount,
    },
    {
      status: "ALL",
      label: "Todas",
      count: reconciliationMetrics.inventoryIntegrityIssueCount,
    },
  ];

  const trendsMetrics = {
    totalSales: trendsData.reduce((sum, r) => sum + safeNum(r.totalSales), 0),
    totalOrders: trendsData.reduce((sum, r) => sum + safeNum(r.totalOrders), 0),
    avgDailySales:
      trendsData.length > 0
        ? trendsData.reduce((sum, r) => sum + safeNum(r.totalSales), 0) / trendsData.length
        : 0,
    days: trendsData.length,
  };

  const updateInventoryIssueReview = useCallback(
    async (row: InventoryIntegrityTableRow, reviewStatus: ReconciliationReviewStatus) => {
      let note: string | null = row.reviewNote;

      if (reviewStatus === "RESOLVED" || reviewStatus === "IGNORED") {
        note = window.prompt("Nota de cierre", row.reviewNote || "")?.trim() || null;
        if (!note) {
          toast("La nota es obligatoria para resolver o ignorar", "error");
          return;
        }
      }

      try {
        await authFetch(
          "patch",
          `/reportes/operational-reconciliation/issues/${row.fingerprint}/review`,
          {
            reviewStatus,
            note,
            issueArea: row.issueArea,
            issueType: row.issueType,
            issueStatus: row.issueStatus,
            branchId: row.branchId ?? undefined,
            branchName: row.branchName,
            referenceId: row.referenceId ?? undefined,
            productId: row.productId ?? undefined,
            productSku: row.productSku ?? undefined,
          },
        );
        toast("Seguimiento actualizado");
        await fetchOperationalReconciliation();
      } catch (err: any) {
        toast(err?.message || "Error al actualizar seguimiento", "error");
      }
    },
    [authFetch, fetchOperationalReconciliation, toast],
  );

  // =======================================================================
  // Column definitions (existing)
  // =======================================================================

  const salesByBranchColumns = [
    {
      key: "branchName",
      header: "Sucursal",
      render: (r: SalesByBranch) => <span className="font-medium">{r.branchName}</span>,
    },
    {
      key: "totalSales",
      header: "Ventas Totales",
      className: "text-right",
      render: (r: SalesByBranch) => formatMXN(r.totalSales),
    },
    {
      key: "totalOrders",
      header: "Ordenes",
      className: "text-right",
      render: (r: SalesByBranch) => formatNumber(r.totalOrders),
    },
    {
      key: "averageTicket",
      header: "Ticket Promedio",
      className: "text-right",
      render: (r: SalesByBranch) => formatMXN(r.averageTicket),
    },
  ];

  const salesByProductColumns = [
    {
      key: "productName",
      header: "Producto",
      render: (r: SalesByProduct) => <span className="font-medium">{r.productName}</span>,
    },
    {
      key: "quantitySold",
      header: "Cantidad Vendida",
      className: "text-right",
      render: (r: SalesByProduct) => formatNumber(r.quantitySold),
    },
    {
      key: "totalRevenue",
      header: "Ingreso Total",
      className: "text-right",
      render: (r: SalesByProduct) => formatMXN(r.totalRevenue),
    },
    {
      key: "averagePrice",
      header: "Precio Promedio",
      className: "text-right",
      render: (r: SalesByProduct) => formatMXN(r.averagePrice),
    },
  ];

  const inventoryColumns = [
    {
      key: "sku",
      header: "SKU",
      className: "font-mono",
    },
    {
      key: "productName",
      header: "Producto",
      render: (r: InventoryValuation) => <span className="font-medium">{r.productName}</span>,
    },
    {
      key: "branchName",
      header: "Sucursal",
      render: (r: InventoryValuation) => r.branchName ?? "Todas",
    },
    {
      key: "currentQuantity",
      header: "Cantidad",
      className: "text-right",
      render: (r: InventoryValuation) => formatNumber(r.currentQuantity),
    },
    {
      key: "costPerUnit",
      header: "Costo Unitario",
      className: "text-right",
      render: (r: InventoryValuation) => formatMXN(r.costPerUnit),
    },
    {
      key: "totalValue",
      header: "Valor Total",
      className: "text-right",
      render: (r: InventoryValuation) => formatMXN(r.totalValue),
    },
  ];

  const trendsColumns = [
    {
      key: "date",
      header: "Fecha",
      render: (r: SalesTrend) =>
        new Date(r.date).toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
    },
    {
      key: "totalSales",
      header: "Ventas",
      className: "text-right",
      render: (r: SalesTrend) => formatMXN(r.totalSales),
    },
    {
      key: "totalOrders",
      header: "Ordenes",
      className: "text-right",
      render: (r: SalesTrend) => formatNumber(r.totalOrders),
    },
    {
      key: "averageTicket",
      header: "Ticket Promedio",
      className: "text-right",
      render: (r: SalesTrend) => formatMXN(r.averageTicket),
    },
  ];

  const reconciliationIssueColumns = [
    {
      key: "area",
      header: "Area",
      render: (r: ReconciliationIssueRow) => <span className="font-medium">{r.area}</span>,
    },
    {
      key: "status",
      header: "Estado",
      render: (r: ReconciliationIssueRow) => (
        <StatusBadge label={statusLabel(r.status)} variant={statusVariant(r.status)} />
      ),
    },
    {
      key: "branch",
      header: "Sucursal",
    },
    {
      key: "reference",
      header: "Referencia",
      className: "font-mono",
    },
    {
      key: "product",
      header: "Producto / Plataforma",
    },
    {
      key: "difference",
      header: "Diferencia",
      className: "text-right",
    },
    {
      key: "impact",
      header: "Impacto",
      className: "text-right",
    },
  ];

  const inventoryIntegrityColumns = [
    {
      key: "type",
      header: "Tipo",
      render: (r: InventoryIntegrityTableRow) => <span className="font-medium">{r.type}</span>,
    },
    {
      key: "status",
      header: "Estado",
      render: (r: InventoryIntegrityTableRow) => (
        <StatusBadge label={statusLabel(r.status)} variant={statusVariant(r.status)} />
      ),
    },
    {
      key: "branch",
      header: "Sucursal / Ruta",
    },
    {
      key: "reference",
      header: "Referencia",
      className: "font-mono",
    },
    {
      key: "product",
      header: "Producto",
    },
    {
      key: "systemStock",
      header: "Sistema",
      className: "text-right",
    },
    {
      key: "lotStock",
      header: "Lote / Recepcion",
      className: "text-right",
    },
    {
      key: "difference",
      header: "Diferencia",
      className: "text-right",
    },
    {
      key: "reviewStatus",
      header: "Seguimiento",
      render: (r: InventoryIntegrityTableRow) => (
        <div className="min-w-32">
          <StatusBadge
            label={reviewStatusLabel(r.reviewStatus)}
            variant={reviewStatusVariant(r.reviewStatus)}
          />
          {r.reviewedAt && (
            <p className="mt-1 text-xs text-gray-500">
              {new Date(r.reviewedAt).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
              })}
              {r.reviewedByName ? ` · ${r.reviewedByName}` : ""}
            </p>
          )}
          {r.reviewNote && (
            <p className="mt-1 max-w-44 truncate text-xs text-gray-500">{r.reviewNote}</p>
          )}
        </div>
      ),
    },
    {
      key: "reviewActions",
      header: "Control",
      render: (r: InventoryIntegrityTableRow) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Marcar revisada"
            aria-label="Marcar revisada"
            disabled={r.reviewStatus === "REVIEWED"}
            onClick={() => updateInventoryIssueReview(r, "REVIEWED")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Resolver con nota"
            aria-label="Resolver con nota"
            disabled={r.reviewStatus === "RESOLVED"}
            onClick={() => updateInventoryIssueReview(r, "RESOLVED")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-green-700 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Ignorar con nota"
            aria-label="Ignorar con nota"
            disabled={r.reviewStatus === "IGNORED"}
            onClick={() => updateInventoryIssueReview(r, "IGNORED")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Ban className="h-4 w-4" />
          </button>
          {r.reviewStatus !== "OPEN" && (
            <button
              type="button"
              title="Reabrir"
              aria-label="Reabrir"
              onClick={() => updateInventoryIssueReview(r, "OPEN")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-700 transition-colors hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
    {
      key: "action",
      header: "Accion",
      render: (r: InventoryIntegrityTableRow) => (
        <Link
          href={r.actionHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          {r.action}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      ),
    },
  ];

  function handleExportReconciliationIssues() {
    exportToCSV(reconciliationIssues, `Reconciliacion_Operativa_${startDate}_${endDate}`, [
      { key: "area", label: "Area" },
      { key: "status", label: "Estado" },
      { key: "branch", label: "Sucursal" },
      { key: "reference", label: "Referencia" },
      { key: "product", label: "Producto/Plataforma" },
      { key: "difference", label: "Diferencia" },
      { key: "impact", label: "Impacto" },
    ]);
  }

  function handleExportInventoryIntegrity() {
    exportToCSV(
      filteredInventoryIntegrityRows,
      `Integridad_Inventario_${inventoryReviewFilter}_${startDate}_${endDate}`,
      [
        { key: "type", label: "Tipo" },
        { key: "status", label: "Estado" },
        { key: "branch", label: "Sucursal/Ruta" },
        { key: "reference", label: "Referencia" },
        { key: "product", label: "Producto" },
        { key: "systemStock", label: "Sistema" },
        { key: "lotStock", label: "Lote/Recepcion" },
        { key: "difference", label: "Diferencia" },
        { key: "reviewStatus", label: "Seguimiento" },
        { key: "reviewNote", label: "Nota" },
        { key: "reviewedByName", label: "Revisado por" },
        { key: "reviewedAt", label: "Fecha revision" },
        { key: "action", label: "Accion" },
        { key: "actionHref", label: "Liga" },
      ],
    );
  }

  // --- Aging detail columns ---
  const agingDetailColumns = [
    {
      key: "name",
      header: agingType === "receivable" ? "Cliente" : "Proveedor",
      render: (r: AgingDetail) => (
        <span className="font-medium">
          {agingType === "receivable" ? r.customerName : r.supplierName}
        </span>
      ),
    },
    {
      key: "invoiceNumber",
      header: "Factura",
      render: (r: AgingDetail) => r.invoiceNumber || "N/A",
    },
    {
      key: "amount",
      header: "Monto Original",
      className: "text-right",
      render: (r: AgingDetail) => formatMXN(r.amount),
    },
    {
      key: "balanceDue",
      header: "Saldo",
      className: "text-right",
      render: (r: AgingDetail) => formatMXN(r.balanceDue),
    },
    {
      key: "dueDate",
      header: "Vencimiento",
      render: (r: AgingDetail) =>
        new Date(r.dueDate).toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
    },
    {
      key: "ageDays",
      header: "Dias",
      className: "text-right",
      render: (r: AgingDetail) => String(r.ageDays),
    },
    {
      key: "bucket",
      header: "Clasificacion",
      render: (r: AgingDetail) => {
        const colors: Record<string, string> = {
          current: "bg-green-100 text-green-800",
          "31-60": "bg-blue-100 text-blue-800",
          "61-90": "bg-yellow-100 text-yellow-800",
          "90+": "bg-red-100 text-red-800",
        };
        const labels: Record<string, string> = {
          current: "Corriente",
          "31-60": "31-60 dias",
          "61-90": "61-90 dias",
          "90+": "90+ dias",
        };
        return (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[r.bucket] || "bg-gray-100 text-gray-800"}`}
          >
            {labels[r.bucket] || r.bucket}
          </span>
        );
      },
    },
  ];

  // =======================================================================
  // Render
  // =======================================================================

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes y Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Consulta ventas, inventario y tendencias de tu negocio
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-border">
        <div className="flex gap-6 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex shrink-0 items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "border-black text-gray-900"
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

      {/* Tab content */}
      <div className="mt-6">
        {/* ============================================================ */}
        {/* VENTAS POR SUCURSAL                                          */}
        {/* ============================================================ */}
        {activeTab === "ventas-sucursal" && (
          <div className="space-y-6">
            <DateFilters
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              branches={branches}
              onRefresh={handleRefresh}
            />

            {/* Summary cards */}
            {!salesByBranchLoading && salesByBranch.length > 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Ventas Totales"
                  value={formatMXN(salesByBranchMetrics.totalSales)}
                  sub="en el periodo seleccionado"
                  icon={DollarSign}
                />
                <MetricCard
                  title="Total de Ordenes"
                  value={formatNumber(salesByBranchMetrics.totalOrders)}
                  sub="ordenes procesadas"
                  icon={BarChart3}
                />
                <MetricCard
                  title="Ticket Promedio"
                  value={formatMXN(salesByBranchMetrics.avgTicket)}
                  sub="promedio entre sucursales"
                  icon={TrendingUp}
                />
                <MetricCard
                  title="Sucursales"
                  value={String(salesByBranchMetrics.branchCount)}
                  sub="con ventas en el periodo"
                  icon={Store}
                />
              </div>
            )}

            <DataTable
              columns={salesByBranchColumns}
              data={salesByBranch}
              loading={salesByBranchLoading}
              emptyMessage="No hay datos de ventas para el periodo seleccionado"
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* VENTAS POR PRODUCTO                                          */}
        {/* ============================================================ */}
        {activeTab === "ventas-producto" && (
          <div className="space-y-6">
            <BranchRequiredFilters
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              branches={branches}
              selectedBranchId={selectedBranchId}
              onBranchChange={setSelectedBranchId}
              onRefresh={handleRefresh}
            />

            {/* Summary cards */}
            {!salesByProductLoading && salesByProduct.length > 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Ingreso Total"
                  value={formatMXN(salesByProductMetrics.totalRevenue)}
                  sub="de la sucursal seleccionada"
                  icon={DollarSign}
                />
                <MetricCard
                  title="Unidades Vendidas"
                  value={formatNumber(salesByProductMetrics.totalQty)}
                  sub="productos vendidos"
                  icon={Package}
                />
                <MetricCard
                  title="Productos"
                  value={String(salesByProductMetrics.productCount)}
                  sub="con ventas registradas"
                  icon={BarChart3}
                />
                <MetricCard
                  title="Producto Top"
                  value={salesByProductMetrics.topProduct}
                  sub="mayor ingreso en el periodo"
                  icon={TrendingUp}
                />
              </div>
            )}

            <DataTable
              columns={salesByProductColumns}
              data={salesByProduct}
              loading={salesByProductLoading}
              emptyMessage="No hay datos de productos para esta sucursal y periodo"
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* VALUACION DE INVENTARIO                                      */}
        {/* ============================================================ */}
        {activeTab === "inventario" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-52">
                <FormField label="Sucursal">
                  <Select
                    value={inventoryBranchId}
                    onChange={(e) => setInventoryBranchId(e.target.value)}
                  >
                    <option value="">Todas las sucursales</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <Button onClick={handleRefresh} variant="outline" size="md">
                <RefreshCw className="h-4 w-4" />
                Consultar
              </Button>
            </div>

            {/* Summary cards */}
            {!inventoryLoading && inventoryData.length > 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  title="Valor Total del Inventario"
                  value={formatMXN(inventoryMetrics.totalValue)}
                  sub="valuacion a costo"
                  icon={DollarSign}
                />
                <MetricCard
                  title="Productos"
                  value={String(inventoryMetrics.totalItems)}
                  sub="lineas de inventario"
                  icon={Package}
                />
                <MetricCard
                  title="Unidades Totales"
                  value={formatNumber(inventoryMetrics.totalUnits)}
                  sub="en existencia"
                  icon={Warehouse}
                />
              </div>
            )}

            <DataTable
              columns={inventoryColumns}
              data={inventoryData}
              loading={inventoryLoading}
              emptyMessage="No hay datos de inventario disponibles"
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* RECONCILIACION OPERATIVA                                     */}
        {/* ============================================================ */}
        {activeTab === "reconciliacion-operativa" && (
          <div className="space-y-6">
            <DateFilters
              showBranch
              branchValue={reconciliationBranchId}
              onBranchChange={setReconciliationBranchId}
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              branches={branches}
              onRefresh={handleRefresh}
            />

            {reconciliationLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Cargando reconciliacion operativa...
              </div>
            )}

            {!reconciliationLoading && reconciliationData && (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
                  <MetricCard
                    title="Estado"
                    value={reconciliationData.status === "OK" ? "OK" : "Revisar"}
                    sub={`${formatNumber(reconciliationMetrics.issueCount)} incidencia(s)`}
                    icon={ClipboardCheck}
                  />
                  <MetricCard
                    title="Ventas POS"
                    value={formatNumber(reconciliationMetrics.saleCount)}
                    sub={`${formatNumber(reconciliationMetrics.posIssueCount)} incidencia(s)`}
                    icon={Store}
                  />
                  <MetricCard
                    title="Transferencias"
                    value={formatNumber(reconciliationMetrics.transferCount)}
                    sub={`${formatNumber(reconciliationMetrics.transferIssueCount)} incidencia(s)`}
                    icon={Warehouse}
                  />
                  <MetricCard
                    title="Integridad Inv."
                    value={formatNumber(reconciliationMetrics.inventoryIntegrityIssueCount)}
                    sub="stock, lotes y requisiciones"
                    icon={AlertTriangle}
                  />
                  <MetricCard
                    title="Delivery Neto"
                    value={formatMXN(reconciliationMetrics.deliveryNetRevenue)}
                    sub={`${formatNumber(reconciliationMetrics.deliveryOrders)} orden(es)`}
                    icon={DollarSign}
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                  <ReconciliationAreaPanel
                    title="POS vs Inventario"
                    issueCount={reconciliationData.posInventory.summary.issueCount}
                    primaryMetric={`${formatQty(reconciliationData.posInventory.summary.totalSoldQuantity)} vendidas`}
                    secondaryMetric={`${formatQty(
                      safeNum(reconciliationData.posInventory.summary.totalSoldQuantity) -
                        safeNum(reconciliationData.posInventory.summary.totalDeductedQuantity),
                    )} und`}
                    icon={AlertTriangle}
                  />
                  <ReconciliationAreaPanel
                    title="CEDIS vs Sucursal"
                    issueCount={reconciliationData.cedisTransfers.summary.issueCount}
                    primaryMetric={`${formatNumber(reconciliationData.cedisTransfers.summary.lineCount)} lineas`}
                    secondaryMetric={`${formatNumber(reconciliationData.cedisTransfers.summary.receivedShortCount)} cortas`}
                    icon={Warehouse}
                  />
                  <ReconciliationAreaPanel
                    title="Food Cost"
                    issueCount={reconciliationData.foodCost.summary.issueCount}
                    primaryMetric={formatMXN(reconciliationData.foodCost.summary.actualCost)}
                    secondaryMetric={formatMXN(
                      safeNum(reconciliationData.foodCost.summary.actualCost) -
                        safeNum(reconciliationData.foodCost.summary.theoreticalCost),
                    )}
                    icon={Package}
                  />
                  <ReconciliationAreaPanel
                    title="Delivery"
                    issueCount={reconciliationData.deliveryNetRevenue.summary.issueCount}
                    primaryMetric={formatMXN(
                      reconciliationData.deliveryNetRevenue.summary.grossRevenue,
                    )}
                    secondaryMetric={formatPct(
                      reconciliationData.deliveryNetRevenue.summary.feePct,
                    )}
                    icon={DollarSign}
                  />
                  <ReconciliationAreaPanel
                    title="Integridad Inventario"
                    issueCount={reconciliationMetrics.inventoryIntegrityIssueCount}
                    primaryMetric={`${formatNumber(reconciliationMetrics.stockPairCount)} pares`}
                    secondaryMetric={`${formatNumber(
                      reconciliationMetrics.inventoryStockMismatchCount,
                    )} diferencias`}
                    icon={AlertTriangle}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">
                        Integridad de Inventario
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Stock, lotes, transferencias y requisiciones abiertas
                      </p>
                    </div>
                    <StatusBadge
                      label={
                        reconciliationMetrics.inventoryIntegrityIssueCount > 0
                          ? `${formatNumber(
                              reconciliationMetrics.inventoryIntegrityIssueCount,
                            )} incidencia(s)`
                          : "OK"
                      }
                      variant={
                        reconciliationMetrics.inventoryIntegrityIssueCount > 0 ? "yellow" : "green"
                      }
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-medium text-gray-500">Stock vs lotes</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">
                        {formatNumber(reconciliationMetrics.inventoryStockMismatchCount)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatNumber(reconciliationMetrics.stockPairCount)} pares revisados
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-medium text-gray-500">Lotes terminales</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">
                        {formatNumber(reconciliationMetrics.terminalLotCount)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">con cantidad mayor a cero</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-medium text-gray-500">Lotes en transferencia</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">
                        {formatNumber(reconciliationMetrics.transferLotIssueCount)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">pendientes de recepcion</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-medium text-gray-500">Requisiciones</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">
                        {formatNumber(reconciliationMetrics.stalledRequisitionCount)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">aprobadas con transfer abierta</p>
                    </div>
                  </div>

                  <div
                    className="flex flex-wrap items-center gap-2"
                    role="group"
                    aria-label="Seguimiento de integridad"
                  >
                    {inventoryReviewFilterOptions.map((option) => {
                      const active = inventoryReviewFilter === option.status;

                      return (
                        <button
                          key={option.status}
                          type="button"
                          onClick={() => setInventoryReviewFilter(option.status)}
                          className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                            active
                              ? "border-black bg-black text-white"
                              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                          aria-pressed={active}
                        >
                          <span>{option.label}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {formatNumber(option.count)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <DataTable
                    columns={inventoryIntegrityColumns}
                    data={filteredInventoryIntegrityRows}
                    searchable
                    searchPlaceholder={`Buscar ${inventoryReviewSearchLabel(
                      inventoryReviewFilter,
                    )}...`}
                    pageSize={8}
                    onExport={
                      filteredInventoryIntegrityRows.length > 0
                        ? handleExportInventoryIntegrity
                        : undefined
                    }
                    exportLabel="Exportar integridad"
                    loading={reconciliationLoading}
                    emptyMessage={inventoryReviewEmptyMessage(inventoryReviewFilter)}
                  />
                </div>

                <DataTable
                  columns={reconciliationIssueColumns}
                  data={reconciliationIssues}
                  searchable
                  searchPlaceholder="Buscar incidencia..."
                  pageSize={12}
                  onExport={
                    reconciliationIssues.length > 0 ? handleExportReconciliationIssues : undefined
                  }
                  exportLabel="Exportar incidencias"
                  loading={reconciliationLoading}
                  emptyMessage="No hay incidencias operativas en el periodo"
                />
              </>
            )}

            {!reconciliationLoading && !reconciliationData && (
              <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                Selecciona un periodo y presiona Consultar para ver la reconciliacion operativa.
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TENDENCIAS                                                   */}
        {/* ============================================================ */}
        {activeTab === "tendencias" && (
          <div className="space-y-6">
            <DateFilters
              showBranch
              branchValue={trendsBranchId}
              onBranchChange={(id) => setTrendsBranchId(id)}
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              branches={branches}
              onRefresh={handleRefresh}
            />

            {/* Summary cards */}
            {!trendsLoading && trendsData.length > 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Ventas del Periodo"
                  value={formatMXN(trendsMetrics.totalSales)}
                  sub="acumulado en el rango"
                  icon={DollarSign}
                />
                <MetricCard
                  title="Ordenes del Periodo"
                  value={formatNumber(trendsMetrics.totalOrders)}
                  sub="ordenes totales"
                  icon={BarChart3}
                />
                <MetricCard
                  title="Promedio Diario"
                  value={formatMXN(trendsMetrics.avgDailySales)}
                  sub="venta promedio por dia"
                  icon={TrendingUp}
                />
                <MetricCard
                  title="Dias con Datos"
                  value={String(trendsMetrics.days)}
                  sub="en el periodo consultado"
                  icon={Store}
                />
              </div>
            )}

            <DataTable
              columns={trendsColumns}
              data={trendsData}
              loading={trendsLoading}
              emptyMessage="No hay datos de tendencias para el periodo seleccionado"
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* ESTADO DE RESULTADOS (P&L)                                   */}
        {/* ============================================================ */}
        {activeTab === "estado-resultados" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-44">
                <FormField label="Fecha Inicio">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </FormField>
              </div>
              <div className="w-44">
                <FormField label="Fecha Fin">
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </FormField>
              </div>
              <div className="w-52">
                <FormField label="Sucursal">
                  <Select value={pnlBranchId} onChange={(e) => setPnlBranchId(e.target.value)}>
                    <option value="">Todas las sucursales</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <Button onClick={handleRefresh} variant="outline" size="md">
                <RefreshCw className="h-4 w-4" />
                Consultar
              </Button>
              <Button
                onClick={handleExportPnl}
                variant="outline"
                size="md"
                disabled={pnlExporting || !pnlData}
              >
                <Download className="h-4 w-4" />
                {pnlExporting ? "Exportando..." : "Exportar Excel"}
              </Button>
            </div>

            {pnlLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Cargando estado de resultados...
              </div>
            )}

            {!pnlLoading && pnlData && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    title="Ingresos"
                    value={formatMXN(pnlData.revenue)}
                    sub="ventas totales del periodo"
                    icon={DollarSign}
                  />
                  <MetricCard
                    title="Utilidad Bruta"
                    value={formatMXN(pnlData.grossProfit)}
                    sub={`Margen: ${formatPct(pnlData.margins.grossMargin)}`}
                    icon={TrendingUp}
                  />
                  <MetricCard
                    title="Utilidad Operativa"
                    value={formatMXN(pnlData.operatingIncome)}
                    sub={`Margen: ${formatPct(pnlData.margins.operatingMargin)}`}
                    icon={BarChart3}
                  />
                  <MetricCard
                    title="Utilidad Neta"
                    value={formatMXN(pnlData.netIncome)}
                    sub={`Margen: ${formatPct(pnlData.margins.netMargin)}`}
                    icon={FileSpreadsheet}
                  />
                </div>

                {/* P&L Table */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="py-3 pl-4 text-left text-xs font-semibold uppercase text-gray-500">
                          Concepto
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold uppercase text-gray-500">
                          Monto
                        </th>
                        <th className="py-3 px-4 text-right text-xs font-semibold uppercase text-gray-500">
                          Margen
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <PnlRow label="Ingresos (Revenue)" amount={pnlData.revenue} bold />
                      <PnlRow label="Costo de Ventas" amount={pnlData.costOfGoods} negative />
                      <PnlRow
                        label="= Utilidad Bruta"
                        amount={pnlData.grossProfit}
                        margin={pnlData.margins.grossMargin}
                        bold
                      />
                      <tr>
                        <td
                          colSpan={3}
                          className="py-2 pl-4 text-xs font-semibold uppercase text-gray-400"
                        >
                          Gastos Operativos
                        </td>
                      </tr>
                      <PnlRow
                        label="Nomina y mano de obra"
                        amount={pnlData.operatingExpenses.labor}
                        indent
                      />
                      <PnlRow label="Renta" amount={pnlData.operatingExpenses.rent} indent />
                      <PnlRow
                        label="Servicios (luz/agua/gas)"
                        amount={pnlData.operatingExpenses.utilities}
                        indent
                      />
                      <PnlRow
                        label="Marketing"
                        amount={pnlData.operatingExpenses.marketing}
                        indent
                      />
                      <PnlRow
                        label="Mantenimiento"
                        amount={pnlData.operatingExpenses.maintenance}
                        indent
                      />
                      <PnlRow
                        label="Otros gastos"
                        amount={pnlData.operatingExpenses.other}
                        indent
                      />
                      <PnlRow
                        label="Total Gastos Operativos"
                        amount={pnlData.operatingExpenses.total}
                        negative
                        bold
                      />
                      <PnlRow
                        label="= Utilidad Operativa"
                        amount={pnlData.operatingIncome}
                        margin={pnlData.margins.operatingMargin}
                        bold
                      />
                      <PnlRow label="Otros Ingresos" amount={pnlData.otherIncome} />
                      <PnlRow label="Otros Gastos" amount={pnlData.otherExpenses} negative />
                      <tr className="bg-gray-100">
                        <td className="py-3 pl-4 text-sm font-bold text-gray-900">
                          = Utilidad Neta
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-bold text-gray-900">
                          {formatMXN(pnlData.netIncome)}
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-bold text-gray-600">
                          {formatPct(pnlData.margins.netMargin)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Bar chart: Revenue vs Costs vs Net */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Ingresos vs Costos vs Utilidad Neta
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={[
                        {
                          name: "Ingresos",
                          value: pnlData.revenue,
                          fill: "#22c55e",
                        },
                        {
                          name: "Costo Ventas",
                          value: pnlData.costOfGoods,
                          fill: "#ef4444",
                        },
                        {
                          name: "Gastos Op.",
                          value: pnlData.operatingExpenses.total,
                          fill: "#f59e0b",
                        },
                        {
                          name: "Utilidad Neta",
                          value: pnlData.netIncome,
                          fill: "#3b82f6",
                        },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatMXN(value)} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {[
                          { name: "Ingresos", fill: "#22c55e" },
                          { name: "Costo Ventas", fill: "#ef4444" },
                          { name: "Gastos Op.", fill: "#f59e0b" },
                          { name: "Utilidad Neta", fill: "#3b82f6" },
                        ].map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {!pnlLoading && !pnlData && (
              <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                Selecciona un periodo y presiona Consultar para ver el estado de resultados.
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* FLUJO DE EFECTIVO                                            */}
        {/* ============================================================ */}
        {activeTab === "flujo-efectivo" && (
          <div className="space-y-6">
            <DateFilters
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              branches={branches}
              onRefresh={handleRefresh}
            />

            {cashFlowLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Cargando flujo de efectivo...
              </div>
            )}

            {!cashFlowLoading && cashFlowData && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    title="Saldo Inicial"
                    value={formatMXN(cashFlowData.beginningBalance)}
                    sub="al inicio del periodo"
                    icon={Banknote}
                  />
                  <MetricCard
                    title="Flujo Operativo"
                    value={formatMXN(cashFlowData.operatingActivities.netOperating)}
                    sub="actividades operativas"
                    icon={TrendingUp}
                  />
                  <MetricCard
                    title="Flujo Neto"
                    value={formatMXN(cashFlowData.netCashFlow)}
                    sub="total del periodo"
                    icon={DollarSign}
                  />
                  <MetricCard
                    title="Saldo Final"
                    value={formatMXN(cashFlowData.endingBalance)}
                    sub="al cierre del periodo"
                    icon={Banknote}
                  />
                </div>

                {/* Three sections */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  {/* Operating Activities */}
                  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-sm font-semibold text-gray-700">
                      Actividades Operativas
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Cobros de ventas</span>
                        <span className="font-medium text-green-600">
                          +{formatMXN(cashFlowData.operatingActivities.cashFromSales)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Pagos a proveedores</span>
                        <span className="font-medium text-red-600">
                          -{formatMXN(cashFlowData.operatingActivities.cashToSuppliers)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Pagos de nomina</span>
                        <span className="font-medium text-red-600">
                          -{formatMXN(cashFlowData.operatingActivities.cashForPayroll)}
                        </span>
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
                        <span>Flujo operativo neto</span>
                        <span
                          className={
                            cashFlowData.operatingActivities.netOperating >= 0
                              ? "text-green-700"
                              : "text-red-700"
                          }
                        >
                          {formatMXN(cashFlowData.operatingActivities.netOperating)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Investing Activities */}
                  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-sm font-semibold text-gray-700">
                      Actividades de Inversion
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Inversiones</span>
                        <span className="font-medium text-gray-500">
                          {formatMXN(cashFlowData.investingActivities)}
                        </span>
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
                        <span>Flujo de inversion</span>
                        <span>{formatMXN(cashFlowData.investingActivities)}</span>
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-gray-400">
                      Sin movimientos de inversion en este periodo.
                    </p>
                  </div>

                  {/* Financing Activities */}
                  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-sm font-semibold text-gray-700">
                      Actividades de Financiamiento
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Financiamiento</span>
                        <span className="font-medium text-gray-500">
                          {formatMXN(cashFlowData.financingActivities)}
                        </span>
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
                        <span>Flujo de financiamiento</span>
                        <span>{formatMXN(cashFlowData.financingActivities)}</span>
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-gray-400">
                      Sin movimientos de financiamiento en este periodo.
                    </p>
                  </div>
                </div>

                {/* Bottom: Saldo Inicial -> Flujo Neto -> Saldo Final */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Resumen de Flujo de Efectivo
                  </h3>
                  <div className="flex flex-wrap items-center justify-center gap-4 text-center">
                    <div className="rounded-lg bg-gray-50 p-4 min-w-[160px]">
                      <p className="text-xs text-gray-500">Saldo Inicial</p>
                      <p className="mt-1 text-lg font-bold text-gray-900">
                        {formatMXN(cashFlowData.beginningBalance)}
                      </p>
                    </div>
                    <span className="text-2xl text-gray-400">+</span>
                    <div
                      className={`rounded-lg p-4 min-w-[160px] ${cashFlowData.netCashFlow >= 0 ? "bg-green-50" : "bg-red-50"}`}
                    >
                      <p className="text-xs text-gray-500">Flujo Neto</p>
                      <p
                        className={`mt-1 text-lg font-bold ${cashFlowData.netCashFlow >= 0 ? "text-green-700" : "text-red-700"}`}
                      >
                        {formatMXN(cashFlowData.netCashFlow)}
                      </p>
                    </div>
                    <span className="text-2xl text-gray-400">=</span>
                    <div className="rounded-lg bg-blue-50 p-4 min-w-[160px]">
                      <p className="text-xs text-gray-500">Saldo Final</p>
                      <p className="mt-1 text-lg font-bold text-blue-700">
                        {formatMXN(cashFlowData.endingBalance)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Waterfall-style chart using stacked bars */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Grafica de Flujo de Efectivo
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={[
                        { name: "Saldo Inicial", value: cashFlowData.beginningBalance },
                        { name: "Cobros", value: cashFlowData.operatingActivities.cashFromSales },
                        {
                          name: "Pago Proveedores",
                          value: -cashFlowData.operatingActivities.cashToSuppliers,
                        },
                        { name: "Nomina", value: -cashFlowData.operatingActivities.cashForPayroll },
                        { name: "Saldo Final", value: cashFlowData.endingBalance },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatMXN(value)} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {[
                          { fill: "#6b7280" },
                          { fill: "#22c55e" },
                          { fill: "#ef4444" },
                          { fill: "#ef4444" },
                          { fill: "#3b82f6" },
                        ].map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {!cashFlowLoading && !cashFlowData && (
              <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                Selecciona un periodo y presiona Consultar para ver el flujo de efectivo.
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* ANTIGUEDAD DE SALDOS                                         */}
        {/* ============================================================ */}
        {activeTab === "antiguedad-saldos" && (
          <div className="space-y-6">
            {/* Toggle + Export */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setAgingType("receivable")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    agingType === "receivable"
                      ? "bg-black text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Cuentas por Cobrar
                </button>
                <button
                  onClick={() => setAgingType("payable")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    agingType === "payable"
                      ? "bg-black text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Cuentas por Pagar
                </button>
              </div>
              <Button onClick={() => fetchAging(agingType)} variant="outline" size="md">
                <RefreshCw className="h-4 w-4" />
                Consultar
              </Button>
              <Button
                onClick={handleExportAging}
                variant="outline"
                size="md"
                disabled={agingExporting || !agingData}
              >
                <Download className="h-4 w-4" />
                {agingExporting ? "Exportando..." : "Exportar Excel"}
              </Button>
            </div>

            {agingLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Cargando antiguedad de saldos...
              </div>
            )}

            {!agingLoading && agingData && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
                  <MetricCard
                    title="Total"
                    value={formatMXN(agingData.total)}
                    sub={agingType === "receivable" ? "por cobrar" : "por pagar"}
                    icon={DollarSign}
                  />
                  <MetricCard
                    title="Corriente (0-30)"
                    value={formatMXN(agingData.buckets.current)}
                    sub="dias"
                    icon={Clock}
                  />
                  <MetricCard
                    title="31-60 dias"
                    value={formatMXN(agingData.buckets.days31to60)}
                    sub="vencido"
                    icon={Clock}
                  />
                  <MetricCard
                    title="61-90 dias"
                    value={formatMXN(agingData.buckets.days61to90)}
                    sub="vencido"
                    icon={Clock}
                  />
                  <MetricCard
                    title="90+ dias"
                    value={formatMXN(agingData.buckets.days90plus)}
                    sub="alto riesgo"
                    icon={Clock}
                  />
                </div>

                {/* Pie chart */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Distribucion por Antiguedad
                  </h3>
                  <div className="flex flex-col items-center md:flex-row md:justify-center gap-8">
                    <ResponsiveContainer width={280} height={280}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Corriente (0-30)", value: agingData.buckets.current },
                            { name: "31-60 dias", value: agingData.buckets.days31to60 },
                            { name: "61-90 dias", value: agingData.buckets.days61to90 },
                            { name: "90+ dias", value: agingData.buckets.days90plus },
                          ]}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          innerRadius={50}
                          dataKey="value"
                          label={({ percent }) =>
                            percent > 0 ? `${(percent * 100).toFixed(0)}%` : ""
                          }
                          labelLine={false}
                        >
                          {PIE_COLORS.map((color, i) => (
                            <Cell key={i} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatMXN(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {[
                        {
                          label: "Corriente (0-30 dias)",
                          color: PIE_COLORS[0],
                          value: agingData.buckets.current,
                        },
                        {
                          label: "31-60 dias",
                          color: PIE_COLORS[1],
                          value: agingData.buckets.days31to60,
                        },
                        {
                          label: "61-90 dias",
                          color: PIE_COLORS[2],
                          value: agingData.buckets.days61to90,
                        },
                        {
                          label: "90+ dias",
                          color: PIE_COLORS[3],
                          value: agingData.buckets.days90plus,
                        },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-3">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-sm text-gray-600">{item.label}</span>
                          <span className="text-sm font-medium text-gray-900">
                            {formatMXN(item.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Detail table */}
                <DataTable
                  columns={agingDetailColumns}
                  data={agingData.details}
                  loading={agingLoading}
                  emptyMessage={
                    agingType === "receivable"
                      ? "No hay cuentas por cobrar pendientes"
                      : "No hay cuentas por pagar pendientes"
                  }
                />
              </>
            )}

            {!agingLoading && !agingData && (
              <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                Presiona Consultar para ver la antiguedad de saldos.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
