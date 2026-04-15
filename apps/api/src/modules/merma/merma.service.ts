import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateMermaDto } from "./dto/create-merma.dto";
import { UpdateMermaDto } from "./dto/update-merma.dto";
import { Prisma } from "@luka/database";

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
    let cost = dto.cost;

    // Auto-calculate cost from product price if not provided
    if (cost === undefined || cost === null) {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, organizationId },
        select: { costPerUnit: true },
      });

      if (product) {
        cost = Number(product.costPerUnit) * dto.quantity;
      }
    }

    return this.prisma.wasteLog.create({
      data: {
        organizationId,
        branchId: dto.branchId || null,
        productId: dto.productId,
        quantity: dto.quantity,
        unit: dto.unit || "kg",
        reason: dto.reason,
        notes: dto.notes || null,
        cost: cost ?? null,
        reportedBy: userId,
        reportedAt: dto.reportedAt ? new Date(dto.reportedAt) : new Date(),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
        reporter: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateMermaDto) {
    const existing = await this.prisma.wasteLog.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException("Registro de merma no encontrado");
    }

    // Recalculate cost if quantity or product changed and cost not provided
    let cost = dto.cost;
    if (cost === undefined && (dto.quantity || dto.productId)) {
      const productId = dto.productId || existing.productId;
      const quantity = dto.quantity || Number(existing.quantity);
      const product = await this.prisma.product.findFirst({
        where: { id: productId, organizationId },
        select: { costPerUnit: true },
      });
      if (product) {
        cost = Number(product.costPerUnit) * quantity;
      }
    }

    return this.prisma.wasteLog.update({
      where: { id },
      data: {
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
        ...(dto.productId && { productId: dto.productId }),
        ...(dto.quantity && { quantity: dto.quantity }),
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
  }

  async remove(organizationId: string, id: string) {
    const existing = await this.prisma.wasteLog.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException("Registro de merma no encontrado");
    }

    await this.prisma.wasteLog.delete({ where: { id } });
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
}
