import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getStockByBranch(branchId: string) {
    return this.prisma.branchInventory.findMany({
      where: { branchId },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
    });
  }

  async adjustStock(
    branchId: string,
    userId: string,
    data: {
      productId: string;
      quantity: number;
      notes?: string;
    },
  ) {
    const inventory = await this.prisma.branchInventory.findUnique({
      where: {
        branchId_productId: {
          branchId,
          productId: data.productId,
        },
      },
    });

    const adjustedQuantity = data.quantity;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.branchInventory.upsert({
        where: {
          branchId_productId: {
            branchId,
            productId: data.productId,
          },
        },
        update: {
          currentQuantity: adjustedQuantity,
          lastCountDate: new Date(),
          lastCountUserId: userId,
        },
        create: {
          branchId,
          productId: data.productId,
          currentQuantity: adjustedQuantity,
          lastCountDate: new Date(),
          lastCountUserId: userId,
        },
      });

      const previousQty = inventory ? Number(inventory.currentQuantity) : 0;
      const diff = adjustedQuantity - previousQty;

      await tx.inventoryMovement.create({
        data: {
          branchId,
          productId: data.productId,
          movementType: "ADJUSTMENT",
          quantity: diff,
          notes: data.notes || "Ajuste manual de inventario",
          userId,
        },
      });

      return updated;
    });

    return result;
  }

  async getLowStockAlerts(branchId: string) {
    // Find items where currentQuantity <= minimumStock using raw SQL
    // since Prisma doesn't support field-to-field comparison directly
    const alerts = await this.prisma.$queryRaw`
      SELECT bi.*, p.name as product_name, p.sku
      FROM branch_inventory bi
      JOIN products p ON p.id = bi.product_id
      WHERE bi.branch_id = ${branchId}
        AND bi.current_quantity <= bi.minimum_stock
        AND bi.minimum_stock > 0
      ORDER BY (bi.current_quantity / NULLIF(bi.minimum_stock, 0)) ASC
    `;
    return alerts;
  }

  async getMovements(branchId: string, productId?: string) {
    return this.prisma.inventoryMovement.findMany({
      where: {
        branchId,
        ...(productId && { productId }),
      },
      include: { product: true },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
  }
}
