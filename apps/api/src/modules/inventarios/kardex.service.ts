import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

interface KardexFilters {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  movementType?: string;
}

interface PaginationFilters extends KardexFilters {
  productId?: string;
  page?: number;
  limit?: number;
}

interface GlobalFilters {
  branchId?: string;
  productId?: string;
  dateFrom?: string;
  dateTo?: string;
  movementType?: string;
  groupBy?: "product" | "branch" | "movementType";
  page?: number;
  limit?: number;
}

const ENTRY_TYPES = ["IN", "TRANSFER_IN"];
const EXIT_TYPES = ["OUT", "TRANSFER_OUT", "WASTE", "SALE_DEDUCTION"];

function toNumber(val: any): number {
  if (val == null) return 0;
  return typeof val === "number" ? val : Number(val);
}

function isEntryType(type: string): boolean {
  return ENTRY_TYPES.includes(type);
}

function isExitType(type: string): boolean {
  return EXIT_TYPES.includes(type);
}

/**
 * Returns a signed quantity: positive for entries, negative for exits.
 * ADJUSTMENT keeps its original sign (can be positive or negative).
 */
function signedQuantity(movementType: string, quantity: number): number {
  if (isEntryType(movementType)) return Math.abs(quantity);
  if (isExitType(movementType)) return -Math.abs(quantity);
  // ADJUSTMENT: keep as-is (already signed in the DB)
  return quantity;
}

@Injectable()
export class KardexService {
  constructor(private prisma: PrismaService) {}

  /**
   * Full Kardex for a product: every movement with running balance.
   */
  async getKardex(organizationId: string, productId: string, filters?: KardexFilters) {
    // 1. Build where clause
    const where: any = {
      productId,
      product: { organizationId },
    };

    if (filters?.branchId) {
      where.branchId = filters.branchId;
    }
    if (filters?.movementType) {
      where.movementType = filters.movementType;
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.timestamp = {};
      if (filters.dateFrom) where.timestamp.gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        where.timestamp.lte = to;
      }
    }

    // 2. If dateFrom is set, calculate the balance before that date
    let initialBalance = 0;
    if (filters?.dateFrom) {
      const priorWhere: any = {
        productId,
        product: { organizationId },
        timestamp: { lt: new Date(filters.dateFrom) },
      };
      if (filters.branchId) priorWhere.branchId = filters.branchId;

      const priorMovements = await this.prisma.inventoryMovement.findMany({
        where: priorWhere,
        select: { movementType: true, quantity: true },
      });

      for (const m of priorMovements) {
        initialBalance += signedQuantity(m.movementType, toNumber(m.quantity));
      }
    }

    // 3. Fetch movements with relations
    const movements = await this.prisma.inventoryMovement.findMany({
      where,
      include: {
        branch: { select: { name: true, code: true } },
        product: {
          select: { name: true, sku: true, unitOfMeasure: true, costPerUnit: true },
        },
      },
      orderBy: { timestamp: "asc" },
    });

    // 4. Fetch user names for all movements
    const userIds = [...new Set(movements.filter((m) => m.userId).map((m) => m.userId!))];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    // 5. Build rows with running balance
    let runningBalance = initialBalance;
    const product = movements.length > 0 ? movements[0].product : null;

    const rows = movements.map((m) => {
      const qty = toNumber(m.quantity);
      const signed = signedQuantity(m.movementType, qty);
      runningBalance += signed;
      const unitCost = toNumber(m.unitCost) || toNumber(product?.costPerUnit);
      const totalCost = Math.abs(signed) * unitCost;

      return {
        id: m.id,
        timestamp: m.timestamp,
        movementType: m.movementType,
        quantity: signed,
        runningBalance: Math.round(runningBalance * 10000) / 10000,
        unitCost,
        totalCost: Math.round(totalCost * 100) / 100,
        branchName: m.branch.name,
        branchCode: m.branch.code,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        notes: m.notes,
        userName: m.userId ? userMap.get(m.userId) || "Sistema" : "Sistema",
      };
    });

    // 6. Get product info even if no movements
    let productInfo = product;
    if (!productInfo) {
      productInfo = await this.prisma.product.findFirst({
        where: { id: productId, organizationId },
        select: { name: true, sku: true, unitOfMeasure: true, costPerUnit: true },
      });
    }

