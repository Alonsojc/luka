import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CacheService } from "../../common/cache/cache.service";

const TRENDS_TTL = 300; // 5 minutes

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  // =========================================================================
  // GET /reportes/analytics/trends
  // =========================================================================
  async getTrends(organizationId: string) {
    const cacheKey = `analytics:trends:${organizationId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;
    const now = new Date();
    const months: string[] = [];
    const monthRanges: { start: Date; end: Date; label: string }[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      months.push(label);
      monthRanges.push({ start, end, label });
    }

    const branches = await this.prisma.branch.findMany({
      where: { organizationId, isActive: true },
      select: { id: true },
    });
    const branchIds = branches.map((b) => b.id);

    // Attempt to get real sales from CorntechSale
    const corntechSales = await this.prisma.corntechSale.findMany({
      where: {
        branchId: { in: branchIds },
        saleDate: { gte: monthRanges[0].start, lte: monthRanges[11].end },
      },
      select: { saleDate: true, total: true },
    });

    // Also check PosSale
    const posSales = await this.prisma.posSale.findMany({
      where: {
        organizationId,
        saleDate: { gte: monthRanges[0].start, lte: monthRanges[11].end },
      },
      select: { saleDate: true, total: true },
    });

    const hasRealSales = corntechSales.length > 0 || posSales.length > 0;

    // Get purchase orders (expenses)
    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: {
        organizationId,
        status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
        createdAt: { gte: monthRanges[0].start, lte: monthRanges[11].end },
      },
      select: { createdAt: true, total: true },
    });

    const hasRealExpenses = purchaseOrders.length > 0;

    // Active employee count
    const activeEmployees = await this.prisma.employee.count({
      where: { organizationId, isActive: true },
    });

    // Aggregate by month
    const salesByMonth = new Map<string, number>();
    const expensesByMonth = new Map<string, number>();

    if (hasRealSales) {
      for (const sale of [...corntechSales, ...posSales]) {
        const key = `${sale.saleDate.getFullYear()}-${String(sale.saleDate.getMonth() + 1).padStart(2, "0")}`;
        salesByMonth.set(key, (salesByMonth.get(key) || 0) + Number(sale.total));
      }
    }

    if (hasRealExpenses) {
      for (const po of purchaseOrders) {
        const key = `${po.createdAt.getFullYear()}-${String(po.createdAt.getMonth() + 1).padStart(2, "0")}`;
        expensesByMonth.set(key, (expensesByMonth.get(key) || 0) + Number(po.total));
      }
    }

    // Generate mock data if no real sales exist
    // Based on: 10 branches, avg ticket ~$180 MXN, ~80-120 tickets/branch/day
    const branchCount = branches.length || 10;

    const sales: number[] = [];
    const expenses: number[] = [];
    const profit: number[] = [];
    const employeeCount: number[] = [];

    for (const range of monthRanges) {
      let monthlySales: number;
      let monthlyExpenses: number;

      if (hasRealSales) {
        monthlySales = salesByMonth.get(range.label) || 0;
      } else {
        // Mock: branches * ~100 tickets/day * 30 days * $180 avg ticket
        const base = branchCount * 100 * 30 * 180;
        const seasonality = 1 + 0.15 * Math.sin((range.start.getMonth() - 2) * Math.PI / 6);
        const noise = 0.95 + Math.random() * 0.1;
        monthlySales = Math.round(base * seasonality * noise);
      }

      if (hasRealExpenses) {
        monthlyExpenses = expensesByMonth.get(range.label) || 0;
      } else {
        // Mock: expenses typically 55-65% of sales for food service
        const costRatio = 0.55 + Math.random() * 0.1;
        monthlyExpenses = Math.round(monthlySales * costRatio);
      }

      sales.push(Math.round(monthlySales));
      expenses.push(Math.round(monthlyExpenses));
      profit.push(Math.round(monthlySales - monthlyExpenses));
      employeeCount.push(activeEmployees || branchCount * 8);
    }

    const result = { months, sales, expenses, profit, employeeCount };
    await this.cache.set(cacheKey, result, TRENDS_TTL);
    return result;
  }

  // =========================================================================
  // GET /reportes/analytics/branch-comparison
  // =========================================================================
  async getBranchComparison(organizationId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, city: true },
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const result = [];

    for (const branch of branches) {
      // Inventory value
      const inventory = await this.prisma.branchInventory.findMany({
        where: { branchId: branch.id },
        include: { product: { select: { costPerUnit: true } } },
      });
      const inventoryValue = inventory.reduce(
        (sum, inv) => sum + Number(inv.currentQuantity) * Number(inv.product.costPerUnit),
        0,
      );

      // Employee count
      const empCount = await this.prisma.employee.count({
        where: { branchId: branch.id, isActive: true },
      });

      // Purchase orders total (this month)
      const poAgg = await this.prisma.purchaseOrder.aggregate({
        where: {
          branchId: branch.id,
          status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { total: true },
      });

      // Sales total from CorntechSale this month
      const corntechAgg = await this.prisma.corntechSale.aggregate({
        where: {
          branchId: branch.id,
          saleDate: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { total: true },
      });

      // Also PosSale
      const posAgg = await this.prisma.posSale.aggregate({
        where: {
          branchId: branch.id,
          saleDate: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { total: true },
      });

      const realSales = Number(corntechAgg._sum.total || 0) + Number(posAgg._sum.total || 0);
      const purchaseTotal = Number(poAgg._sum.total || 0);

      // If no real sales, estimate from branch average
      const salesTotal = realSales > 0
        ? realSales
        : Math.round(100 * 30 * 180 * (0.9 + Math.random() * 0.2));

      result.push({
        name: branch.name,
        city: branch.city,
        inventoryValue: Math.round(inventoryValue * 100) / 100,
        employeeCount: empCount,
        purchaseTotal: Math.round(purchaseTotal * 100) / 100,
        salesTotal: Math.round(salesTotal * 100) / 100,
      });
    }

    return { branches: result };
  }

  // =========================================================================
  // GET /reportes/analytics/kpis
  // =========================================================================
  async getKpis(organizationId: string) {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const branches = await this.prisma.branch.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const branchIds = branches.map((b) => b.id);
    const branchCount = branches.length || 10;

    // --- Sales from both sources ---
    const currentCorntechSales = await this.prisma.corntechSale.aggregate({
      where: {
        branchId: { in: branchIds },
        saleDate: { gte: currentMonthStart, lte: currentMonthEnd },
      },
      _sum: { total: true },
      _count: { id: true },
    });
    const currentPosSales = await this.prisma.posSale.aggregate({
      where: {
        organizationId,
        saleDate: { gte: currentMonthStart, lte: currentMonthEnd },
      },
      _sum: { total: true },
      _count: { id: true },
    });

    const prevCorntechSales = await this.prisma.corntechSale.aggregate({
      where: {
        branchId: { in: branchIds },
        saleDate: { gte: prevMonthStart, lte: prevMonthEnd },
      },
      _sum: { total: true },
    });
    const prevPosSales = await this.prisma.posSale.aggregate({
      where: {
        organizationId,
        saleDate: { gte: prevMonthStart, lte: prevMonthEnd },
      },
      _sum: { total: true },
    });

    let currentMonthSales =
      Number(currentCorntechSales._sum.total || 0) +
      Number(currentPosSales._sum.total || 0);
    let previousMonthSales =
      Number(prevCorntechSales._sum.total || 0) +
      Number(prevPosSales._sum.total || 0);
    const currentSaleCount =
      (currentCorntechSales._count.id || 0) +
      (currentPosSales._count.id || 0);

    const hasRealSales = currentMonthSales > 0 || previousMonthSales > 0;

    if (!hasRealSales) {
      // Mock based on branch count
      currentMonthSales = branchCount * 100 * 30 * 180;
      previousMonthSales = Math.round(currentMonthSales * (0.92 + Math.random() * 0.08));
    }

    const salesGrowth =
      previousMonthSales > 0
        ? Math.round(((currentMonthSales - previousMonthSales) / previousMonthSales) * 10000) / 100
        : 0;

    const averageTicket =
      currentSaleCount > 0
        ? Math.round((currentMonthSales / currentSaleCount) * 100) / 100
        : hasRealSales
          ? 0
          : 180;

    // --- Top selling products (from PosSaleItem) ---
    const topProducts = await this.prisma.posSaleItem.groupBy({
      by: ["productName"],
      where: {
        sale: {
          organizationId,
          saleDate: { gte: currentMonthStart, lte: currentMonthEnd },
        },
      },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    });

    let topSellingProducts = topProducts.map((p) => ({
      name: p.productName,
      quantity: Number(p._sum.quantity || 0),
      revenue: Math.round(Number(p._sum.total || 0) * 100) / 100,
    }));

    // If no POS items, try to extract from CorntechSale JSON items
    if (topSellingProducts.length === 0) {
      const corntechSalesRaw = await this.prisma.corntechSale.findMany({
        where: {
          branchId: { in: branchIds },
          saleDate: { gte: currentMonthStart, lte: currentMonthEnd },
        },
        select: { items: true },
        take: 500,
      });

      const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
      for (const sale of corntechSalesRaw) {
        const items = sale.items as Array<{ name?: string; quantity?: number; total?: number }>;
        if (Array.isArray(items)) {
          for (const item of items) {
            const name = item.name || "Desconocido";
            const existing = productMap.get(name) || { name, quantity: 0, revenue: 0 };
            existing.quantity += item.quantity || 1;
            existing.revenue += item.total || 0;
            productMap.set(name, existing);
          }
        }
      }

      topSellingProducts = Array.from(productMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map((p) => ({
          name: p.name,
          quantity: Math.round(p.quantity),
          revenue: Math.round(p.revenue * 100) / 100,
        }));
    }

    // If still nothing, generate mock top products
    if (topSellingProducts.length === 0) {
      topSellingProducts = [
        { name: "Poke Bowl Clasico", quantity: 1850, revenue: 333000 },
        { name: "Poke Bowl Premium", quantity: 1420, revenue: 312400 },
        { name: "Poke Bowl Salmon", quantity: 1180, revenue: 271400 },
        { name: "Limonada Natural", quantity: 2100, revenue: 105000 },
        { name: "Poke Bowl Atun", quantity: 960, revenue: 220800 },
      ];
    }

    // --- Top branches by sales ---
    const branchSales: { name: string; sales: number }[] = [];
    const allBranches = await this.prisma.branch.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true },
    });

    for (const br of allBranches) {
      const cAgg = await this.prisma.corntechSale.aggregate({
        where: {
          branchId: br.id,
          saleDate: { gte: currentMonthStart, lte: currentMonthEnd },
        },
        _sum: { total: true },
      });
      const pAgg = await this.prisma.posSale.aggregate({
        where: {
          branchId: br.id,
          saleDate: { gte: currentMonthStart, lte: currentMonthEnd },
        },
        _sum: { total: true },
      });
      const bSales = Number(cAgg._sum.total || 0) + Number(pAgg._sum.total || 0);
      branchSales.push({
        name: br.name,
        sales: bSales > 0 ? Math.round(bSales * 100) / 100 : Math.round(100 * 30 * 180 * (0.8 + Math.random() * 0.4)),
      });
    }

    const topBranches = branchSales
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    // --- Inventory turnover ---
    const inventoryAll = await this.prisma.branchInventory.findMany({
      where: { branchId: { in: branchIds } },
      include: { product: { select: { costPerUnit: true } } },
    });
    const avgInventoryValue = inventoryAll.reduce(
      (sum, inv) => sum + Number(inv.currentQuantity) * Number(inv.product.costPerUnit),
      0,
    );

    const cogsAgg = await this.prisma.purchaseOrder.aggregate({
      where: {
        organizationId,
        status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
        createdAt: { gte: currentMonthStart, lte: currentMonthEnd },
      },
      _sum: { total: true },
    });
    const cogs = Number(cogsAgg._sum.total || 0);

    const inventoryTurnover =
      avgInventoryValue > 0
        ? Math.round((cogs / avgInventoryValue) * 100) / 100
        : hasRealSales ? 0 : 2.8;

    // --- Cash position (bank balances) ---
    const bankAgg = await this.prisma.bankAccount.aggregate({
      where: { organizationId, isActive: true },
      _sum: { currentBalance: true },
    });
    const cashPosition = Math.round(Number(bankAgg._sum.currentBalance || 0) * 100) / 100;

    // --- Accounts payable ---
    const apAgg = await this.prisma.accountPayable.aggregate({
      where: {
        organizationId,
        status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      },
      _sum: { balanceDue: true },
    });
    const accountsPayable = Math.round(Number(apAgg._sum.balanceDue || 0) * 100) / 100;

    // --- Accounts receivable ---
    const arAgg = await this.prisma.accountReceivable.aggregate({
      where: {
        organizationId,
        status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      },
      _sum: { balanceDue: true },
    });
    const accountsReceivable = Math.round(Number(arAgg._sum.balanceDue || 0) * 100) / 100;

    // --- Employee cost ratio ---
    const payrollAgg = await this.prisma.payrollPeriod.aggregate({
      where: {
        organizationId,
        startDate: { gte: currentMonthStart },
        endDate: { lte: currentMonthEnd },
      },
      _sum: { totalEmployerCost: true, totalGross: true },
    });
    const payrollCost = Number(payrollAgg._sum.totalEmployerCost || 0) + Number(payrollAgg._sum.totalGross || 0);
    const employeeCostRatio =
      currentMonthSales > 0
        ? Math.round((payrollCost / currentMonthSales) * 10000) / 100
        : hasRealSales ? 0 : 18.5;

    return {
      currentMonthSales: Math.round(currentMonthSales * 100) / 100,
      previousMonthSales: Math.round(previousMonthSales * 100) / 100,
      salesGrowth,
      averageTicket,
      topSellingProducts,
      topBranches,
      inventoryTurnover,
      cashPosition,
      accountsPayable,
      accountsReceivable,
      employeeCostRatio,
    };
  }
}
