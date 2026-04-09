import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class FinancialReportsService {
  constructor(private prisma: PrismaService) {}

  // ====================================================================
  // A) Estado de Resultados (P&L / Income Statement)
  // ====================================================================

  async getPnl(
    organizationId: string,
    startDate: string,
    endDate: string,
    branchId?: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // --- Revenue: CorntechSale totals in date range ---
    const branchWhere = branchId
      ? { branchId }
      : {
          branchId: {
            in: (
              await this.prisma.branch.findMany({
                where: { organizationId },
                select: { id: true },
              })
            ).map((b) => b.id),
          },
        };

    const corntechAgg = await this.prisma.corntechSale.aggregate({
      where: {
        ...branchWhere,
        saleDate: { gte: start, lte: end },
      },
      _sum: { total: true },
    });

    const revenue = Number(corntechAgg._sum.total || 0);

    // --- Cost of Goods Sold: PurchaseOrders with status RECEIVED ---
    const purchaseAgg = await this.prisma.purchaseOrder.aggregate({
      where: {
        organizationId,
        status: "RECEIVED",
        createdAt: { gte: start, lte: end },
        ...(branchId ? { branchId } : {}),
      },
      _sum: { total: true },
    });

    const costOfGoods = Number(purchaseAgg._sum.total || 0);
    const grossProfit = revenue - costOfGoods;

    // --- Labor costs: PayrollPeriod totals in range ---
    const payrollAgg = await this.prisma.payrollPeriod.aggregate({
      where: {
        organizationId,
        startDate: { gte: start },
        endDate: { lte: end },
      },
      _sum: {
        totalEmployerCost: true,
      },
    });

    const labor = Number(payrollAgg._sum.totalEmployerCost || 0);

    // --- Expense breakdown from JournalEntry lines ---
    const expenseLines = await this.prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId,
          status: "POSTED",
          entryDate: { gte: start, lte: end },
          ...(branchId ? { branchId } : {}),
        },
        account: {
          type: "EXPENSE",
        },
      },
      include: {
        account: { select: { name: true, code: true } },
      },
    });

    // Categorize expenses by account name keywords
    const expenseCategories: Record<string, number> = {
      rent: 0,
      utilities: 0,
      marketing: 0,
      maintenance: 0,
      other: 0,
    };

    const rentKeywords = ["renta", "alquiler", "arrendamiento", "rent"];
    const utilityKeywords = ["luz", "agua", "gas", "telefono", "internet", "electricidad", "servicios", "utilit"];
    const marketingKeywords = ["marketing", "publicidad", "mercadotecnia", "promo"];
    const maintenanceKeywords = ["mantenimiento", "reparacion", "manten", "mainten"];

    for (const line of expenseLines) {
      const amount = Number(line.debit) - Number(line.credit);
      const nameLower = line.account.name.toLowerCase();

      if (rentKeywords.some((kw) => nameLower.includes(kw))) {
        expenseCategories.rent += amount;
      } else if (utilityKeywords.some((kw) => nameLower.includes(kw))) {
        expenseCategories.utilities += amount;
      } else if (marketingKeywords.some((kw) => nameLower.includes(kw))) {
        expenseCategories.marketing += amount;
      } else if (maintenanceKeywords.some((kw) => nameLower.includes(kw))) {
        expenseCategories.maintenance += amount;
      } else {
        expenseCategories.other += amount;
      }
    }

    const totalOperatingExpenses =
      labor +
      expenseCategories.rent +
      expenseCategories.utilities +
      expenseCategories.marketing +
      expenseCategories.maintenance +
      expenseCategories.other;

    const operatingIncome = grossProfit - totalOperatingExpenses;

    // --- Other Income (non-sales REVENUE accounts) ---
    const otherIncomeLines = await this.prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId,
          status: "POSTED",
          entryDate: { gte: start, lte: end },
          ...(branchId ? { branchId } : {}),
        },
        account: {
          type: "REVENUE",
        },
      },
    });

    const otherIncome = otherIncomeLines.reduce(
      (sum, l) => sum + (Number(l.credit) - Number(l.debit)),
      0,
    );

    // --- Other Expenses (interest, bank fees from journal) ---
    const interestKeywords = ["interes", "comision bancaria", "bank fee", "interest"];
    let otherExpenses = 0;
    for (const line of expenseLines) {
      const nameLower = line.account.name.toLowerCase();
      if (interestKeywords.some((kw) => nameLower.includes(kw))) {
        otherExpenses += Number(line.debit) - Number(line.credit);
      }
    }

    const netIncome = operatingIncome + otherIncome - otherExpenses;

    // --- Margins ---
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;

    return {
      revenue: round2(revenue),
      costOfGoods: round2(costOfGoods),
      grossProfit: round2(grossProfit),
      operatingExpenses: {
        labor: round2(labor),
        rent: round2(expenseCategories.rent),
        utilities: round2(expenseCategories.utilities),
        marketing: round2(expenseCategories.marketing),
        maintenance: round2(expenseCategories.maintenance),
        other: round2(expenseCategories.other),
        total: round2(totalOperatingExpenses),
      },
      operatingIncome: round2(operatingIncome),
      otherIncome: round2(otherIncome),
      otherExpenses: round2(otherExpenses),
      netIncome: round2(netIncome),
      margins: {
        grossMargin: round2(grossMargin),
        operatingMargin: round2(operatingMargin),
        netMargin: round2(netMargin),
      },
    };
  }

  // ====================================================================
  // B) Flujo de Efectivo (Cash Flow Statement)
  // ====================================================================

  async getCashFlow(
    organizationId: string,
    startDate: string,
    endDate: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // --- Cash received from sales (payments on AccountReceivable) ---
    const receivablePaymentsAgg = await this.prisma.payment.aggregate({
      where: {
        organizationId,
        type: "receivable",
        paymentDate: { gte: start, lte: end },
      },
      _sum: { amount: true },
    });
    const cashFromSales = Number(receivablePaymentsAgg._sum.amount || 0);

    // --- Cash paid to suppliers (payments on AccountPayable) ---
    const payablePaymentsAgg = await this.prisma.payment.aggregate({
      where: {
        organizationId,
        type: "payable",
        paymentDate: { gte: start, lte: end },
      },
      _sum: { amount: true },
    });
    const cashToSuppliers = Number(payablePaymentsAgg._sum.amount || 0);

    // --- Cash paid for payroll ---
    const payrollAgg = await this.prisma.payrollPeriod.aggregate({
      where: {
        organizationId,
        startDate: { gte: start },
        endDate: { lte: end },
        status: "PAID",
      },
      _sum: { totalNet: true },
    });
    const cashForPayroll = Number(payrollAgg._sum.totalNet || 0);

    const netOperating = cashFromSales - cashToSuppliers - cashForPayroll;

    // Placeholders
    const investingActivities = 0;
    const financingActivities = 0;

    const netCashFlow = netOperating + investingActivities + financingActivities;

    // --- Bank balances ---
    const bankAccounts = await this.prisma.bankAccount.findMany({
      where: { organizationId, isActive: true },
      select: { currentBalance: true },
    });

    const currentBankBalance = bankAccounts.reduce(
      (sum, b) => sum + Number(b.currentBalance),
      0,
    );

    // Approximate beginning balance as current - net cash flow
    const beginningBalance = currentBankBalance - netCashFlow;

    return {
      operatingActivities: {
        cashFromSales: round2(cashFromSales),
        cashToSuppliers: round2(cashToSuppliers),
        cashForPayroll: round2(cashForPayroll),
        netOperating: round2(netOperating),
      },
      investingActivities: round2(investingActivities),
      financingActivities: round2(financingActivities),
      netCashFlow: round2(netCashFlow),
      beginningBalance: round2(beginningBalance),
      endingBalance: round2(currentBankBalance),
    };
  }

  // ====================================================================
  // C) Aging de Cuentas por Cobrar
  // ====================================================================

  async getReceivableAging(organizationId: string) {
    const receivables = await this.prisma.accountReceivable.findMany({
      where: {
        organizationId,
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    const now = new Date();
    const buckets = { current: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
    const details: Array<{
      customerId: string | null;
      customerName: string;
      invoiceNumber: string | null;
      amount: number;
      balanceDue: number;
      dueDate: string;
      ageDays: number;
      bucket: string;
    }> = [];

    for (const rec of receivables) {
      const due = new Date(rec.dueDate);
      const ageDays = Math.max(
        0,
        Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const balance = Number(rec.balanceDue);

      let bucket: string;
      if (ageDays <= 30) {
        bucket = "current";
        buckets.current += balance;
      } else if (ageDays <= 60) {
        bucket = "31-60";
        buckets.days31to60 += balance;
      } else if (ageDays <= 90) {
        bucket = "61-90";
        buckets.days61to90 += balance;
      } else {
        bucket = "90+";
        buckets.days90plus += balance;
      }

      details.push({
        customerId: rec.customer?.id ?? null,
        customerName: rec.customer?.name ?? "Sin cliente",
        invoiceNumber: null,
        amount: Number(rec.amount),
        balanceDue: balance,
        dueDate: rec.dueDate.toISOString().split("T")[0],
        ageDays,
        bucket,
      });
    }

    const total =
      buckets.current + buckets.days31to60 + buckets.days61to90 + buckets.days90plus;

    return {
      total: round2(total),
      buckets: {
        current: round2(buckets.current),
        days31to60: round2(buckets.days31to60),
        days61to90: round2(buckets.days61to90),
        days90plus: round2(buckets.days90plus),
      },
      details,
    };
  }

  // ====================================================================
  // D) Aging de Cuentas por Pagar
  // ====================================================================

  async getPayableAging(organizationId: string) {
    const payables = await this.prisma.accountPayable.findMany({
      where: {
        organizationId,
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
      },
      include: {
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    const now = new Date();
    const buckets = { current: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
    const details: Array<{
      supplierId: string;
      supplierName: string;
      invoiceNumber: string | null;
      amount: number;
      balanceDue: number;
      dueDate: string;
      ageDays: number;
      bucket: string;
    }> = [];

    for (const pay of payables) {
      const due = new Date(pay.dueDate);
      const ageDays = Math.max(
        0,
        Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const balance = Number(pay.balanceDue);

      let bucket: string;
      if (ageDays <= 30) {
        bucket = "current";
        buckets.current += balance;
      } else if (ageDays <= 60) {
        bucket = "31-60";
        buckets.days31to60 += balance;
      } else if (ageDays <= 90) {
        bucket = "61-90";
        buckets.days61to90 += balance;
      } else {
        bucket = "90+";
        buckets.days90plus += balance;
      }

      details.push({
        supplierId: pay.supplierId,
        supplierName: pay.supplier?.name ?? "Sin proveedor",
        invoiceNumber: pay.invoiceNumber ?? null,
        amount: Number(pay.amount),
        balanceDue: balance,
        dueDate: pay.dueDate.toISOString().split("T")[0],
        ageDays,
        bucket,
      });
    }

    const total =
      buckets.current + buckets.days31to60 + buckets.days61to90 + buckets.days90plus;

    return {
      total: round2(total),
      buckets: {
        current: round2(buckets.current),
        days31to60: round2(buckets.days31to60),
        days61to90: round2(buckets.days61to90),
        days90plus: round2(buckets.days90plus),
      },
      details,
    };
  }

  // ====================================================================
  // E) Excel/CSV Exports
  // ====================================================================

  async exportPnlExcel(
    organizationId: string,
    startDate: string,
    endDate: string,
  ): Promise<string> {
    const pnl = await this.getPnl(organizationId, startDate, endDate);

    const rows: string[][] = [
      ["Estado de Resultados", "", ""],
      ["Periodo", `${startDate} - ${endDate}`, ""],
      ["", "", ""],
      ["Concepto", "Monto", "% Margen"],
      ["Ingresos (Revenue)", String(pnl.revenue), ""],
      ["(-) Costo de Ventas", String(pnl.costOfGoods), ""],
      ["= Utilidad Bruta", String(pnl.grossProfit), `${pnl.margins.grossMargin}%`],
      ["", "", ""],
      ["Gastos Operativos:", "", ""],
      ["  Nomina y mano de obra", String(pnl.operatingExpenses.labor), ""],
      ["  Renta", String(pnl.operatingExpenses.rent), ""],
      ["  Servicios (luz/agua/gas)", String(pnl.operatingExpenses.utilities), ""],
      ["  Marketing", String(pnl.operatingExpenses.marketing), ""],
      ["  Mantenimiento", String(pnl.operatingExpenses.maintenance), ""],
      ["  Otros gastos", String(pnl.operatingExpenses.other), ""],
      ["(-) Total Gastos Operativos", String(pnl.operatingExpenses.total), ""],
      ["", "", ""],
      ["= Utilidad Operativa", String(pnl.operatingIncome), `${pnl.margins.operatingMargin}%`],
      ["(+) Otros Ingresos", String(pnl.otherIncome), ""],
      ["(-) Otros Gastos", String(pnl.otherExpenses), ""],
      ["", "", ""],
      ["= Utilidad Neta", String(pnl.netIncome), `${pnl.margins.netMargin}%`],
    ];

    return rows.map((row) => row.map(escapeCSV).join(";")).join("\n");
  }

  async exportAgingExcel(
    organizationId: string,
    type: "receivable" | "payable",
  ): Promise<string> {
    const aging =
      type === "receivable"
        ? await this.getReceivableAging(organizationId)
        : await this.getPayableAging(organizationId);

    const entityLabel = type === "receivable" ? "Cliente" : "Proveedor";
    const title =
      type === "receivable"
        ? "Antiguedad de Cuentas por Cobrar"
        : "Antiguedad de Cuentas por Pagar";

    const headerRows: string[][] = [
      [title, "", "", "", "", "", ""],
      [`Fecha: ${new Date().toISOString().split("T")[0]}`, "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      [
        "Resumen por Antigüedad",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      ["Corriente (0-30 dias)", String(aging.buckets.current), "", "", "", "", ""],
      ["31-60 dias", String(aging.buckets.days31to60), "", "", "", "", ""],
      ["61-90 dias", String(aging.buckets.days61to90), "", "", "", "", ""],
      ["90+ dias", String(aging.buckets.days90plus), "", "", "", "", ""],
      ["Total", String(aging.total), "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      [entityLabel, "Factura", "Monto", "Saldo", "Vencimiento", "Dias", "Clasificacion"],
    ];

    const detailRows = aging.details.map((d: any) => [
      d.customerName || d.supplierName,
      d.invoiceNumber || "N/A",
      String(d.amount),
      String(d.balanceDue),
      d.dueDate,
      String(d.ageDays),
      d.bucket,
    ]);

    return [...headerRows, ...detailRows]
      .map((row) => row.map(escapeCSV).join(";"))
      .join("\n");
  }
}

// ====================================================================
// Helpers
// ====================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function escapeCSV(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
