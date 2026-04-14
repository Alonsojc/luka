import { Injectable } from "@nestjs/common";
import { Prisma } from "@luka/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CacheService } from "../../common/cache/cache.service";

const REPORT_TTL = 300; // 5 minutes

@Injectable()
export class ReportesService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async salesByBranch(
    organizationId: string,
    startDate: string,
    endDate: string,
  ) {
    const branches = await this.prisma.branch.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, code: true },
    });

    if (branches.length === 0) return [];

    const branchIds = branches.map((b) => b.id);

    // Single aggregation query instead of N+1
    const salesAgg = await this.prisma.corntechSale.groupBy({
      by: ["branchId"],
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

    const salesMap = new Map(
      salesAgg.map((s) => [s.branchId, s]),
    );

    return branches.map((branch) => {
      const agg = salesMap.get(branch.id);
      const totalSales = Number(agg?._sum.total || 0);
      const totalOrders = agg?._count.id || 0;
      return {
        branchId: branch.id,
        branchName: branch.name,
        totalSales,
        totalOrders,
        averageTicket: totalOrders > 0 ? totalSales / totalOrders : 0,
      };
    });
  }

  async salesByProduct(
    organizationId: string,
    branchId: string,
    startDate: string,
    endDate: string,
  ) {
    // Aggregate items directly in PostgreSQL using jsonb_array_elements
    const results = await this.prisma.$queryRaw<
      Array<{
        product_name: string;
        quantity_sold: number;
        total_revenue: number;
      }>
    >`
      SELECT
        item->>'name' AS product_name,
        SUM(COALESCE((item->>'quantity')::numeric, 1))::float AS quantity_sold,
        SUM(COALESCE((item->>'total')::numeric, 0))::float AS total_revenue
      FROM corntech_sales cs,
        jsonb_array_elements(cs.items) AS item
      WHERE cs.branch_id = ${branchId}
        AND cs.sale_date >= ${new Date(startDate)}
        AND cs.sale_date <= ${new Date(endDate)}
        AND cs.branch_id IN (
          SELECT id FROM branches WHERE organization_id = ${organizationId}
        )
      GROUP BY item->>'name'
      ORDER BY total_revenue DESC
    `;

    return results.map((r) => ({
      productId: r.product_name,
      productName: r.product_name || "Desconocido",
      quantitySold: r.quantity_sold,
      totalRevenue: r.total_revenue,
      averagePrice:
        r.quantity_sold > 0 ? r.total_revenue / r.quantity_sold : 0,
    }));
  }

  async salesTrends(
    organizationId: string,
    branchId: string | undefined,
    startDate: string,
    endDate: string,
  ) {
    const branchCondition = branchId
      ? Prisma.sql`AND cs.branch_id = ${branchId}`
      : Prisma.empty;

    const results = await this.prisma.$queryRaw<
      Array<{
        date: string;
        total_sales: number;
        total_orders: number;
      }>
    >(Prisma.sql`
      SELECT
        cs.sale_date::date::text AS date,
        SUM(cs.total)::float AS total_sales,
        COUNT(cs.id)::int AS total_orders
      FROM corntech_sales cs
      JOIN branches b ON b.id = cs.branch_id
      WHERE b.organization_id = ${organizationId}
        AND cs.sale_date >= ${new Date(startDate)}
        AND cs.sale_date <= ${new Date(endDate)}
        ${branchCondition}
      GROUP BY cs.sale_date::date
      ORDER BY cs.sale_date::date ASC
    `);

    return results.map((d) => ({
      date: d.date,
      totalSales: d.total_sales,
      totalOrders: d.total_orders,
      averageTicket:
        d.total_orders > 0 ? d.total_sales / d.total_orders : 0,
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
