import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

interface SuaMovement {
  nss: string;
  curp: string;
  firstName: string;
  lastName: string;
  movementType: string; // 08 = alta, 02 = baja, 07 = modification
  movementLabel: string;
  date: string;
  salary: number;
  employerRegistration: string;
}

interface BranchContribution {
  branch: string;
  branchLabel: string;
  employerRate: number;
  employeeRate: number;
  employerAmount: number;
  employeeAmount: number;
  total: number;
}

interface EmployeeContribution {
  employeeId: string;
  employeeName: string;
  nss: string;
  sbc: number;
  employerTotal: number;
  employeeTotal: number;
  total: number;
}

// Default IMSS rates for 2024-2025 (used when no IMSSRate records exist)
const DEFAULT_IMSS_RATES: {
  branch: string;
  label: string;
  employerRate: number;
  employeeRate: number;
}[] = [
  {
    branch: "enfermedades_maternidad_fija",
    label: "Enfermedades y Maternidad (Cuota Fija)",
    employerRate: 0.204,
    employeeRate: 0.0,
  },
  {
    branch: "enfermedades_maternidad_excedente",
    label: "Enfermedades y Maternidad (Excedente)",
    employerRate: 0.011,
    employeeRate: 0.004,
  },
  {
    branch: "enfermedades_maternidad_prestaciones",
    label: "Enfermedades y Maternidad (Prestaciones en Dinero)",
    employerRate: 0.007,
    employeeRate: 0.0025,
  },
  {
    branch: "enfermedades_maternidad_gastos_medicos",
    label: "Enfermedades y Maternidad (Gastos Médicos Pensionados)",
    employerRate: 0.0105,
    employeeRate: 0.00375,
  },
  {
    branch: "invalidez_vida",
    label: "Invalidez y Vida",
    employerRate: 0.0175,
    employeeRate: 0.00625,
  },
  {
    branch: "retiro",
    label: "Retiro",
    employerRate: 0.02,
    employeeRate: 0.0,
  },
  {
    branch: "cesantia_vejez",
    label: "Cesantia en Edad Avanzada y Vejez",
    employerRate: 0.03150,
    employeeRate: 0.01125,
  },
  {
    branch: "guarderias",
    label: "Guarderias y Prestaciones Sociales",
    employerRate: 0.01,
    employeeRate: 0.0,
  },
  {
    branch: "infonavit",
    label: "INFONAVIT",
    employerRate: 0.05,
    employeeRate: 0.0,
  },
];

const MOVEMENT_LABELS: Record<string, string> = {
  "08": "Alta",
  "02": "Baja",
  "07": "Modificacion de Salario",
};

