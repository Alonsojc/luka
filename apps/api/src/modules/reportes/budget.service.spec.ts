import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { BudgetService } from "./budget.service";
import { PrismaService } from "../../common/prisma/prisma.service";

const mockPrisma: any = {
  branchBudget: {
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
  payrollReceipt: {
    findMany: vi.fn(),
  },
  purchaseOrder: {
    aggregate: vi.fn(),
  },
  branch: {
    findMany: vi.fn(),
  },
};

describe("BudgetService", () => {
  let service: BudgetService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BudgetService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<BudgetService>(BudgetService);
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // setBudget
  // -----------------------------------------------------------------------
  describe("setBudget", () => {
    it("should upsert a budget entry with correct composite key", async () => {
      const budgetEntry = {
        id: "bud-1",
        organizationId: "org-1",
        branchId: "b1",
        year: 2026,
        month: 4,
        category: "LABOR",
        budgetAmount: 50000,
      };
      mockPrisma.branchBudget.upsert.mockResolvedValue(budgetEntry);

      const result = await service.setBudget("org-1", {
        branchId: "b1",
        year: 2026,
        month: 4,
        category: "LABOR",
        budgetAmount: 50000,
      });

      expect(result).toEqual(budgetEntry);
      expect(mockPrisma.branchBudget.upsert).toHaveBeenCalledWith({
        where: {
          organizationId_branchId_year_month_category: {
            organizationId: "org-1",
            branchId: "b1",
            year: 2026,
            month: 4,
            category: "LABOR",
          },
        },
        update: {
          budgetAmount: 50000,
          notes: null,
        },
        create: {
          organizationId: "org-1",
          branchId: "b1",
          year: 2026,
          month: 4,
          category: "LABOR",
          budgetAmount: 50000,
          notes: null,
        },
      });
    });

    it("should store notes when provided", async () => {
      mockPrisma.branchBudget.upsert.mockResolvedValue({});

      await service.setBudget("org-1", {
        branchId: "b1",
        year: 2026,
        month: 4,
        category: "RENT",
        budgetAmount: 30000,
        notes: "Renta ajustada por inflacion",
      });

      expect(mockPrisma.branchBudget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { budgetAmount: 30000, notes: "Renta ajustada por inflacion" },
          create: expect.objectContaining({
            notes: "Renta ajustada por inflacion",
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // getComparison
  // -----------------------------------------------------------------------
  describe("getComparison", () => {
    function setupComparisonMocks(budgets: any[], laborActual: number, foodCostActual: number) {
      mockPrisma.branchBudget.findMany.mockResolvedValue(budgets);
      mockPrisma.payrollReceipt.findMany.mockResolvedValue(
        laborActual > 0
          ? [
              {
                grossSalary: laborActual * 0.6,
                employerImss: laborActual * 0.2,
                employerRcv: laborActual * 0.1,
                employerInfonavit: laborActual * 0.1,
              },
            ]
          : [],
      );
      mockPrisma.purchaseOrder.aggregate.mockResolvedValue({
        _sum: { total: foodCostActual },
      });
    }

    it("should return correct variance calculation (budget - actual)", async () => {
      setupComparisonMocks(
        [
          { category: "LABOR", budgetAmount: 50000 },
          { category: "FOOD_COST", budgetAmount: 30000 },
        ],
        45000, // labor actual
        28000, // food cost actual
      );

      const result = await service.getComparison("org-1", "b1", 2026, 4);

      const laborRow = result.rows.find((r: any) => r.category === "LABOR");
      expect(laborRow).toBeTruthy();
      expect(laborRow!.budget).toBe(50000);
      expect(laborRow!.actual).toBe(45000);
      expect(laborRow!.variance).toBe(5000); // 50000 - 45000

      const foodRow = result.rows.find((r: any) => r.category === "FOOD_COST");
      expect(foodRow!.variance).toBe(2000); // 30000 - 28000
    });

    it("should mark status as UNDER when actual <= budget", async () => {
      setupComparisonMocks([{ category: "LABOR", budgetAmount: 50000 }], 40000, 0);

      const result = await service.getComparison("org-1", "b1", 2026, 4);

      const laborRow = result.rows.find((r: any) => r.category === "LABOR");
      expect(laborRow!.status).toBe("UNDER");
    });

    it("should mark status as OVER when actual > budget", async () => {
      setupComparisonMocks([{ category: "LABOR", budgetAmount: 40000 }], 55000, 0);

      const result = await service.getComparison("org-1", "b1", 2026, 4);

      const laborRow = result.rows.find((r: any) => r.category === "LABOR");
      expect(laborRow!.status).toBe("OVER");
    });

    it("should calculate variancePct correctly", async () => {
      setupComparisonMocks([{ category: "LABOR", budgetAmount: 100000 }], 75000, 0);

      const result = await service.getComparison("org-1", "b1", 2026, 4);

      const laborRow = result.rows.find((r: any) => r.category === "LABOR");
      // variance = 25000, variancePct = (25000/100000) * 100 = 25%
      expect(laborRow!.variancePct).toBe(25);
    });

    it("should set variancePct to 0 when budget is 0", async () => {
      setupComparisonMocks([], 0, 0);

      const result = await service.getComparison("org-1", "b1", 2026, 4);

      // All categories have 0 budget => variancePct = 0
      for (const row of result.rows) {
        expect(row.variancePct).toBe(0);
      }
    });

    it("should always return all 7 categories", async () => {
      setupComparisonMocks([], 0, 0);

      const result = await service.getComparison("org-1", "b1", 2026, 4);

      expect(result.rows).toHaveLength(7);
      const categories = result.rows.map((r: any) => r.category);
      expect(categories).toContain("LABOR");
      expect(categories).toContain("FOOD_COST");
      expect(categories).toContain("RENT");
      expect(categories).toContain("UTILITIES");
      expect(categories).toContain("MARKETING");
      expect(categories).toContain("MAINTENANCE");
      expect(categories).toContain("OTHER");
    });

    it("should include totals with aggregate budget, actual, variance", async () => {
      setupComparisonMocks(
        [
          { category: "LABOR", budgetAmount: 50000 },
          { category: "FOOD_COST", budgetAmount: 30000 },
        ],
        45000,
        28000,
      );

      const result = await service.getComparison("org-1", "b1", 2026, 4);

      expect(result.totals.budget).toBe(80000);
      expect(result.totals.actual).toBe(73000); // 45000 + 28000
      expect(result.totals.variance).toBe(7000);
      expect(result.totals.status).toBe("UNDER");
    });
  });

  // -----------------------------------------------------------------------
  // setBulkBudgets
  // -----------------------------------------------------------------------
  describe("setBulkBudgets", () => {
    it("should upsert multiple budget entries and return count", async () => {
      mockPrisma.branchBudget.upsert.mockResolvedValue({});

      const result = await service.setBulkBudgets("org-1", {
        branchId: "b1",
        year: 2026,
        budgets: [
          { month: 1, category: "LABOR", amount: 50000 },
          { month: 1, category: "RENT", amount: 25000 },
          { month: 2, category: "LABOR", amount: 52000 },
        ],
      });

      expect(result.count).toBe(3);
      expect(mockPrisma.branchBudget.upsert).toHaveBeenCalledTimes(3);
    });
  });

  // -----------------------------------------------------------------------
  // copyBudgetFromPreviousYear
  // -----------------------------------------------------------------------
  describe("copyBudgetFromPreviousYear", () => {
    it("should copy budgets from source year to target year", async () => {
      mockPrisma.branchBudget.findMany.mockResolvedValue([
        { month: 1, category: "LABOR", budgetAmount: 50000 },
        { month: 1, category: "RENT", budgetAmount: 25000 },
      ]);
      mockPrisma.branchBudget.upsert.mockResolvedValue({});

      const result = await service.copyBudgetFromPreviousYear("org-1", "b1", 2025, 2026);

      expect(result.count).toBe(2);
      expect(mockPrisma.branchBudget.upsert).toHaveBeenCalledTimes(2);
    });

    it("should apply adjustment percentage when provided", async () => {
      mockPrisma.branchBudget.findMany.mockResolvedValue([
        { month: 1, category: "LABOR", budgetAmount: 50000 },
      ]);
      mockPrisma.branchBudget.upsert.mockResolvedValue({});

      await service.copyBudgetFromPreviousYear("org-1", "b1", 2025, 2026, 10);

      // 50000 * 1.10 = 55000
      expect(mockPrisma.branchBudget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            budgetAmount: 55000,
          }),
        }),
      );
    });

    it("should return count 0 when source year has no budgets", async () => {
      mockPrisma.branchBudget.findMany.mockResolvedValue([]);

      const result = await service.copyBudgetFromPreviousYear("org-1", "b1", 2020, 2026);

      expect(result.count).toBe(0);
      expect(result.message).toContain("No budgets found");
    });
  });
});
