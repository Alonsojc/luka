import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

const CATEGORIES = [
  "LABOR",
  "FOOD_COST",
  "RENT",
  "UTILITIES",
  "MARKETING",
  "MAINTENANCE",
  "OTHER",
] as const;

type Category = (typeof CATEGORIES)[number];

@Injectable()
export class BudgetService {
  constructor(private prisma: PrismaService) {}

  // =========================================================================
  // SET BUDGET (Upsert)
  // =========================================================================
  async setBudget(
    organizationId: string,
    data: {
      branchId: string;
      year: number;
      month: number;
      category: string;
      budgetAmount: number;
      notes?: string;
    },
  ) {
    return this.prisma.branchBudget.upsert({
      where: {
        organizationId_branchId_year_month_category: {
          organizationId,
          branchId: data.branchId,
          year: data.year,
          month: data.month,
          category: data.category,
        },
      },
      update: {
        budgetAmount: data.budgetAmount,
        notes: data.notes ?? null,
      },
      create: {
        organizationId,
        branchId: data.branchId,
        year: data.year,
        month: data.month,
        category: data.category,
        budgetAmount: data.budgetAmount,
        notes: data.notes ?? null,
      },
    });
  }

  // =========================================================================
  // SET BULK BUDGETS
  // =========================================================================
  async setBulkBudgets(
    organizationId: string,
    data: {
      branchId: string;
      year: number;
      budgets: { month: number; category: string; amount: number }[];
    },
  ) {
    const results = [];
    for (const entry of data.budgets) {
      const result = await this.prisma.branchBudget.upsert({
        where: {
          organizationId_branchId_year_month_category: {
            organizationId,
            branchId: data.branchId,
            year: data.year,
            month: entry.month,
            category: entry.category,
          },
        },
        update: {
          budgetAmount: entry.amount,
        },
        create: {
          organizationId,
          branchId: data.branchId,
          year: data.year,
          month: entry.month,
          category: entry.category,
          budgetAmount: entry.amount,
        },
      });
      results.push(result);
    }
    return { count: results.length };
  }

  // =========================================================================
  // GET BUDGETS
  // =========================================================================
  async getBudgets(organizationId: string, branchId: string, year: number) {
    return this.prisma.branchBudget.findMany({
      where: { organizationId, branchId, year },
      orderBy: [{ month: "asc" }, { category: "asc" }],
    });
  }