    return {
      product: productInfo
        ? {
            id: productId,
            name: productInfo.name,
            sku: productInfo.sku,
            unitOfMeasure: productInfo.unitOfMeasure,
            costPerUnit: toNumber(productInfo.costPerUnit),
          }
        : null,
      initialBalance,
      movements: rows,
      totalMovements: rows.length,
    };
  }

  /**
   * Summary stats for a product (optionally filtered by branch).
   */
  async getKardexSummary(organizationId: string, productId: string, branchId?: string) {
    // Current stock from BranchInventory
    const inventoryWhere: any = { productId };
    if (branchId) inventoryWhere.branchId = branchId;

    const inventoryRecords = await this.prisma.branchInventory.findMany({
      where: inventoryWhere,
      include: { branch: { select: { name: true } } },
    });

    const currentStock = inventoryRecords.reduce((sum, r) => sum + toNumber(r.currentQuantity), 0);

    // Product info
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      select: { name: true, sku: true, unitOfMeasure: true, costPerUnit: true },
    });

    const costPerUnit = toNumber(product?.costPerUnit);

    // Movement aggregates
    const movementWhere: any = {
      productId,
      product: { organizationId },
    };
    if (branchId) movementWhere.branchId = branchId;

    const allMovements = await this.prisma.inventoryMovement.findMany({
      where: movementWhere,
      select: { movementType: true, quantity: true, unitCost: true, timestamp: true },
      orderBy: { timestamp: "desc" },
    });

    let totalEntries = 0;
    let totalExits = 0;
    let totalAdjustments = 0;
    let costSum = 0;
    let costCount = 0;

    for (const m of allMovements) {
      const qty = Math.abs(toNumber(m.quantity));
      if (isEntryType(m.movementType)) {
        totalEntries += qty;
      } else if (isExitType(m.movementType)) {
        totalExits += qty;
      } else {
        totalAdjustments += qty;
      }
      const uc = toNumber(m.unitCost);
      if (uc > 0) {
        costSum += uc;
        costCount++;
      }
    }

    const averageCost = costCount > 0 ? costSum / costCount : costPerUnit;
    const lastMovement = allMovements.length > 0 ? allMovements[0].timestamp : null;

    return {
      product: product
        ? {
            id: productId,
            name: product.name,
            sku: product.sku,
            unitOfMeasure: product.unitOfMeasure,
          }
        : null,
      currentStock: Math.round(currentStock * 10000) / 10000,
      stockValue: Math.round(currentStock * costPerUnit * 100) / 100,
      totalEntries: Math.round(totalEntries * 10000) / 10000,
      totalExits: Math.round(totalExits * 10000) / 10000,
      totalAdjustments: Math.round(totalAdjustments * 10000) / 10000,
      averageCost: Math.round(averageCost * 100) / 100,
      costPerUnit,
      lastMovementDate: lastMovement,
      stockByBranch: inventoryRecords.map((r) => ({
        branchName: r.branch.name,
        quantity: toNumber(r.currentQuantity),
      })),
    };
  }

  /**
   * All movements for a branch with pagination.
   */
  async getMovementsByBranch(
    organizationId: string,
    branchId: string,
    filters?: PaginationFilters,
  ) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      branchId,
      product: { organizationId },
    };

    if (filters?.productId) where.productId = filters.productId;
    if (filters?.movementType) where.movementType = filters.movementType;
    if (filters?.dateFrom || filters?.dateTo) {
      where.timestamp = {};
      if (filters.dateFrom) where.timestamp.gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        where.timestamp.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          product: { select: { name: true, sku: true, unitOfMeasure: true, costPerUnit: true } },
          branch: { select: { name: true } },
        },
        orderBy: { timestamp: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    // User names
    const userIds = [...new Set(data.filter((m) => m.userId).map((m) => m.userId!))];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    const movements = data.map((m) => {
      const qty = toNumber(m.quantity);
      const signed = signedQuantity(m.movementType, qty);
      const unitCost = toNumber(m.unitCost) || toNumber(m.product.costPerUnit);

      return {
        id: m.id,
        timestamp: m.timestamp,
        movementType: m.movementType,
        quantity: signed,
        unitCost,
        totalCost: Math.round(Math.abs(signed) * unitCost * 100) / 100,
        productName: m.product.name,
        productSku: m.product.sku,
        unitOfMeasure: m.product.unitOfMeasure,
        branchName: m.branch.name,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        notes: m.notes,
        userName: m.userId ? userMap.get(m.userId) || "Sistema" : "Sistema",
      };
    });

    return {
      data: movements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Cross-branch movement report with grouping options.
   */
  async getGlobalKardex(organizationId: string, filters?: GlobalFilters) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      product: { organizationId },
    };

    if (filters?.branchId) where.branchId = filters.branchId;
    if (filters?.productId) where.productId = filters.productId;
    if (filters?.movementType) where.movementType = filters.movementType;
    if (filters?.dateFrom || filters?.dateTo) {
      where.timestamp = {};
      if (filters.dateFrom) where.timestamp.gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        where.timestamp.lte = to;
      }
    }

    // If groupBy is specified, return aggregated data
    if (filters?.groupBy) {
      return this.getGroupedData(where, filters.groupBy, organizationId);
    }

    const [data, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          product: { select: { name: true, sku: true, unitOfMeasure: true, costPerUnit: true } },
          branch: { select: { name: true, code: true } },
        },
        orderBy: { timestamp: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    const userIds = [...new Set(data.filter((m) => m.userId).map((m) => m.userId!))];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    const movements = data.map((m) => {
      const qty = toNumber(m.quantity);
      const signed = signedQuantity(m.movementType, qty);
      const unitCost = toNumber(m.unitCost) || toNumber(m.product.costPerUnit);

      return {
        id: m.id,
        timestamp: m.timestamp,
        movementType: m.movementType,
        quantity: signed,
        unitCost,
        totalCost: Math.round(Math.abs(signed) * unitCost * 100) / 100,
        productName: m.product.name,
        productSku: m.product.sku,
        branchName: m.branch.name,
        branchCode: m.branch.code,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        notes: m.notes,
        userName: m.userId ? userMap.get(m.userId) || "Sistema" : "Sistema",
      };
    });

    return {
      data: movements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async getGroupedData(
    where: any,
    groupBy: "product" | "branch" | "movementType",
    organizationId: string,
  ) {
    const allMovements = await this.prisma.inventoryMovement.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, costPerUnit: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    if (groupBy === "product") {
      const groups = new Map<
        string,
        {
          name: string;
          sku: string;
          entries: number;
          exits: number;
          adjustments: number;
          totalCost: number;
        }
      >();

      for (const m of allMovements) {
        const key = m.productId;
        if (!groups.has(key)) {
          groups.set(key, {
            name: m.product.name,
            sku: m.product.sku,
            entries: 0,
            exits: 0,
            adjustments: 0,
            totalCost: 0,
          });
        }
        const g = groups.get(key)!;
        const qty = Math.abs(toNumber(m.quantity));
        const cost = qty * (toNumber(m.unitCost) || toNumber(m.product.costPerUnit));

        if (isEntryType(m.movementType)) g.entries += qty;
        else if (isExitType(m.movementType)) g.exits += qty;
        else g.adjustments += qty;
        g.totalCost += cost;
      }

      return {
        groupBy: "product",
        data: Array.from(groups.entries()).map(([id, g]) => ({
          productId: id,
          ...g,
          totalCost: Math.round(g.totalCost * 100) / 100,
        })),
      };
    }

    if (groupBy === "branch") {
      const groups = new Map<
        string,
        {
          name: string;
          code: string;
          entries: number;
          exits: number;
          adjustments: number;
          totalMovements: number;
        }
      >();

      for (const m of allMovements) {
        const key = m.branchId;
        if (!groups.has(key)) {
          groups.set(key, {
            name: m.branch.name,
            code: m.branch.code,
            entries: 0,
            exits: 0,
            adjustments: 0,
            totalMovements: 0,
          });
        }
        const g = groups.get(key)!;
        const qty = Math.abs(toNumber(m.quantity));
        g.totalMovements++;

        if (isEntryType(m.movementType)) g.entries += qty;
        else if (isExitType(m.movementType)) g.exits += qty;
        else g.adjustments += qty;
      }

      return {
        groupBy: "branch",
        data: Array.from(groups.entries()).map(([id, g]) => ({
          branchId: id,
          ...g,
        })),
      };
    }

    // groupBy === "movementType"
    const groups = new Map<string, { count: number; totalQuantity: number; totalCost: number }>();

    for (const m of allMovements) {
      const key = m.movementType;
      if (!groups.has(key)) {
        groups.set(key, { count: 0, totalQuantity: 0, totalCost: 0 });
      }
      const g = groups.get(key)!;
      const qty = Math.abs(toNumber(m.quantity));
      g.count++;
      g.totalQuantity += qty;
      g.totalCost += qty * (toNumber(m.unitCost) || toNumber(m.product.costPerUnit));
    }

    return {
      groupBy: "movementType",
      data: Array.from(groups.entries()).map(([type, g]) => ({
        movementType: type,
        ...g,
        totalCost: Math.round(g.totalCost * 100) / 100,
      })),
    };
  }
}
