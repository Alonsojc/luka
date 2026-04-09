import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateLotDto } from "./dto/create-lot.dto";
import { UpdateLotDto } from "./dto/update-lot.dto";
import { Prisma } from "@luka/database";

@Injectable()
export class LotsService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // Create a new lot (receiving product)
  // ---------------------------------------------------------------
  async createLot(organizationId: string, userId: string, dto: CreateLotDto) {
    const lotNumber =
      dto.lotNumber || this.generateLotNumber(dto.productId, dto.branchId);

    return this.prisma.productLot.create({
      data: {
        organizationId,
        productId: dto.productId,
        branchId: dto.branchId,
        lotNumber,
        batchDate: dto.batchDate ? new Date(dto.batchDate) : new Date(),
        expirationDate: new Date(dto.expirationDate),
        quantity: dto.quantity,
        initialQuantity: dto.quantity,
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
          lte: new Date(
            now.getTime() + filters.expiringWithin * 24 * 60 * 60 * 1000,
          ),
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
    });

    if (!existing) {
      throw new NotFoundException("Lote no encontrado");
    }

    return this.prisma.productLot.update({
      where: { id },
      data: {
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.status && { status: dto.status }),
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
  }

  // ---------------------------------------------------------------
  // Consume from a lot (FEFO — First Expired, First Out)
  // ---------------------------------------------------------------
  async consumeFromLot(
    organizationId: string,
    lotId: string,
    quantity: number,
  ) {
    const lot = await this.prisma.productLot.findFirst({
      where: { id: lotId, organizationId },
    });

    if (!lot) {
      throw new NotFoundException("Lote no encontrado");
    }

    const currentQty = Number(lot.quantity);
    if (quantity > currentQty) {
      throw new BadRequestException(
        `Cantidad solicitada (${quantity}) excede la disponible (${currentQty})`,
      );
    }

    const newQty = currentQty - quantity;
    let newStatus = lot.status;
    if (newQty <= 0) {
      newStatus = "CONSUMED";
    } else if (newQty <= Number(lot.initialQuantity) * 0.1) {
      newStatus = "LOW";
    }

    return this.prisma.productLot.update({
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
  }

  // ---------------------------------------------------------------
  // Dispose lot -> mark DISPOSED + create WasteLog entry
  // ---------------------------------------------------------------
  async disposeLot(
    organizationId: string,
    lotId: string,
    userId: string,
    reason: string,
  ) {
    const lot = await this.prisma.productLot.findFirst({
      where: { id: lotId, organizationId },
      include: {
        product: { select: { id: true, costPerUnit: true, unitOfMeasure: true } },
      },
    });

    if (!lot) {
      throw new NotFoundException("Lote no encontrado");
    }

    const remainingQty = Number(lot.quantity);
    const costPerUnit = lot.unitCost
      ? Number(lot.unitCost)
      : Number(lot.product.costPerUnit);
    const wasteCost = remainingQty * costPerUnit;

    return this.prisma.$transaction(async (tx) => {
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
  async getExpiringAlerts(
    organizationId: string,
    daysAhead: number = 7,
    branchId?: string,
  ) {
    const now = new Date();
    const futureDate = new Date(
      now.getTime() + daysAhead * 24 * 60 * 60 * 1000,
    );

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
      const cost = lot.unitCost
        ? Number(lot.unitCost)
        : Number(lot.product.costPerUnit);
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

    const byBranch = Array.from(byBranchMap.entries()).map(
      ([branchId, data]) => ({
        branchId,
        ...data,
      }),
    );

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
      orderBy: { _count: { _all: "desc" } },
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
      totalQuantity: Number(p._sum.quantity || 0),
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
      totalFinishedLots > 0
        ? Math.round((consumedLots / totalFinishedLots) * 100)
        : 100;

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

    const trendMap = new Map<
      string,
      { expired: number; disposed: number; consumed: number }
    >();
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
  async getLotsByProduct(
    organizationId: string,
    productId: string,
    branchId?: string,
  ) {
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
  // Helper: generate lot number
  // ---------------------------------------------------------------
  private generateLotNumber(productId: string, branchId: string): string {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timePart = now
      .toISOString()
      .slice(11, 19)
      .replace(/:/g, "");
    const suffix = productId.slice(-4).toUpperCase();
    return `LOT-${datePart}-${timePart}-${suffix}`;
  }
}
