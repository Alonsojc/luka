import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Account codes from the seed chart of accounts:
 *   100.01  Caja y Bancos
 *   100.02  Clientes (CxC)
 *   100.03  Inventarios
 *   100.04  IVA Acreditable
 *   200.01  Proveedores (CxP)
 *   200.02  IVA Trasladado
 *   200.03  ISR por Pagar
 *   200.04  IMSS por Pagar
 *   200.05  Sueldos por Pagar
 *   400.01  Ventas
 *   600.01  Sueldos y Salarios
 *   600.02  Cuotas IMSS Patron
 */

const ACCOUNT_CODES = {
  CAJA_BANCOS: "100.01",
  CLIENTES: "100.02",
  INVENTARIOS: "100.03",
  IVA_ACREDITABLE: "100.04",
  PROVEEDORES: "200.01",
  IVA_TRASLADADO: "200.02",
  ISR_POR_PAGAR: "200.03",
  IMSS_POR_PAGAR: "200.04",
  SUELDOS_POR_PAGAR: "200.05",
  VENTAS: "400.01",
  SUELDOS_SALARIOS: "600.01",
  CUOTAS_IMSS_PATRON: "600.02",
} as const;

interface JournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

@Injectable()
export class AutoPolizasService {
  private readonly logger = new Logger(AutoPolizasService.name);

  constructor(private prisma: PrismaService) {}

  // ------------------------------------------------------------------
  // Helper: find account by code within organization
  // ------------------------------------------------------------------

  async findAccountByCode(organizationId: string, code: string) {
    const account = await this.prisma.accountCatalog.findUnique({
      where: { organizationId_code: { organizationId, code } },
    });
    if (!account) {
      throw new NotFoundException(
        `Cuenta contable con codigo "${code}" no encontrada en la organizacion`,
      );
    }
    return account;
  }

  // ------------------------------------------------------------------
  // Helper: create the journal entry inside a transaction
  // ------------------------------------------------------------------

