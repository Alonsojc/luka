import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { JwtPayload } from "../../common/decorators/current-user.decorator";

@Injectable()
export class InventoryLoadService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Load inventory into a branch (manual load — array of items with productId).
   */
  async loadInventory(
    caller: JwtPayload,
    data: {
      branchId: string;
      items: Array<{
        productId: string;
        quantity: number;
        unitCost?: number;
        notes?: string;
      }>;
    },
  ) {
    // Validate branch belongs to org
    const branch = await this.prisma.branch.findFirst({
      where: { id: data.branchId, organizationId: caller.organizationId },
    });
    if (!branch) {
      throw new BadRequestException("Sucursal no encontrada o no pertenece a la organizacion");
    }

    // Validate all products exist in the organization
    const productIds = data.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId: caller.organizationId },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const missing = productIds.filter((id) => !productMap.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Productos no encontrados: ${missing.join(", ")}`);
    }

    let totalItems = 0;
    let totalQuantity = 0;
    let totalCost = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const item of data.items) {
        const product = productMap.get(item.productId)!;
        const unitCost = item.unitCost ?? Number(product.costPerUnit);

        // Create IN movement
        await tx.inventoryMovement.create({
          data: {
            branchId: data.branchId,
            productId: item.productId,
            movementType: "IN",
            quantity: item.quantity,
            unitCost,
            referenceType: "inventory_load",
            notes: item.notes || "Carga de inventario",
            userId: caller.sub,
          },
        });

        // Upsert branch inventory
        await tx.branchInventory.upsert({
          where: {
            branchId_productId: {
              branchId: data.branchId,
              productId: item.productId,
            },
          },
          update: {
            currentQuantity: { increment: item.quantity },
            lastCountDate: new Date(),
            lastCountUserId: caller.sub,
          },
          create: {
            branchId: data.branchId,
            productId: item.productId,
            currentQuantity: item.quantity,
            lastCountDate: new Date(),
            lastCountUserId: caller.sub,
          },
        });

        totalItems++;
        totalQuantity += item.quantity;
        totalCost += item.quantity * unitCost;
      }
    });

    await this.audit.log({
      organizationId: caller.organizationId,
      userId: caller.sub,
      userName: caller.email,
      action: "CREATE",
      module: "INVENTARIOS",
      entityType: "InventoryLoad",
      entityId: data.branchId,
      description: `Carga de inventario en ${branch.name}: ${totalItems} producto(s), ${totalQuantity} unidades totales`,
    });

    return { totalItems, totalQuantity, totalCost };
  }

  /**
   * Load inventory from CSV rows (matched by SKU).
   */
  async loadFromCsv(
    caller: JwtPayload,
    branchId: string,
    rows: Array<{
      sku: string;
      productName?: string;
      quantity: number;
      unitCost?: number;
      notes?: string;
    }>,
  ) {
    // Validate branch
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId: caller.organizationId },
    });
    if (!branch) {
      throw new BadRequestException("Sucursal no encontrada o no pertenece a la organizacion");
    }

    // Get all organization products indexed by SKU
    const orgProducts = await this.prisma.product.findMany({
      where: { organizationId: caller.organizationId, isActive: true },
    });
    const skuMap = new Map(orgProducts.map((p) => [p.sku.toLowerCase().trim(), p]));

    const matched: Array<{
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      unitCost: number;
      notes?: string;
    }> = [];
    const unmatched: Array<{ sku: string; row: number }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const product = skuMap.get(row.sku.toLowerCase().trim());
      if (product) {
        matched.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: row.quantity,
          unitCost: row.unitCost ?? Number(product.costPerUnit),
          notes: row.notes,
        });
      } else {
        unmatched.push({ sku: row.sku, row: i + 1 });
      }
    }

    // Load matched items
    let loadedCount = 0;
    if (matched.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const item of matched) {
          await tx.inventoryMovement.create({
            data: {
              branchId,
              productId: item.productId,
              movementType: "IN",
              quantity: item.quantity,
              unitCost: item.unitCost,
              referenceType: "csv_import",
              notes: item.notes || "Importacion CSV",
              userId: caller.sub,
            },
          });

          await tx.branchInventory.upsert({
            where: {
              branchId_productId: {
                branchId,
                productId: item.productId,
              },
            },
            update: {
              currentQuantity: { increment: item.quantity },
              lastCountDate: new Date(),
              lastCountUserId: caller.sub,
            },
            create: {
              branchId,
              productId: item.productId,
              currentQuantity: item.quantity,
              lastCountDate: new Date(),
              lastCountUserId: caller.sub,
            },
          });

          loadedCount++;
        }
      });

      await this.audit.log({
        organizationId: caller.organizationId,
        userId: caller.sub,
        userName: caller.email,
        action: "CREATE",
        module: "INVENTARIOS",
        entityType: "InventoryLoad",
        entityId: branchId,
        description: `Importacion CSV en ${branch.name}: ${loadedCount} cargados, ${unmatched.length} no encontrados`,
      });
    }

    return {
      matched: matched.length,
      unmatched,
      loaded: loadedCount,
    };
  }

  /**
   * Adjust inventory — set new absolute quantity.
   */
  async adjustInventory(
    caller: JwtPayload,
    data: {
      branchId: string;
      productId: string;
      newQuantity: number;
      reason: string;
    },
  ) {
    // Validate branch
    const branch = await this.prisma.branch.findFirst({
      where: { id: data.branchId, organizationId: caller.organizationId },
    });
    if (!branch) {
      throw new BadRequestException("Sucursal no encontrada o no pertenece a la organizacion");
    }

    // Validate product
    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, organizationId: caller.organizationId },
    });
    if (!product) {
      throw new NotFoundException("Producto no encontrado");
    }

    // Get current stock
    const currentInventory = await this.prisma.branchInventory.findUnique({
      where: {
        branchId_productId: {
          branchId: data.branchId,
          productId: data.productId,
        },
      },
    });

    const previousQty = currentInventory ? Number(currentInventory.currentQuantity) : 0;
    const diff = data.newQuantity - previousQty;

    const _result = await this.prisma.$transaction(async (tx) => {
      // Create ADJUSTMENT movement
      await tx.inventoryMovement.create({
        data: {
          branchId: data.branchId,
          productId: data.productId,
          movementType: "ADJUSTMENT",
          quantity: diff,
          referenceType: "inventory_adjustment",
          notes: data.reason,
          userId: caller.sub,
        },
      });

      // Upsert inventory
      return tx.branchInventory.upsert({
        where: {
          branchId_productId: {
            branchId: data.branchId,
            productId: data.productId,
          },
        },
        update: {
          currentQuantity: data.newQuantity,
          lastCountDate: new Date(),
          lastCountUserId: caller.sub,
        },
        create: {
          branchId: data.branchId,
          productId: data.productId,
          currentQuantity: data.newQuantity,
          lastCountDate: new Date(),
          lastCountUserId: caller.sub,
        },
      });
    });

    await this.audit.log({
      organizationId: caller.organizationId,
      userId: caller.sub,
      userName: caller.email,
      action: "UPDATE",
      module: "INVENTARIOS",
      entityType: "BranchInventory",
      entityId: `${data.branchId}:${data.productId}`,
      description: `Ajuste de inventario en ${branch.name}: ${product.name} de ${previousQty} a ${data.newQuantity} (${diff >= 0 ? "+" : ""}${diff})`,
      changes: { currentQuantity: { old: previousQty, new: data.newQuantity } },
    });

    return {
      productId: data.productId,
      productName: product.name,
      previousQuantity: previousQty,
      newQuantity: data.newQuantity,
      difference: diff,
    };
  }

  /**
   * Get load history (IN movements) for a branch, optionally filtered by date range.
   */
  async getLoadHistory(caller: JwtPayload, branchId: string, dateFrom?: string, dateTo?: string) {
    // Validate branch
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId: caller.organizationId },
    });
    if (!branch) {
      throw new BadRequestException("Sucursal no encontrada o no pertenece a la organizacion");
    }

    const where: any = {
      branchId,
      movementType: "IN",
    };

    if (dateFrom || dateTo) {
      where.timestamp = {};
      if (dateFrom) where.timestamp.gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.timestamp.lte = endDate;
      }
    }

    const movements = await this.prisma.inventoryMovement.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unitOfMeasure: true,
            costPerUnit: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { timestamp: "desc" },
      take: 500,
    });

    // Group by date (YYYY-MM-DD)
    const groups = new Map<
      string,
      {
        date: string;
        items: typeof movements;
        totalQuantity: number;
        totalCost: number;
      }
    >();

    for (const m of movements) {
      const dateKey = m.timestamp.toISOString().split("T")[0];
      const existing = groups.get(dateKey);
      const cost = Number(m.unitCost ?? 0) * Number(m.quantity);

      if (existing) {
        existing.items.push(m);
        existing.totalQuantity += Number(m.quantity);
        existing.totalCost += cost;
      } else {
        groups.set(dateKey, {
          date: dateKey,
          items: [m],
          totalQuantity: Number(m.quantity),
          totalCost: cost,
        });
      }
    }

    return Array.from(groups.values());
  }

  /**
   * Get current inventory stock for a branch with product details.
   */
  async getInventoryByBranch(caller: JwtPayload, branchId: string) {
    // Validate branch
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId: caller.organizationId },
    });
    if (!branch) {
      throw new BadRequestException("Sucursal no encontrada o no pertenece a la organizacion");
    }

    const inventory = await this.prisma.branchInventory.findMany({
      where: { branchId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unitOfMeasure: true,
            costPerUnit: true,
            isActive: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    // Compute total valuation
    let totalValuation = 0;
    const items = inventory.map((item) => {
      const qty = Number(item.currentQuantity);
      const cost = Number(item.product.costPerUnit);
      const value = qty * cost;
      totalValuation += value;

      return {
        ...item,
        currentQuantity: qty,
        minimumStock: Number(item.minimumStock),
        totalValue: value,
        belowMinimum: Number(item.minimumStock) > 0 && qty <= Number(item.minimumStock),
      };
    });

    return {
      branchId,
      branchName: branch.name,
      branchType: branch.branchType,
      totalValuation,
      items,
    };
  }
}
