import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

const IVA_RATE = 0.16;
const ISR_CORPORATE_RATE = 0.3;

interface IvaResult {
  ivaCausado: number;
  ivaAcreditable: number;
  ivaRetenido: number;
  ivaPagar: number;
  ivaFavor: number;
  details: {
    ingresos: number;
    gastos: number;
    retenciones: number;
  };
}

interface IsrResult {
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
}

@Injectable()
export class DeclarationsService {
  constructor(private prisma: PrismaService) {}

  // ------------------------------------------------------------------
  // IVA Provisional
  // ------------------------------------------------------------------

  async calculateIvaProvisional(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<IvaResult> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // IVA Causado: 16% of INGRESO CFDIs stamped in the month
    const ingresoCfdis = await this.prisma.cFDI.findMany({
      where: {
        organizationId,
        cfdiType: "INGRESO",
        status: "STAMPED",
        stampedAt: { gte: startDate, lte: endDate },
      },
      select: { subtotal: true, total: true },
    });

    const totalIngresos = ingresoCfdis.reduce((sum, c) => sum + Number(c.subtotal), 0);
    const ivaCausado = totalIngresos * IVA_RATE;

    // IVA Acreditable: 16% of deductible expenses (payments to suppliers in the month)
    const supplierPayments = await this.prisma.payment.findMany({
      where: {
        organizationId,
        type: "payable",
        paymentDate: { gte: startDate, lte: endDate },
      },
      select: { amount: true },
    });

    const totalGastos = supplierPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    // Deductible base is the subtotal (amount / 1.16 for IVA-inclusive payments)
    const gastosSinIva = totalGastos / (1 + IVA_RATE);
    const ivaAcreditable = gastosSinIva * IVA_RATE;

    // IVA Retenido: sum of withheld IVA from EGRESO CFDIs in the month
    const egresoCfdis = await this.prisma.cFDI.findMany({
      where: {
        organizationId,
        cfdiType: "EGRESO",
        status: "STAMPED",
        stampedAt: { gte: startDate, lte: endDate },
      },
      select: { total: true, subtotal: true },
    });

    const totalRetenciones = egresoCfdis.reduce(
      (sum, c) => sum + (Number(c.total) - Number(c.subtotal)),
      0,
    );
    const ivaRetenido = Math.abs(totalRetenciones);

    // IVA a Pagar = Causado - Acreditable - Retenido
    const ivaNeto = ivaCausado - ivaAcreditable - ivaRetenido;
    const ivaPagar = Math.max(0, ivaNeto);
    const ivaFavor = Math.max(0, -ivaNeto);

    return {
      ivaCausado: Math.round(ivaCausado * 100) / 100,
      ivaAcreditable: Math.round(ivaAcreditable * 100) / 100,
      ivaRetenido: Math.round(ivaRetenido * 100) / 100,
      ivaPagar: Math.round(ivaPagar * 100) / 100,
      ivaFavor: Math.round(ivaFavor * 100) / 100,
      details: {
        ingresos: Math.round(totalIngresos * 100) / 100,
        gastos: Math.round(gastosSinIva * 100) / 100,
        retenciones: Math.round(ivaRetenido * 100) / 100,
      },
    };
  }

  // ------------------------------------------------------------------
  // ISR Provisional
  // ------------------------------------------------------------------

