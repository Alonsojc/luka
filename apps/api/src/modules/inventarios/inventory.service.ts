import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getStockByBranch(organizationId: string, branchId: string) {
    return this.prisma.branchInventory.findMany({
      where: { branchId, branch: { organizationId } },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
    });
  }

  async adjustStock(
    organizationId: string,
    branchId: string,
    userId: string,
    data: {
      productId: string;
      quantity: number;
      notes?: string;
    },
  ) {
    await this.assertBranchAndProductBelongToOrganization(organizationId, branchId, data.productId);

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

  async getLowStockAlerts(organizationId: string, branchId: string) {
    // Find items where currentQuantity <= minimumStock using raw SQL
    // since Prisma doesn't support field-to-field comparison directly
    const alerts = await this.prisma.$queryRaw`
      SELECT bi.*, p.name as product_name, p.sku
      FROM branch_inventory bi
      JOIN products p ON p.id = bi.product_id
      JOIN branches b ON b.id = bi.branch_id
      WHERE bi.branch_id = ${branchId}
        AND b.organization_id = ${organizationId}
        AND bi.current_quantity <= bi.minimum_stock
        AND bi.minimum_stock > 0
      ORDER BY (bi.current_quantity / NULLIF(bi.minimum_stock, 0)) ASC
    `;
    return alerts;
  }

  async getMovements(organizationId: string, branchId: string, productId?: string) {
    return this.prisma.inventoryMovement.findMany({
      where: {
        branchId,
        branch: { organizationId },
        ...(productId && { productId, product: { organizationId } }),
      },
      include: { product: true },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
  }

  private async assertBranchAndProductBelongToOrganization(
    organizationId: string,
    branchId: string,
    productId: string,
  ) {
    const [branch, product] = await Promise.all([
      this.prisma.branch.findFirst({
        where: { id: branchId, organizationId },
        select: { id: true },
      }),
      this.prisma.product.findFirst({
        where: { id: productId, organizationId },
        select: { id: true },
      }),
    ]);

    if (!branch) {
      throw new BadRequestException("Sucursal no encontrada o no pertenece a la organizacion");
    }
    if (!product) {
      throw new BadRequestException("Producto no encontrado o no pertenece a la organizacion");
    }
  }
}
