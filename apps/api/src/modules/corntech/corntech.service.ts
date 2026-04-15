import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ---------- DTOs ----------

interface PosSaleItemDto {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface PosSaleDto {
  ticketNumber: string;
  date: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  terminalId?: string;
  items: PosSaleItemDto[];
}

interface SyncResult {
  total: number;
  synced: number;
  failed: number;
  errors: string[];
}

interface BranchSyncStatus {
  branchId: string;
  branchName: string;
  branchCity: string;
  lastSyncAt: Date | null;
  lastSyncStatus: string;
  todaySalesCount: number;
  todaySalesTotal: number;
}

@Injectable()
export class CorntechService {
  constructor(private prisma: PrismaService) {}

  // ======================================================
  // POS SYNC ENGINE
  // ======================================================

  /** Webhook: POS sends a batch of sales */
  async processSalesBatch(
    orgId: string,
    branchId: string,
    sales: PosSaleDto[],
  ): Promise<SyncResult> {
    const log = await this.createPosSyncLog(orgId, branchId, "SALES", sales.length);

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const sale of sales) {
      try {
        await this.prisma.posSale.create({
          data: {
            organizationId: orgId,
            branchId,
            ticketNumber: sale.ticketNumber,
            saleDate: new Date(sale.date),
            subtotal: sale.subtotal,
            tax: sale.tax,
            total: sale.total,
            paymentMethod: sale.paymentMethod,
            posTerminalId: sale.terminalId,
            rawData: sale as any,
            items: {
              create: sale.items.map((item) => ({
                productSku: item.sku,
                productName: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.total,
              })),
            },
          },
        });

        // Decrease branch inventory for each sold item
        for (const item of sale.items) {
          await this.prisma.branchInventory.updateMany({
            where: {
              branchId,
              product: { sku: item.sku },
            },
            data: {
              currentQuantity: { decrement: Number(item.quantity) },
            },
          });
        }

        synced++;
      } catch (error: any) {
        failed++;
        errors.push(`Ticket ${sale.ticketNumber}: ${error.message}`);
      }
    }

    await this.completePosSyncLog(
      log.id,
      synced,
      failed,
      errors.length > 0 ? errors.join("; ") : undefined,
    );

    return { total: sales.length, synced, failed, errors };
  }

  /** Sync status per branch */
  async getSyncStatus(orgId: string): Promise<BranchSyncStatus[]> {
    const branches = await this.prisma.branch.findMany({
      where: { organizationId: orgId, isActive: true },
    });

    const statuses = await Promise.all(
      branches.map(async (branch) => {
        const lastSync = await this.prisma.posSyncLog.findFirst({
          where: { branchId: branch.id },
          orderBy: { startedAt: "desc" },
        });

        const todaySales = await this.prisma.posSale.aggregate({
          where: {
            branchId: branch.id,
            saleDate: { gte: startOfDay(new Date()) },
          },
          _sum: { total: true },
          _count: true,
        });

        return {
          branchId: branch.id,
          branchName: branch.name,
          branchCity: branch.city,
          lastSyncAt: lastSync?.startedAt ?? null,
          lastSyncStatus: lastSync?.status ?? "NEVER",
          todaySalesCount: todaySales._count,
          todaySalesTotal: Number(todaySales._sum.total ?? 0),
        };
      }),
    );

    return statuses;
  }