  private async createJournalEntry(params: {
    organizationId: string;
    branchId?: string;
    entryDate: Date;
    type: "DIARIO" | "INGRESO" | "EGRESO";
    description: string;
    referenceType: string;
    referenceId: string;
    createdById: string;
    lines: JournalLineInput[];
  }) {
    const {
      organizationId,
      branchId,
      entryDate,
      type,
      description,
      referenceType,
      referenceId,
      createdById,
      lines,
    } = params;

    // Validate partida doble
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        `La partida doble no cuadra: debitos (${totalDebit.toFixed(2)}) != creditos (${totalCredit.toFixed(2)})`,
      );
    }

    // Check for existing entry with the same reference (avoid duplicates)
    const existing = await this.prisma.journalEntry.findFirst({
      where: { organizationId, referenceType, referenceId },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe una poliza para ${referenceType} con id ${referenceId}`,
      );
    }

    return this.prisma.journalEntry.create({
      data: {
        organizationId,
        branchId: branchId || null,
        entryDate,
        type: type as any,
        description,
        referenceType,
        referenceId,
        status: "DRAFT",
        createdById,
        lines: {
          create: lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description || null,
          })),
        },
      },
      include: {
        branch: true,
        lines: { include: { account: true } },
      },
    });
  }

  // ------------------------------------------------------------------
  // 1. Generate from Purchase Order (Compra recibida)
  // ------------------------------------------------------------------

  async generateFromPurchase(purchaseOrderId: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { supplier: true, branch: true },
    });
    if (!po) {
      throw new NotFoundException("Orden de compra no encontrada");
    }

    const orgId = po.organizationId;
    const [inventarios, ivaAcreditable, proveedores] = await Promise.all([
      this.findAccountByCode(orgId, ACCOUNT_CODES.INVENTARIOS),
      this.findAccountByCode(orgId, ACCOUNT_CODES.IVA_ACREDITABLE),
      this.findAccountByCode(orgId, ACCOUNT_CODES.PROVEEDORES),
    ]);

    const subtotal = Number(po.subtotal);
    const tax = Number(po.tax);
    const total = Number(po.total);

    const lines: JournalLineInput[] = [
      {
        accountId: inventarios.id,
        debit: subtotal,
        credit: 0,
        description: `Inventario - OC ${po.id.slice(-6)}`,
      },
      {
        accountId: ivaAcreditable.id,
        debit: tax,
        credit: 0,
        description: `IVA Acreditable - OC ${po.id.slice(-6)}`,
      },
      {
        accountId: proveedores.id,
        debit: 0,
        credit: total,
        description: `Proveedor: ${po.supplier.name}`,
      },
    ];

    return this.createJournalEntry({
      organizationId: orgId,
      branchId: po.branchId,
      entryDate: po.createdAt,
      type: "DIARIO",
      description: `Compra recibida - ${po.supplier.name} - OC ${po.id.slice(-6)}`,
      referenceType: "purchaseOrder",
      referenceId: po.id,
      createdById: userId,
      lines,
    });
  }

  // ------------------------------------------------------------------
  // 2. Generate from Sale (Venta POS o Corntech)
  // ------------------------------------------------------------------

  async generateFromSale(saleId: string, type: "pos" | "corntech", userId: string) {
    let subtotal: number;
    let tax: number;
    let total: number;
    let saleDate: Date;
    let branchId: string;
    let organizationId: string;
    let ticketNumber: string | null;

    if (type === "pos") {
      const sale = await this.prisma.posSale.findUnique({
        where: { id: saleId },
      });
      if (!sale) {
        throw new NotFoundException("Venta POS no encontrada");
      }
      subtotal = Number(sale.subtotal);
      tax = Number(sale.tax);
      total = Number(sale.total);
      saleDate = sale.saleDate;
      branchId = sale.branchId;
      organizationId = sale.organizationId;
      ticketNumber = sale.ticketNumber;
    } else {
      const sale = await this.prisma.corntechSale.findUnique({
        where: { id: saleId },
        include: { branch: true },
      });
      if (!sale) {
        throw new NotFoundException("Venta Corntech no encontrada");
      }
      subtotal = Number(sale.subtotal);
      tax = Number(sale.tax);
      total = Number(sale.total);
      saleDate = sale.saleDate;
      branchId = sale.branchId;
      organizationId = sale.branch.organizationId;
      ticketNumber = sale.ticketNumber;
    }

    const [cajaBancos, ventas, ivaTrasladado] = await Promise.all([
      this.findAccountByCode(organizationId, ACCOUNT_CODES.CAJA_BANCOS),
      this.findAccountByCode(organizationId, ACCOUNT_CODES.VENTAS),
      this.findAccountByCode(organizationId, ACCOUNT_CODES.IVA_TRASLADADO),
    ]);

    const ticketRef = ticketNumber ? ` - Ticket ${ticketNumber}` : "";
    const sourceLabel = type === "pos" ? "POS" : "Corntech";

    const lines: JournalLineInput[] = [
      {
        accountId: cajaBancos.id,
        debit: total,
        credit: 0,
        description: `Cobro venta ${sourceLabel}${ticketRef}`,
      },
      {
        accountId: ventas.id,
        debit: 0,
        credit: subtotal,
        description: `Venta ${sourceLabel}${ticketRef}`,
      },
      {
        accountId: ivaTrasladado.id,
        debit: 0,
        credit: tax,
        description: `IVA Trasladado${ticketRef}`,
      },
    ];

    return this.createJournalEntry({
      organizationId,
      branchId,
      entryDate: saleDate,
      type: "INGRESO",
      description: `Venta ${sourceLabel}${ticketRef}`,
      referenceType: type === "pos" ? "posSale" : "corntechSale",
      referenceId: saleId,
      createdById: userId,
      lines,
    });
  }

  // ------------------------------------------------------------------
  // 3. Generate from Payroll (Nomina aprobada)
  // ------------------------------------------------------------------

  async generateFromPayroll(payrollPeriodId: string, userId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: payrollPeriodId },
      include: { receipts: true },
    });
    if (!period) {
      throw new NotFoundException("Periodo de nomina no encontrado");
    }

    const orgId = period.organizationId;

    const [sueldosSalarios, cajaBancos, isrPorPagar, imssPorPagar, cuotasImssPatron] =
      await Promise.all([
        this.findAccountByCode(orgId, ACCOUNT_CODES.SUELDOS_SALARIOS),
        this.findAccountByCode(orgId, ACCOUNT_CODES.CAJA_BANCOS),
        this.findAccountByCode(orgId, ACCOUNT_CODES.ISR_POR_PAGAR),
        this.findAccountByCode(orgId, ACCOUNT_CODES.IMSS_POR_PAGAR),
        this.findAccountByCode(orgId, ACCOUNT_CODES.CUOTAS_IMSS_PATRON),
      ]);

    const totalGross = Number(period.totalGross);
    const totalNet = Number(period.totalNet);
    const totalEmployerCost = Number(period.totalEmployerCost);

    // Calculate totals from receipts for ISR and IMSS breakdown
    let totalIsr = 0;
    let totalImssEmployee = 0;
    let totalEmployerImss = 0;
    let totalEmployerRcv = 0;
    let totalEmployerInfonavit = 0;

    for (const receipt of period.receipts) {
      totalIsr += Number(receipt.isrWithheld);
      totalImssEmployee += Number(receipt.imssEmployee);
      totalEmployerImss += Number(receipt.employerImss);
      totalEmployerRcv += Number(receipt.employerRcv);
      totalEmployerInfonavit += Number(receipt.employerInfonavit);
    }

    const totalPatronal = totalEmployerImss + totalEmployerRcv + totalEmployerInfonavit;

    const periodLabel = `${period.startDate.toISOString().slice(0, 10)} al ${period.endDate.toISOString().slice(0, 10)}`;

    const lines: JournalLineInput[] = [
      // Debit: Gasto nomina (salarios brutos)
      {
        accountId: sueldosSalarios.id,
        debit: totalGross,
        credit: 0,
        description: `Sueldos y salarios - ${periodLabel}`,
      },
      // Debit: Gasto patronal (IMSS/RCV/INFONAVIT patron)
      {
        accountId: cuotasImssPatron.id,
        debit: totalPatronal,
        credit: 0,
        description: `Cuotas patronales - ${periodLabel}`,
      },
      // Credit: Bancos (pago neto)
      {
        accountId: cajaBancos.id,
        debit: 0,
        credit: totalNet,
        description: `Pago neto nomina - ${periodLabel}`,
      },
      // Credit: ISR por Pagar
      {
        accountId: isrPorPagar.id,
        debit: 0,
        credit: totalIsr,
        description: `ISR retenido - ${periodLabel}`,
      },
      // Credit: IMSS por Pagar (employee + employer)
      {
        accountId: imssPorPagar.id,
        debit: 0,
        credit: totalImssEmployee + totalPatronal,
        description: `IMSS empleado + patronal - ${periodLabel}`,
      },
    ];

    return this.createJournalEntry({
      organizationId: orgId,
      entryDate: period.endDate,
      type: "EGRESO",
      description: `Nomina - ${periodLabel}`,
      referenceType: "payrollPeriod",
      referenceId: period.id,
      createdById: userId,
      lines,
    });
  }

  // ------------------------------------------------------------------
  // 4. Generate from Payment (Pago registrado)
  // ------------------------------------------------------------------

  async generateFromPayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { payable: true, receivable: true },
    });
    if (!payment) {
      throw new NotFoundException("Pago no encontrado");
    }

    const orgId = payment.organizationId;
    const amount = Number(payment.amount);
    const paymentRef = payment.reference || payment.id.slice(-6);

    const lines: JournalLineInput[] = [];

    if (payment.type === "payable") {
      const [proveedores, cajaBancos] = await Promise.all([
        this.findAccountByCode(orgId, ACCOUNT_CODES.PROVEEDORES),
        this.findAccountByCode(orgId, ACCOUNT_CODES.CAJA_BANCOS),
      ]);

      lines.push(
        {
          accountId: proveedores.id,
          debit: amount,
          credit: 0,
          description: `Pago a proveedor - Ref: ${paymentRef}`,
        },
        {
          accountId: cajaBancos.id,
          debit: 0,
          credit: amount,
          description: `Egreso bancario - Ref: ${paymentRef}`,
        },
      );
    } else if (payment.type === "receivable") {
      const [cajaBancos, clientes] = await Promise.all([
        this.findAccountByCode(orgId, ACCOUNT_CODES.CAJA_BANCOS),
        this.findAccountByCode(orgId, ACCOUNT_CODES.CLIENTES),
      ]);

      lines.push(
        {
          accountId: cajaBancos.id,
          debit: amount,
          credit: 0,
          description: `Cobro de cliente - Ref: ${paymentRef}`,
        },
        {
          accountId: clientes.id,
          debit: 0,
          credit: amount,
          description: `Abono CxC - Ref: ${paymentRef}`,
        },
      );
    } else {
      throw new BadRequestException(`Tipo de pago no soportado: ${payment.type}`);
    }

    return this.createJournalEntry({
      organizationId: orgId,
      entryDate: payment.paymentDate,
      type: payment.type === "payable" ? "EGRESO" : "INGRESO",
      description: `Pago ${payment.type === "payable" ? "a proveedor" : "de cliente"} - Ref: ${paymentRef}`,
      referenceType: "payment",
      referenceId: payment.id,
      createdById: userId,
      lines,
    });
  }

  // ------------------------------------------------------------------
  // 5. Generate from Bank Transaction (Transaccion bancaria conciliada)
  // ------------------------------------------------------------------

  async generateFromBankTransaction(transactionId: string, userId: string) {
    const txn = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId },
      include: { bankAccount: true },
    });
    if (!txn) {
      throw new NotFoundException("Transaccion bancaria no encontrada");
    }

    // Check if already linked
    const existingEntry = await this.prisma.journalEntry.findFirst({
      where: {
        referenceType: "bankTransaction",
        referenceId: txn.id,
      },
    });
    if (existingEntry) {
      throw new BadRequestException(`Ya existe una poliza para esta transaccion bancaria`);
    }

    if (!txn.isReconciled) {
      throw new BadRequestException(
        "La transaccion bancaria debe estar conciliada para generar poliza",
      );
    }

    const orgId = txn.bankAccount.organizationId;
    const amount = Math.abs(Number(txn.amount));
    const txnRef = txn.reference || txn.id.slice(-6);

    const cajaBancos = await this.findAccountByCode(orgId, ACCOUNT_CODES.CAJA_BANCOS);

    const lines: JournalLineInput[] = [];

    if (txn.type === "credit") {
      // Money coming in
      lines.push(
        {
          accountId: cajaBancos.id,
          debit: amount,
          credit: 0,
          description: `Deposito bancario - Ref: ${txnRef}`,
        },
        {
          accountId: cajaBancos.id,
          debit: 0,
          credit: amount,
          description: `Contrapartida pendiente - Ref: ${txnRef}`,
        },
      );
    } else {
      // Money going out
      lines.push(
        {
          accountId: cajaBancos.id,
          debit: amount,
          credit: 0,
          description: `Contrapartida pendiente - Ref: ${txnRef}`,
        },
        {
          accountId: cajaBancos.id,
          debit: 0,
          credit: amount,
          description: `Retiro bancario - Ref: ${txnRef}`,
        },
      );
    }

    return this.createJournalEntry({
      organizationId: orgId,
      branchId: txn.bankAccount.branchId || undefined,
      entryDate: txn.transactionDate,
      type: "DIARIO",
      description: `Transaccion bancaria - ${txn.description || txnRef}`,
      referenceType: "bankTransaction",
      referenceId: txn.id,
      createdById: userId,
      lines,
    });
  }

  // ------------------------------------------------------------------
  // Pending events: find business events without journal entries
  // ------------------------------------------------------------------

  async getPendingEvents(organizationId: string) {
    // Get all referenceIds that already have journal entries
    const existingEntries = await this.prisma.journalEntry.findMany({
      where: { organizationId },
      select: { referenceType: true, referenceId: true },
    });

    const linkedIds = new Set(
      existingEntries
        .filter((e) => e.referenceId)
        .map((e) => `${e.referenceType}:${e.referenceId}`),
    );

    // Find unlinked purchases (RECEIVED or PARTIALLY_RECEIVED)
    const purchases = await this.prisma.purchaseOrder.findMany({
      where: {
        organizationId,
        status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
      },
      include: { supplier: true, branch: true },
      orderBy: { createdAt: "desc" },
    });
    const pendingPurchases = purchases.filter((po) => !linkedIds.has(`purchaseOrder:${po.id}`));

    // Find unlinked POS sales
    const posSales = await this.prisma.posSale.findMany({
      where: { organizationId },
      include: { branch: true },
      orderBy: { saleDate: "desc" },
      take: 200,
    });
    const pendingPosSales = posSales.filter((s) => !linkedIds.has(`posSale:${s.id}`));

    // Find unlinked Corntech sales (through branches)
    const orgBranches = await this.prisma.branch.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const branchIds = orgBranches.map((b) => b.id);
    const corntechSales = await this.prisma.corntechSale.findMany({
      where: { branchId: { in: branchIds } },
      include: { branch: true },
      orderBy: { saleDate: "desc" },
      take: 200,
    });
    const pendingCorntechSales = corntechSales.filter(
      (s) => !linkedIds.has(`corntechSale:${s.id}`),
    );

    // Find unlinked payroll periods (APPROVED, STAMPED, or PAID)
    const payrollPeriods = await this.prisma.payrollPeriod.findMany({
      where: {
        organizationId,
        status: { in: ["APPROVED", "STAMPED", "PAID"] },
      },
      orderBy: { endDate: "desc" },
    });
    const pendingPayrolls = payrollPeriods.filter((p) => !linkedIds.has(`payrollPeriod:${p.id}`));

    // Find unlinked payments
    const payments = await this.prisma.payment.findMany({
      where: { organizationId },
      include: { payable: true, receivable: true },
      orderBy: { paymentDate: "desc" },
      take: 200,
    });
    const pendingPayments = payments.filter((p) => !linkedIds.has(`payment:${p.id}`));

    // Format results
    const events: Array<{
      id: string;
      type: string;
      saleSource?: string;
      reference: string;
      amount: number;
      date: string;
      branchName?: string;
    }> = [];

    for (const po of pendingPurchases) {
      events.push({
        id: po.id,
        type: "purchase",
        reference: `OC - ${po.supplier.name}`,
        amount: Number(po.total),
        date: po.createdAt.toISOString(),
        branchName: po.branch.name,
      });
    }

    for (const sale of pendingPosSales) {
      events.push({
        id: sale.id,
        type: "sale",
        saleSource: "pos",
        reference: `POS - Ticket ${sale.ticketNumber}`,
        amount: Number(sale.total),
        date: sale.saleDate.toISOString(),
        branchName: sale.branch.name,
      });
    }

    for (const sale of pendingCorntechSales) {
      events.push({
        id: sale.id,
        type: "sale",
        saleSource: "corntech",
        reference: `Corntech - ${sale.ticketNumber || sale.corntechSaleId}`,
        amount: Number(sale.total),
        date: sale.saleDate.toISOString(),
        branchName: sale.branch.name,
      });
    }

    for (const period of pendingPayrolls) {
      events.push({
        id: period.id,
        type: "payroll",
        reference: `Nomina ${period.startDate.toISOString().slice(0, 10)} al ${period.endDate.toISOString().slice(0, 10)}`,
        amount: Number(period.totalGross),
        date: period.endDate.toISOString(),
      });
    }

    for (const payment of pendingPayments) {
      events.push({
        id: payment.id,
        type: "payment",
        reference: `Pago ${payment.type === "payable" ? "a proveedor" : "de cliente"} - ${payment.reference || payment.id.slice(-6)}`,
        amount: Number(payment.amount),
        date: payment.paymentDate.toISOString(),
      });
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      summary: {
        purchases: pendingPurchases.length,
        posSales: pendingPosSales.length,
        corntechSales: pendingCorntechSales.length,
        payrolls: pendingPayrolls.length,
        payments: pendingPayments.length,
        total:
          pendingPurchases.length +
          pendingPosSales.length +
          pendingCorntechSales.length +
          pendingPayrolls.length +
          pendingPayments.length,
      },
      events,
    };
  }

  // ------------------------------------------------------------------
  // Batch generate: create entries for all pending events
  // ------------------------------------------------------------------

  async generateBatch(organizationId: string, userId: string, types?: string[]) {
    const pending = await this.getPendingEvents(organizationId);
    const results: Array<{
      type: string;
      referenceId: string;
      success: boolean;
      entryId?: string;
      error?: string;
    }> = [];

    const shouldProcess = (eventType: string) =>
      !types || types.length === 0 || types.includes(eventType);

    for (const event of pending.events) {
      if (!shouldProcess(event.type)) continue;

      try {
        let entry;
        switch (event.type) {
          case "purchase":
            entry = await this.generateFromPurchase(event.id, userId);
            break;
          case "sale":
            entry = await this.generateFromSale(
              event.id,
              (event.saleSource as "pos" | "corntech") || "pos",
              userId,
            );
            break;
          case "payroll":
            entry = await this.generateFromPayroll(event.id, userId);
            break;
          case "payment":
            entry = await this.generateFromPayment(event.id, userId);
            break;
          default:
            continue;
        }
        results.push({
          type: event.type,
          referenceId: event.id,
          success: true,
          entryId: entry.id,
        });
      } catch (error: any) {
        this.logger.warn(`Error generando poliza para ${event.type}:${event.id}: ${error.message}`);
        results.push({
          type: event.type,
          referenceId: event.id,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      total: results.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  // ------------------------------------------------------------------
  // Recently generated auto-entries
  // ------------------------------------------------------------------

  async getRecentAutoEntries(organizationId: string) {
    return this.prisma.journalEntry.findMany({
      where: {
        organizationId,
        referenceType: { not: null },
        referenceId: { not: null },
      },
      include: {
        branch: true,
        lines: { include: { account: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}
