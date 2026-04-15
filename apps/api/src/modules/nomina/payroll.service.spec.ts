import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { PayrollService } from "./payroll.service";
import { PrismaService } from "../../common/prisma/prisma.service";

const mockTx: any = {
  payrollReceipt: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    create: vi.fn().mockResolvedValue({}),
  },
  payrollPeriod: {
    update: vi.fn(),
  },
};

const mockPrisma: any = {
  payrollPeriod: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  employee: {
    findMany: vi.fn(),
  },
  iSRTable: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn((fn: any) => fn(mockTx)),
};

describe("PayrollService", () => {
  let service: PayrollService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // findAllPeriods
  // -----------------------------------------------------------------------
  describe("findAllPeriods", () => {
    it("should return all periods for an organization", async () => {
      const periods = [{ id: "per-1", periodType: "QUINCENAL", startDate: "2026-04-01" }];
      mockPrisma.payrollPeriod.findMany.mockResolvedValue(periods);

      const result = await service.findAllPeriods("org-1");

      expect(result).toEqual(periods);
      expect(mockPrisma.payrollPeriod.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        include: { _count: { select: { receipts: true } } },
        orderBy: { startDate: "desc" },
      });
    });
  });

  // -----------------------------------------------------------------------
  // findPeriod
  // -----------------------------------------------------------------------
  describe("findPeriod", () => {
    it("should return the period when found", async () => {
      const period = { id: "per-1", organizationId: "org-1", status: "DRAFT" };
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue(period);

      const result = await service.findPeriod("org-1", "per-1");

      expect(result).toEqual(period);
    });

    it("should throw NotFoundException when period is not found", async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue(null);

      await expect(service.findPeriod("org-1", "nope")).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // createPeriod
  // -----------------------------------------------------------------------
  describe("createPeriod", () => {
    it("should create a period with correct dates and type", async () => {
      const expected = {
        id: "per-new",
        organizationId: "org-1",
        periodType: "QUINCENAL",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-04-15"),
      };
      mockPrisma.payrollPeriod.create.mockResolvedValue(expected);

      const result = await service.createPeriod("org-1", {
        periodType: "QUINCENAL",
        startDate: "2026-04-01",
        endDate: "2026-04-15",
      });

      expect(result).toEqual(expected);
      expect(mockPrisma.payrollPeriod.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          periodType: "QUINCENAL",
          startDate: new Date("2026-04-01"),
          endDate: new Date("2026-04-15"),
        },
      });
    });
  });

  // -----------------------------------------------------------------------
  // calculatePayroll
  // -----------------------------------------------------------------------
  describe("calculatePayroll", () => {
    const draftPeriod = {
      id: "per-1",
      organizationId: "org-1",
      status: "DRAFT",
      periodType: "QUINCENAL",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-15"),
      receipts: [],
    };

    it("should throw BadRequestException when period is not DRAFT", async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue({
        ...draftPeriod,
        status: "APPROVED",
      });

      await expect(service.calculatePayroll("org-1", "per-1")).rejects.toThrow(BadRequestException);
    });

    it("should calculate gross, ISR (fallback 10%), IMSS, and net for each employee", async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue(draftPeriod);
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: "emp-1",
          dailySalary: 500,
          branchId: "b1",
          organizationId: "org-1",
          isActive: true,
        },
      ]);
      // No ISR table => fallback 10%
      mockPrisma.iSRTable.findMany.mockResolvedValue([]);

      const updatedPeriod = { id: "per-1", status: "CALCULATED" };
      mockTx.payrollPeriod.update.mockResolvedValue(updatedPeriod);

      const result = await service.calculatePayroll("org-1", "per-1");

      expect(result.status).toBe("CALCULATED");

      // Verify receipt was created with correct calculation
      // 15 days * 500 = 7500 gross
      // ISR fallback: 7500 * 0.10 = 750
      // IMSS: 7500 * 0.02775 = 208.125 => 208.13
      // Net: 7500 - 750 - 208.125 = 6541.875 => 6541.88
      expect(mockTx.payrollReceipt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          employeeId: "emp-1",
          grossSalary: 7500,
          isrWithheld: 750,
          imssEmployee: 208.13,
          netSalary: 6541.88,
        }),
      });
    });

    it("should calculate ISR using the ISR table bracket when available", async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue(draftPeriod);
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: "emp-1",
          dailySalary: 500,
          branchId: "b1",
          organizationId: "org-1",
          isActive: true,
        },
      ]);
      // Provide ISR table bracket that matches 7500 gross
      mockPrisma.iSRTable.findMany.mockResolvedValue([
        {
          lowerLimit: 5000,
          upperLimit: 10000,
          fixedFee: 300,
          ratePercentage: 0.15,
        },
      ]);

      mockTx.payrollPeriod.update.mockResolvedValue({
        id: "per-1",
        status: "CALCULATED",
      });

      await service.calculatePayroll("org-1", "per-1");

      // ISR = fixedFee + (gross - lowerLimit) * rate = 300 + (7500 - 5000) * 0.15 = 300 + 375 = 675
      expect(mockTx.payrollReceipt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isrWithheld: 675,
        }),
      });
    });

    it("should handle empty period with no active employees", async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue(draftPeriod);
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.iSRTable.findMany.mockResolvedValue([]);

      mockTx.payrollPeriod.update.mockResolvedValue({
        id: "per-1",
        status: "CALCULATED",
        totalGross: 0,
        totalNet: 0,
      });

      const _result = await service.calculatePayroll("org-1", "per-1");

      expect(mockTx.payrollReceipt.create).not.toHaveBeenCalled();
      expect(mockTx.payrollPeriod.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CALCULATED",
            totalGross: 0,
            totalDeductions: 0,
            totalNet: 0,
            totalEmployerCost: 0,
          }),
        }),
      );
    });

    it("should delete previous receipts before recalculation", async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue(draftPeriod);
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.iSRTable.findMany.mockResolvedValue([]);
      mockTx.payrollPeriod.update.mockResolvedValue({});

      await service.calculatePayroll("org-1", "per-1");

      expect(mockTx.payrollReceipt.deleteMany).toHaveBeenCalledWith({
        where: { payrollPeriodId: "per-1" },
      });
    });
  });

  // -----------------------------------------------------------------------
  // approvePeriod
  // -----------------------------------------------------------------------
  describe("approvePeriod", () => {
    it("should change status to APPROVED when period is CALCULATED", async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue({
        id: "per-1",
        organizationId: "org-1",
        status: "CALCULATED",
        receipts: [],
      });
      mockPrisma.payrollPeriod.update.mockResolvedValue({
        id: "per-1",
        status: "APPROVED",
      });

      const result = await service.approvePeriod("org-1", "per-1");

      expect(result.status).toBe("APPROVED");
      expect(mockPrisma.payrollPeriod.update).toHaveBeenCalledWith({
        where: { id: "per-1" },
        data: { status: "APPROVED" },
        include: { receipts: { include: { employee: true } } },
      });
    });

    it("should throw BadRequestException when period is not CALCULATED (already APPROVED)", async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue({
        id: "per-1",
        organizationId: "org-1",
        status: "APPROVED",
        receipts: [],
      });

      await expect(service.approvePeriod("org-1", "per-1")).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when period is still DRAFT", async () => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue({
        id: "per-1",
        organizationId: "org-1",
        status: "DRAFT",
        receipts: [],
      });

      await expect(service.approvePeriod("org-1", "per-1")).rejects.toThrow(BadRequestException);
    });
  });
});
