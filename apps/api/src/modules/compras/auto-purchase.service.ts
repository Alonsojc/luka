import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

interface ReorderAlert {
  product: {
    id: string;
    sku: string;
    name: string;
    unitOfMeasure: string;
    costPerUnit: number;
  };
  branch: { id: string; name: string; branchType: string };
  currentQuantity: number;
  minimumStock: number;
  deficit: number;
  suggestedOrderQty: number;
  preferredSupplier: {
    id: string;
    name: string;
  } | null;
  lastPrice: number | null;
}

interface SupplierGroup {
  supplier: { id: string; name: string };
  items: Array<{
    product: { id: string; sku: string; name: string; unitOfMeasure: string };
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
}

interface GenerateResult {
  ordersCreated: number;
  totalItems: number;
  totalValue: number;
  orders: Array<{
    id: string;
    supplierId: string;
    supplierName: string;
    itemCount: number;
    total: number;
  }>;
}

@Injectable()
export class AutoPurchaseService {
  constructor(private prisma: PrismaService) {}

  /**
   * Find all products below minimum stock for a given org/branch.
   */
  async getReorderAlerts(
    organizationId: string,
    branchId?: string,
    multiplier = 1.5,
  ): Promise<ReorderAlert[]> {
    // If no branchId given, default to CEDIS branches
    const branchFilter: any = branchId ? { branchId } : { branch: { branchType: "CEDIS" } };

    const lowStock = await this.prisma.branchInventory.findMany({
      where: {
        ...branchFilter,
        branch: {
          ...branchFilter.branch,
          organizationId,
        },
        // Prisma: currentQuantity < minimumStock via raw filter
        // Since Prisma doesn't support column-to-column comparisons directly,
        // we fetch all and filter in app
      },
      include: {
        product: true,
        branch: true,
      },
    });

    // Filter: currentQuantity < minimumStock
    const belowMinimum = lowStock.filter((inv) => {
      const current = Number(inv.currentQuantity);
      const minimum = Number(inv.minimumStock);
      return minimum > 0 && current < minimum;
    });

    // For each product, find preferred supplier
    const alerts: ReorderAlert[] = [];

    for (const inv of belowMinimum) {
      const current = Number(inv.currentQuantity);
      const minimum = Number(inv.minimumStock);
      const deficit = minimum - current;
      const suggestedOrderQty = Math.ceil(deficit * multiplier);

      const preferred = await this.getPreferredSupplier(organizationId, inv.productId);

      alerts.push({
        product: {
          id: inv.product.id,
          sku: inv.product.sku,
          name: inv.product.name,
          unitOfMeasure: inv.product.unitOfMeasure,
          costPerUnit: Number(inv.product.costPerUnit),
        },
        branch: {
          id: inv.branch.id,
          name: inv.branch.name,
          branchType: inv.branch.branchType,
        },
        currentQuantity: current,
        minimumStock: minimum,
        deficit,
        suggestedOrderQty,
        preferredSupplier: preferred?.supplier ?? null,
        lastPrice: preferred?.unitPrice ?? null,
      });
    }

    // Sort: most critical first (lowest stock ratio)
    alerts.sort((a, b) => {
      const ratioA = a.minimumStock > 0 ? a.currentQuantity / a.minimumStock : 1;
      const ratioB = b.minimumStock > 0 ? b.currentQuantity / b.minimumStock : 1;
      return ratioA - ratioB;
    });

    return alerts;
  }

  /**
   * Find the best supplier for a product based on current price history.
   */
  async getPreferredSupplier(
    organizationId: string,
    productId: string,
  ): Promise<{
    supplier: { id: string; name: string };
    unitPrice: number;
  } | null> {
    const now = new Date();

    const currentPrices = await this.prisma.supplierPriceHistory.findMany({
      where: {
        productId,
        supplier: { organizationId },
        effectiveDate: { lte: now },
        OR: [{ expiresDate: null }, { expiresDate: { gt: now } }],
      },
      include: {
        supplier: { select: { id: true, name: true, isActive: true } },
      },
      orderBy: { unitPrice: "asc" },
    });

    // Pick active supplier with lowest price
    const best = currentPrices.find((p) => p.supplier.isActive);
    if (!best) return null;

    return {
      supplier: { id: best.supplier.id, name: best.supplier.name },
      unitPrice: Number(best.unitPrice),
    };
  }

  /**
   * Preview what purchase orders would be generated (without creating them).
   */
  async previewPurchaseOrders(
    organizationId: string,
    branchId: string,
    multiplier = 1.5,
  ): Promise<{ supplierGroups: SupplierGroup[]; grandTotal: number }> {
    const alerts = await this.getReorderAlerts(organizationId, branchId, multiplier);

    return this.groupAlertsBySupplier(alerts);
  }

  /**
   * Actually create DRAFT purchase orders from reorder alerts.
   */
  async generatePurchaseOrders(
    organizationId: string,
    branchId: string,
    userId: string,
    options?: { multiplier?: number; productIds?: string[] },
  ): Promise<GenerateResult> {
    const multiplier = options?.multiplier ?? 1.5;

    let alerts = await this.getReorderAlerts(organizationId, branchId, multiplier);

    // If specific products requested, filter
    if (options?.productIds?.length) {
      alerts = alerts.filter((a) => options.productIds!.includes(a.product.id));
    }

    if (alerts.length === 0) {
      return { ordersCreated: 0, totalItems: 0, totalValue: 0, orders: [] };
    }

    const { supplierGroups } = this.groupAlertsBySupplier(alerts);

    const createdOrders: GenerateResult["orders"] = [];

    for (const group of supplierGroups) {
      const po = await this.prisma.purchaseOrder.create({
        data: {
          organizationId,
          branchId,
          supplierId: group.supplier.id,
          createdById: userId,
          subtotal: group.subtotal,
          tax: group.tax,
          total: group.total,
          notes: "Orden generada automaticamente por reabastecimiento",
          items: {
            create: group.items.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitOfMeasure: item.product.unitOfMeasure,
            })),
          },
        },
      });