  // =========================================================================
  // GET ACTUALS (Real spend from live data)
  // =========================================================================
  async getActuals(
    organizationId: string,
    branchId: string,
    year: number,
    month: number,
  ): Promise<Record<Category, number>> {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    // LABOR: PayrollReceipts for the branch in the month
    const payrollReceipts = await this.prisma.payrollReceipt.findMany({
      where: {
        branchId,
        payrollPeriod: {
          organizationId,
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
      },
      select: {
        grossSalary: true,
        employerImss: true,
        employerRcv: true,
        employerInfonavit: true,
      },
    });

    const laborActual = payrollReceipts.reduce(
      (sum, r) =>
        sum +
        Number(r.grossSalary) +
        Number(r.employerImss) +
        Number(r.employerRcv) +
        Number(r.employerInfonavit),
      0,
    );

    // FOOD_COST: PurchaseOrders (RECEIVED) for the branch in the month
    const poAgg = await this.prisma.purchaseOrder.aggregate({
      where: {
        organizationId,
        branchId,
        status: "RECEIVED",
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { total: true },
    });
    const foodCostActual = Number(poAgg._sum.total || 0);

    return {
      LABOR: Math.round(laborActual * 100) / 100,
      FOOD_COST: Math.round(foodCostActual * 100) / 100,
      RENT: 0,
      UTILITIES: 0,
      MARKETING: 0,
      MAINTENANCE: 0,
      OTHER: 0,
    };
  }

  // =========================================================================
  // GET COMPARISON (single month)
  // =========================================================================
  async getComparison(
    organizationId: string,
    branchId: string,
    year: number,
    month: number,
  ) {
    const [budgets, actuals] = await Promise.all([
      this.prisma.branchBudget.findMany({
        where: { organizationId, branchId, year, month },
      }),
      this.getActuals(organizationId, branchId, year, month),
    ]);

    const budgetMap = new Map(
      budgets.map((b) => [b.category, Number(b.budgetAmount)]),
    );

    const rows = CATEGORIES.map((category) => {
      const budget = budgetMap.get(category) || 0;
      const actual = actuals[category] || 0;
      const variance = budget - actual;
      const variancePct = budget > 0 ? Math.round((variance / budget) * 10000) / 100 : 0;
      return {
        category,
        budget: Math.round(budget * 100) / 100,
        actual: Math.round(actual * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        variancePct,
        status: actual <= budget ? "UNDER" : "OVER",
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        budget: acc.budget + r.budget,
        actual: acc.actual + r.actual,
        variance: acc.variance + r.variance,
      }),
      { budget: 0, actual: 0, variance: 0 },
    );

    return {
      rows,
      totals: {
        ...totals,
        budget: Math.round(totals.budget * 100) / 100,
        actual: Math.round(totals.actual * 100) / 100,
        variance: Math.round(totals.variance * 100) / 100,
        variancePct:
          totals.budget > 0
            ? Math.round((totals.variance / totals.budget) * 10000) / 100
            : 0,
        status: totals.actual <= totals.budget ? "UNDER" : "OVER",
      },
    };
  }

  // =========================================================================
  // GET ANNUAL COMPARISON
  // =========================================================================
  async getAnnualComparison(
    organizationId: string,
    branchId: string,
    year: number,
  ) {
    const months: {
      month: number;
      budget: number;
      actual: number;
      variance: number;
      variancePct: number;
    }[] = [];

    for (let month = 1; month <= 12; month++) {
      const comparison = await this.getComparison(
        organizationId,
        branchId,
        year,
        month,
      );
      months.push({
        month,
        budget: comparison.totals.budget,
        actual: comparison.totals.actual,
        variance: comparison.totals.variance,
        variancePct: comparison.totals.variancePct,
      });
    }

    const totals = months.reduce(
      (acc, m) => ({
        budget: acc.budget + m.budget,
        actual: acc.actual + m.actual,
        variance: acc.variance + m.variance,
      }),
      { budget: 0, actual: 0, variance: 0 },
    );

    return {
      months,
      totals: {
        budget: Math.round(totals.budget * 100) / 100,
        actual: Math.round(totals.actual * 100) / 100,
        variance: Math.round(totals.variance * 100) / 100,
        variancePct:
          totals.budget > 0
            ? Math.round((totals.variance / totals.budget) * 10000) / 100
            : 0,
      },
    };
  }

  // =========================================================================
  // GET MULTI-BRANCH COMPARISON
  // =========================================================================
  async getMultiBranchComparison(
    organizationId: string,
    year: number,
    month: number,
  ) {
    const branches = await this.prisma.branch.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });

    const rows = [];
    for (const branch of branches) {
      const comparison = await this.getComparison(
        organizationId,
        branch.id,
        year,
        month,
      );
      rows.push({
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code,
        budget: comparison.totals.budget,
        actual: comparison.totals.actual,
        variance: comparison.totals.variance,
        variancePct: comparison.totals.variancePct,
        status: comparison.totals.status,
      });
    }

    // Sort by worst variance (most over budget first)
    rows.sort((a, b) => a.variance - b.variance);

    return { rows };
  }

  // =========================================================================
  // COPY BUDGET FROM PREVIOUS YEAR
  // =========================================================================
  async copyBudgetFromPreviousYear(
    organizationId: string,
    branchId: string,
    fromYear: number,
    toYear: number,
    adjustmentPercent?: number,
  ) {
    const sourceBudgets = await this.prisma.branchBudget.findMany({
      where: { organizationId, branchId, year: fromYear },
    });

    if (sourceBudgets.length === 0) {
      return { count: 0, message: "No budgets found for source year" };
    }

    const multiplier = adjustmentPercent
      ? 1 + adjustmentPercent / 100
      : 1;

    let count = 0;
    for (const budget of sourceBudgets) {
      const newAmount =
        Math.round(Number(budget.budgetAmount) * multiplier * 100) / 100;
      await this.prisma.branchBudget.upsert({
        where: {
          organizationId_branchId_year_month_category: {
            organizationId,
            branchId,
            year: toYear,
            month: budget.month,
            category: budget.category,
          },
        },
        update: { budgetAmount: newAmount },
        create: {
          organizationId,
          branchId,
          year: toYear,
          month: budget.month,
          category: budget.category,
          budgetAmount: newAmount,
        },
      });
      count++;
    }

    return { count, message: `Copied ${count} budget entries` };
  }
}
