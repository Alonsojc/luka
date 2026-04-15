import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WhatsAppService } from "./whatsapp.service";

@Injectable()
export class AlertEngineService {
  private readonly logger = new Logger(AlertEngineService.name);

  constructor(
    private prisma: PrismaService,
    private whatsApp: WhatsAppService,
  ) {}

  // ---------------------------------------------------------------
  // Stock Alerts
  // ---------------------------------------------------------------

  async checkStockAlerts(organizationId: string) {
    const rules = await this.getActiveRules(organizationId, "STOCK_LOW");
    if (rules.length === 0) return { triggered: 0 };

    // Find products below minimum stock
    const _lowStockItems = await this.prisma.branchInventory.findMany({
      where: {
        branch: { organizationId },
        currentQuantity: { lt: this.prisma.$queryRawUnsafe as any },
      },
      include: {
        product: true,
        branch: true,
      },
    });

    // Use raw query for the self-referencing comparison
    const lowStock: Array<{
      branchName: string;
      productName: string;
      sku: string;
      currentStock: string;
      minimumStock: string;
      unit: string;
      branchId: string;
    }> = await this.prisma.$queryRaw`
      SELECT
        b.name as "branchName",
        p.name as "productName",
        p.sku,
        bi.current_quantity::text as "currentStock",
        bi.minimum_stock::text as "minimumStock",
        p.unit_of_measure as "unit",
        b.id as "branchId"
      FROM branch_inventory bi
      JOIN branches b ON b.id = bi.branch_id
      JOIN products p ON p.id = bi.product_id
      WHERE b.organization_id = ${organizationId}
        AND bi.current_quantity < bi.minimum_stock
        AND bi.minimum_stock > 0
    `;

    let triggered = 0;
    for (const rule of rules) {
      const conditions = rule.conditions as any;
      const branchFilter = conditions?.branchIds as string[] | undefined;

      const filtered = branchFilter?.length
        ? lowStock.filter((item) => branchFilter.includes(item.branchId))
        : lowStock;

      if (filtered.length === 0) continue;

      for (const item of filtered) {
        await this.processAlertRule(rule, {
          branchName: item.branchName,
          productName: item.productName,
          sku: item.sku,
          currentStock: item.currentStock,
          minimumStock: item.minimumStock,
          unit: item.unit,
        });
      }
      triggered++;
    }

    return { triggered, lowStockCount: lowStock.length };
  }

  // ---------------------------------------------------------------
  // Expiration Alerts
  // ---------------------------------------------------------------