  /** Daily sales summary grouped by branch + payment method */
  async getDailySummary(orgId: string, date: string) {
    const targetDate = new Date(date);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const raw = await this.prisma.posSale.groupBy({
      by: ["branchId", "paymentMethod"],
      where: {
        organizationId: orgId,
        saleDate: { gte: startOfDay(targetDate), lt: startOfDay(nextDate) },
      },
      _sum: { total: true, tax: true, subtotal: true },
      _count: true,
    });

    // Look up branch names
    const branchIds = [...new Set(raw.map((r) => r.branchId))];
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    });
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));

    // Group by branch
    const byBranch = new Map<
      string,
      {
        sales: { paymentMethod: string; count: number; total: number }[];
        totalSales: number;
        totalCount: number;
      }
    >();
    for (const row of raw) {
      const total = Number(row._sum.total) || 0;
      const count = row._count;
      if (!byBranch.has(row.branchId)) {
        byBranch.set(row.branchId, { sales: [], totalSales: 0, totalCount: 0 });
      }
      const entry = byBranch.get(row.branchId)!;
      entry.sales.push({ paymentMethod: row.paymentMethod, count, total });
      entry.totalSales += total;
      entry.totalCount += count;
    }

    let grandTotal = 0;
    let grandCount = 0;
    const branchSummaries = Array.from(byBranch.entries()).map(([branchId, data]) => {
      grandTotal += data.totalSales;
      grandCount += data.totalCount;
      return {
        branchId,
        branchName: branchMap.get(branchId) || branchId,
        sales: data.sales,
        totalSales: data.totalSales,
        totalCount: data.totalCount,
      };
    });

    return { branches: branchSummaries, grandTotal, grandCount };
  }

  /** List recent POS sales for a branch */
  async getPosSales(orgId: string, branchId?: string, date?: string, limit = 50) {
    const where: any = { organizationId: orgId };
    if (branchId) where.branchId = branchId;
    if (date) {
      const d = new Date(date);
      where.saleDate = { gte: startOfDay(d), lte: endOfDay(d) };
    }

    return this.prisma.posSale.findMany({
      where,
      include: {
        items: true,
        branch: { select: { id: true, name: true, city: true } },
      },
      orderBy: { saleDate: "desc" },
      take: limit,
    });
  }

  /** Sync logs history */
  async getPosSyncLogs(orgId: string, branchId?: string, limit = 20) {
    return this.prisma.posSyncLog.findMany({
      where: {
        organizationId: orgId,
        ...(branchId && { branchId }),
      },
      include: { branch: { select: { id: true, name: true, city: true } } },
      orderBy: { startedAt: "desc" },
      take: limit,
    });
  }

  private async createPosSyncLog(orgId: string, branchId: string, type: string, total: number) {
    return this.prisma.posSyncLog.create({
      data: {
        organizationId: orgId,
        branchId,
        syncType: type,
        status: "RUNNING",
        recordsTotal: total,
      },
    });
  }

  private async completePosSyncLog(id: string, synced: number, failed: number, error?: string) {
    return this.prisma.posSyncLog.update({
      where: { id },
      data: {
        status: failed === 0 ? "SUCCESS" : synced > 0 ? "PARTIAL" : "FAILED",
        recordsSynced: synced,
        recordsFailed: failed,
        errorMessage: error ?? null,
        completedAt: new Date(),
      },
    });
  }

  // ======================================================
  // LEGACY CORNTECH SYNC (existing endpoints)
  // ======================================================

  async getSyncLogs(branchId: string, syncType?: string) {
    return this.prisma.corntechSyncLog.findMany({
      where: {
        branchId,
        ...(syncType && { syncType }),
      },
      include: { branch: true },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  }

  async createSyncLog(data: { branchId: string; syncType: string }) {
    return this.prisma.corntechSyncLog.create({
      data: {
        branchId: data.branchId,
        syncType: data.syncType,
        status: "RUNNING",
      },
    });
  }

  async completeSyncLog(
    id: string,
    data: {
      status: string;
      recordsSynced?: number;
      errorMessage?: string;
    },
  ) {
    return this.prisma.corntechSyncLog.update({
      where: { id },
      data: {
        status: data.status as any,
        recordsSynced: data.recordsSynced || 0,
        errorMessage: data.errorMessage,
        completedAt: new Date(),
      },
    });
  }

  async getSales(branchId: string, startDate?: string, endDate?: string) {
    return this.prisma.corntechSale.findMany({
      where: {
        branchId,
        ...(startDate &&
          endDate && {
            saleDate: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
      },
      orderBy: { saleDate: "desc" },
      take: 200,
    });
  }

  async upsertSale(data: {
    branchId: string;
    corntechSaleId: string;
    saleDate: string;
    ticketNumber?: string;
    subtotal: number;
    tax: number;
    total: number;
    paymentMethod?: string;
    items?: any[];
  }) {
    const { saleDate, ...rest } = data;
    return this.prisma.corntechSale.upsert({
      where: {
        branchId_corntechSaleId: {
          branchId: data.branchId,
          corntechSaleId: data.corntechSaleId,
        },
      },
      update: {
        ...rest,
        saleDate: new Date(saleDate),
        items: data.items || [],
        syncedAt: new Date(),
      },
      create: {
        ...rest,
        saleDate: new Date(saleDate),
        items: data.items || [],
      },
    });
  }

  async bulkUpsertSales(
    branchId: string,
    sales: Array<{
      corntechSaleId: string;
      saleDate: string;
      ticketNumber?: string;
      subtotal: number;
      tax: number;
      total: number;
      paymentMethod?: string;
      items?: any[];
    }>,
  ) {
    const results = [];
    for (const sale of sales) {
      const result = await this.upsertSale({
        branchId,
        ...sale,
      });
      results.push(result);
    }
    return { synced: results.length };
  }

  async getCashClosings(branchId: string, startDate?: string, endDate?: string) {
    return this.prisma.corntechCashClosing.findMany({
      where: {
        branchId,
        ...(startDate &&
          endDate && {
            closingDate: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
      },
      orderBy: { closingDate: "desc" },
      take: 100,
    });
  }

  async upsertCashClosing(data: {
    branchId: string;
    corntechClosingId: string;
    closingDate: string;
    totalCash: number;
    totalCard: number;
    totalOther?: number;
    expectedTotal: number;
    actualTotal: number;
    difference?: number;
    cashierName?: string;
  }) {
    const { closingDate, ...rest } = data;
    const diff =
      data.difference !== undefined ? data.difference : data.actualTotal - data.expectedTotal;

    return this.prisma.corntechCashClosing.upsert({
      where: {
        branchId_corntechClosingId: {
          branchId: data.branchId,
          corntechClosingId: data.corntechClosingId,
        },
      },
      update: {
        ...rest,
        closingDate: new Date(closingDate),
        difference: diff,
        syncedAt: new Date(),
      },
      create: {
        ...rest,
        closingDate: new Date(closingDate),
        difference: diff,
      },
    });
  }
}