@Injectable()
export class SuaService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate the list of IMSS movements for the given month.
   * Detects: hires (altas), terminations (bajas), salary changes (modifications).
   */
  async generateSuaMovements(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<SuaMovement[]> {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    // Fetch all employees that have some activity in this month
    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId,
        OR: [
          // Active employees
          { isActive: true },
          // Employees terminated this month
          {
            terminationDate: { gte: monthStart, lte: monthEnd },
          },
        ],
      },
      orderBy: { lastName: "asc" },
    });

    const movements: SuaMovement[] = [];

    for (const emp of employees) {
      const sbc = Number(emp.integratedDailySalary || emp.dailySalary || 0);
      const regNum = emp.employerRegistrationNumber || "";

      // ALTA: hireDate falls in this month
      const hireDate = new Date(emp.hireDate);
      if (
        hireDate >= monthStart &&
        hireDate <= monthEnd
      ) {
        movements.push({
          nss: emp.nss || "",
          curp: emp.curp || "",
          firstName: emp.firstName,
          lastName: emp.lastName,
          movementType: "08",
          movementLabel: MOVEMENT_LABELS["08"],
          date: this.formatDateDDMMYYYY(hireDate),
          salary: sbc,
          employerRegistration: regNum,
        });
        continue; // If hired this month, no need to check for modifications
      }

      // BAJA: terminationDate falls in this month
      if (
        emp.terminationDate &&
        new Date(emp.terminationDate) >= monthStart &&
        new Date(emp.terminationDate) <= monthEnd
      ) {
        movements.push({
          nss: emp.nss || "",
          curp: emp.curp || "",
          firstName: emp.firstName,
          lastName: emp.lastName,
          movementType: "02",
          movementLabel: MOVEMENT_LABELS["02"],
          date: this.formatDateDDMMYYYY(new Date(emp.terminationDate)),
          salary: sbc,
          employerRegistration: regNum,
        });
        continue;
      }

      // MODIFICATION: check if employee had salary changes this month
      // by comparing updatedAt with monthStart and checking salary fields
      const updatedAt = new Date(emp.updatedAt);
      if (
        updatedAt >= monthStart &&
        updatedAt <= monthEnd &&
        hireDate < monthStart // Only if employee existed before this month
      ) {
        movements.push({
          nss: emp.nss || "",
          curp: emp.curp || "",
          firstName: emp.firstName,
          lastName: emp.lastName,
          movementType: "07",
          movementLabel: MOVEMENT_LABELS["07"],
          date: this.formatDateDDMMYYYY(updatedAt),
          salary: sbc,
          employerRegistration: regNum,
        });
      }
    }

    return movements;
  }

  /**
   * Generate fixed-width SUA file content per IMSS specification.
   */
  async generateSuaFile(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<string> {
    const movements = await this.generateSuaMovements(
      organizationId,
      year,
      month,
    );

    const lines: string[] = [];

    for (const mov of movements) {
      // Split lastName into paterno and materno
      const nameParts = mov.lastName.split(" ");
      const paterno = nameParts[0] || "";
      const materno = nameParts.slice(1).join(" ") || "";
      const nombre = mov.firstName;

      // Build the name field: PATERNO|MATERNO|NOMBRE (50 chars)
      const nameField = `${paterno}|${materno}|${nombre}`;

      // Format salary: 7 digits with 2 decimals (no decimal point), e.g. 0035000 for 350.00
      const salaryStr = Math.round(mov.salary * 100)
        .toString()
        .padStart(7, "0");

      const line = [
        (mov.nss || "").padEnd(11, " ").slice(0, 11), // Pos 1-11: NSS
        nameField.padEnd(50, " ").slice(0, 50), // Pos 12-61: Name
        (mov.curp || "").padEnd(18, " ").slice(0, 18), // Pos 62-79: CURP
        mov.date.replace(/\//g, "").padEnd(8, " ").slice(0, 8), // Pos 80-87: Date DDMMYYYY
        salaryStr.slice(0, 7), // Pos 88-94: Salary
        mov.movementType.padStart(2, "0").slice(0, 2), // Pos 95-96: Movement type
        (mov.employerRegistration || "").padEnd(11, " ").slice(0, 11), // Pos 97-107: Employer reg
      ].join("");

      lines.push(line);
    }

    return lines.join("\r\n");
  }

  /**
   * Calculate IMSS contribution summary broken down by branch and employee.
   */
  async generateSuaPaymentSummary(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<{
    totalEmployer: number;
    totalEmployee: number;
    totalContribution: number;
    byBranch: BranchContribution[];
    byEmployee: EmployeeContribution[];
  }> {
    // Get active employees
    const employees = await this.prisma.employee.findMany({
      where: { organizationId, isActive: true },
      orderBy: { lastName: "asc" },
    });

    // Get IMSS rates from DB
    const dbRates = await this.prisma.iMSSRate.findMany({
      where: { organizationId, year },
    });

    // Use DB rates if available, otherwise use defaults
    const rates =
      dbRates.length > 0
        ? dbRates.map((r) => ({
            branch: r.branch,
            label: this.getBranchLabel(r.branch),
            employerRate: Number(r.employerRate),
            employeeRate: Number(r.employeeRate),
          }))
        : DEFAULT_IMSS_RATES;

    // Days in month
    const daysInMonth = new Date(year, month, 0).getDate();

    // Calculate by branch (aggregated across all employees)
    const byBranch: BranchContribution[] = rates.map((rate) => {
      let employerAmount = 0;
      let employeeAmount = 0;

      for (const emp of employees) {
        const sbc = Number(emp.integratedDailySalary || emp.dailySalary || 0);
        const monthlySbc = sbc * daysInMonth;
        employerAmount += monthlySbc * rate.employerRate;
        employeeAmount += monthlySbc * rate.employeeRate;
      }

      return {
        branch: rate.branch,
        branchLabel: rate.label,
        employerRate: rate.employerRate,
        employeeRate: rate.employeeRate,
        employerAmount: Math.round(employerAmount * 100) / 100,
        employeeAmount: Math.round(employeeAmount * 100) / 100,
        total:
          Math.round((employerAmount + employeeAmount) * 100) / 100,
      };
    });

    // Calculate by employee
    const byEmployee: EmployeeContribution[] = employees.map((emp) => {
      const sbc = Number(emp.integratedDailySalary || emp.dailySalary || 0);
      const monthlySbc = sbc * daysInMonth;
      let employerTotal = 0;
      let employeeTotal = 0;

      for (const rate of rates) {
        employerTotal += monthlySbc * rate.employerRate;
        employeeTotal += monthlySbc * rate.employeeRate;
      }

      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        nss: emp.nss || "",
        sbc,
        employerTotal: Math.round(employerTotal * 100) / 100,
        employeeTotal: Math.round(employeeTotal * 100) / 100,
        total:
          Math.round((employerTotal + employeeTotal) * 100) / 100,
      };
    });

    const totalEmployer = byBranch.reduce((s, b) => s + b.employerAmount, 0);
    const totalEmployee = byBranch.reduce((s, b) => s + b.employeeAmount, 0);

    return {
      totalEmployer: Math.round(totalEmployer * 100) / 100,
      totalEmployee: Math.round(totalEmployee * 100) / 100,
      totalContribution: Math.round((totalEmployer + totalEmployee) * 100) / 100,
      byBranch,
      byEmployee,
    };
  }

  /**
   * Save a generated SUA export and return the record.
   */
  async saveSuaExport(
    organizationId: string,
    year: number,
    month: number,
    userId: string,
  ) {
    const fileContent = await this.generateSuaFile(
      organizationId,
      year,
      month,
    );
    const movements = await this.generateSuaMovements(
      organizationId,
      year,
      month,
    );
    const summary = await this.generateSuaPaymentSummary(
      organizationId,
      year,
      month,
    );

    return this.prisma.suaExport.create({
      data: {
        organizationId,
        year,
        month,
        fileContent,
        movementCount: movements.length,
        totalEmployer: summary.totalEmployer,
        totalEmployee: summary.totalEmployee,
        totalAmount: summary.totalContribution,
        generatedBy: userId,
      },
    });
  }

  /**
   * List previous SUA exports for the organization.
   */
  async getSuaHistory(organizationId: string) {
    return this.prisma.suaExport.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        year: true,
        month: true,
        movementCount: true,
        totalEmployer: true,
        totalEmployee: true,
        totalAmount: true,
        generatedBy: true,
        createdAt: true,
      },
    });
  }

  /**
   * Get file content for download.
   */
  async getSuaFileContent(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<string> {
    // Try to find a previously generated export
    const existing = await this.prisma.suaExport.findFirst({
      where: { organizationId, year, month },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return existing.fileContent;
    }

    // Generate on-the-fly
    return this.generateSuaFile(organizationId, year, month);
  }

  // ── Helpers ──

  private formatDateDDMMYYYY(date: Date): string {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    return `${dd}${mm}${yyyy}`;
  }

  private getBranchLabel(branch: string): string {
    const labels: Record<string, string> = {
      enfermedades_maternidad_fija: "Enfermedades y Maternidad (Cuota Fija)",
      enfermedades_maternidad_excedente: "Enfermedades y Maternidad (Excedente)",
      enfermedades_maternidad_prestaciones:
        "Enfermedades y Maternidad (Prestaciones en Dinero)",
      enfermedades_maternidad_gastos_medicos:
        "Enfermedades y Maternidad (Gastos Medicos Pensionados)",
      enfermedades_maternidad: "Enfermedades y Maternidad",
      invalidez_vida: "Invalidez y Vida",
      retiro: "Retiro",
      cesantia_vejez: "Cesantia en Edad Avanzada y Vejez",
      cesantia: "Cesantia en Edad Avanzada y Vejez",
      guarderias: "Guarderias y Prestaciones Sociales",
      infonavit: "INFONAVIT",
    };
    return labels[branch] || branch;
  }
}