      createdOrders.push({
        id: po.id,
        supplierId: group.supplier.id,
        supplierName: group.supplier.name,
        itemCount: group.items.length,
        total: group.total,
      });
    }

    return {
      ordersCreated: createdOrders.length,
      totalItems: createdOrders.reduce((sum, o) => sum + o.itemCount, 0),
      totalValue: createdOrders.reduce((sum, o) => sum + o.total, 0),
      orders: createdOrders,
    };
  }

  /**
   * Dashboard summary for reorder status across all branches.
   */
  async getReorderSummary(organizationId: string) {
    const allInventory = await this.prisma.branchInventory.findMany({
      where: {
        branch: { organizationId },
      },
      include: {
        product: true,
        branch: { select: { id: true, name: true, branchType: true } },
      },
    });

    const belowMinimum = allInventory.filter((inv) => {
      const current = Number(inv.currentQuantity);
      const minimum = Number(inv.minimumStock);
      return minimum > 0 && current < minimum;
    });

    // Products below minimum by branch
    const byBranch: Record<string, { branchId: string; branchName: string; count: number }> = {};
    for (const inv of belowMinimum) {
      if (!byBranch[inv.branch.id]) {
        byBranch[inv.branch.id] = {
          branchId: inv.branch.id,
          branchName: inv.branch.name,
          count: 0,
        };
      }
      byBranch[inv.branch.id].count++;
    }

    // Estimate reorder value and count by supplier
    const supplierVolume: Record<
      string,
      { supplierId: string; supplierName: string; value: number; count: number }
    > = {};
    let totalEstimatedValue = 0;
    const supplierIds = new Set<string>();

    for (const inv of belowMinimum) {
      const deficit = Number(inv.minimumStock) - Number(inv.currentQuantity);
      const qty = Math.ceil(deficit * 1.5);
      const preferred = await this.getPreferredSupplier(organizationId, inv.productId);

      const unitPrice = preferred?.unitPrice ?? Number(inv.product.costPerUnit);
      const lineValue = qty * unitPrice;
      totalEstimatedValue += lineValue;

      if (preferred) {
        supplierIds.add(preferred.supplier.id);
        if (!supplierVolume[preferred.supplier.id]) {
          supplierVolume[preferred.supplier.id] = {
            supplierId: preferred.supplier.id,
            supplierName: preferred.supplier.name,
            value: 0,
            count: 0,
          };
        }
        supplierVolume[preferred.supplier.id].value += lineValue;
        supplierVolume[preferred.supplier.id].count += 1;
      }
    }

    const branchesRanked = Object.values(byBranch).sort((a, b) => b.count - a.count);
    const topSuppliers = Object.values(supplierVolume).sort((a, b) => b.value - a.value);

    return {
      totalProductsBelowMinimum: belowMinimum.length,
      totalEstimatedValue,
      totalSuppliersNeeded: supplierIds.size,
      byBranch: branchesRanked,
      topSuppliers,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private groupAlertsBySupplier(alerts: ReorderAlert[]): {
    supplierGroups: SupplierGroup[];
    grandTotal: number;
  } {
    // Separate alerts with and without suppliers
    const withSupplier = alerts.filter((a) => a.preferredSupplier);
    const withoutSupplier = alerts.filter((a) => !a.preferredSupplier);

    const grouped: Record<string, SupplierGroup> = {};

    for (const alert of withSupplier) {
      const sid = alert.preferredSupplier!.id;
      if (!grouped[sid]) {
        grouped[sid] = {
          supplier: alert.preferredSupplier!,
          items: [],
          subtotal: 0,
          tax: 0,
          total: 0,
        };
      }

      const unitPrice = alert.lastPrice ?? Number(alert.product.costPerUnit);
      const subtotal = alert.suggestedOrderQty * unitPrice;

      grouped[sid].items.push({
        product: {
          id: alert.product.id,
          sku: alert.product.sku,
          name: alert.product.name,
          unitOfMeasure: alert.product.unitOfMeasure,
        },
        quantity: alert.suggestedOrderQty,
        unitPrice,
        subtotal,
      });
    }

    // If there are items without supplier, group them under a "sin proveedor" group
    if (withoutSupplier.length > 0) {
      const noSupplierItems = withoutSupplier.map((alert) => {
        const unitPrice = Number(alert.product.costPerUnit);
        return {
          product: {
            id: alert.product.id,
            sku: alert.product.sku,
            name: alert.product.name,
            unitOfMeasure: alert.product.unitOfMeasure,
          },
          quantity: alert.suggestedOrderQty,
          unitPrice,
          subtotal: alert.suggestedOrderQty * unitPrice,
        };
      });

      grouped["__no_supplier__"] = {
        supplier: { id: "", name: "Sin proveedor asignado" },
        items: noSupplierItems,
        subtotal: 0,
        tax: 0,
        total: 0,
      };
    }

    // Calculate totals per group
    let grandTotal = 0;
    const supplierGroups = Object.values(grouped).map((g) => {
      g.subtotal = g.items.reduce((sum, i) => sum + i.subtotal, 0);
      g.tax = g.subtotal * 0.16;
      g.total = g.subtotal + g.tax;
      grandTotal += g.total;
      return g;
    });

    return { supplierGroups, grandTotal };
  }
}
