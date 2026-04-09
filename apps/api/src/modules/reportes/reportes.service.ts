import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class ReportesService {
  constructor(private prisma: PrismaService) {}

  async salesByBranch(
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
      const sales = await this.prisma.corntechSale.aggregate({
        where: {
          branchId: branch.id,
          saleDate: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        _sum: { total: true, subtotal: true, tax: true },
        _count: { id: true },
      });

      results.push({
        branchId: branch.id,
        branchName: branch.name,
        totalSales: Number(sales._sum.total || 0),
        totalOrders: sales._count.id,
        averageTicket: sales._count.id > 0 ? Number(sales._sum.total || 0) / sales._count.id : 0,
      });
    }

    return results;
  }

  async salesByProduct(
    organizationId: string,
    branchId: string,
    startDate: string,
    endDate: string,
  ) {
    // Get sales from corntech and group by product items within JSON
    const sales = await this.prisma.corntechSale.findMany({
      where: {
        branchId,
        saleDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      select: { items: true, total: true, saleDate: true },
    });

    // Aggregate items from JSON (items is a JSON array in each sale)
    const productMap = new Map<
      string,
      { productId: string; productName: string; quantitySold: number; totalRevenue: number }
    >();

    for (const sale of sales) {
      const items = sale.items as Array<{
        name?: string;
        quantity?: number;
        total?: number;
      }>;
      if (Array.isArray(items)) {
        for (const item of items) {
          const name = item.name || "Desconocido";
          const existing = productMap.get(name) || {
            productId: name,
            productName: name,
            quantitySold: 0,
            totalRevenue: 0,
          };
          existing.quantitySold += item.quantity || 1;
          existing.totalRevenue += item.total || 0;
          productMap.set(name, existing);
        }
      }
    }

    return Array.from(productMap.values())
      .map((p) => ({ ...p, averagePrice: p.quantitySold > 0 ? p.totalRevenue / p.quantitySold : 0 }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  async salesTrends(
    organizationId: string,
    branchId: string | undefined,
    startDate: string,
    endDate: string,
  ) {
    const where: any = {
      saleDate: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    };

    if (branchId) {
      where.branchId = branchId;
    } else {
      // Restrict to org branches
      const branches = await this.prisma.branch.findMany({
        where: { organizationId },
        select: { id: true },
      });
      where.branchId = { in: branches.map((b) => b.id) };
    }

    const sales = await this.prisma.corntechSale.findMany({
      where,
      select: {
        saleDate: true,
        total: true,
        branchId: true,
      },
      orderBy: { saleDate: "asc" },
    });

    // Group by date
    const dailyMap = new Map<
      string,
      { date: string; totalSales: number; totalOrders: number }
    >();

    for (const sale of sales) {
      const dateKey = sale.saleDate.toISOString().split("T")[0];
      const existing = dailyMap.get(dateKey) || {
        date: dateKey,
        totalSales: 0,
        totalOrders: 0,
      };
      existing.totalSales += Number(sale.total);
      existing.totalOrders += 1;
      dailyMap.set(dateKey, existing);
    }

    return Array.from(dailyMap.values()).map((d) => ({
      ...d,
      averageTicket: d.totalOrders > 0 ? d.totalSales / d.totalOrders : 0,
    }));
  }

  async cashClosingSummary(
    organizationId: string,
    branchId: string,
    startDate: string,
    endDate: string,
  ) {
    const closings = await this.prisma.corntechCashClosing.findMany({
      where: {
        branchId,
        closingDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: { closingDate: "desc" },
    });

    const totals = closings.reduce(
      (acc, c) => ({
        totalCash: acc.totalCash + Number(c.totalCash),
        totalCard: acc.totalCard + Number(c.totalCard),
        totalOther: acc.totalOther + Number(c.totalOther),
        expectedTotal: acc.expectedTotal + Number(c.expectedTotal),
        actualTotal: acc.actualTotal + Number(c.actualTotal),
        difference: acc.difference + Number(c.difference),
      }),
      {
        totalCash: 0,
        totalCard: 0,
        totalOther: 0,
        expectedTotal: 0,
        actualTotal: 0,
        difference: 0,
      },
    );

    return {
      closings,
      summary: totals,
      closingCount: closings.length,
    };
  }

  async inventoryValuation(organizationId: string, branchId?: string) {
    const where: any = {};
    if (branchId) {
      where.branchId = branchId;
    } else {
      const branches = await this.prisma.branch.findMany({
        where: { organizationId },
        select: { id: true },
      });
      where.branchId = { in: branches.map((b) => b.id) };
    }

    const inventory = await this.prisma.branchInventory.findMany({
      where,
      include: {
        product: {
          select: { name: true, sku: true, costPerUnit: true },
        },
        branch: { select: { name: true } },
      },
    });

    const items = inventory.map((inv) => ({
      branch: inv.branch.name,
      product: inv.product.name,
      sku: inv.product.sku,
      currentQuantity: Number(inv.currentQuantity),
      costPerUnit: Number(inv.product.costPerUnit),
      totalValue:
        Number(inv.currentQuantity) * Number(inv.product.costPerUnit),
    }));

    const totalValue = items.reduce((sum, i) => sum + i.totalValue, 0);

    return {
      items,
      totalValue: Math.round(totalValue * 100) / 100,
      itemCount: items.length,
    };
  }
}
