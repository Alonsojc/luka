import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class RoleDashboardService {
  constructor(private prisma: PrismaService) {}

  // =========================================================================
  // STORE / BRANCH MANAGER DASHBOARD
  // =========================================================================
  async getStoreDashboard(
    organizationId: string,
    branchId: string,
    userId: string,
    dateRange?: { start: Date; end: Date },
  ) {
    const now = new Date();
    const todayStart =
      dateRange?.start ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd =
      dateRange?.end ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // --- Stock summary ---
    const inventory = await this.prisma.branchInventory.findMany({
      where: { branchId },
      include: { product: { select: { name: true, costPerUnit: true, sku: true } } },
    });

    const totalProducts = inventory.length;
    const lowStockItems = inventory.filter(
      (inv) =>
        Number(inv.currentQuantity) <= Number(inv.minimumStock) && Number(inv.minimumStock) > 0,
    );
    const lowStockCount = lowStockItems.length;
    const inventoryValue = inventory.reduce(
      (sum, inv) => sum + Number(inv.currentQuantity) * Number(inv.product.costPerUnit),
      0,
    );

    // --- Today's sales ---
    const [corntechAgg, posAgg] = await Promise.all([
      this.prisma.corntechSale.aggregate({
        where: { branchId, saleDate: { gte: todayStart, lte: todayEnd } },
        _sum: { total: true },
        _count: { id: true },
      }),
      this.prisma.posSale.aggregate({
        where: { branchId, saleDate: { gte: todayStart, lte: todayEnd } },
        _sum: { total: true },
        _count: { id: true },
      }),
    ]);

    const salesToday = Number(corntechAgg._sum.total || 0) + Number(posAgg._sum.total || 0);
    const salesCountToday = (corntechAgg._count.id || 0) + (posAgg._count.id || 0);

    // --- Pending requisitions for this branch ---
    const pendingRequisitions = await this.prisma.requisition.count({
      where: {
        requestingBranchId: branchId,
        status: { in: ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_FULFILLED"] },
      },
    });

    // --- Expiring lots (next 7 days) ---
    const expiringLots = await this.prisma.productLot.findMany({
      where: {
        branchId,
        status: "ACTIVE",
        expirationDate: { gte: now, lte: sevenDaysFromNow },
      },
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { expirationDate: "asc" },
      take: 15,
    });

    // --- Recent transfers (incoming + outgoing) ---
    const recentTransfers = await this.prisma.interBranchTransfer.findMany({
      where: {
        OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
        createdAt: { gte: weekAgo },
      },
      include: {
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // --- Waste this week vs last week ---
    const [wasteThisWeek, wasteLastWeek] = await Promise.all([
      this.prisma.wasteLog.aggregate({
        where: { branchId, reportedAt: { gte: weekAgo, lte: now } },
        _sum: { cost: true },
        _count: { id: true },
      }),
      this.prisma.wasteLog.aggregate({
        where: { branchId, reportedAt: { gte: twoWeeksAgo, lte: weekAgo } },
        _sum: { cost: true },
        _count: { id: true },
      }),
    ]);

    // --- Sales chart (by day or by week depending on range) ---
    const salesByDay: { date: string; total: number; count: number }[] = [];
    if (dateRange) {
      const rangeDays = Math.ceil(
        (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24),
      );
      const groupByWeek = rangeDays > 30;

      if (groupByWeek) {
        // Group by week
        const cursor = new Date(dateRange.start);
        while (cursor < dateRange.end) {
          const bucketStart = new Date(cursor);
          const bucketEnd = new Date(
            Math.min(cursor.getTime() + 7 * 24 * 60 * 60 * 1000 - 1, dateRange.end.getTime()),
          );
          const [cAgg, pAgg] = await Promise.all([
            this.prisma.corntechSale.aggregate({
              where: { branchId, saleDate: { gte: bucketStart, lte: bucketEnd } },
              _sum: { total: true },
              _count: { id: true },
            }),
            this.prisma.posSale.aggregate({
              where: { branchId, saleDate: { gte: bucketStart, lte: bucketEnd } },
              _sum: { total: true },
              _count: { id: true },
            }),
          ]);
          const label = `${bucketStart.getDate()}/${bucketStart.getMonth() + 1}`;
          salesByDay.push({
            date: label,
            total:
              Math.round((Number(cAgg._sum.total || 0) + Number(pAgg._sum.total || 0)) * 100) / 100,
            count: (cAgg._count.id || 0) + (pAgg._count.id || 0),
          });
          cursor.setDate(cursor.getDate() + 7);
        }
      } else {
        // Group by day
        const cursor = new Date(dateRange.start);
        const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
        while (cursor <= dateRange.end) {
          const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
          const dayEnd = new Date(
            cursor.getFullYear(),
            cursor.getMonth(),
            cursor.getDate(),
            23,
            59,
            59,
            999,
          );
          const [cAgg, pAgg] = await Promise.all([
            this.prisma.corntechSale.aggregate({
              where: { branchId, saleDate: { gte: dayStart, lte: dayEnd } },
              _sum: { total: true },
              _count: { id: true },
            }),
            this.prisma.posSale.aggregate({
              where: { branchId, saleDate: { gte: dayStart, lte: dayEnd } },
              _sum: { total: true },
              _count: { id: true },
            }),
          ]);
          salesByDay.push({
            date: dayNames[dayStart.getDay()],
            total:
              Math.round((Number(cAgg._sum.total || 0) + Number(pAgg._sum.total || 0)) * 100) / 100,
            count: (cAgg._count.id || 0) + (pAgg._count.id || 0),
          });
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    } else {
      // Default: last 7 days
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayEnd = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - i,
          23,
          59,
          59,
          999,
        );
        const [cAgg, pAgg] = await Promise.all([
          this.prisma.corntechSale.aggregate({
            where: { branchId, saleDate: { gte: dayStart, lte: dayEnd } },
            _sum: { total: true },
            _count: { id: true },
          }),
          this.prisma.posSale.aggregate({
            where: { branchId, saleDate: { gte: dayStart, lte: dayEnd } },
            _sum: { total: true },
            _count: { id: true },
          }),
        ]);
        const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
        salesByDay.push({
          date: dayNames[dayStart.getDay()],
          total:
            Math.round((Number(cAgg._sum.total || 0) + Number(pAgg._sum.total || 0)) * 100) / 100,
          count: (cAgg._count.id || 0) + (pAgg._count.id || 0),
        });
      }
    }

    return {
      type: "store" as const,
      stock: {
        totalProducts,
        lowStockCount,
        inventoryValue: Math.round(inventoryValue * 100) / 100,
        lowStockItems: lowStockItems.slice(0, 10).map((inv) => ({
          product: inv.product.name,
          sku: inv.product.sku,
          current: Number(inv.currentQuantity),
          minimum: Number(inv.minimumStock),
        })),
      },
      salesToday: {
        total: Math.round(salesToday * 100) / 100,
        count: salesCountToday,
      },
      pendingRequisitions,
      expiringLots: expiringLots.map((lot) => ({
        id: lot.id,
        product: lot.product.name,
        lotNumber: lot.lotNumber,
        expirationDate: lot.expirationDate,
        quantity: Number(lot.quantity),
        daysUntilExpiry: Math.ceil(
          (lot.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        ),
      })),
      recentTransfers: recentTransfers.map((t) => ({
        id: t.id,
        from: t.fromBranch.name,
        to: t.toBranch.name,
        status: t.status,
        createdAt: t.createdAt,
        direction: t.fromBranchId === branchId ? "OUTGOING" : "INCOMING",
      })),
      waste: {
        thisWeek: Math.round(Number(wasteThisWeek._sum.cost || 0) * 100) / 100,
        thisWeekCount: wasteThisWeek._count.id || 0,
        lastWeek: Math.round(Number(wasteLastWeek._sum.cost || 0) * 100) / 100,
        lastWeekCount: wasteLastWeek._count.id || 0,
      },
      salesByDay,
    };
  }

  // =========================================================================
  // CEDIS / WAREHOUSE MANAGER DASHBOARD
  // =========================================================================
  async getCedisDashboard(organizationId: string, dateRange?: { start: Date; end: Date }) {
    const now = new Date();
    const todayStart =
      dateRange?.start ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd =
      dateRange?.end ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const weekAgo = dateRange?.start ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const branches = await this.prisma.branch.findMany({
      where: { organizationId, isActive: true },
      select: { id: true },
    });
    const branchIds = branches.map((b) => b.id);

    // --- Pending requisitions by priority ---
    const requisitions = await this.prisma.requisition.findMany({
      where: {
        organizationId,
        status: { in: ["SUBMITTED", "APPROVED", "PARTIALLY_FULFILLED"] },
      },
      select: { priority: true, status: true, requestingBranchId: true },
    });

    const reqByPriority = {
      URGENT: requisitions.filter((r) => r.priority === "URGENT").length,
      HIGH: requisitions.filter((r) => r.priority === "HIGH").length,
      NORMAL: requisitions.filter((r) => r.priority === "NORMAL").length,
      LOW: requisitions.filter((r) => r.priority === "LOW").length,
      total: requisitions.length,
    };

    // --- Active transfers ---
    const activeTransfers = await this.prisma.interBranchTransfer.count({
      where: {
        OR: [{ fromBranchId: { in: branchIds } }, { toBranchId: { in: branchIds } }],
        status: "IN_TRANSIT",
      },
    });

    // --- Stock below minimum (reorder alerts) ---
    const allInventory = await this.prisma.branchInventory.findMany({
      where: { branchId: { in: branchIds } },
    });
    const reorderAlerts = allInventory.filter(
      (inv) =>
        Number(inv.currentQuantity) <= Number(inv.minimumStock) && Number(inv.minimumStock) > 0,
    ).length;

    // --- Today's dispatches (transfers created today) ---
    const todaysDispatches = await this.prisma.interBranchTransfer.count({
      where: {
        fromBranchId: { in: branchIds },
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    });

    // --- Lots expiring this week ---
    const expiringLots = await this.prisma.productLot.findMany({
      where: {
        branchId: { in: branchIds },
        status: "ACTIVE",
        expirationDate: { gte: now, lte: sevenDaysFromNow },
      },
      include: {
        product: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { expirationDate: "asc" },
      take: 15,
    });

    // --- Top 5 most requested products this week ---
    const recentReqItems = await this.prisma.requisitionItem.findMany({
      where: {
        requisition: {
          organizationId,
          createdAt: { gte: weekAgo },
        },
      },
      include: { product: { select: { name: true, sku: true } } },
    });

    const productRequestMap = new Map<
      string,
      { name: string; sku: string; count: number; totalQty: number }
    >();
    for (const item of recentReqItems) {
      const key = item.productId;
      const existing = productRequestMap.get(key) || {
        name: item.product.name,
        sku: item.product.sku,
        count: 0,
        totalQty: 0,
      };
      existing.count += 1;
      existing.totalQty += Number(item.requestedQuantity);
      productRequestMap.set(key, existing);
    }

    const topRequestedProducts = Array.from(productRequestMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // --- Urgent requisitions list ---
    const urgentReqs = await this.prisma.requisition.findMany({
      where: {
        organizationId,
        status: { in: ["SUBMITTED", "APPROVED"] },
        priority: { in: ["URGENT", "HIGH"] },
      },
      include: {
        requestingBranch: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return {
      type: "cedis" as const,
      requisitions: reqByPriority,
      activeTransfers,
      reorderAlerts,
      todaysDispatches,
      expiringLots: expiringLots.map((lot) => ({
        id: lot.id,
        product: lot.product.name,
        branch: lot.branch.name,
        lotNumber: lot.lotNumber,
        expirationDate: lot.expirationDate,
        quantity: Number(lot.quantity),
        daysUntilExpiry: Math.ceil(
          (lot.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        ),
      })),
      topRequestedProducts,
      urgentRequisitions: urgentReqs.map((r) => ({
        id: r.id,
        branch: r.requestingBranch.name,
        priority: r.priority,
        status: r.status,
        itemCount: r._count.items,
        createdAt: r.createdAt,
      })),
    };
  }

  // =========================================================================
  // INVESTOR DASHBOARD
  // =========================================================================
  async getInvestorDashboard(organizationId: string, dateRange?: { start: Date; end: Date }) {
    const now = new Date();
    const currentMonthStart = dateRange?.start ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd =
      dateRange?.end ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const branches = await this.prisma.branch.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true },
    });
    const branchIds = branches.map((b) => b.id);

    // --- Revenue this month vs last month ---
    const [curCorntech, curPos, prevCorntech, prevPos] = await Promise.all([
      this.prisma.corntechSale.aggregate({
        where: {
          branchId: { in: branchIds },
          saleDate: { gte: currentMonthStart, lte: currentMonthEnd },
        },
        _sum: { total: true },
      }),
      this.prisma.posSale.aggregate({
        where: { organizationId, saleDate: { gte: currentMonthStart, lte: currentMonthEnd } },
        _sum: { total: true },
      }),
      this.prisma.corntechSale.aggregate({
        where: {
          branchId: { in: branchIds },
          saleDate: { gte: prevMonthStart, lte: prevMonthEnd },
        },
        _sum: { total: true },
      }),
      this.prisma.posSale.aggregate({
        where: { organizationId, saleDate: { gte: prevMonthStart, lte: prevMonthEnd } },
        _sum: { total: true },
      }),
    ]);

    const revenueThisMonth = Number(curCorntech._sum.total || 0) + Number(curPos._sum.total || 0);
    const revenueLastMonth = Number(prevCorntech._sum.total || 0) + Number(prevPos._sum.total || 0);
    const revenueChange =
      revenueLastMonth > 0
        ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 10000) / 100
        : 0;

    // --- Expenses this month (purchase orders) ---
    const expensesAgg = await this.prisma.purchaseOrder.aggregate({
      where: {
        organizationId,
        status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
        createdAt: { gte: currentMonthStart, lte: currentMonthEnd },
      },
      _sum: { total: true },
    });
    const expensesThisMonth = Number(expensesAgg._sum.total || 0);

    // --- Gross margin ---
    const grossMargin =
      revenueThisMonth > 0
        ? Math.round(((revenueThisMonth - expensesThisMonth) / revenueThisMonth) * 10000) / 100
        : 0;

    // --- Revenue by branch (top 5) ---
    const branchRevenue: { name: string; revenue: number }[] = [];
    for (const br of branches) {
      const [cAgg, pAgg] = await Promise.all([
        this.prisma.corntechSale.aggregate({
          where: { branchId: br.id, saleDate: { gte: currentMonthStart, lte: currentMonthEnd } },
          _sum: { total: true },
        }),
        this.prisma.posSale.aggregate({
          where: { branchId: br.id, saleDate: { gte: currentMonthStart, lte: currentMonthEnd } },
          _sum: { total: true },
        }),
      ]);
      branchRevenue.push({
        name: br.name,
        revenue:
          Math.round((Number(cAgg._sum.total || 0) + Number(pAgg._sum.total || 0)) * 100) / 100,
      });
    }
    const topBranches = branchRevenue.sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    // --- Monthly revenue trend (12 months) ---
    const monthlyTrend: { month: string; revenue: number; expenses: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthNames = [
        "Ene",
        "Feb",
        "Mar",
        "Abr",
        "May",
        "Jun",
        "Jul",
        "Ago",
        "Sep",
        "Oct",
        "Nov",
        "Dic",
      ];
      const label = `${monthNames[mStart.getMonth()]} ${mStart.getFullYear().toString().slice(-2)}`;

      const [mCorntech, mPos, mExpenses] = await Promise.all([
        this.prisma.corntechSale.aggregate({
          where: { branchId: { in: branchIds }, saleDate: { gte: mStart, lte: mEnd } },
          _sum: { total: true },
        }),
        this.prisma.posSale.aggregate({
          where: { organizationId, saleDate: { gte: mStart, lte: mEnd } },
          _sum: { total: true },
        }),
        this.prisma.purchaseOrder.aggregate({
          where: {
            organizationId,
            status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] },
            createdAt: { gte: mStart, lte: mEnd },
          },
          _sum: { total: true },
        }),
      ]);

      monthlyTrend.push({
        month: label,
        revenue:
          Math.round((Number(mCorntech._sum.total || 0) + Number(mPos._sum.total || 0)) * 100) /
          100,
        expenses: Math.round(Number(mExpenses._sum.total || 0) * 100) / 100,
      });
    }

    // --- Cash position ---
    const bankAgg = await this.prisma.bankAccount.aggregate({
      where: { organizationId, isActive: true },
      _sum: { currentBalance: true },
    });
    const cashPosition = Math.round(Number(bankAgg._sum.currentBalance || 0) * 100) / 100;

    // --- Payroll cost ---
    const payrollAgg = await this.prisma.payrollPeriod.aggregate({
      where: {
        organizationId,
        startDate: { gte: currentMonthStart },
        endDate: { lte: currentMonthEnd },
      },
      _sum: { totalGross: true, totalEmployerCost: true },
    });
    const payrollCost =
      Number(payrollAgg._sum.totalGross || 0) + Number(payrollAgg._sum.totalEmployerCost || 0);

    // --- Food cost % ---
    const foodCostPct =
      revenueThisMonth > 0 ? Math.round((expensesThisMonth / revenueThisMonth) * 10000) / 100 : 0;

    return {
      type: "investor" as const,
      revenue: {
        thisMonth: Math.round(revenueThisMonth * 100) / 100,
        lastMonth: Math.round(revenueLastMonth * 100) / 100,
        change: revenueChange,
      },
      expenses: Math.round(expensesThisMonth * 100) / 100,
      grossMargin,
      topBranches,
      monthlyTrend,
      cashPosition,
      payrollCost: Math.round(payrollCost * 100) / 100,
      foodCostPct,
    };
  }

  // =========================================================================
  // ACCOUNTANT DASHBOARD
  // =========================================================================
  async getAccountantDashboard(organizationId: string, dateRange?: { start: Date; end: Date }) {
    const now = new Date();

    // --- Pending polizas (journal entries in DRAFT) ---
    const pendingPolizas = await this.prisma.journalEntry.count({
      where: { organizationId, status: "DRAFT" },
    });

    // --- Unreconciled bank transactions ---
    const bankAccounts = await this.prisma.bankAccount.findMany({
      where: { organizationId, isActive: true },
      select: { id: true },
    });
    const bankAccountIds = bankAccounts.map((b) => b.id);

    const unreconciledTxns =
      bankAccountIds.length > 0
        ? await this.prisma.bankTransaction.count({
            where: {
              bankAccountId: { in: bankAccountIds },
              isReconciled: false,
            },
          })
        : 0;

    // --- Open fiscal period ---
    const openPeriod = await this.prisma.fiscalPeriod.findFirst({
      where: { organizationId, status: "OPEN" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    // --- CxP overdue ---
    const cxpOverdue = await this.prisma.accountPayable.aggregate({
      where: {
        organizationId,
        status: "OVERDUE",
      },
      _sum: { balanceDue: true },
      _count: { id: true },
    });

    // --- CxC overdue ---
    const cxcOverdue = await this.prisma.accountReceivable.aggregate({
      where: {
        organizationId,
        status: "OVERDUE",
      },
      _sum: { balanceDue: true },
      _count: { id: true },
    });

    // --- Pending CFDI (draft) ---
    const pendingCfdi = await this.prisma.cFDI.count({
      where: { organizationId, status: "DRAFT" },
    });

    // --- ISR/IVA provisional (sum from revenue CFDIs this month or dateRange) ---
    const currentMonthStart = dateRange?.start ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd =
      dateRange?.end ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const revenueCfdis = await this.prisma.cFDI.findMany({
      where: {
        organizationId,
        cfdiType: "INGRESO",
        status: "STAMPED",
        stampedAt: { gte: currentMonthStart, lte: currentMonthEnd },
      },
      select: { subtotal: true, total: true },
    });

    const totalSubtotal = revenueCfdis.reduce((sum, c) => sum + Number(c.subtotal), 0);
    const totalTotal = revenueCfdis.reduce((sum, c) => sum + Number(c.total), 0);
    const ivaEstimate = Math.round((totalTotal - totalSubtotal) * 100) / 100;
    const isrEstimate = Math.round(totalSubtotal * 0.1 * 100) / 100; // Simplified ISR provisional

    return {
      type: "accountant" as const,
      pendingPolizas,
      unreconciledTxns,
      openPeriod: openPeriod
        ? { year: openPeriod.year, month: openPeriod.month, status: openPeriod.status }
        : null,
      cxpOverdue: {
        count: cxpOverdue._count.id || 0,
        amount: Math.round(Number(cxpOverdue._sum.balanceDue || 0) * 100) / 100,
      },
      cxcOverdue: {
        count: cxcOverdue._count.id || 0,
        amount: Math.round(Number(cxcOverdue._sum.balanceDue || 0) * 100) / 100,
      },
      pendingCfdi,
      taxEstimates: {
        ivaProvisional: ivaEstimate,
        isrProvisional: isrEstimate,
      },
    };
  }

  // =========================================================================
  // AUTO-DETECT ROLE AND RETURN APPROPRIATE DASHBOARD
  // =========================================================================
  async getMyDashboard(
    organizationId: string,
    userId: string,
    roles: Array<{ branchId: string | null; roleName: string }>,
    dateRange?: { start: Date; end: Date },
  ) {
    // Priority order for role selection
    const rolePriority = [
      "owner",
      "admin",
      "investor",
      "accountant",
      "cedis_manager",
      "zone_manager",
      "branch_manager",
      "cashier",
    ];

    const userRoleNames = roles.map((r) => r.roleName);
    let selectedRole = "branch_manager"; // default

    for (const role of rolePriority) {
      if (userRoleNames.includes(role)) {
        selectedRole = role;
        break;
      }
    }

    switch (selectedRole) {
      case "owner":
      case "admin":
      case "investor":
        return this.getInvestorDashboard(organizationId, dateRange);

      case "accountant":
        return this.getAccountantDashboard(organizationId, dateRange);

      case "cedis_manager":
        return this.getCedisDashboard(organizationId, dateRange);

      case "zone_manager":
      case "branch_manager":
      case "cashier":
      default: {
        // Find the first branch the user is assigned to
        const branchRole = roles.find((r) => r.branchId);
        if (branchRole?.branchId) {
          return this.getStoreDashboard(organizationId, branchRole.branchId, userId, dateRange);
        }
        // If no specific branch, get first org branch
        const firstBranch = await this.prisma.branch.findFirst({
          where: { organizationId, isActive: true },
          select: { id: true },
        });
        if (firstBranch) {
          return this.getStoreDashboard(organizationId, firstBranch.id, userId, dateRange);
        }
        return { type: "store" as const, error: "No branch found" };
      }
    }
  }
}
