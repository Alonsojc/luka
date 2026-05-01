import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { Prisma } from "@luka/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CacheService } from "../../common/cache/cache.service";
import { JwtPayload } from "../../common/decorators/current-user.decorator";
import { UpdateReconciliationReviewDto } from "./dto/update-reconciliation-review.dto";

const _REPORT_TTL = 300; // 5 minutes
const DECIMAL_EPSILON = 0.0001;
const LOT_STOCK_STATUSES = ["ACTIVE", "LOW", "EXPIRED"];
const LOT_TERMINAL_STATUSES = ["CONSUMED", "DISPOSED"];

interface DateRange {
  start: Date;
  end: Date;
}

interface PosSaleAggregate {
  branchId: string;
  branchName: string;
  branchCode: string | null;
  productSku: string;
  productName: string;
  quantitySold: number;
  revenue: number;
  saleIds: Set<string>;
}

type ReviewStatus = "OPEN" | "REVIEWED" | "RESOLVED" | "IGNORED";

interface ReconciliationReviewSummary {
  openCount: number;
  reviewedCount: number;
  resolvedCount: number;
  ignoredCount: number;
}

interface ReconciliationIssueReview {
  status: ReviewStatus;
  note: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  resolvedAt: Date | null;
  ignoredAt: Date | null;
  updatedAt: Date | null;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function stockKey(branchId: string, productId: string): string {
  return `${branchId}:${productId}`;
}

function issueFingerprint(parts: Array<string | number | null | undefined>): string {
  const payload = parts
    .map((part) => (part === null || part === undefined ? "" : String(part).trim()))
    .join("|");

  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function openReview(): ReconciliationIssueReview {
  return {
    status: "OPEN",
    note: null,
    reviewedById: null,
    reviewedByName: null,
    reviewedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    updatedAt: null,
  };
}

function reviewSummaryFromIssues(
  issues: Array<{ review?: ReconciliationIssueReview }>,
): ReconciliationReviewSummary {
  return issues.reduce(
    (summary, issue) => {
      const status = issue.review?.status ?? "OPEN";
      if (status === "REVIEWED") summary.reviewedCount++;
      else if (status === "RESOLVED") summary.resolvedCount++;
      else if (status === "IGNORED") summary.ignoredCount++;
      else summary.openCount++;
      return summary;
    },
    { openCount: 0, reviewedCount: 0, resolvedCount: 0, ignoredCount: 0 },
  );
}

@Injectable()
export class ReportesService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  private get reconciliationReviewDelegate() {
    return (this.prisma as any).operationalReconciliationReview as {
      findMany(args: any): Promise<any[]>;
      upsert(args: any): Promise<any>;
    };
  }

  async updateOperationalReconciliationIssueReview(
    organizationId: string,
    user: JwtPayload,
    issueFingerprint: string,
    dto: UpdateReconciliationReviewDto,
  ) {
    const note = dto.note?.trim() || null;

    if (["RESOLVED", "IGNORED"].includes(dto.reviewStatus) && !note) {
      throw new BadRequestException("La nota es obligatoria para resolver o ignorar incidencias");
    }

    const now = new Date();
    const review = await this.reconciliationReviewDelegate.upsert({
      where: {
        organizationId_issueFingerprint: {
          organizationId,
          issueFingerprint,
        },
      },
      create: {
        organizationId,
        issueFingerprint,
        issueArea: dto.issueArea || "UNKNOWN",
        issueType: dto.issueType || null,
        issueStatus: dto.issueStatus || "UNKNOWN",
        branchId: dto.branchId || null,
        branchName: dto.branchName || null,
        referenceId: dto.referenceId || null,
        productId: dto.productId || null,
        productSku: dto.productSku || null,
        reviewStatus: dto.reviewStatus,
        note,
        reviewedById: user.sub,
        reviewedByName: user.email,
        reviewedAt: now,
        resolvedAt: dto.reviewStatus === "RESOLVED" ? now : null,
        ignoredAt: dto.reviewStatus === "IGNORED" ? now : null,
      },
      update: {
        issueArea: dto.issueArea || undefined,
        issueType: dto.issueType ?? undefined,
        issueStatus: dto.issueStatus || undefined,
        branchId: dto.branchId ?? undefined,
        branchName: dto.branchName ?? undefined,
        referenceId: dto.referenceId ?? undefined,
        productId: dto.productId ?? undefined,
        productSku: dto.productSku ?? undefined,
        reviewStatus: dto.reviewStatus,
        note,
        reviewedById: user.sub,
        reviewedByName: user.email,
        reviewedAt: now,
        resolvedAt: dto.reviewStatus === "RESOLVED" ? now : null,
        ignoredAt: dto.reviewStatus === "IGNORED" ? now : null,
      },
    });

    return {
      issueFingerprint: review.issueFingerprint,
      review: this.formatIssueReview(review),
    };
  }

  async salesByBranch(organizationId: string, startDate: string, endDate: string) {
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

    const salesMap = new Map(salesAgg.map((s) => [s.branchId, s]));

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
      averagePrice: r.quantity_sold > 0 ? r.total_revenue / r.quantity_sold : 0,
    }));
  }

  async salesTrends(
    organizationId: string,
    branchId: string | undefined,
    startDate: string,
    endDate: string,
  ) {
    const branchCondition = branchId ? Prisma.sql`AND cs.branch_id = ${branchId}` : Prisma.empty;

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
      averageTicket: d.total_orders > 0 ? d.total_sales / d.total_orders : 0,
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
      totalValue: Number(inv.currentQuantity) * Number(inv.product.costPerUnit),
    }));

    const totalValue = items.reduce((sum, i) => sum + i.totalValue, 0);

    return {
      items,
      totalValue: Math.round(totalValue * 100) / 100,
      itemCount: items.length,
    };
  }

  async operationalReconciliation(
    organizationId: string,
    filters: { startDate?: string; endDate?: string; branchId?: string },
  ) {
    const range = this.normalizeDateRange(filters.startDate, filters.endDate);

    const [posInventory, cedisTransfers, foodCost, deliveryNetRevenue, inventoryIntegrity] =
      await Promise.all([
        this.getPosInventoryReconciliation(organizationId, range, filters.branchId),
        this.getTransferDispatchReconciliation(organizationId, range, filters.branchId),
        this.getFoodCostReconciliation(organizationId, range, filters.branchId),
        this.getDeliveryNetRevenueReconciliation(organizationId, range, filters.branchId),
        this.getInventoryIntegrityReconciliation(organizationId, filters.branchId),
      ]);

    const issueCount =
      posInventory.summary.issueCount +
      cedisTransfers.summary.issueCount +
      foodCost.summary.issueCount +
      deliveryNetRevenue.summary.issueCount +
      inventoryIntegrity.summary.issueCount;

    return {
      period: {
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
        branchId: filters.branchId ?? null,
      },
      status: issueCount > 0 ? "REVIEW_REQUIRED" : "OK",
      issueCount,
      posInventory,
      cedisTransfers,
      foodCost,
      deliveryNetRevenue,
      inventoryIntegrity,
    };
  }

  private async getPosInventoryReconciliation(
    organizationId: string,
    range: DateRange,
    branchId?: string,
  ) {
    const sales = await this.getPosSaleItemAggregates(organizationId, range, branchId);
    const movements = await this.getSaleMovementAggregates(organizationId, sales.saleIds, branchId);

    const keys = new Set([...sales.byBranchSku.keys(), ...movements.keys()]);
    const rows = [...keys]
      .map((key) => {
        const sale = sales.byBranchSku.get(key);
        const movement = movements.get(key);
        const soldQuantity = sale?.quantitySold ?? 0;
        const deductedQuantity = movement?.deductedQuantity ?? 0;
        const difference = round4(soldQuantity - deductedQuantity);
        const status =
          Math.abs(difference) <= DECIMAL_EPSILON
            ? "OK"
            : soldQuantity === 0
              ? "ORPHAN_DEDUCTION"
              : deductedQuantity === 0
                ? "MISSING_DEDUCTION"
                : "QUANTITY_MISMATCH";

        return {
          branchId: sale?.branchId ?? movement?.branchId ?? null,
          branchName: sale?.branchName ?? movement?.branchName ?? "Desconocida",
          branchCode: sale?.branchCode ?? movement?.branchCode ?? null,
          productSku: sale?.productSku ?? movement?.productSku ?? "SIN_SKU",
          productName: sale?.productName ?? movement?.productName ?? "Desconocido",
          soldQuantity: round4(soldQuantity),
          deductedQuantity: round4(deductedQuantity),
          difference,
          revenue: round2(sale?.revenue ?? 0),
          actualCost: round2(movement?.actualCost ?? 0),
          status,
        };
      })
      .sort(
        (a, b) =>
          a.branchName.localeCompare(b.branchName) || a.productSku.localeCompare(b.productSku),
      );

    const issues = rows.filter((row) => row.status !== "OK");

    return {
      summary: {
        saleCount: sales.saleIds.length,
        saleLineCount: sales.itemCount,
        totalSoldQuantity: round4(rows.reduce((sum, row) => sum + row.soldQuantity, 0)),
        totalDeductedQuantity: round4(rows.reduce((sum, row) => sum + row.deductedQuantity, 0)),
        issueCount: issues.length,
      },
      rows,
      issues,
    };
  }

  private async getTransferDispatchReconciliation(
    organizationId: string,
    range: DateRange,
    branchId?: string,
  ) {
    const andConditions: any[] = [
      {
        OR: [
          { createdAt: { gte: range.start, lte: range.end } },
          { completedAt: { gte: range.start, lte: range.end } },
        ],
      },
    ];

    if (branchId) {
      andConditions.push({
        OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
      });
    }

    const transfers = await this.prisma.interBranchTransfer.findMany({
      where: {
        fromBranch: { organizationId },
        toBranch: { organizationId },
        status: { in: ["IN_TRANSIT", "RECEIVED"] },
        AND: andConditions,
      },
      include: {
        fromBranch: { select: { id: true, name: true, code: true } },
        toBranch: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, unitOfMeasure: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = transfers.flatMap((transfer) =>
      transfer.items.map((item) => {
        const requestedQuantity = toNumber(item.requestedQuantity);
        const sentQuantity = toNumber(item.sentQuantity);
        const receivedQuantity = toNumber(item.receivedQuantity);
        const difference = round4(sentQuantity - receivedQuantity);
        const status =
          transfer.status === "IN_TRANSIT" && sentQuantity > 0
            ? "PENDING_RECEIPT"
            : Math.abs(difference) <= DECIMAL_EPSILON
              ? "OK"
              : "RECEIVED_SHORT";

        return {
          transferId: transfer.id,
          status,
          transferStatus: transfer.status,
          fromBranchId: transfer.fromBranchId,
          fromBranchName: transfer.fromBranch.name,
          toBranchId: transfer.toBranchId,
          toBranchName: transfer.toBranch.name,
          productId: item.productId,
          productSku: item.product.sku,
          productName: item.product.name,
          unitOfMeasure: item.product.unitOfMeasure,
          requestedQuantity: round4(requestedQuantity),
          sentQuantity: round4(sentQuantity),
          receivedQuantity: round4(receivedQuantity),
          difference,
          createdAt: transfer.createdAt,
          completedAt: transfer.completedAt,
        };
      }),
    );

    const issues = rows.filter((row) => row.status !== "OK");

    return {
      summary: {
        transferCount: transfers.length,
        lineCount: rows.length,
        pendingReceiptCount: rows.filter((row) => row.status === "PENDING_RECEIPT").length,
        receivedShortCount: rows.filter((row) => row.status === "RECEIVED_SHORT").length,
        issueCount: issues.length,
      },
      rows,
      issues,
    };
  }

  private async getFoodCostReconciliation(
    organizationId: string,
    range: DateRange,
    branchId?: string,
  ) {
    const sales = await this.getPosSaleItemAggregates(organizationId, range, branchId);
    const movements = await this.getSaleMovementAggregates(organizationId, sales.saleIds, branchId);

    const salesBySku = new Map<
      string,
      { productSku: string; productName: string; quantitySold: number; revenue: number }
    >();

    for (const sale of sales.byBranchSku.values()) {
      const existing = salesBySku.get(sale.productSku);
      if (existing) {
        existing.quantitySold += sale.quantitySold;
        existing.revenue += sale.revenue;
      } else {
        salesBySku.set(sale.productSku, {
          productSku: sale.productSku,
          productName: sale.productName,
          quantitySold: sale.quantitySold,
          revenue: sale.revenue,
        });
      }
    }

    const skus = [...salesBySku.keys()];
    const productNames = [...new Set([...salesBySku.values()].map((sale) => sale.productName))];
    const recipes =
      skus.length > 0 || productNames.length > 0
        ? await this.prisma.recipe.findMany({
            where: {
              organizationId,
              isActive: true,
              OR: [
                ...(skus.length > 0 ? [{ corntechProductId: { in: skus } }] : []),
                ...(productNames.length > 0 ? [{ menuItemName: { in: productNames } }] : []),
              ],
            },
            select: {
              id: true,
              menuItemName: true,
              corntechProductId: true,
              costPerServing: true,
              sellingPrice: true,
            },
          })
        : [];

    const recipeBySku = new Map(
      recipes
        .filter((recipe) => recipe.corntechProductId)
        .map((recipe) => [recipe.corntechProductId!, recipe]),
    );
    const recipeByName = new Map(
      recipes.map((recipe) => [normalizeKey(recipe.menuItemName), recipe]),
    );

    const actualCostBySku = new Map<string, number>();
    for (const movement of movements.values()) {
      actualCostBySku.set(
        movement.productSku,
        (actualCostBySku.get(movement.productSku) ?? 0) + movement.actualCost,
      );
    }

    const rows = [...salesBySku.values()]
      .map((sale) => {
        const recipe =
          recipeBySku.get(sale.productSku) ?? recipeByName.get(normalizeKey(sale.productName));
        const costPerServing = toNumber(recipe?.costPerServing);
        const theoreticalCost = costPerServing * sale.quantitySold;
        const actualCost = actualCostBySku.get(sale.productSku) ?? 0;
        const costDifference = actualCost - theoreticalCost;
        const tolerance = Math.max(5, theoreticalCost * 0.05);
        const status = !recipe
          ? "MISSING_RECIPE"
          : costPerServing <= 0
            ? "MISSING_RECIPE_COST"
            : actualCost <= DECIMAL_EPSILON && theoreticalCost > DECIMAL_EPSILON
              ? "MISSING_DEDUCTION"
              : Math.abs(costDifference) > tolerance
                ? "COST_MISMATCH"
                : "OK";

        return {
          productSku: sale.productSku,
          productName: sale.productName,
          recipeId: recipe?.id ?? null,
          recipeName: recipe?.menuItemName ?? null,
          quantitySold: round4(sale.quantitySold),
          revenue: round2(sale.revenue),
          theoreticalCost: round2(theoreticalCost),
          actualCost: round2(actualCost),
          costDifference: round2(costDifference),
          theoreticalFoodCostPct:
            sale.revenue > 0 ? round2((theoreticalCost / sale.revenue) * 100) : 0,
          actualFoodCostPct: sale.revenue > 0 ? round2((actualCost / sale.revenue) * 100) : 0,
          status,
        };
      })
      .sort((a, b) => a.productSku.localeCompare(b.productSku));

    const issues = rows.filter((row) => row.status !== "OK");

    return {
      summary: {
        skuCount: rows.length,
        totalRevenue: round2(rows.reduce((sum, row) => sum + row.revenue, 0)),
        theoreticalCost: round2(rows.reduce((sum, row) => sum + row.theoreticalCost, 0)),
        actualCost: round2(rows.reduce((sum, row) => sum + row.actualCost, 0)),
        issueCount: issues.length,
      },
      rows,
      issues,
    };
  }

  private async getDeliveryNetRevenueReconciliation(
    organizationId: string,
    range: DateRange,
    branchId?: string,
  ) {
    const orders = await this.prisma.deliveryOrder.findMany({
      where: {
        organizationId,
        ...(branchId ? { branchId } : {}),
        orderDate: { gte: range.start, lte: range.end },
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { orderDate: "desc" },
    });

    const byPlatform = new Map<
      string,
      {
        platform: string;
        orderCount: number;
        grossRevenue: number;
        deliveryFees: number;
        platformFees: number;
        discounts: number;
        recordedNetRevenue: number;
        recalculatedNetRevenue: number;
      }
    >();

    const rows = orders.map((order) => {
      const grossRevenue = toNumber(order.total);
      const deliveryFee = toNumber(order.deliveryFee);
      const platformFee = toNumber(order.platformFee);
      const discount = toNumber(order.discount);
      const recalculatedNetRevenue = grossRevenue - deliveryFee - platformFee;
      const recordedNetRevenue =
        order.netRevenue === null || order.netRevenue === undefined
          ? recalculatedNetRevenue
          : toNumber(order.netRevenue);
      const delta = recordedNetRevenue - recalculatedNetRevenue;
      const status =
        Math.abs(delta) > 0.01
          ? "NET_REVENUE_MISMATCH"
          : recalculatedNetRevenue < 0
            ? "NEGATIVE_NET_REVENUE"
            : "OK";

      const platformSummary = byPlatform.get(order.platform) ?? {
        platform: order.platform,
        orderCount: 0,
        grossRevenue: 0,
        deliveryFees: 0,
        platformFees: 0,
        discounts: 0,
        recordedNetRevenue: 0,
        recalculatedNetRevenue: 0,
      };
      platformSummary.orderCount++;
      platformSummary.grossRevenue += grossRevenue;
      platformSummary.deliveryFees += deliveryFee;
      platformSummary.platformFees += platformFee;
      platformSummary.discounts += discount;
      platformSummary.recordedNetRevenue += recordedNetRevenue;
      platformSummary.recalculatedNetRevenue += recalculatedNetRevenue;
      byPlatform.set(order.platform, platformSummary);

      return {
        orderId: order.id,
        platform: order.platform,
        externalOrderId: order.externalOrderId,
        branchId: order.branchId,
        branchName: order.branch?.name ?? "Sin sucursal",
        orderDate: order.orderDate,
        grossRevenue: round2(grossRevenue),
        deliveryFee: round2(deliveryFee),
        platformFee: round2(platformFee),
        discount: round2(discount),
        recordedNetRevenue: round2(recordedNetRevenue),
        recalculatedNetRevenue: round2(recalculatedNetRevenue),
        delta: round2(delta),
        feePct: grossRevenue > 0 ? round2(((deliveryFee + platformFee) / grossRevenue) * 100) : 0,
        status,
      };
    });

    const issues = rows.filter((row) => row.status !== "OK");
    const grossRevenue = rows.reduce((sum, row) => sum + row.grossRevenue, 0);
    const totalFees = rows.reduce((sum, row) => sum + row.deliveryFee + row.platformFee, 0);

    return {
      summary: {
        orderCount: orders.length,
        grossRevenue: round2(grossRevenue),
        deliveryFees: round2(rows.reduce((sum, row) => sum + row.deliveryFee, 0)),
        platformFees: round2(rows.reduce((sum, row) => sum + row.platformFee, 0)),
        discounts: round2(rows.reduce((sum, row) => sum + row.discount, 0)),
        recordedNetRevenue: round2(rows.reduce((sum, row) => sum + row.recordedNetRevenue, 0)),
        recalculatedNetRevenue: round2(
          rows.reduce((sum, row) => sum + row.recalculatedNetRevenue, 0),
        ),
        feePct: grossRevenue > 0 ? round2((totalFees / grossRevenue) * 100) : 0,
        issueCount: issues.length,
      },
      byPlatform: [...byPlatform.values()].map((platform) => ({
        ...platform,
        grossRevenue: round2(platform.grossRevenue),
        deliveryFees: round2(platform.deliveryFees),
        platformFees: round2(platform.platformFees),
        discounts: round2(platform.discounts),
        recordedNetRevenue: round2(platform.recordedNetRevenue),
        recalculatedNetRevenue: round2(platform.recalculatedNetRevenue),
        feePct:
          platform.grossRevenue > 0
            ? round2(
                ((platform.deliveryFees + platform.platformFees) / platform.grossRevenue) * 100,
              )
            : 0,
      })),
      rows,
      issues,
    };
  }

  private async getIssueReviewsByFingerprint(
    organizationId: string,
    fingerprints: string[],
  ): Promise<Map<string, ReconciliationIssueReview>> {
    const uniqueFingerprints = [...new Set(fingerprints.filter(Boolean))];
    if (uniqueFingerprints.length === 0) {
      return new Map();
    }

    const reviews = await this.reconciliationReviewDelegate.findMany({
      where: {
        organizationId,
        issueFingerprint: { in: uniqueFingerprints },
      },
    });

    return new Map(
      reviews.map((review) => [review.issueFingerprint, this.formatIssueReview(review)]),
    );
  }

  private formatIssueReview(review: {
    reviewStatus: ReviewStatus;
    note: string | null;
    reviewedById: string | null;
    reviewedByName: string | null;
    reviewedAt: Date | null;
    resolvedAt: Date | null;
    ignoredAt: Date | null;
    updatedAt: Date;
  }): ReconciliationIssueReview {
    return {
      status: review.reviewStatus,
      note: review.note,
      reviewedById: review.reviewedById,
      reviewedByName: review.reviewedByName,
      reviewedAt: review.reviewedAt,
      resolvedAt: review.resolvedAt,
      ignoredAt: review.ignoredAt,
      updatedAt: review.updatedAt,
    };
  }

  private async getInventoryIntegrityReconciliation(organizationId: string, branchId?: string) {
    const [inventories, stockLots, terminalLots, transferLotAllocations, linkedRequisitions] =
      await Promise.all([
        this.prisma.branchInventory.findMany({
          where: {
            ...(branchId ? { branchId } : {}),
            branch: { organizationId },
            product: { organizationId },
            currentQuantity: { not: 0 },
          },
          include: {
            branch: { select: { id: true, name: true, code: true } },
            product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
          },
        }),
        this.prisma.productLot.findMany({
          where: {
            organizationId,
            ...(branchId ? { branchId } : {}),
            status: { in: LOT_STOCK_STATUSES },
            quantity: { not: 0 },
          },
          include: {
            branch: { select: { id: true, name: true, code: true } },
            product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
          },
        }),
        this.prisma.productLot.findMany({
          where: {
            organizationId,
            ...(branchId ? { branchId } : {}),
            status: { in: LOT_TERMINAL_STATUSES },
            quantity: { gt: 0 },
          },
          include: {
            branch: { select: { id: true, name: true, code: true } },
            product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
          },
          orderBy: [{ updatedAt: "desc" }],
        }),
        this.prisma.interBranchTransferLotAllocation.findMany({
          where: {
            quantity: { gt: 0 },
            transferItem: {
              transfer: {
                fromBranch: { organizationId },
                toBranch: { organizationId },
                status: { in: ["IN_TRANSIT", "RECEIVED"] },
                ...(branchId ? { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] } : {}),
              },
            },
          },
          include: {
            sourceLot: { select: { id: true, status: true, quantity: true } },
            transferItem: {
              include: {
                product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
                transfer: {
                  include: {
                    fromBranch: { select: { id: true, name: true, code: true } },
                    toBranch: { select: { id: true, name: true, code: true } },
                  },
                },
              },
            },
          },
          orderBy: [{ expirationDate: "asc" }, { createdAt: "asc" }],
        }),
        this.prisma.requisition.findMany({
          where: {
            organizationId,
            status: "APPROVED",
            transferId: { not: null },
            ...(branchId
              ? { OR: [{ requestingBranchId: branchId }, { fulfillingBranchId: branchId }] }
              : {}),
          },
          include: {
            requestingBranch: { select: { id: true, name: true, code: true } },
            fulfillingBranch: { select: { id: true, name: true, code: true } },
            items: { select: { id: true, approvedQuantity: true, requestedQuantity: true } },
          },
          orderBy: { updatedAt: "desc" },
        }),
      ]);

    const inventoryByPair = new Map<string, (typeof inventories)[number]>();
    for (const inventory of inventories) {
      inventoryByPair.set(stockKey(inventory.branchId, inventory.productId), inventory);
    }

    const lotByPair = new Map<
      string,
      {
        branchId: string;
        productId: string;
        branch: (typeof stockLots)[number]["branch"];
        product: (typeof stockLots)[number]["product"];
        quantity: number;
      }
    >();

    for (const lot of stockLots) {
      const key = stockKey(lot.branchId, lot.productId);
      const existing = lotByPair.get(key);
      if (existing) {
        existing.quantity += toNumber(lot.quantity);
      } else {
        lotByPair.set(key, {
          branchId: lot.branchId,
          productId: lot.productId,
          branch: lot.branch,
          product: lot.product,
          quantity: toNumber(lot.quantity),
        });
      }
    }

    const stockKeys = new Set([...inventoryByPair.keys(), ...lotByPair.keys()]);
    const stockRows = [...stockKeys]
      .map((key) => {
        const inventory = inventoryByPair.get(key);
        const lotGroup = lotByPair.get(key);
        const lotQuantity = round4(lotGroup?.quantity ?? 0);
        const stockQuantity = round4(toNumber(inventory?.currentQuantity));
        const difference = round4(stockQuantity - lotQuantity);
        const status =
          Math.abs(difference) <= DECIMAL_EPSILON
            ? "OK"
            : stockQuantity > 0 && lotQuantity <= DECIMAL_EPSILON
              ? "STOCK_WITHOUT_LOTS"
              : stockQuantity <= DECIMAL_EPSILON && lotQuantity > 0
                ? "LOTS_WITHOUT_STOCK"
                : "LOT_STOCK_MISMATCH";

        return {
          type: "LOT_STOCK_BALANCE",
          fingerprint: issueFingerprint([
            "INVENTORY_INTEGRITY",
            "LOT_STOCK_BALANCE",
            status,
            inventory?.branchId ?? lotGroup?.branchId,
            inventory?.productId ?? lotGroup?.productId,
            stockQuantity,
            lotQuantity,
            difference,
          ]),
          branchId: inventory?.branchId ?? lotGroup?.branchId ?? null,
          branchName: inventory?.branch.name ?? lotGroup?.branch.name ?? "Sucursal desconocida",
          branchCode: inventory?.branch.code ?? lotGroup?.branch.code ?? null,
          productId: inventory?.productId ?? lotGroup?.productId ?? null,
          productSku: inventory?.product.sku ?? lotGroup?.product.sku ?? null,
          productName: inventory?.product.name ?? lotGroup?.product.name ?? "Producto desconocido",
          unitOfMeasure:
            inventory?.product.unitOfMeasure ?? lotGroup?.product.unitOfMeasure ?? null,
          stockQuantity,
          lotQuantity,
          difference,
          status,
        };
      })
      .sort(
        (a, b) =>
          a.branchName.localeCompare(b.branchName) ||
          String(a.productSku ?? "").localeCompare(String(b.productSku ?? "")),
      );

    const stockMismatches = stockRows.filter((row) => row.status !== "OK");

    const terminalLotIssues = terminalLots.map((lot) => ({
      type: "TERMINAL_LOT_WITH_STOCK",
      fingerprint: issueFingerprint([
        "INVENTORY_INTEGRITY",
        "TERMINAL_LOT_WITH_STOCK",
        lot.id,
        lot.status,
        round4(toNumber(lot.quantity)),
      ]),
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      status: "TERMINAL_LOT_WITH_STOCK",
      lotStatus: lot.status,
      branchId: lot.branchId,
      branchName: lot.branch.name,
      branchCode: lot.branch.code,
      productId: lot.productId,
      productSku: lot.product.sku,
      productName: lot.product.name,
      unitOfMeasure: lot.product.unitOfMeasure,
      quantity: round4(toNumber(lot.quantity)),
      updatedAt: lot.updatedAt,
    }));

    const transferLotIssues = transferLotAllocations
      .map((allocation) => {
        const allocatedQuantity = toNumber(allocation.quantity);
        const receivedQuantity = toNumber(allocation.receivedQuantity);
        const pendingQuantity = round4(allocatedQuantity - receivedQuantity);
        const transfer = allocation.transferItem.transfer;

        return {
          type: "TRANSFER_LOT_ALLOCATION",
          fingerprint: issueFingerprint([
            "INVENTORY_INTEGRITY",
            "TRANSFER_LOT_ALLOCATION",
            transfer.status,
            allocation.id,
            transfer.id,
            pendingQuantity,
          ]),
          allocationId: allocation.id,
          transferId: transfer.id,
          transferItemId: allocation.transferItemId,
          status:
            transfer.status === "RECEIVED" ? "RECEIVED_ALLOCATION_SHORT" : "IN_TRANSIT_LOT_PENDING",
          transferStatus: transfer.status,
          fromBranchId: transfer.fromBranchId,
          fromBranchName: transfer.fromBranch.name,
          toBranchId: transfer.toBranchId,
          toBranchName: transfer.toBranch.name,
          productId: allocation.transferItem.productId,
          productSku: allocation.transferItem.product.sku,
          productName: allocation.transferItem.product.name,
          unitOfMeasure: allocation.transferItem.product.unitOfMeasure,
          lotNumber: allocation.lotNumber,
          sourceLotId: allocation.sourceLotId,
          sourceLotStatus: allocation.sourceLot?.status ?? null,
          allocatedQuantity: round4(allocatedQuantity),
          receivedQuantity: round4(receivedQuantity),
          pendingQuantity,
          expirationDate: allocation.expirationDate,
        };
      })
      .filter((row) => row.pendingQuantity > DECIMAL_EPSILON);

    const stalledRequisitions = await this.getStalledLinkedRequisitions(
      organizationId,
      linkedRequisitions,
    );

    const issues = [
      ...stockMismatches,
      ...terminalLotIssues,
      ...transferLotIssues,
      ...stalledRequisitions,
    ];
    const reviewsByFingerprint = await this.getIssueReviewsByFingerprint(
      organizationId,
      issues.map((issue) => issue.fingerprint),
    );
    const withReview = <T extends { fingerprint: string }>(issue: T) => ({
      ...issue,
      review: reviewsByFingerprint.get(issue.fingerprint) ?? openReview(),
    });
    const stockMismatchesWithReview = stockMismatches.map(withReview);
    const terminalLotIssuesWithReview = terminalLotIssues.map(withReview);
    const transferLotIssuesWithReview = transferLotIssues.map(withReview);
    const stalledRequisitionsWithReview = stalledRequisitions.map(withReview);
    const issuesWithReview = [
      ...stockMismatchesWithReview,
      ...terminalLotIssuesWithReview,
      ...transferLotIssuesWithReview,
      ...stalledRequisitionsWithReview,
    ];

    return {
      summary: {
        stockPairCount: stockRows.length,
        stockMismatchCount: stockMismatches.length,
        terminalLotCount: terminalLotIssues.length,
        transferLotIssueCount: transferLotIssues.length,
        stalledRequisitionCount: stalledRequisitions.length,
        issueCount: issues.length,
        review: reviewSummaryFromIssues(issuesWithReview),
      },
      stockRows,
      stockMismatches: stockMismatchesWithReview,
      terminalLots: terminalLotIssuesWithReview,
      transferLotAllocations: transferLotIssuesWithReview,
      stalledRequisitions: stalledRequisitionsWithReview,
      issues: issuesWithReview,
    };
  }

  private async getStalledLinkedRequisitions(
    organizationId: string,
    requisitions: Array<{
      id: string;
      status: string;
      priority: string;
      transferId: string | null;
      createdAt: Date;
      updatedAt: Date;
      requestingBranchId: string;
      fulfillingBranchId: string | null;
      requestingBranch: { id: string; name: string; code: string | null };
      fulfillingBranch: { id: string; name: string; code: string | null } | null;
      items: Array<{ id: string; approvedQuantity: unknown; requestedQuantity: unknown }>;
    }>,
  ) {
    const transferIds = requisitions
      .map((requisition) => requisition.transferId)
      .filter((id): id is string => Boolean(id));

    if (transferIds.length === 0) {
      return [];
    }

    const transfers = await this.prisma.interBranchTransfer.findMany({
      where: {
        id: { in: transferIds },
        fromBranch: { organizationId },
        toBranch: { organizationId },
      },
      include: {
        items: true,
      },
    });
    const transferById = new Map(transfers.map((transfer) => [transfer.id, transfer]));

    return requisitions
      .map((requisition) => {
        const transfer = requisition.transferId
          ? transferById.get(requisition.transferId)
          : undefined;
        const transferStatus = transfer?.status ?? "MISSING";
        const status = !transfer
          ? "LINKED_TRANSFER_MISSING"
          : ["PENDING", "APPROVED"].includes(transfer.status)
            ? "TRANSFER_NOT_SHIPPED"
            : transfer.status === "IN_TRANSIT"
              ? "TRANSFER_NOT_RECEIVED"
              : transfer.status === "RECEIVED"
                ? "REQUISITION_STATUS_NOT_CLOSED"
                : transfer.status === "CANCELLED"
                  ? "TRANSFER_CANCELLED_REQUISITION_OPEN"
                  : "OK";
        const requestedQuantity = round4(
          requisition.items.reduce(
            (sum, item) => sum + toNumber(item.approvedQuantity ?? item.requestedQuantity),
            0,
          ),
        );

        return {
          type: "APPROVED_REQUISITION_WITH_OPEN_TRANSFER",
          fingerprint: issueFingerprint([
            "INVENTORY_INTEGRITY",
            "APPROVED_REQUISITION_WITH_OPEN_TRANSFER",
            status,
            requisition.id,
            requisition.transferId,
            transferStatus,
            requestedQuantity,
            transfer?.items.length ?? 0,
          ]),
          requisitionId: requisition.id,
          status,
          requisitionStatus: requisition.status,
          priority: requisition.priority,
          transferId: requisition.transferId,
          transferStatus,
          requestingBranchId: requisition.requestingBranchId,
          requestingBranchName: requisition.requestingBranch.name,
          fulfillingBranchId: requisition.fulfillingBranchId,
          fulfillingBranchName: requisition.fulfillingBranch?.name ?? null,
          itemCount: requisition.items.length,
          requestedQuantity,
          transferLineCount: transfer?.items.length ?? 0,
          createdAt: requisition.createdAt,
          updatedAt: requisition.updatedAt,
        };
      })
      .filter((row) => row.status !== "OK");
  }

  private async getPosSaleItemAggregates(
    organizationId: string,
    range: DateRange,
    branchId?: string,
  ) {
    const items = await this.prisma.posSaleItem.findMany({
      where: {
        sale: {
          organizationId,
          ...(branchId ? { branchId } : {}),
          saleDate: { gte: range.start, lte: range.end },
        },
      },
      include: {
        sale: {
          include: {
            branch: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    const byBranchSku = new Map<string, PosSaleAggregate>();
    const saleIds = new Set<string>();

    for (const item of items) {
      saleIds.add(item.saleId);
      const key = `${item.sale.branchId}:${item.productSku}`;
      const existing = byBranchSku.get(key);
      if (existing) {
        existing.quantitySold += toNumber(item.quantity);
        existing.revenue += toNumber(item.total);
        existing.saleIds.add(item.saleId);
      } else {
        byBranchSku.set(key, {
          branchId: item.sale.branchId,
          branchName: item.sale.branch.name,
          branchCode: item.sale.branch.code,
          productSku: item.productSku,
          productName: item.productName,
          quantitySold: toNumber(item.quantity),
          revenue: toNumber(item.total),
          saleIds: new Set([item.saleId]),
        });
      }
    }

    return {
      itemCount: items.length,
      saleIds: [...saleIds],
      byBranchSku,
    };
  }

  private async getSaleMovementAggregates(
    organizationId: string,
    saleIds: string[],
    branchId?: string,
  ) {
    const result = new Map<
      string,
      {
        branchId: string;
        branchName: string;
        branchCode: string | null;
        productSku: string;
        productName: string;
        deductedQuantity: number;
        actualCost: number;
      }
    >();

    if (saleIds.length === 0) {
      return result;
    }

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        movementType: "SALE_DEDUCTION",
        referenceType: "pos_sale",
        referenceId: { in: saleIds },
        branch: { organizationId },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        product: { select: { sku: true, name: true, costPerUnit: true } },
      },
    });

    for (const movement of movements) {
      const key = `${movement.branchId}:${movement.product.sku}`;
      const quantity = toNumber(movement.quantity);
      const unitCost = toNumber(movement.unitCost) || toNumber(movement.product.costPerUnit);
      const existing = result.get(key);

      if (existing) {
        existing.deductedQuantity += quantity;
        existing.actualCost += quantity * unitCost;
      } else {
        result.set(key, {
          branchId: movement.branchId,
          branchName: movement.branch.name,
          branchCode: movement.branch.code,
          productSku: movement.product.sku,
          productName: movement.product.name,
          deductedQuantity: quantity,
          actualCost: quantity * unitCost,
        });
      }
    }

    return result;
  }

  private normalizeDateRange(startDate?: string, endDate?: string): DateRange {
    const end = endDate ? new Date(endDate) : new Date();
    if (Number.isNaN(end.getTime())) {
      throw new BadRequestException("endDate invalida");
    }
    end.setHours(23, 59, 59, 999);

    const start = startDate ? new Date(startDate) : new Date(end);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException("startDate invalida");
    }
    if (!startDate) {
      start.setDate(end.getDate() - 7);
    }
    start.setHours(0, 0, 0, 0);

    if (start > end) {
      throw new BadRequestException("startDate no puede ser posterior a endDate");
    }

    return { start, end };
  }
}