  async checkExpirationAlerts(organizationId: string) {
    const rules = await this.getActiveRules(organizationId, "LOT_EXPIRING");
    if (rules.length === 0) return { triggered: 0 };

    let triggered = 0;
    for (const rule of rules) {
      const conditions = rule.conditions as any;
      const daysAhead = conditions?.daysAhead ?? 7;
      const branchFilter = conditions?.branchIds as string[] | undefined;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

      const where: any = {
        organization: { id: organizationId },
        status: "ACTIVE",
        expirationDate: { lte: cutoffDate },
        quantity: { gt: 0 },
      };
      if (branchFilter?.length) {
        where.branchId = { in: branchFilter };
      }

      const expiringLots = await this.prisma.productLot.findMany({
        where,
        include: {
          product: true,
          branch: true,
        },
        orderBy: { expirationDate: "asc" },
      });

      for (const lot of expiringLots) {
        const daysLeft = Math.ceil(
          (lot.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        await this.processAlertRule(rule, {
          branchName: lot.branch.name,
          productName: lot.product.name,
          lotNumber: lot.lotNumber,
          expirationDate: lot.expirationDate.toLocaleDateString("es-MX"),
          daysLeft: String(Math.max(0, daysLeft)),
          quantity: lot.quantity.toString(),
          unit: lot.product.unitOfMeasure,
        });
      }
      if (expiringLots.length > 0) triggered++;
    }

    return { triggered };
  }

  // ---------------------------------------------------------------
  // Requisition Alerts
  // ---------------------------------------------------------------

  async checkRequisitionAlerts(
    organizationId: string,
    requisitionId: string,
    event: "REQUISITION_NEW" | "REQUISITION_APPROVED",
  ) {
    const rules = await this.getActiveRules(organizationId, event);
    if (rules.length === 0) return { triggered: 0 };

    const requisition = await this.prisma.requisition.findFirst({
      where: { id: requisitionId, organizationId },
      include: {
        requestingBranch: true,
        requestedBy: true,
        approvedBy: true,
        items: true,
      },
    });

    if (!requisition) return { triggered: 0 };

    let triggered = 0;
    for (const rule of rules) {
      const variables: Record<string, string> = {
        branchName: requisition.requestingBranch.name,
        requestedBy: `${requisition.requestedBy.firstName} ${requisition.requestedBy.lastName}`,
        itemCount: String(requisition.items.length),
        priority: requisition.priority,
        deliveryDate: requisition.requestedDeliveryDate
          ? requisition.requestedDeliveryDate.toLocaleDateString("es-MX")
          : "Sin fecha",
        folio: requisition.id.slice(-8).toUpperCase(),
      };

      if (event === "REQUISITION_APPROVED" && requisition.approvedBy) {
        variables.approvedBy = `${requisition.approvedBy.firstName} ${requisition.approvedBy.lastName}`;
      }

      await this.processAlertRule(rule, variables);
      triggered++;
    }

    return { triggered };
  }

  // ---------------------------------------------------------------
  // Delivery Alerts
  // ---------------------------------------------------------------

  async checkDeliveryAlerts(organizationId: string, orderId: string) {
    const rules = await this.getActiveRules(organizationId, "DELIVERY_NEW");
    if (rules.length === 0) return { triggered: 0 };

    const order = await this.prisma.deliveryOrder.findFirst({
      where: { id: orderId, organizationId },
      include: { branch: true },
    });

    if (!order) return { triggered: 0 };

    let triggered = 0;
    for (const rule of rules) {
      await this.processAlertRule(rule, {
        branchName: order.branch?.name || "N/A",
        platform: order.platform,
        customerName: order.customerName || "N/A",
        total: order.total.toString(),
      });
      triggered++;
    }

    return { triggered };
  }

  // ---------------------------------------------------------------
  // Daily Summary
  // ---------------------------------------------------------------

  async sendDailySummary(organizationId: string) {
    const rules = await this.getActiveRules(organizationId, "DAILY_SUMMARY");
    if (rules.length === 0) return { triggered: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Gather summary data
    const [pendingRequisitions, lowStockCount, expiringLots, activeTransfers] = await Promise.all([
      this.prisma.requisition.count({
        where: { organizationId, status: { in: ["SUBMITTED", "APPROVED"] } },
      }),
      this.prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) as count
          FROM branch_inventory bi
          JOIN branches b ON b.id = bi.branch_id
          WHERE b.organization_id = ${organizationId}
            AND bi.current_quantity < bi.minimum_stock
            AND bi.minimum_stock > 0
        `.then((r) => Number(r[0]?.count ?? 0)),
      this.prisma.productLot.count({
        where: {
          organization: { id: organizationId },
          status: "ACTIVE",
          expirationDate: {
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          quantity: { gt: 0 },
        },
      }),
      this.prisma.interBranchTransfer.count({
        where: {
          fromBranch: { organizationId },
          status: { in: ["PENDING", "IN_TRANSIT"] },
        },
      }),
    ]);

    // Try to get sales total (from Corntech or POS sales)
    let totalSales: string;
    try {
      const salesResult = await this.prisma.posSale.aggregate({
        where: {
          organizationId,
          saleDate: { gte: today, lt: tomorrow },
        },
        _sum: { total: true },
      });
      totalSales = (salesResult._sum.total || 0).toString();
    } catch {
      // PosSale model may not have the right date filter — fallback
      totalSales = "N/A";
    }

    let triggered = 0;
    for (const rule of rules) {
      await this.processAlertRule(rule, {
        date: today.toLocaleDateString("es-MX"),
        totalSales,
        pendingRequisitions: String(pendingRequisitions),
        lowStockCount: String(lowStockCount),
        expiringLots: String(expiringLots),
        activeTransfers: String(activeTransfers),
      });
      triggered++;
    }

    return { triggered };
  }

  // ---------------------------------------------------------------
  // Core processing
  // ---------------------------------------------------------------

  async processAlertRule(
    rule: {
      id: string;
      organizationId: string;
      recipients: any;
      messageTemplate: string;
    },
    data: Record<string, string>,
  ) {
    const recipients = (rule.recipients as any[]) || [];
    const rendered = this.whatsApp.renderTemplate(rule.messageTemplate, data);

    const results = [];
    for (const recipient of recipients) {
      const result = await this.whatsApp.sendMessage(
        rule.organizationId,
        recipient.phone,
        rendered,
        rule.id,
      );
      results.push(result);
    }

    // Update last triggered timestamp
    await this.prisma.alertRule.update({
      where: { id: rule.id },
      data: { lastTriggeredAt: new Date() },
    });

    return results;
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  private async getActiveRules(organizationId: string, eventType: string) {
    return this.prisma.alertRule.findMany({
      where: {
        organizationId,
        eventType,
        isActive: true,
      },
    });
  }
}