  async calculateIsrProvisional(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<IsrResult> {
    // Ingresos acumulados (Jan to month): sum of INGRESO CFDI subtotals
    const yearStart = new Date(year, 0, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const ingresoCfdis = await this.prisma.cFDI.findMany({
      where: {
        organizationId,
        cfdiType: "INGRESO",
        status: "STAMPED",
        stampedAt: { gte: yearStart, lte: monthEnd },
      },
      select: { subtotal: true, stampedAt: true },
    });

    const ingresosAcumulados = ingresoCfdis.reduce((sum, c) => sum + Number(c.subtotal), 0);

    // Build monthly breakdown of income
    const ingresosMensuales: Array<{ month: number; amount: number }> = [];
    for (let m = 1; m <= month; m++) {
      const mStart = new Date(year, m - 1, 1);
      const mEnd = new Date(year, m, 0, 23, 59, 59, 999);
      const monthTotal = ingresoCfdis
        .filter((c) => {
          const d = c.stampedAt ? new Date(c.stampedAt as unknown as string) : new Date(0);
          return d >= mStart && d <= mEnd;
        })
        .reduce((sum, c) => sum + Number(c.subtotal), 0);
      ingresosMensuales.push({
        month: m,
        amount: Math.round(monthTotal * 100) / 100,
      });
    }

    // Deducciones autorizadas acumuladas: sum of deductible expenses (supplier payments)
    const supplierPayments = await this.prisma.payment.findMany({
      where: {
        organizationId,
        type: "payable",
        paymentDate: { gte: yearStart, lte: monthEnd },
      },
      select: { amount: true, paymentDate: true },
    });

    const deduccionesAcumuladas = supplierPayments.reduce(
      (sum, p) => sum + Number(p.amount) / (1 + IVA_RATE),
      0,
    );

    // Build monthly breakdown of deductions
    const deduccionesMensuales: Array<{ month: number; amount: number }> = [];
    for (let m = 1; m <= month; m++) {
      const mStart = new Date(year, m - 1, 1);
      const mEnd = new Date(year, m, 0, 23, 59, 59, 999);
      const monthTotal = supplierPayments
        .filter((p) => {
          const d = new Date(p.paymentDate as unknown as string);
          return d >= mStart && d <= mEnd;
        })
        .reduce((sum, p) => sum + Number(p.amount) / (1 + IVA_RATE), 0);
      deduccionesMensuales.push({
        month: m,
        amount: Math.round(monthTotal * 100) / 100,
      });
    }

    // Utilidad fiscal = Ingresos - Deducciones
    const utilidadFiscal = Math.max(0, ingresosAcumulados - deduccionesAcumuladas);

    // ISR causado: 30% for corporations (simplified)
    const isrCausado = utilidadFiscal * ISR_CORPORATE_RATE;

    // ISR pagado previo: sum of filed ISR declarations for months 1 to (month-1)
    const previousDeclarations = await this.prisma.taxDeclaration.findMany({
      where: {
        organizationId,
        year,
        month: { lt: month },
        type: "ISR_PROVISIONAL",
        status: "FILED",
      },
      select: { amount: true },
    });

    const isrPagadoPrevio = previousDeclarations.reduce((sum, d) => sum + Number(d.amount), 0);

    // ISR a Pagar = ISR causado - pagos previos
    const isrPagar = Math.max(0, isrCausado - isrPagadoPrevio);

    return {
      ingresosAcumulados: Math.round(ingresosAcumulados * 100) / 100,
      deduccionesAcumuladas: Math.round(deduccionesAcumuladas * 100) / 100,
      utilidadFiscal: Math.round(utilidadFiscal * 100) / 100,
      isrCausado: Math.round(isrCausado * 100) / 100,
      isrPagadoPrevio: Math.round(isrPagadoPrevio * 100) / 100,
      isrPagar: Math.round(isrPagar * 100) / 100,
      details: {
        ingresosMensuales,
        deduccionesMensuales,
      },
    };
  }

  // ------------------------------------------------------------------
  // Combined Summary
  // ------------------------------------------------------------------

  async getDeclarationSummary(organizationId: string, year: number, month: number) {
    const [iva, isr] = await Promise.all([
      this.calculateIvaProvisional(organizationId, year, month),
      this.calculateIsrProvisional(organizationId, year, month),
    ]);

    // Fetch filing status for both
    const declarations = await this.prisma.taxDeclaration.findMany({
      where: {
        organizationId,
        year,
        month,
        type: { in: ["ISR_PROVISIONAL", "IVA_PROVISIONAL"] },
      },
    });

    const ivaDeclaration = declarations.find((d) => d.type === "IVA_PROVISIONAL");
    const isrDeclaration = declarations.find((d) => d.type === "ISR_PROVISIONAL");

    return {
      year,
      month,
      iva: {
        ...iva,
        status: ivaDeclaration?.status || "PENDING",
        filedAt: ivaDeclaration?.filedAt || null,
        filingReference: ivaDeclaration?.filingReference || null,
      },
      isr: {
        ...isr,
        status: isrDeclaration?.status || "PENDING",
        filedAt: isrDeclaration?.filedAt || null,
        filingReference: isrDeclaration?.filingReference || null,
      },
    };
  }

  // ------------------------------------------------------------------
  // Annual Summary (12 months)
  // ------------------------------------------------------------------

  async getAnnualSummary(organizationId: string, year: number) {
    const months: Array<{
      month: number;
      iva: IvaResult & { status: string; filedAt: Date | null };
      isr: IsrResult & { status: string; filedAt: Date | null };
    }> = [];

    // Fetch all declarations for the year
    const allDeclarations = await this.prisma.taxDeclaration.findMany({
      where: { organizationId, year },
    });

    for (let m = 1; m <= 12; m++) {
      const [iva, isr] = await Promise.all([
        this.calculateIvaProvisional(organizationId, year, m),
        this.calculateIsrProvisional(organizationId, year, m),
      ]);

      const ivaDecl = allDeclarations.find((d) => d.month === m && d.type === "IVA_PROVISIONAL");
      const isrDecl = allDeclarations.find((d) => d.month === m && d.type === "ISR_PROVISIONAL");

      months.push({
        month: m,
        iva: {
          ...iva,
          status: ivaDecl?.status || "PENDING",
          filedAt: ivaDecl?.filedAt || null,
        },
        isr: {
          ...isr,
          status: isrDecl?.status || "PENDING",
          filedAt: isrDecl?.filedAt || null,
        },
      });
    }

    return { year, months };
  }

  // ------------------------------------------------------------------
  // Mark as Filed
  // ------------------------------------------------------------------

  async markAsFiled(
    organizationId: string,
    year: number,
    month: number,
    type: string,
    filingData: { filingReference?: string; amount?: number },
  ) {
    if (!["ISR_PROVISIONAL", "IVA_PROVISIONAL"].includes(type)) {
      throw new NotFoundException(
        `Tipo de declaracion no valido: ${type}. Use ISR_PROVISIONAL o IVA_PROVISIONAL.`,
      );
    }

    // Calculate the amount if not provided
    let amount = filingData.amount;
    if (amount === undefined) {
      if (type === "IVA_PROVISIONAL") {
        const iva = await this.calculateIvaProvisional(organizationId, year, month);
        amount = iva.ivaPagar;
      } else {
        const isr = await this.calculateIsrProvisional(organizationId, year, month);
        amount = isr.isrPagar;
      }
    }

    return this.prisma.taxDeclaration.upsert({
      where: {
        organizationId_year_month_type: {
          organizationId,
          year,
          month,
          type,
        },
      },
      create: {
        organizationId,
        year,
        month,
        type,
        status: "FILED",
        amount,
        filedAt: new Date(),
        filingReference: filingData.filingReference || null,
        details: {},
      },
      update: {
        status: "FILED",
        amount,
        filedAt: new Date(),
        filingReference: filingData.filingReference || null,
      },
    });
  }

  // ------------------------------------------------------------------
  // History of filed declarations
  // ------------------------------------------------------------------

  async getHistory(organizationId: string) {
    return this.prisma.taxDeclaration.findMany({
      where: { organizationId },
      orderBy: [{ year: "desc" }, { month: "desc" }, { type: "asc" }],
    });
  }
}
