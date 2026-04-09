import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  async findAllPeriods(organizationId: string) {
    return this.prisma.payrollPeriod.findMany({
      where: { organizationId },
      include: { _count: { select: { receipts: true } } },
      orderBy: { startDate: "desc" },
    });
  }

  async findPeriod(organizationId: string, id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id, organizationId },
      include: {
        receipts: {
          include: { employee: true, branch: true },
        },
      },
    });
    if (!period) {
      throw new NotFoundException("Período de nómina no encontrado");
    }
    return period;
  }

  async createPeriod(
    organizationId: string,
    data: {
      periodType: string;
      startDate: string;
      endDate: string;
    },
  ) {
    return this.prisma.payrollPeriod.create({
      data: {
        organizationId,
        periodType: data.periodType as any,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
    });
  }

  async calculatePayroll(organizationId: string, periodId: string) {
    const period = await this.findPeriod(organizationId, periodId);
    if (period.status !== "DRAFT") {
      throw new BadRequestException(
        "Solo se puede calcular nómina de períodos en borrador",
      );
    }

    const employees = await this.prisma.employee.findMany({
      where: { organizationId, isActive: true },
    });

    const startDate = new Date(period.startDate);
    const endDate = new Date(period.endDate);
    const totalDays =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) + 1;

    // Load ISR table for the period
    const isrTable = await this.prisma.iSRTable.findMany({
      where: {
        organizationId,
        year: startDate.getFullYear(),
        periodType: period.periodType,
      },
      orderBy: { lowerLimit: "asc" },
    });

    const receipts: any[] = [];

    for (const employee of employees) {
      const daysWorked = totalDays;
      const grossSalary = Number(employee.dailySalary) * daysWorked;

      // Basic ISR calculation
      let isrWithheld = 0;
      if (isrTable.length > 0) {
        const bracket = isrTable.find(
          (row) =>
            grossSalary >= Number(row.lowerLimit) &&
            grossSalary <= Number(row.upperLimit),
        );
        if (bracket) {
          const excess = grossSalary - Number(bracket.lowerLimit);
          isrWithheld =
            Number(bracket.fixedFee) +
            excess * Number(bracket.ratePercentage);
        }
      } else {
        // Fallback: approximate ISR at ~10% for basic calc
        isrWithheld = grossSalary * 0.1;
      }

      // Basic IMSS employee contribution (~2.775% of salary)
      const imssEmployee = grossSalary * 0.02775;

      const netSalary = grossSalary - isrWithheld - imssEmployee;

      // Employer costs (approximate)
      const employerImss = grossSalary * 0.13;
      const employerRcv = grossSalary * 0.0525;
      const employerInfonavit = grossSalary * 0.05;

      receipts.push({
        payrollPeriodId: periodId,
        employeeId: employee.id,
        branchId: employee.branchId,
        daysWorked,
        grossSalary,
        isrWithheld: Math.round(isrWithheld * 100) / 100,
        imssEmployee: Math.round(imssEmployee * 100) / 100,
        netSalary: Math.round(netSalary * 100) / 100,
        employerImss: Math.round(employerImss * 100) / 100,
        employerRcv: Math.round(employerRcv * 100) / 100,
        employerInfonavit: Math.round(employerInfonavit * 100) / 100,
      });
    }

    // Create all receipts in a transaction
    return this.prisma.$transaction(async (tx) => {
      // Delete existing receipts for this period (recalculation)
      await tx.payrollReceipt.deleteMany({
        where: { payrollPeriodId: periodId },
      });

      for (const receipt of receipts) {
        await tx.payrollReceipt.create({ data: receipt });
      }

      const totalGross = receipts.reduce((s, r) => s + r.grossSalary, 0);
      const totalDeductions = receipts.reduce(
        (s, r) => s + r.isrWithheld + r.imssEmployee,
        0,
      );
      const totalNet = receipts.reduce((s, r) => s + r.netSalary, 0);
      const totalEmployerCost = receipts.reduce(
        (s, r) =>
          s +
          r.grossSalary +
          r.employerImss +
          r.employerRcv +
          r.employerInfonavit,
        0,
      );

      return tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status: "CALCULATED",
          totalGross: Math.round(totalGross * 100) / 100,
          totalDeductions: Math.round(totalDeductions * 100) / 100,
          totalNet: Math.round(totalNet * 100) / 100,
          totalEmployerCost: Math.round(totalEmployerCost * 100) / 100,
        },
        include: {
          receipts: { include: { employee: true, branch: true } },
        },
      });
    });
  }

  async approvePeriod(organizationId: string, periodId: string) {
    const period = await this.findPeriod(organizationId, periodId);
    if (period.status !== "CALCULATED") {
      throw new BadRequestException(
        "Solo se puede aprobar nómina calculada",
      );
    }
    return this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: "APPROVED" },
      include: { receipts: { include: { employee: true } } },
    });
  }
}
