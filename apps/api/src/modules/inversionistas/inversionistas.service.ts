import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class InversionistasService {
  constructor(private prisma: PrismaService) {}

  async profitabilityByBranch(
    organizationId: string,
    startDate: string,
    endDate: string,
  ) {
    const branches = await this.prisma.branch.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, code: true },
    });

    const results = [];

    for (const branch of branches) {
      // Revenue: sales totals
      const sales = await this.prisma.corntechSale.aggregate({
        where: {
          branchId: branch.id,
          saleDate: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        _sum: { total: true },
        _count: { id: true },
      });

      // Costs: purchase orders received
      const purchases = await this.prisma.purchaseOrder.aggregate({
        where: {
          branchId: branch.id,
          status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        _sum: { total: true },
      });

      // Labor cost: payroll receipts for this branch
      const payroll = await this.prisma.payrollReceipt.aggregate({
        where: {
          branchId: branch.id,
          payrollPeriod: {
            startDate: { gte: new Date(startDate) },
            endDate: { lte: new Date(endDate) },
          },
        },
        _sum: {
          grossSalary: true,
          employerImss: true,
          employerRcv: true,
          employerInfonavit: true,
        },
      });

      const revenue = Number(sales._sum.total || 0);
      const costOfGoods = Number(purchases._sum.total || 0);
      const laborCost =
        Number(payroll._sum.grossSalary || 0) +
        Number(payroll._sum.employerImss || 0) +
        Number(payroll._sum.employerRcv || 0) +
        Number(payroll._sum.employerInfonavit || 0);

      const grossProfit = revenue - costOfGoods;
      const netProfit = grossProfit - laborCost;
      const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

      results.push({
        branch,
        revenue: Math.round(revenue * 100) / 100,
        costOfGoods: Math.round(costOfGoods * 100) / 100,
        laborCost: Math.round(laborCost * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        marginPercent: Math.round(margin * 100) / 100,
        transactions: sales._count.id,
      });
    }

    return results;
  }

  async consolidatedPnL(
    organizationId: string,
    startDate: string,
    endDate: string,
  ) {
    const branches = await this.prisma.branch.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const branchIds = branches.map((b) => b.id);

    // Total revenue
    const salesAgg = await this.prisma.corntechSale.aggregate({
      where: {
        branchId: { in: branchIds },
        saleDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      _sum: { total: true, subtotal: true, tax: true },
      _count: { id: true },
    });

    // Total COGS
    const purchasesAgg = await this.prisma.purchaseOrder.aggregate({
      where: {
        organizationId,
        status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      _sum: { total: true },
    });

    // Total payroll
    const payrollAgg = await this.prisma.payrollPeriod.aggregate({
      where: {
        organizationId,
        startDate: { gte: new Date(startDate) },
        endDate: { lte: new Date(endDate) },
      },
      _sum: {
        totalGross: true,
        totalEmployerCost: true,
        totalNet: true,
      },
    });

    const revenue = Number(salesAgg._sum.total || 0);
    const cogs = Number(purchasesAgg._sum.total || 0);
    const laborCost = Number(payrollAgg._sum.totalEmployerCost || 0);
    const grossProfit = revenue - cogs;
    const operatingProfit = grossProfit - laborCost;

    return {
      period: { startDate, endDate },
      revenue: Math.round(revenue * 100) / 100,
      cogs: Math.round(cogs * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMargin:
        revenue > 0
          ? Math.round((grossProfit / revenue) * 10000) / 100
          : 0,
      laborCost: Math.round(laborCost * 100) / 100,
      operatingProfit: Math.round(operatingProfit * 100) / 100,
      operatingMargin:
        revenue > 0
          ? Math.round((operatingProfit / revenue) * 10000) / 100
          : 0,
      transactionCount: salesAgg._count.id,
    };
  }

  async roiSummary(
    organizationId: string,
    startDate: string,
    endDate: string,
  ) {
    // Get profitability data
    const pnl = await this.consolidatedPnL(
      organizationId,
      startDate,
      endDate,
    );

    // Get total bank account balances as proxy for invested capital
    const bankAccounts = await this.prisma.bankAccount.aggregate({
      where: { organizationId, isActive: true },
      _sum: { currentBalance: true },
    });

    // Get inventory valuation
    const branches = await this.prisma.branch.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const branchIds = branches.map((b) => b.id);

    const inventory = await this.prisma.branchInventory.findMany({
      where: { branchId: { in: branchIds } },
      include: {
        product: { select: { costPerUnit: true } },
      },
    });

    const inventoryValue = inventory.reduce(
      (sum, inv) =>
        sum + Number(inv.currentQuantity) * Number(inv.product.costPerUnit),
      0,
    );

    const totalAssets =
      Number(bankAccounts._sum.currentBalance || 0) + inventoryValue;

    const roi =
      totalAssets > 0
        ? (pnl.operatingProfit / totalAssets) * 100
        : 0;

    return {
      period: pnl.period,
      operatingProfit: pnl.operatingProfit,
      totalBankBalance: Math.round(
        Number(bankAccounts._sum.currentBalance || 0) * 100,
      ) / 100,
      inventoryValue: Math.round(inventoryValue * 100) / 100,
      totalAssets: Math.round(totalAssets * 100) / 100,
      roiPercent: Math.round(roi * 100) / 100,
      revenue: pnl.revenue,
      grossMargin: pnl.grossMargin,
      operatingMargin: pnl.operatingMargin,
    };
  }
}
