import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

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

// SAT Third Party Type codes
const THIRD_PARTY_NATIONAL = "04"; // Proveedor nacional

// SAT Operation Type codes
const OP_PROFESSIONAL_SERVICES = "85";
const OP_PURCHASE_OF_GOODS = "06";
const _OP_LEASE = "03";

@Injectable()
export class DiotService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate DIOT data for a given month
   * Groups all supplier payments by RFC, calculates IVA breakdown
   */
  async generateDiot(organizationId: string, year: number, month: number): Promise<DiotRecord[]> {
    this.validatePeriod(year, month);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    // Query all payments to suppliers in the given month
    const payments = await this.prisma.payment.findMany({
      where: {
        organizationId,
        type: "payable",
        payableId: { not: null },
        paymentDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      include: {
        payable: {
          include: {
            supplier: true,
          },
        },
      },
    });

    // Group by supplier RFC
    const supplierMap = new Map<
      string,
      {
        rfc: string;
        name: string;
        totalPaid: number;
      }
    >();

    for (const payment of payments) {
      const supplier = payment.payable?.supplier;
      if (!supplier || !supplier.rfc) continue;

      const rfc = supplier.rfc.toUpperCase().trim();
      const existing = supplierMap.get(rfc) || {
        rfc,
        name: supplier.name,
        totalPaid: 0,
      };

      existing.totalPaid += Number(payment.amount);
      supplierMap.set(rfc, existing);
    }

    // Build DIOT records with IVA breakdown
    const records: DiotRecord[] = [];
    for (const [, supplier] of supplierMap) {
      const totalPaid = Math.round(supplier.totalPaid * 100) / 100;

      // Calculate IVA breakdown from the total amount
      // Standard breakdown: amount = base + IVA16
      // base = total / 1.16, iva16 = base * 0.16
      const base16 = Math.round((totalPaid / 1.16) * 100) / 100;
      const iva16 = Math.round((totalPaid - base16) * 100) / 100;

      records.push({
        supplierRfc: supplier.rfc,
        supplierName: supplier.name,
        operationType: this.classifyOperationType(supplier.rfc),
        totalPaid,
        iva16,
        iva0: 0,
        exempt: 0,
        withheldIva: 0,
        withheldIsr: 0,
      });
    }

    // Sort by RFC for consistent output
    records.sort((a, b) => a.supplierRfc.localeCompare(b.supplierRfc));

    return records;
  }

  /**
   * Generate the pipe-delimited DIOT text file per SAT specification
   * Format: tipo_tercero|tipo_operacion|RFC|IDFiscal|NombreExtranjero|PaisResidencia|Nacionalidad|
   *         MontoIVA16|16||||MontoIVA0|||||MontoExento||||||
   */
  async generateDiotFile(organizationId: string, year: number, month: number): Promise<string> {
    const records = await this.generateDiot(organizationId, year, month);

    if (records.length === 0) {
      throw new BadRequestException("No hay pagos a proveedores en el periodo seleccionado");
    }

    const lines = records.map((record) => {
      // SAT DIOT format (pipe-delimited):
      // Col 1: Tipo de tercero (04 = Nacional)
      // Col 2: Tipo de operacion (85, 06, 03)
      // Col 3: RFC del proveedor
      // Col 4: ID Fiscal (empty for nationals)
      // Col 5: Nombre del extranjero (empty for nationals)
      // Col 6: Pais de residencia (empty for nationals)
      // Col 7: Nacionalidad (empty for nationals)
      // Col 8: Monto de IVA pagado al 16%
      // Col 9: Tasa IVA (16)
      // Col 10-11: empty
      // Col 12: Monto de IVA pagado al 0%  (empty if 0)
      // Col 13-16: empty
      // Col 17: Monto exento (empty if 0)
      // Col 18: IVA retenido (empty if 0)
      // Col 19: ISR retenido (empty if 0)
      // Remaining cols: empty

      const iva16Str = record.iva16 > 0 ? record.iva16.toFixed(0) : "";
      const tasaStr = record.iva16 > 0 ? "16" : "";
      const iva0Str = record.iva0 > 0 ? record.iva0.toFixed(0) : "";
      const exemptStr = record.exempt > 0 ? record.exempt.toFixed(0) : "";
      const withheldIvaStr = record.withheldIva > 0 ? record.withheldIva.toFixed(0) : "";
      const withheldIsrStr = record.withheldIsr > 0 ? record.withheldIsr.toFixed(0) : "";

      return [
        THIRD_PARTY_NATIONAL, // Tipo de tercero
        record.operationType, // Tipo de operacion
        record.supplierRfc, // RFC
        "", // ID Fiscal
        "", // Nombre extranjero
        "", // Pais de residencia
        "", // Nacionalidad
        iva16Str, // IVA pagado 16%
        tasaStr, // Tasa
        "", // empty
        "", // empty
        iva0Str, // IVA pagado 0%
        "", // empty
        "", // empty
        "", // empty
        "", // empty
        exemptStr, // Exento
        withheldIvaStr, // IVA retenido
        withheldIsrStr, // ISR retenido
        "", // empty
        "", // empty
        "", // empty
        "", // empty
        "", // empty
      ].join("|");
    });

    return lines.join("\n");
  }

  /**
   * Get DIOT generation history for the organization
   */
  async getDiotHistory(organizationId: string): Promise<DiotHistoryItem[]> {
    // Since we generate on-the-fly, we build history from payment data
    // Group payments by month to show which months have data
    const payments = await this.prisma.payment.findMany({
      where: {
        organizationId,
        type: "payable",
        payableId: { not: null },
      },
      select: {
        paymentDate: true,
        amount: true,
      },
      orderBy: { paymentDate: "desc" },
    });

    const monthMap = new Map<
      string,
      { year: number; month: number; count: number; total: number }
    >();

    for (const payment of payments) {
      const date = new Date(payment.paymentDate);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${month}`;

      const existing = monthMap.get(key) || { year, month, count: 0, total: 0 };
      existing.count += 1;
      existing.total += Number(payment.amount);
      monthMap.set(key, existing);
    }

    const history: DiotHistoryItem[] = [];
    for (const [, data] of monthMap) {
      history.push({
        year: data.year,
        month: data.month,
        generatedAt: new Date().toISOString(),
        recordCount: data.count,
        totalAmount: Math.round(data.total * 100) / 100,
        status: "available",
      });
    }

    // Sort descending by date
    history.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    return history;
  }

  /**
   * Get DIOT summary/preview without full generation
   */
  async getDiotSummary(organizationId: string, year: number, month: number): Promise<DiotSummary> {
    const records = await this.generateDiot(organizationId, year, month);

    return {
      totalSuppliers: records.length,
      totalAmount: records.reduce((s, r) => s + r.totalPaid, 0),
      totalIva16: records.reduce((s, r) => s + r.iva16, 0),
      totalIva0: records.reduce((s, r) => s + r.iva0, 0),
      totalExempt: records.reduce((s, r) => s + r.exempt, 0),
      totalWithheldIva: records.reduce((s, r) => s + r.withheldIva, 0),
      totalWithheldIsr: records.reduce((s, r) => s + r.withheldIsr, 0),
    };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private validatePeriod(year: number, month: number) {
    if (!year || year < 2020 || year > 2100) {
      throw new BadRequestException("Ano invalido");
    }
    if (!month || month < 1 || month > 12) {
      throw new BadRequestException("Mes invalido");
    }
  }

  /**
   * Classify operation type based on supplier RFC pattern
   * In production, this would use supplier category metadata
   * Default: 06 (Purchase of goods) for restaurant supplies
   */
  private classifyOperationType(rfc: string): string {
    // Physical persons (13-char RFC) are more likely professional services
    if (rfc.length === 13) {
      return OP_PROFESSIONAL_SERVICES;
    }
    // Legal entities (12-char RFC) default to purchase of goods
    return OP_PURCHASE_OF_GOODS;
  }
}
