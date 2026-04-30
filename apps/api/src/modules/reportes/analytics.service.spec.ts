import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "./analytics.service";

describe("AnalyticsService", () => {
  let mockPrisma: any;
  let mockCache: any;
  let service: AnalyticsService;

  beforeEach(() => {
    mockPrisma = {
      branch: { findMany: vi.fn() },
      corntechSale: {
        findMany: vi.fn(),
        aggregate: vi.fn(),
      },
      posSale: { aggregate: vi.fn(), findMany: vi.fn() },
      purchaseOrder: { findMany: vi.fn(), aggregate: vi.fn() },
      employee: { count: vi.fn() },
      branchInventory: { findMany: vi.fn() },
      posSaleItem: { groupBy: vi.fn() },
      bankAccount: { aggregate: vi.fn() },
      accountPayable: { aggregate: vi.fn() },
      accountReceivable: { aggregate: vi.fn() },
      payrollPeriod: { aggregate: vi.fn() },
    };
    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    service = new AnalyticsService(mockPrisma, mockCache);
  });

  it("returns zeroed trends with NO_DATA instead of generated estimates", async () => {
    const randomSpy = vi.spyOn(Math, "random");

    mockPrisma.branch.findMany.mockResolvedValue([{ id: "branch-1" }]);
    mockPrisma.corntechSale.findMany.mockResolvedValue([]);
    mockPrisma.posSale.findMany.mockResolvedValue([]);
    mockPrisma.purchaseOrder.findMany.mockResolvedValue([]);
    mockPrisma.employee.count.mockResolvedValue(0);

    const result = await service.getTrends("org-1");

    expect(result.dataStatus).toBe("NO_DATA");
    expect(result.sales.every((value) => value === 0)).toBe(true);
    expect(result.expenses.every((value) => value === 0)).toBe(true);
    expect(result.profit.every((value) => value === 0)).toBe(true);
    expect(result.employeeCount.every((value) => value === 0)).toBe(true);
    expect(randomSpy).not.toHaveBeenCalled();

    randomSpy.mockRestore();
  });

  it("returns KPI empty states instead of fake sales, products, branches, or ratios", async () => {
    const randomSpy = vi.spyOn(Math, "random");
    const emptySalesAgg = { _sum: { total: null }, _count: { id: 0 } };

    mockPrisma.branch.findMany
      .mockResolvedValueOnce([{ id: "branch-1" }])
      .mockResolvedValueOnce([{ id: "branch-1", name: "Luka Centro" }]);
    mockPrisma.corntechSale.aggregate.mockResolvedValue(emptySalesAgg);
    mockPrisma.posSale.aggregate.mockResolvedValue(emptySalesAgg);
    mockPrisma.posSaleItem.groupBy.mockResolvedValue([]);
    mockPrisma.corntechSale.findMany.mockResolvedValue([]);
    mockPrisma.branchInventory.findMany.mockResolvedValue([]);
    mockPrisma.purchaseOrder.aggregate.mockResolvedValue({ _sum: { total: null } });
    mockPrisma.bankAccount.aggregate.mockResolvedValue({ _sum: { currentBalance: null } });
    mockPrisma.accountPayable.aggregate.mockResolvedValue({ _sum: { balanceDue: null } });
    mockPrisma.accountReceivable.aggregate.mockResolvedValue({ _sum: { balanceDue: null } });
    mockPrisma.payrollPeriod.aggregate.mockResolvedValue({
      _sum: { totalEmployerCost: null, totalGross: null },
    });

    const result = await service.getKpis("org-1");

    expect(result.dataStatus).toBe("NO_DATA");
    expect(result.currentMonthSales).toBe(0);
    expect(result.previousMonthSales).toBe(0);
    expect(result.averageTicket).toBe(0);
    expect(result.inventoryTurnover).toBe(0);
    expect(result.employeeCostRatio).toBe(0);
    expect(result.topSellingProducts).toEqual([]);
    expect(result.topBranches).toEqual([{ name: "Luka Centro", sales: 0 }]);
    expect(randomSpy).not.toHaveBeenCalled();

    randomSpy.mockRestore();
  });
});
