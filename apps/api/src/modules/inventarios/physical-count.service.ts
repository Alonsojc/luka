import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { Prisma } from "@prisma/client";
const Decimal = Prisma.Decimal;

@Injectable()
export class PhysicalCountService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new physical count for a branch.
   * Auto-populates items from BranchInventory, snapshotting current system quantities.
   */
  async create(organizationId: string, branchId: string, userId: string, notes?: string) {
    // Verify the branch belongs to the organization
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId },
    });
    if (!branch) {
      throw new NotFoundException("Sucursal no encontrada");
    }

    // Check for existing open/in-progress count for this branch
    const existingCount = await this.prisma.physicalCount.findFirst({
      where: {
        organizationId,
        branchId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    });
    if (existingCount) {
      throw new BadRequestException(
        "Ya existe un conteo abierto o en progreso para esta sucursal. Finalice o cancele el conteo existente primero.",
      );
    }

    // Get all inventory items for this branch
    const inventoryItems = await this.prisma.branchInventory.findMany({
      where: { branchId },
      include: { product: true },
    });

    if (inventoryItems.length === 0) {
      throw new BadRequestException(
        "No hay productos en inventario para esta sucursal. Cargue inventario primero.",
      );
    }

    // Create the count with all items pre-populated
    const count = await this.prisma.physicalCount.create({
      data: {
        organizationId,
        branchId,
        startedById: userId,
        countDate: new Date(),
        notes,
        totalProducts: inventoryItems.length,
        items: {
          create: inventoryItems.map((inv) => ({
            productId: inv.productId,
            systemQuantity: inv.currentQuantity,
            unitCost: inv.product.costPerUnit,
          })),
        },
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        startedBy: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unitOfMeasure: true, costPerUnit: true },
            },
          },
        },
      },
    });

    return count;
  }

  /**
   * List physical counts with optional filters and pagination.
   */
  async getAll(
    organizationId: string,
    filters: {
      branchId?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
    page = 1,
    limit = 50,
  ) {
    const where: any = { organizationId };

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.countDate = {};
      if (filters.dateFrom) {
        where.countDate.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.countDate.lte = new Date(filters.dateTo + "T23:59:59.999Z");
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.physicalCount.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          startedBy: { select: { id: true, firstName: true, lastName: true } },
          completedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.physicalCount.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single physical count with all items and product details.
   */
  async getOne(organizationId: string, id: string) {
    const count = await this.prisma.physicalCount.findFirst({
      where: { id, organizationId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        startedBy: { select: { id: true, firstName: true, lastName: true } },
        completedBy: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                unitOfMeasure: true,
                costPerUnit: true,
              },
            },
          },
          orderBy: { product: { name: "asc" } },
        },
      },
    });

    if (!count) {
      throw new NotFoundException("Conteo fisico no encontrado");
    }

    return count;
  }

  /**
   * Update a single count item with counted quantity.
   * Auto-calculates difference and adjustmentValue.
   */
  async updateItem(
    organizationId: string,
    countId: string,
    itemId: string,
    data: { countedQuantity: number; notes?: string },
  ) {
    // Verify the count exists and is editable
    const count = await this.prisma.physicalCount.findFirst({
      where: { id: countId, organizationId },
    });
    if (!count) {
      throw new NotFoundException("Conteo fisico no encontrado");
    }
    if (count.status === "COMPLETED" || count.status === "CANCELLED") {
      throw new BadRequestException("Este conteo ya fue finalizado o cancelado");
    }

    // Get the item
    const item = await this.prisma.physicalCountItem.findFirst({
      where: { id: itemId, physicalCountId: countId },
    });
    if (!item) {
      throw new NotFoundException("Item de conteo no encontrado");
    }

    const countedQty = new Decimal(data.countedQuantity);
    const systemQty = item.systemQuantity;
    const difference = countedQty.minus(systemQty);
    const unitCost = item.unitCost || new Decimal(0);
    const adjustmentValue = difference.times(unitCost);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.physicalCountItem.update({
        where: { id: itemId },
        data: {
          countedQuantity: countedQty,
          difference,
          adjustmentValue,
          notes: data.notes,
          countedAt: new Date(),
        },
        include: {
          product: {
            select: { id: true, name: true, sku: true, unitOfMeasure: true, costPerUnit: true },
          },
        },
      });

      // Update count status to IN_PROGRESS if still OPEN
      if (count.status === "OPEN") {
        await tx.physicalCount.update({
          where: { id: countId },
          data: { status: "IN_PROGRESS" },
        });
      }

      return updatedItem;
    });

    return updated;
  }

  /**
   * Bulk update multiple count items at once.
   */
  async bulkUpdateItems(
    organizationId: string,
    countId: string,
    items: Array<{ itemId: string; countedQuantity: number; notes?: string }>,
  ) {
    const count = await this.prisma.physicalCount.findFirst({
      where: { id: countId, organizationId },
    });
    if (!count) {
      throw new NotFoundException("Conteo fisico no encontrado");
    }
    if (count.status === "COMPLETED" || count.status === "CANCELLED") {
      throw new BadRequestException("Este conteo ya fue finalizado o cancelado");
    }

    const results = await this.prisma.$transaction(async (tx) => {
      const updated = [];
      for (const entry of items) {
        const item = await tx.physicalCountItem.findFirst({
          where: { id: entry.itemId, physicalCountId: countId },
        });
        if (!item) continue;

        const countedQty = new Decimal(entry.countedQuantity);
        const systemQty = item.systemQuantity;
        const difference = countedQty.minus(systemQty);
        const unitCost = item.unitCost || new Decimal(0);
        const adjustmentValue = difference.times(unitCost);

        const updatedItem = await tx.physicalCountItem.update({
          where: { id: entry.itemId },
          data: {
            countedQuantity: countedQty,
            difference,
            adjustmentValue,
            notes: entry.notes,
            countedAt: new Date(),
          },
          include: {
            product: {
              select: { id: true, name: true, sku: true, unitOfMeasure: true, costPerUnit: true },
            },
          },
        });
        updated.push(updatedItem);
      }

      // Update status to IN_PROGRESS if OPEN
      if (count.status === "OPEN") {
        await tx.physicalCount.update({
          where: { id: countId },
          data: { status: "IN_PROGRESS" },
        });
      }

      return updated;
    });

    return results;
  }

  /**
   * Complete a physical count:
   * - Calculate totals
   * - Generate ADJUSTMENT movements for each item with a difference
   * - Update BranchInventory
   * - Set status to COMPLETED
   */
  async complete(organizationId: string, countId: string, userId: string) {
    const count = await this.prisma.physicalCount.findFirst({
      where: { id: countId, organizationId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, costPerUnit: true } },
          },
        },
      },
    });

    if (!count) {
      throw new NotFoundException("Conteo fisico no encontrado");
    }
    if (count.status === "COMPLETED") {
      throw new BadRequestException("Este conteo ya fue finalizado");
    }
    if (count.status === "CANCELLED") {
      throw new BadRequestException("Este conteo fue cancelado");
    }

    // All items must have been counted
    const uncountedItems = count.items.filter((item) => item.countedQuantity === null);
    if (uncountedItems.length > 0) {
      throw new BadRequestException(
        `Hay ${uncountedItems.length} producto(s) sin contar. Cuente todos los productos antes de finalizar.`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let totalDiscrepancies = 0;
      let totalAdjustmentValue = new Decimal(0);

      for (const item of count.items) {
        const diff = item.difference;
        if (!diff || diff.equals(new Decimal(0))) continue;

        totalDiscrepancies++;
        if (item.adjustmentValue) {
          totalAdjustmentValue = totalAdjustmentValue.plus(item.adjustmentValue);
        }

        // Create InventoryMovement for each adjustment
        await tx.inventoryMovement.create({
          data: {
            branchId: count.branchId,
            productId: item.productId,
            movementType: "ADJUSTMENT",
            quantity: diff,
            unitCost: item.unitCost,
            referenceType: "physical_count",
            referenceId: count.id,
            notes: `Ajuste por conteo fisico #${count.id.slice(-6).toUpperCase()}`,
            userId,
          },
        });

        // Update BranchInventory to match counted quantity
        await tx.branchInventory.upsert({
          where: {
            branchId_productId: {
              branchId: count.branchId,
              productId: item.productId,
            },
          },
          update: {
            currentQuantity: item.countedQuantity!,
            lastCountDate: new Date(),
            lastCountUserId: userId,
          },
          create: {
            branchId: count.branchId,
            productId: item.productId,
            currentQuantity: item.countedQuantity!,
            lastCountDate: new Date(),
            lastCountUserId: userId,
          },
        });
      }

      // Also update lastCountDate for items with NO difference
      for (const item of count.items) {
        if (item.difference && !item.difference.equals(new Decimal(0))) continue;
        await tx.branchInventory.updateMany({
          where: {
            branchId: count.branchId,
            productId: item.productId,
          },
          data: {
            lastCountDate: new Date(),
            lastCountUserId: userId,
          },
        });
      }

      // Finalize the count
      const completed = await tx.physicalCount.update({
        where: { id: countId },
        data: {
          status: "COMPLETED",
          completedById: userId,
          completedAt: new Date(),
          totalProducts: count.items.length,
          totalDiscrepancies,
          totalAdjustmentValue,
        },
        include: {
          branch: { select: { id: true, name: true, code: true } },
          startedBy: { select: { id: true, firstName: true, lastName: true } },
          completedBy: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true, unitOfMeasure: true, costPerUnit: true },
              },
            },
          },
        },
      });

      return completed;
    });

    return result;
  }

  /**
   * Cancel an open or in-progress physical count.
   */
  async cancel(organizationId: string, countId: string) {
    const count = await this.prisma.physicalCount.findFirst({
      where: { id: countId, organizationId },
    });
    if (!count) {
      throw new NotFoundException("Conteo fisico no encontrado");
    }
    if (count.status === "COMPLETED") {
      throw new BadRequestException("No se puede cancelar un conteo ya finalizado");
    }
    if (count.status === "CANCELLED") {
      throw new BadRequestException("Este conteo ya fue cancelado");
    }

    return this.prisma.physicalCount.update({
      where: { id: countId },
      data: { status: "CANCELLED" },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        startedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Get completed counts history for a specific branch.
   */
  async getHistory(organizationId: string, branchId: string) {
    return this.prisma.physicalCount.findMany({
      where: {
        organizationId,
        branchId,
        status: "COMPLETED",
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        startedBy: { select: { id: true, firstName: true, lastName: true } },
        completedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 50,
    });
  }
}
