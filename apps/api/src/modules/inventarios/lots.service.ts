import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateLotDto } from "./dto/create-lot.dto";
import { UpdateLotDto } from "./dto/update-lot.dto";
import { Prisma } from "@luka/database";

const LOT_STOCK_STATUSES = ["ACTIVE", "LOW", "EXPIRED"];
const LOT_TERMINAL_STATUSES = ["CONSUMED", "DISPOSED"];
const DECIMAL_EPSILON = 0.0001;

@Injectable()
export class LotsService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // Create a new lot (receiving product)
  // ---------------------------------------------------------------
  async createLot(organizationId: string, userId: string, dto: CreateLotDto) {
    const quantity = this.normalizePositiveQuantity(dto.quantity);
    const lotNumber = dto.lotNumber || this.generateLotNumber(dto.productId, dto.branchId);
    const { product } = await this.assertBranchAndProductBelongToOrganization(
      organizationId,
      dto.branchId,
      dto.productId,
    );
    const unitCost = dto.unitCost ?? Number(product.costPerUnit);

    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.productLot.create({
        data: {
          organizationId,
          productId: dto.productId,
          branchId: dto.branchId,
          lotNumber,
          batchDate: dto.batchDate ? new Date(dto.batchDate) : new Date(),
          expirationDate: new Date(dto.expirationDate),
          quantity,
          initialQuantity: quantity,
          unitCost: dto.unitCost ?? null,
          supplierId: dto.supplierId || null,
          notes: dto.notes || null,
          receivedById: userId,
          status: "ACTIVE",
        },
        include: {
          product: {
            select: { id: true, name: true, sku: true, unitOfMeasure: true },
          },
          branch: { select: { id: true, name: true, code: true } },
          supplier: { select: { id: true, name: true } },
          receivedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      await this.incrementBranchInventory(tx, dto.branchId, dto.productId, quantity, userId);
      await tx.inventoryMovement.create({
        data: {
          branchId: dto.branchId,
          productId: dto.productId,
          movementType: "IN",
          quantity,
          unitCost,
          referenceType: "product_lot",
          referenceId: lot.id,
          notes: dto.notes || `Recepcion de lote ${lotNumber}`,
          userId,
        },
      });

      return lot;
    });
  }

  // ---------------------------------------------------------------
  // List lots with filters + pagination
  // ---------------------------------------------------------------
  async getLots(
    organizationId: string,
    filters: {
      branchId?: string;
      productId?: string;
      status?: string;
      expiringBefore?: string;
      expiringWithin?: number;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const now = new Date();

    const where: Prisma.ProductLotWhereInput = {
      organizationId,
      ...(filters.branchId && { branchId: filters.branchId }),
      ...(filters.productId && { productId: filters.productId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.expiringBefore && {
        expirationDate: { lte: new Date(filters.expiringBefore) },
      }),
      ...(filters.expiringWithin && {
        expirationDate: {
          lte: new Date(now.getTime() + filters.expiringWithin * 24 * 60 * 60 * 1000),
          gte: now,
        },
        status: "ACTIVE",
      }),
      ...(filters.search && {
        OR: [
          {
            product: {
              name: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
          },
          {
            lotNumber: {
              contains: filters.search,
              mode: "insensitive" as const,
            },
          },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.productLot.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              unitOfMeasure: true,
            },
          },
          branch: { select: { id: true, name: true, code: true } },
          supplier: { select: { id: true, name: true } },
          receivedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { expirationDate: "asc" },
        skip,
        take: limit,
      }),
      this.prisma.productLot.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------
  // Single lot detail
  // ---------------------------------------------------------------
  async getLot(organizationId: string, id: string) {
    const lot = await this.prisma.productLot.findFirst({
      where: { id, organizationId },
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
        branch: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true } },
        receivedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!lot) {
      throw new NotFoundException("Lote no encontrado");
    }

    return lot;
  }

  // ---------------------------------------------------------------
  // Update lot (quantity, notes, status)
  // ---------------------------------------------------------------
  async updateLot(organizationId: string, id: string, dto: UpdateLotDto) {
    const existing = await this.prisma.productLot.findFirst({
      where: { id, organizationId },
      include: {
        product: { select: { costPerUnit: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException("Lote no encontrado");
    }

    const currentQuantity = this.toNumber(existing.quantity);
    const targetQuantity =
      dto.quantity !== undefined
        ? this.normalizeNonNegativeQuantity(dto.quantity)
        : currentQuantity;
    let targetStatus = dto.status || existing.status;

    if (LOT_TERMINAL_STATUSES.includes(targetStatus) && targetQuantity > 0) {
      throw new BadRequestException("Un lote consumido o descartado debe quedar con cantidad 0");
    }
    if (targetQuantity === 0 && !dto.status && existing.status !== "DISPOSED") {
      targetStatus = "CONSUMED";
    }

    const quantityDiff = this.roundQuantity(targetQuantity - currentQuantity);
    const unitCost = existing.unitCost
      ? this.toNumber(existing.unitCost)
      : this.toNumber(existing.product.costPerUnit);

    return this.prisma.$transaction(async (tx) => {
      if (quantityDiff > 0) {
        await this.incrementBranchInventory(
          tx,
          existing.branchId,
          existing.productId,
          quantityDiff,
          null,
        );
        await tx.inventoryMovement.create({
          data: {
            branchId: existing.branchId,
            productId: existing.productId,
            movementType: "ADJUSTMENT",
            quantity: quantityDiff,
            unitCost,
            referenceType: "product_lot_adjustment",
            referenceId: id,
            notes: dto.notes || `Ajuste manual de lote ${existing.lotNumber}`,
          },
        });
      } else if (quantityDiff < 0) {
        await this.decrementBranchInventory(
          tx,
          existing.branchId,
          existing.productId,
          Math.abs(quantityDiff),
        );
        await tx.inventoryMovement.create({
          data: {
            branchId: existing.branchId,
            productId: existing.productId,
            movementType: "ADJUSTMENT",
            quantity: quantityDiff,
            unitCost,
            referenceType: "product_lot_adjustment",
            referenceId: id,
            notes: dto.notes || `Ajuste manual de lote ${existing.lotNumber}`,
          },
        });
      }

      return tx.productLot.update({
        where: { id },
        data: {
          ...(dto.quantity !== undefined && { quantity: targetQuantity }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          status: targetStatus,
        },
        include: {
          product: {
            select: { id: true, name: true, sku: true, unitOfMeasure: true },
          },
          branch: { select: { id: true, name: true, code: true } },
          supplier: { select: { id: true, name: true } },
          receivedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
    });
  }

  // ---------------------------------------------------------------
  // Consume from a lot (FEFO — First Expired, First Out)
  // ---------------------------------------------------------------
  async consumeFromLot(organizationId: string, lotId: string, quantity: number, userId?: string) {
    const requestedQuantity = this.normalizePositiveQuantity(quantity);
    const lot = await this.prisma.productLot.findFirst({
      where: { id: lotId, organizationId },
      include: {
        product: { select: { costPerUnit: true } },
      },
    });

    if (!lot) {
      throw new NotFoundException("Lote no encontrado");
    }
    if (LOT_TERMINAL_STATUSES.includes(lot.status)) {
      throw new BadRequestException(`No se puede consumir un lote con estatus ${lot.status}`);
    }

    const currentQty = this.toNumber(lot.quantity);
    if (requestedQuantity > currentQty + DECIMAL_EPSILON) {
      throw new BadRequestException(
        `Cantidad solicitada (${requestedQuantity}) excede la disponible (${currentQty})`,
      );
    }

    const newQty = this.roundQuantity(Math.max(0, currentQty - requestedQuantity));
    let newStatus = lot.status;
    if (newQty <= 0) {
      newStatus = "CONSUMED";
    } else if (
      ["ACTIVE", "LOW"].includes(lot.status) &&
      newQty <= this.toNumber(lot.initialQuantity) * 0.1
    ) {
      newStatus = "LOW";
    }

    const unitCost = lot.unitCost
      ? this.toNumber(lot.unitCost)
      : this.toNumber(lot.product.costPerUnit);

    return this.prisma.$transaction(async (tx) => {
      await this.decrementBranchInventory(tx, lot.branchId, lot.productId, requestedQuantity);

      await tx.inventoryMovement.create({
        data: {
          branchId: lot.branchId,
          productId: lot.productId,
          movementType: "OUT",
          quantity: requestedQuantity,
          unitCost,
          referenceType: "product_lot",
          referenceId: lotId,
          notes: `Consumo de lote ${lot.lotNumber}`,
          userId,
        },
      });

      return tx.productLot.update({
        where: { id: lotId },
        data: {
          quantity: newQty,
          status: newStatus,
        },
        include: {
          product: {
            select: { id: true, name: true, sku: true, unitOfMeasure: true },
          },
          branch: { select: { id: true, name: true, code: true } },
        },
      });
    });
  }

  // ---------------------------------------------------------------
  // Dispose lot -> mark DISPOSED + create WasteLog entry
  // ---------------------------------------------------------------
  async disposeLot(organizationId: string, lotId: string, userId: string, reason: string) {
    const lot = await this.prisma.productLot.findFirst({
      where: { id: lotId, organizationId },
      include: {
        product: { select: { id: true, costPerUnit: true, unitOfMeasure: true } },
      },
    });

    if (!lot) {
      throw new NotFoundException("Lote no encontrado");
    }
    if (LOT_TERMINAL_STATUSES.includes(lot.status)) {
      throw new BadRequestException(`No se puede descartar un lote con estatus ${lot.status}`);
    }

    const remainingQty = this.toNumber(lot.quantity);
    if (remainingQty <= 0) {
      throw new BadRequestException("El lote no tiene inventario disponible para descartar");
    }
    const costPerUnit = lot.unitCost ? Number(lot.unitCost) : Number(lot.product.costPerUnit);
    const wasteCost = remainingQty * costPerUnit;

    return this.prisma.$transaction(async (tx) => {
      await this.decrementBranchInventory(tx, lot.branchId, lot.productId, remainingQty);

      // Mark lot as DISPOSED
      const updatedLot = await tx.productLot.update({
        where: { id: lotId },
        data: { status: "DISPOSED", quantity: 0 },
        include: {
          product: {
            select: { id: true, name: true, sku: true, unitOfMeasure: true },
          },
          branch: { select: { id: true, name: true, code: true } },
        },
      });

      await tx.inventoryMovement.create({
        data: {
          branchId: lot.branchId,
          productId: lot.productId,
          movementType: "WASTE",
          quantity: remainingQty,
          unitCost: costPerUnit,
          referenceType: "product_lot",
          referenceId: lotId,
          notes: reason || `Lote ${lot.lotNumber} descartado por caducidad`,
          userId,
        },
      });

      // Create WasteLog entry
      await tx.wasteLog.create({
        data: {
          organizationId,
          branchId: lot.branchId,
          productId: lot.productId,
          quantity: remainingQty,
          unit: lot.product.unitOfMeasure || "kg",
          reason: "EXPIRED",
          notes: reason || `Lote ${lot.lotNumber} descartado por caducidad`,
          cost: wasteCost,
          reportedBy: userId,
          reportedAt: new Date(),
        },
      });

      return updatedLot;
    });
  }

  // ---------------------------------------------------------------
  // Expiring alerts — lots expiring within N days, grouped by urgency
  // ---------------------------------------------------------------
  async getExpiringAlerts(organizationId: string, daysAhead: number = 7, branchId?: string) {
    const now = new Date();
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const where: Prisma.ProductLotWhereInput = {
      organizationId,
      status: "ACTIVE",
      expirationDate: { lte: futureDate },
      ...(branchId && { branchId }),
    };

    const lots = await this.prisma.productLot.findMany({
      where,
      include: {
        product: {
          select: { id: true, name: true, sku: true, unitOfMeasure: true },
        },
        branch: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { expirationDate: "asc" },
    });

    const critical: typeof lots = []; // 0-2 days
    const warning: typeof lots = []; // 3-5 days
    const upcoming: typeof lots = []; // 6-7 days

    for (const lot of lots) {
      const daysRemaining = Math.ceil(
        (lot.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysRemaining <= 2) {
        critical.push(lot);
      } else if (daysRemaining <= 5) {
        warning.push(lot);
      } else {
        upcoming.push(lot);
      }
    }

    return {
      critical: { count: critical.length, lots: critical },
      warning: { count: warning.length, lots: warning },
      upcoming: { count: upcoming.length, lots: upcoming },
      total: lots.length,
    };
  }

  // ---------------------------------------------------------------
  // Expiration summary for dashboard
  // ---------------------------------------------------------------
  async getExpirationSummary(organizationId: string) {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Total active lots
    const activeLots = await this.prisma.productLot.count({
      where: { organizationId, status: "ACTIVE" },
    });

    // Expired lots (status EXPIRED)
    const expiredLots = await this.prisma.productLot.count({
      where: { organizationId, status: "EXPIRED" },
    });

    // Lots expiring this week
    const expiringThisWeek = await this.prisma.productLot.count({
      where: {
        organizationId,
        status: "ACTIVE",
        expirationDate: { lte: weekFromNow, gte: now },
      },
    });

    // Value at risk (sum of remaining qty * unit cost for expiring lots)
    const atRiskLots = await this.prisma.productLot.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        expirationDate: { lte: weekFromNow },
      },
      include: {
        product: { select: { costPerUnit: true } },
      },
    });

    const valueAtRisk = atRiskLots.reduce((acc, lot) => {
      const cost = lot.unitCost ? Number(lot.unitCost) : Number(lot.product.costPerUnit);
      return acc + Number(lot.quantity) * cost;
    }, 0);

    // By branch: expired + expiring soon counts
    const branchLots = await this.prisma.productLot.groupBy({
      by: ["branchId", "status"],
      where: {
        organizationId,
        OR: [
          { status: "EXPIRED" },
          {
            status: "ACTIVE",
            expirationDate: { lte: weekFromNow },
          },
        ],
      },
      _count: true,
    });

    const branchIds = [...new Set(branchLots.map((b) => b.branchId))];
    const branches =
      branchIds.length > 0
        ? await this.prisma.branch.findMany({
            where: { id: { in: branchIds } },
            select: { id: true, name: true },
          })
        : [];
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));

    const byBranchMap = new Map<
      string,
      { branchName: string; expired: number; expiringSoon: number }
    >();
    for (const row of branchLots) {
      const entry = byBranchMap.get(row.branchId) || {
        branchName: branchMap.get(row.branchId) || "Desconocida",
        expired: 0,
        expiringSoon: 0,
      };
      if (row.status === "EXPIRED") {
        entry.expired += row._count;
      } else {
        entry.expiringSoon += row._count;
      }
      byBranchMap.set(row.branchId, entry);
    }

    const byBranch = Array.from(byBranchMap.entries()).map(([branchId, data]) => ({
      branchId,
      ...data,
    }));

    // Top 10 products with most expiring lots
    const byProductRaw = await this.prisma.productLot.groupBy({
      by: ["productId"],
      where: {
        organizationId,
        status: "ACTIVE",
        expirationDate: { lte: weekFromNow },
      },
      _count: true,
      _sum: { quantity: true },
      orderBy: { _count: { productId: "desc" } },
      take: 10,
    });

    const productIds = byProductRaw.map((p) => p.productId);
    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          })
        : [];
    const productMap = new Map(products.map((p) => [p.id, p.name]));

    const byProduct = byProductRaw.map((p) => ({
      productId: p.productId,
      productName: productMap.get(p.productId) || "Desconocido",
      lotCount: p._count,
      totalQuantity: Number(p._sum?.quantity || 0),
    }));

    // Status distribution
    const statusDistribution = await this.prisma.productLot.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: true,
    });

    // FIFO compliance: lots consumed in expiration order
    const consumedLots = await this.prisma.productLot.count({
      where: { organizationId, status: "CONSUMED" },
    });
    const totalFinishedLots = await this.prisma.productLot.count({
      where: {
        organizationId,
        status: { in: ["CONSUMED", "DISPOSED", "EXPIRED"] },
      },
    });
    const fifoCompliance =
      totalFinishedLots > 0 ? Math.round((consumedLots / totalFinishedLots) * 100) : 100;

    // Trend: daily counts of expired/disposed/consumed over last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trendRaw = await this.prisma.productLot.findMany({
      where: {
        organizationId,
        status: { in: ["EXPIRED", "DISPOSED", "CONSUMED"] },
        updatedAt: { gte: thirtyDaysAgo },
      },
      select: { status: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
    });

    const trendMap = new Map<string, { expired: number; disposed: number; consumed: number }>();
    for (const r of trendRaw) {
      const dateKey = r.updatedAt.toISOString().split("T")[0];
      const entry = trendMap.get(dateKey) || {
        expired: 0,
        disposed: 0,
        consumed: 0,
      };
      if (r.status === "EXPIRED") entry.expired++;
      else if (r.status === "DISPOSED") entry.disposed++;
      else if (r.status === "CONSUMED") entry.consumed++;
      trendMap.set(dateKey, entry);
    }

    const trend = Array.from(trendMap.entries()).map(([date, vals]) => ({
      date,
      ...vals,
    }));

    return {
      activeLots,
      expiredLots,
      expiringThisWeek,
      valueAtRisk: Math.round(valueAtRisk * 100) / 100,
      byBranch,
      byProduct,
      statusDistribution: statusDistribution.map((s) => ({
        status: s.status,
        count: s._count,
      })),
      fifoCompliance,
      trend,
    };
  }

  // ---------------------------------------------------------------
  // Auto-expire lots past expiration date still ACTIVE
  // ---------------------------------------------------------------
  async autoExpireLots(organizationId: string) {
    const now = new Date();

    const result = await this.prisma.productLot.updateMany({
      where: {
        organizationId,
        status: "ACTIVE",
        expirationDate: { lt: now },
      },
      data: { status: "EXPIRED" },
    });

    return { expired: result.count };
  }

  // ---------------------------------------------------------------
  // All lots for a product sorted by expiration (FEFO view)
  // ---------------------------------------------------------------
  async getLotsByProduct(organizationId: string, productId: string, branchId?: string) {
    return this.prisma.productLot.findMany({
      where: {
        organizationId,
        productId,
        ...(branchId && { branchId }),
        status: { in: ["ACTIVE", "LOW"] },
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { expirationDate: "asc" }, // FEFO order
    });
  }

  // ---------------------------------------------------------------
  // Reconcile physical lot balance vs branch inventory balance
  // ---------------------------------------------------------------
  async getLotStockReconciliation(
    organizationId: string,
    filters: { branchId?: string; productId?: string } = {},
  ) {
    const lotGroups = await this.prisma.productLot.groupBy({
      by: ["branchId", "productId"],
      where: {
        organizationId,
        status: { in: LOT_STOCK_STATUSES },
        ...(filters.branchId && { branchId: filters.branchId }),
        ...(filters.productId && { productId: filters.productId }),
      },
      _sum: { quantity: true },
    });

    if (lotGroups.length === 0) {
      return {
        data: [],
        summary: { total: 0, balanced: 0, mismatched: 0 },
      };
    }

    const pairs = lotGroups.map((group) => ({
      branchId: group.branchId,
      productId: group.productId,
    }));
    const branchIds = [...new Set(lotGroups.map((group) => group.branchId))];
    const productIds = [...new Set(lotGroups.map((group) => group.productId))];

    const [inventories, branches, products] = await Promise.all([
      this.prisma.branchInventory.findMany({
        where: {
          OR: pairs,
          branch: { organizationId },
          product: { organizationId },
        },
        include: {
          branch: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
        },
      }),
      this.prisma.branch.findMany({
        where: { id: { in: branchIds }, organizationId },
        select: { id: true, name: true, code: true },
      }),
      this.prisma.product.findMany({
        where: { id: { in: productIds }, organizationId },
        select: { id: true, name: true, sku: true, unitOfMeasure: true },
      }),
    ]);

    const inventoryMap = new Map(
      inventories.map((inventory) => [
        this.stockKey(inventory.branchId, inventory.productId),
        inventory,
      ]),
    );
    const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
    const productMap = new Map(products.map((product) => [product.id, product]));

    const data = lotGroups.map((group) => {
      const key = this.stockKey(group.branchId, group.productId);
      const inventory = inventoryMap.get(key);
      const lotQuantity = this.roundQuantity(this.toNumber(group._sum.quantity));
      const stockQuantity = this.roundQuantity(this.toNumber(inventory?.currentQuantity));
      const difference = this.roundQuantity(stockQuantity - lotQuantity);
      const branch = inventory?.branch || branchMap.get(group.branchId);
      const product = inventory?.product || productMap.get(group.productId);

      return {
        branchId: group.branchId,
        branchName: branch?.name || "Sucursal desconocida",
        branchCode: branch?.code || null,
        productId: group.productId,
        productName: product?.name || "Producto desconocido",
        productSku: product?.sku || null,
        unitOfMeasure: product?.unitOfMeasure || null,
        lotQuantity,
        stockQuantity,
        difference,
        isBalanced: Math.abs(difference) < DECIMAL_EPSILON,
      };
    });

    return {
      data,
      summary: {
        total: data.length,
        balanced: data.filter((row) => row.isBalanced).length,
        mismatched: data.filter((row) => !row.isBalanced).length,
      },
    };
  }

  // ---------------------------------------------------------------
  // Helper: generate lot number
  // ---------------------------------------------------------------
  private generateLotNumber(productId: string, _branchId: string): string {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timePart = now.toISOString().slice(11, 19).replace(/:/g, "");
    const suffix = productId.slice(-4).toUpperCase();
    return `LOT-${datePart}-${timePart}-${suffix}`;
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
        select: { id: true, costPerUnit: true },
      }),
    ]);

    if (!branch) {
      throw new BadRequestException("Sucursal no encontrada o no pertenece a la organizacion");
    }
    if (!product) {
      throw new BadRequestException("Producto no encontrado o no pertenece a la organizacion");
    }

    return { branch, product };
  }

  private async incrementBranchInventory(
    tx: Prisma.TransactionClient,
    branchId: string,
    productId: string,
    quantity: number,
    userId?: string | null,
  ) {
    await tx.branchInventory.upsert({
      where: {
        branchId_productId: {
          branchId,
          productId,
        },
      },
      update: {
        currentQuantity: { increment: quantity },
        ...(userId && {
          lastCountDate: new Date(),
          lastCountUserId: userId,
        }),
      },
      create: {
        branchId,
        productId,
        currentQuantity: quantity,
        ...(userId && {
          lastCountDate: new Date(),
          lastCountUserId: userId,
        }),
      },
    });
  }

  private async decrementBranchInventory(
    tx: Prisma.TransactionClient,
    branchId: string,
    productId: string,
    quantity: number,
  ) {
    const inventory = await tx.branchInventory.findUnique({
      where: {
        branchId_productId: {
          branchId,
          productId,
        },
      },
      select: { currentQuantity: true },
    });

    const available = this.toNumber(inventory?.currentQuantity);
    if (available + DECIMAL_EPSILON < quantity) {
      throw new BadRequestException(
        `Stock insuficiente en sucursal. Disponible: ${available}, solicitado: ${quantity}`,
      );
    }

    await tx.branchInventory.update({
      where: {
        branchId_productId: {
          branchId,
          productId,
        },
      },
      data: {
        currentQuantity: { decrement: quantity },
      },
    });
  }

  private normalizePositiveQuantity(quantity: number): number {
    const normalized = this.roundQuantity(Number(quantity));
    if (!Number.isFinite(normalized) || normalized <= 0) {
      throw new BadRequestException("La cantidad debe ser mayor a cero");
    }
    return normalized;
  }

  private normalizeNonNegativeQuantity(quantity: number): number {
    const normalized = this.roundQuantity(Number(quantity));
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException("La cantidad no puede ser negativa");
    }
    return normalized;
  }

  private roundQuantity(quantity: number): number {
    return Math.round(quantity * 10000) / 10000;
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private stockKey(branchId: string, productId: string): string {
    return `${branchId}:${productId}`;
  }
}
