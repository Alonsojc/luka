import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateMermaDto } from "./dto/create-merma.dto";
import { UpdateMermaDto } from "./dto/update-merma.dto";
import { Prisma } from "@luka/database";

const DECIMAL_EPSILON = 0.0001;

@Injectable()
export class MermaService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters: {
      branchId?: string;
      productId?: string;
      reason?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.WasteLogWhereInput = {
      organizationId,
      ...(filters.branchId && { branchId: filters.branchId }),
      ...(filters.productId && { productId: filters.productId }),
      ...(filters.reason && { reason: filters.reason }),
      ...(filters.dateFrom || filters.dateTo
        ? {
            reportedAt: {
              ...(filters.dateFrom && {
                gte: new Date(filters.dateFrom),
              }),
              ...(filters.dateTo && {
                lte: new Date(filters.dateTo + "T23:59:59.999Z"),
              }),
            },
          }
        : {}),
      ...(filters.search && {
        product: {
          name: { contains: filters.search, mode: "insensitive" as const },
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.wasteLog.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
          reporter: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { reportedAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.wasteLog.count({ where }),
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

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.wasteLog.findFirst({
      where: { id, organizationId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        product: {
          select: { id: true, name: true, sku: true, unitOfMeasure: true, costPerUnit: true },
        },
        reporter: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!record) {
      throw new NotFoundException("Registro de merma no encontrado");
    }

    return record;
  }

  async create(organizationId: string, userId: string, dto: CreateMermaDto) {
    const quantity = this.normalizePositiveQuantity(dto.quantity);
    const { product } = await this.assertProductAndBranchBelongToOrganization(
      organizationId,
      dto.productId,
      dto.branchId,
    );
    const cost = dto.cost ?? Number(product.costPerUnit) * quantity;
    const unitCost = cost / quantity;

    return this.prisma.$transaction(async (tx) => {
      const wasteLog = await tx.wasteLog.create({
        data: {
          organizationId,
          branchId: dto.branchId || null,
          productId: dto.productId,
          quantity,
          unit: dto.unit || "kg",
          reason: dto.reason,
          notes: dto.notes || null,
          cost,
          reportedBy: userId,
          reportedAt: dto.reportedAt ? new Date(dto.reportedAt) : new Date(),
        },
        include: {
          branch: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
          reporter: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (dto.branchId) {
        await this.decrementBranchInventory(tx, dto.branchId, dto.productId, quantity);
        await tx.inventoryMovement.create({
          data: {
            branchId: dto.branchId,
            productId: dto.productId,
            movementType: "WASTE",
            quantity,
            unitCost,
            referenceType: "waste_log",
            referenceId: wasteLog.id,
            notes: dto.notes || `Merma registrada: ${dto.reason}`,
            userId,
          },
        });
      }

      return wasteLog;
    });
  }

  async update(organizationId: string, id: string, dto: UpdateMermaDto) {
    const existing = await this.prisma.wasteLog.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException("Registro de merma no encontrado");
    }

    const existingQuantity = this.toNumber(existing.quantity);
    const nextProductId = dto.productId || existing.productId;
    const nextBranchId = dto.branchId !== undefined ? dto.branchId : existing.branchId;
    const nextQuantity =
      dto.quantity !== undefined ? this.normalizePositiveQuantity(dto.quantity) : existingQuantity;
    const stockImpactChanged =
      nextProductId !== existing.productId ||
      nextBranchId !== existing.branchId ||
      nextQuantity !== existingQuantity;
    const { product } = await this.assertProductAndBranchBelongToOrganization(
      organizationId,
      nextProductId,
      nextBranchId || undefined,
    );

    // Recalculate cost if quantity or product changed and cost not provided
    let cost = dto.cost;
    if (cost === undefined && (dto.quantity !== undefined || dto.productId)) {
      cost = Number(product.costPerUnit) * nextQuantity;
    }

    const existingMovement = existing.branchId
      ? await this.prisma.inventoryMovement.findFirst({
          where: {
            referenceType: "waste_log",
            referenceId: id,
            movementType: "WASTE",
          },
          select: { id: true },
        })
      : null;

    return this.prisma.$transaction(async (tx) => {
      if (stockImpactChanged) {
        if (existing.branchId && existingMovement) {
          await this.incrementBranchInventory(
            tx,
            existing.branchId,
            existing.productId,
            existingQuantity,
            existing.reportedBy,
          );
          await tx.inventoryMovement.create({
            data: {
              branchId: existing.branchId,
              productId: existing.productId,
              movementType: "IN",
              quantity: existingQuantity,
              referenceType: "waste_log_reversal",
              referenceId: id,
              notes: "Reverso por edicion de merma",
              userId: existing.reportedBy,
            },
          });
        }

        if (nextBranchId) {
          const totalCost =
            cost !== undefined
              ? cost
              : this.toNumber(existing.cost) || Number(product.costPerUnit) * nextQuantity;
          await this.decrementBranchInventory(tx, nextBranchId, nextProductId, nextQuantity);
          await tx.inventoryMovement.create({
            data: {
              branchId: nextBranchId,
              productId: nextProductId,
              movementType: "WASTE",
              quantity: nextQuantity,
              unitCost: totalCost / nextQuantity,
              referenceType: "waste_log",
              referenceId: id,
              notes: dto.notes || `Merma actualizada: ${dto.reason || existing.reason}`,
              userId: existing.reportedBy,
            },
          });
        }
      }

      return tx.wasteLog.update({
        where: { id },
        data: {
          ...(dto.branchId !== undefined && { branchId: dto.branchId }),
          ...(dto.productId && { productId: dto.productId }),
          ...(dto.quantity !== undefined && { quantity: nextQuantity }),
          ...(dto.unit && { unit: dto.unit }),
          ...(dto.reason && { reason: dto.reason }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(cost !== undefined && { cost }),
          ...(dto.reportedAt && { reportedAt: new Date(dto.reportedAt) }),
        },
        include: {
          branch: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
          reporter: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });
  }

  async remove(organizationId: string, id: string) {
    const existing = await this.prisma.wasteLog.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException("Registro de merma no encontrado");
    }

    const existingMovement = existing.branchId
      ? await this.prisma.inventoryMovement.findFirst({
          where: {
            referenceType: "waste_log",
            referenceId: id,
            movementType: "WASTE",
          },
          select: { id: true },
        })
      : null;

    await this.prisma.$transaction(async (tx) => {
      if (existing.branchId && existingMovement) {
        await this.incrementBranchInventory(
          tx,
          existing.branchId,
          existing.productId,
          this.toNumber(existing.quantity),
          existing.reportedBy,
        );
        await tx.inventoryMovement.create({
          data: {
            branchId: existing.branchId,
            productId: existing.productId,
            movementType: "IN",
            quantity: this.toNumber(existing.quantity),
            referenceType: "waste_log_delete",
            referenceId: id,
            notes: "Reverso por eliminacion de merma",
            userId: existing.reportedBy,
          },
        });
      }

      await tx.wasteLog.delete({ where: { id } });
    });

    return { deleted: true };
  }

  async getSummary(
    organizationId: string,
    filters: {
      branchId?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const where: Prisma.WasteLogWhereInput = {
      organizationId,
      ...(filters.branchId && { branchId: filters.branchId }),
      ...(filters.dateFrom || filters.dateTo
        ? {
            reportedAt: {
              ...(filters.dateFrom && {
                gte: new Date(filters.dateFrom),
              }),
              ...(filters.dateTo && {
                lte: new Date(filters.dateTo + "T23:59:59.999Z"),
              }),
            },
          }
        : {}),
    };

    // Total aggregation
    const totals = await this.prisma.wasteLog.aggregate({
      where,
      _sum: {
        quantity: true,
        cost: true,
      },
    });

    // By reason
    const byReason = await this.prisma.wasteLog.groupBy({
      by: ["reason"],
      where,
      _sum: { quantity: true, cost: true },
      orderBy: { _sum: { quantity: "desc" } },
    });

    // By branch
    const byBranchRaw = await this.prisma.wasteLog.groupBy({
      by: ["branchId"],
      where: { ...where, branchId: { not: null } },
      _sum: { quantity: true, cost: true },
      orderBy: { _sum: { quantity: "desc" } },
    });

    // Get branch names
    const branchIds = byBranchRaw.map((b) => b.branchId).filter(Boolean) as string[];
    const branches =
      branchIds.length > 0
        ? await this.prisma.branch.findMany({
            where: { id: { in: branchIds } },
            select: { id: true, name: true },
          })
        : [];
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));

    const byBranch = byBranchRaw.map((b) => ({
      branchId: b.branchId,
      branchName: branchMap.get(b.branchId!) || "Desconocida",
      quantity: Number(b._sum.quantity || 0),
      cost: Number(b._sum.cost || 0),
    }));

    // By product (top 10)
    const byProductRaw = await this.prisma.wasteLog.groupBy({
      by: ["productId"],
      where,
      _sum: { quantity: true, cost: true },
      orderBy: { _sum: { quantity: "desc" } },
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
      quantity: Number(p._sum.quantity || 0),
      cost: Number(p._sum.cost || 0),
    }));

    // Trend: daily aggregation for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trendWhere: Prisma.WasteLogWhereInput = {
      ...where,
      reportedAt: {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : thirtyDaysAgo,
        ...(filters.dateTo && {
          lte: new Date(filters.dateTo + "T23:59:59.999Z"),
        }),
      },
    };

    const trendRaw = await this.prisma.wasteLog.findMany({
      where: trendWhere,
      select: { reportedAt: true, quantity: true, cost: true },
      orderBy: { reportedAt: "asc" },
    });

    // Group by date
    const trendMap = new Map<string, { quantity: number; cost: number }>();
    for (const r of trendRaw) {
      const dateKey = r.reportedAt.toISOString().split("T")[0];
      const existing = trendMap.get(dateKey) || { quantity: 0, cost: 0 };
      existing.quantity += Number(r.quantity);
      existing.cost += Number(r.cost || 0);
      trendMap.set(dateKey, existing);
    }

    const trend = Array.from(trendMap.entries()).map(([date, vals]) => ({
      date,
      quantity: Math.round(vals.quantity * 100) / 100,
      cost: Math.round(vals.cost * 100) / 100,
    }));

    return {
      totalWaste: Number(totals._sum.quantity || 0),
      totalCost: Number(totals._sum.cost || 0),
      byReason: byReason.map((r) => ({
        reason: r.reason,
        quantity: Number(r._sum.quantity || 0),
        cost: Number(r._sum.cost || 0),
      })),
      byBranch,
      byProduct,
      trend,
    };
  }

  private async assertProductAndBranchBelongToOrganization(
    organizationId: string,
    productId: string,
    branchId?: string | null,
  ) {
    const [product, branch] = await Promise.all([
      this.prisma.product.findFirst({
        where: { id: productId, organizationId },
        select: { id: true, costPerUnit: true },
      }),
      branchId
        ? this.prisma.branch.findFirst({
            where: { id: branchId, organizationId },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!product) {
      throw new BadRequestException("Producto no encontrado o no pertenece a la organizacion");
    }
    if (branchId && !branch) {
      throw new BadRequestException("Sucursal no encontrada o no pertenece a la organizacion");
    }

    return { product, branch };
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

  private normalizePositiveQuantity(quantity: number): number {
    const normalized = this.roundQuantity(Number(quantity));
    if (!Number.isFinite(normalized) || normalized <= 0) {
      throw new BadRequestException("La cantidad debe ser mayor a cero");
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
}
