import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  buildNominaCfdiXml,
  NominaCfdiData,
  NominaPercepcion,
  NominaDeduccion,
  NominaOtroPago,
} from "../facturacion/cfdi/cfdi-xml-builder";

/**
 * Map from Mexican state names to SAT ClaveEntFed codes.
 * Used to derive the employee's federative entity from the branch state.
 */
const STATE_TO_CLAVE_ENT_FED: Record<string, string> = {
  AGUASCALIENTES: "AGU",
  "BAJA CALIFORNIA": "BCN",
  "BAJA CALIFORNIA SUR": "BCS",
  CAMPECHE: "CAM",
  CHIAPAS: "CHP",
  CHIHUAHUA: "CHH",
  "CIUDAD DE MEXICO": "CMX",
  CDMX: "CMX",
  COAHUILA: "COA",
  COLIMA: "COL",
  DURANGO: "DUR",
  GUANAJUATO: "GUA",
  GUERRERO: "GRO",
  HIDALGO: "HID",
  JALISCO: "JAL",
  MEXICO: "MEX",
  "ESTADO DE MEXICO": "MEX",
  MICHOACAN: "MIC",
  MORELOS: "MOR",
  NAYARIT: "NAY",
  "NUEVO LEON": "NLE",
  OAXACA: "OAX",
  PUEBLA: "PUE",
  QUERETARO: "QUE",
  "QUINTANA ROO": "ROO",
  "SAN LUIS POTOSI": "SLP",
  SINALOA: "SIN",
  SONORA: "SON",
  TABASCO: "TAB",
  TAMAULIPAS: "TAM",
  TLAXCALA: "TLA",
  VERACRUZ: "VER",
  YUCATAN: "YUC",
  ZACATECAS: "ZAC",
};

/** Map ContractType enum to SAT TipoContrato code */
function mapContractType(contractType: string): string {
  switch (contractType) {
    case "PERMANENT":
      return "01";
    case "TEMPORARY":
      return "02";
    case "SEASONAL":
      return "03";
    default:
      return "01";
  }
}

/** Map PaymentFrequency enum to SAT PeriodicidadPago code */
function mapPaymentFrequency(frequency: string): string {
  switch (frequency) {
    case "WEEKLY":
      return "02";
    case "BIWEEKLY":
      return "04";
    case "MONTHLY":
      return "05";
    default:
      return "04";
  }
}

/** Map PaymentFrequency enum to SAT TipoNomina code */
function mapTipoNomina(_periodType: string): string {
  // Regular payroll periods are always "Ordinaria"
  return "O";
}

/**
 * Calculate antiquity in ISO 8601 weeks format (e.g., "P52W").
 * Counts from hireDate to the period end date.
 */
function calculateAntiquity(hireDate: Date, referenceDate: Date): string {
  const diffMs = referenceDate.getTime() - hireDate.getTime();
  const weeks = Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)));
  return `P${weeks}W`;
}

/**
 * Derive SAT ClaveEntFed from branch state name.
 * Normalizes accented characters and matches against known state names.
 */
function deriveClaveEntFed(state: string): string {
  const normalized = state
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  return STATE_TO_CLAVE_ENT_FED[normalized] || "CMX";
}

/** Format a Date to ISO date string (YYYY-MM-DD) */
function fmtIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Format a Date to ISO datetime string (YYYY-MM-DDTHH:mm:ss) */
function fmtIsoDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "");
}

@Injectable()
export class NominaCfdiService {
  constructor(private prisma: PrismaService) {}

  /**
   * Load full receipt data with all relations needed for CFDI generation.
   */
  private async getReceiptWithRelations(organizationId: string, receiptId: string) {
    const receipt = await this.prisma.payrollReceipt.findFirst({
      where: { id: receiptId },
      include: {
        employee: true,
        branch: true,
        payrollPeriod: {
          include: { organization: true },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException("Recibo de nomina no encontrado");
    }

    if (receipt.payrollPeriod.organizationId !== organizationId) {
      throw new NotFoundException("Recibo de nomina no encontrado");
    }

    return receipt;
  }

  /**
   * Build the NominaCfdiData structure from a payroll receipt and its relations.
   */
  private buildNominaData(receipt: any): NominaCfdiData {
    const employee = receipt.employee;
    const branch = receipt.branch;
    const period = receipt.payrollPeriod;
    const org = period.organization;

    // Validate required employee fields
    if (!employee.rfc) {
      throw new BadRequestException(
        `El empleado ${employee.firstName} ${employee.lastName} no tiene RFC registrado`,
      );
    }
    if (!employee.curp) {
      throw new BadRequestException(
        `El empleado ${employee.firstName} ${employee.lastName} no tiene CURP registrado`,
      );
    }
    if (!employee.nss) {
      throw new BadRequestException(
        `El empleado ${employee.firstName} ${employee.lastName} no tiene NSS registrado`,
      );
    }

    const grossSalary = Number(receipt.grossSalary);
    const isrWithheld = Number(receipt.isrWithheld);
    const imssEmployee = Number(receipt.imssEmployee);
    const employmentSubsidy = Number(receipt.employmentSubsidy || 0);
    const netSalary = Number(receipt.netSalary);
    const daysWorked = Number(receipt.daysWorked);

    // Build percepciones from perceptionDetails JSON or default to salary
    const perceptionDetails = receipt.perceptionDetails as any[];
    let percepciones: NominaPercepcion[];
    let totalGravado: number;
    let totalExento: number;

    if (perceptionDetails && perceptionDetails.length > 0) {
      percepciones = perceptionDetails.map((p: any) => ({
        tipoPercepcion: p.tipoPercepcion || "001",
        clave: p.clave || "001",
        concepto: p.concepto || "Sueldos, Salarios y Rayas",
        importeGravado: Number(p.importeGravado || 0),
        importeExento: Number(p.importeExento || 0),
      }));
      totalGravado = percepciones.reduce((s, p) => s + p.importeGravado, 0);
      totalExento = percepciones.reduce((s, p) => s + p.importeExento, 0);
    } else {
      // Default: all gross salary as gravado sueldo
      totalGravado = grossSalary;
      totalExento = 0;
      percepciones = [
        {
          tipoPercepcion: "001",
          clave: "001",
          concepto: "Sueldos, Salarios y Rayas",
          importeGravado: grossSalary,
          importeExento: 0,
        },
      ];
    }

    const totalPercepciones = totalGravado + totalExento;

    // Build deducciones from deductionDetails JSON or default to ISR + IMSS
    const deductionDetails = receipt.deductionDetails as any[];
    let deducciones: NominaDeduccion[];

    if (deductionDetails && deductionDetails.length > 0) {
      deducciones = deductionDetails.map((d: any) => ({
        tipoDeduccion: d.tipoDeduccion || "004",
        clave: d.clave || "004",
        concepto: d.concepto || "Otra deduccion",
        importe: Number(d.importe || 0),
      }));
    } else {
      deducciones = [];
      if (isrWithheld > 0) {
        deducciones.push({
          tipoDeduccion: "002",
          clave: "002",
          concepto: "ISR",
          importe: isrWithheld,
        });
      }
      if (imssEmployee > 0) {
        deducciones.push({
          tipoDeduccion: "001",
          clave: "001",
          concepto: "Seguridad social",
          importe: imssEmployee,
        });
      }
    }

    const totalDeducciones = deducciones.reduce((s, d) => s + d.importe, 0);

    // ISR is "impuestos retenidos", IMSS is "otras deducciones"
    const totalImpuestosRetenidos = isrWithheld;
    const totalOtrasDeducciones = totalDeducciones - isrWithheld;

    // Build otros pagos (subsidio al empleo)
    const otrosPagos: NominaOtroPago[] = [];
    if (employmentSubsidy > 0) {
      otrosPagos.push({
        tipoOtroPago: "002",
        clave: "002",
        concepto: "Subsidio para el empleo",
        importe: employmentSubsidy,
        subsidioCausado: employmentSubsidy,
      });
    }
    const totalOtrosPagos = otrosPagos.reduce((s, op) => s + op.importe, 0);

    const now = new Date();
    const periodEnd = new Date(period.endDate);
    const hireDate = new Date(employee.hireDate);

    const registroPatronal = employee.employerRegistrationNumber || org.rfc || "";

    return {
      serie: "NOM",
      folio: receipt.id.slice(-8).toUpperCase(),
      fecha: fmtIsoDateTime(now),
      lugarExpedicion: branch.postalCode || "00000",
      exportacion: "01",

      emisorRfc: org.rfc,
      emisorNombre: org.razonSocial,
      emisorRegimenFiscal: org.regimenFiscal,
      registroPatronal,

      receptorRfc: employee.rfc,
      receptorNombre: `${employee.firstName} ${employee.lastName}`,
      receptorCurp: employee.curp,
      receptorDomicilioFiscal: branch.postalCode || "00000",
      receptorRegimenFiscal: "605", // Sueldos y salarios
      numSeguridadSocial: employee.nss,
      fechaInicioRelLaboral: fmtIsoDate(hireDate),
      antiguedad: calculateAntiquity(hireDate, periodEnd),
      tipoContrato: mapContractType(employee.contractType),
      tipoJornada: "01", // Diurna by default
      tipoRegimen: "02", // Sueldos y salarios
      numEmpleado: employee.employeeNumber,
      departamento: employee.department || undefined,
      puesto: employee.jobPosition,
      periodicidadPago: mapPaymentFrequency(period.periodType),
      claveEntFed: deriveClaveEntFed(branch.state),

      tipoNomina: mapTipoNomina(period.periodType),
      fechaPago: fmtIsoDate(periodEnd),
      fechaInicialPago: fmtIsoDate(new Date(period.startDate)),
      fechaFinalPago: fmtIsoDate(periodEnd),
      numDiasPagados: daysWorked,

      totalPercepciones,
      totalDeducciones,
      totalOtrosPagos,

      totalSueldos: totalGravado + totalExento,
      totalGravado,
      totalExento,
      percepciones,

      totalOtrasDeducciones: Math.max(0, totalOtrasDeducciones),
      totalImpuestosRetenidos: Math.max(0, totalImpuestosRetenidos),
      deducciones,

      otrosPagos,
    };
  }

  /**
   * Preview CFDI XML for a payroll receipt without saving.
   */
  async getPreview(organizationId: string, receiptId: string): Promise<string> {
    const receipt = await this.getReceiptWithRelations(organizationId, receiptId);
    const nominaData = this.buildNominaData(receipt);
    return buildNominaCfdiXml(nominaData);
  }

  /**
   * Generate CFDI XML for a single payroll receipt and store it.
   */
  async generatePayrollCfdi(organizationId: string, receiptId: string) {
    const receipt = await this.getReceiptWithRelations(organizationId, receiptId);

    // Don't regenerate if already has a CFDI
    if (receipt.cfdiId) {
      const existingCfdi = await this.prisma.cFDI.findUnique({
        where: { id: receipt.cfdiId },
      });
      if (existingCfdi) {
        throw new BadRequestException(
          "Este recibo ya tiene un CFDI generado. Elimine el existente primero.",
        );
      }
    }

    const nominaData = this.buildNominaData(receipt);
    const xmlContent = buildNominaCfdiXml(nominaData);

    const employee = receipt.employee;
    const org = receipt.payrollPeriod.organization;
    const totalPercepciones = nominaData.totalPercepciones;
    const totalDeducciones = nominaData.totalDeducciones;
    const total = totalPercepciones + nominaData.totalOtrosPagos - totalDeducciones;

    // Create the CFDI record and link it to the receipt
    const cfdi = await this.prisma.$transaction(async (tx) => {
      const newCfdi = await tx.cFDI.create({
        data: {
          organizationId,
          branchId: receipt.branchId,
          cfdiType: "NOMINA",
          series: "NOM",
          folio: receipt.id.slice(-8).toUpperCase(),
          issuerRfc: org.rfc,
          issuerName: org.razonSocial,
          issuerRegimen: org.regimenFiscal,
          receiverRfc: employee.rfc!,
          receiverName: `${employee.firstName} ${employee.lastName}`,
          receiverRegimen: "605",
          receiverUsoCfdi: "CN01",
          subtotal: totalPercepciones + nominaData.totalOtrosPagos,
          discount: totalDeducciones,
          total: Math.max(0, total),
          currency: "MXN",
          xmlContent,
          status: "DRAFT",
          createdById: organizationId, // System-generated
        },
      });

      // Link CFDI to receipt
      await tx.payrollReceipt.update({
        where: { id: receiptId },
        data: { cfdiId: newCfdi.id },
      });

      return newCfdi;
    });

    return cfdi;
  }

  /**
   * Generate CFDIs for all receipts in a payroll period.
   */
  async generateBatchCfdi(organizationId: string, periodId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, organizationId },
      include: {
        receipts: {
          include: {
            employee: true,
            branch: true,
          },
        },
      },
    });

    if (!period) {
      throw new NotFoundException("Periodo de nomina no encontrado");
    }

    if (period.status === "DRAFT") {
      throw new BadRequestException("La nomina debe estar calculada antes de generar CFDIs");
    }

    const results = {
      generated: 0,
      failed: 0,
      total: period.receipts.length,
      errors: [] as { employeeId: string; employeeName: string; error: string }[],
    };

    for (const receipt of period.receipts) {
      try {
        // Skip if already has a CFDI
        if (receipt.cfdiId) {
          results.generated++;
          continue;
        }

        await this.generatePayrollCfdi(organizationId, receipt.id);
        results.generated++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          employeeId: receipt.employeeId,
          employeeName: `${receipt.employee.firstName} ${receipt.employee.lastName}`,
          error: error.message || "Error desconocido",
        });
      }
    }

    return results;
  }

  /**
   * List all generated CFDIs for a payroll period.
   */
  async listPeriodCfdis(organizationId: string, periodId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, organizationId },
    });

    if (!period) {
      throw new NotFoundException("Periodo de nomina no encontrado");
    }

    const receipts = await this.prisma.payrollReceipt.findMany({
      where: { payrollPeriodId: periodId },
      include: {
        employee: true,
        cfdi: true,
      },
      orderBy: { employee: { lastName: "asc" } },
    });

    return receipts.map((r) => ({
      receiptId: r.id,
      employeeId: r.employeeId,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      employeeRfc: r.employee.rfc || "",
      grossSalary: Number(r.grossSalary),
      isrWithheld: Number(r.isrWithheld),
      imssEmployee: Number(r.imssEmployee),
      netSalary: Number(r.netSalary),
      cfdiId: r.cfdiId,
      cfdiStatus: r.cfdi?.status || null,
      cfdiUuid: r.cfdi?.uuid || null,
    }));
  }
}
