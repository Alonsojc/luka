import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

interface TierConfig {
  name: string;
  minPoints: number;
  multiplier: number;
}

const DEFAULT_TIERS: TierConfig[] = [
  { name: "Bronce", minPoints: 0, multiplier: 1 },
  { name: "Plata", minPoints: 500, multiplier: 1.5 },
  { name: "Oro", minPoints: 2000, multiplier: 2 },
];

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // Program configuration
  // ---------------------------------------------------------------

  async getProgram(organizationId: string) {
    let program = await this.prisma.loyaltyProgram.findUnique({
      where: { organizationId },
    });

    if (!program) {
      program = await this.prisma.loyaltyProgram.create({
        data: {
          organizationId,
          name: "Luka Rewards",
          pointsPerDollar: 10,
          pointValue: 0.1,
          minRedemption: 100,
          isActive: true,
          tiers: DEFAULT_TIERS,
        },
      });
    }

    return program;
  }

  async updateProgram(
    organizationId: string,
    data: {
      name?: string;
      pointsPerDollar?: number;
      pointValue?: number;
      minRedemption?: number;
      expirationDays?: number | null;
      isActive?: boolean;
      tiers?: TierConfig[];
    },
  ) {
    await this.getProgram(organizationId);
    return this.prisma.loyaltyProgram.update({
      where: { organizationId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.pointsPerDollar !== undefined && {
          pointsPerDollar: data.pointsPerDollar,
        }),
        ...(data.pointValue !== undefined && { pointValue: data.pointValue }),
        ...(data.minRedemption !== undefined && {
          minRedemption: data.minRedemption,
        }),
        ...(data.expirationDays !== undefined && {
          expirationDays: data.expirationDays,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.tiers !== undefined && { tiers: data.tiers }),
      },
    });
  }

  // ---------------------------------------------------------------
  // Customer listing with loyalty info
  // ---------------------------------------------------------------

  async getCustomers(organizationId: string) {
    return this.prisma.customer.findMany({
      where: { organizationId },
      orderBy: { loyaltyPoints: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        loyaltyPoints: true,
        loyaltyTier: true,
        totalPointsEarned: true,
        registeredAt: true,
        updatedAt: true,
        loyaltyTransactions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
  }

  async getCustomerDetail(organizationId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      include: {
        loyaltyTransactions: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { branch: { select: { name: true, code: true } } },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException("Cliente no encontrado");
    }

    const program = await this.getProgram(organizationId);
    const tiers = (program.tiers as TierConfig[] | null) || DEFAULT_TIERS;
    const currentTier = this.getCustomerTier(customer.totalPointsEarned, tiers);
    const nextTier = this.getNextTier(customer.totalPointsEarned, tiers);

    return {
      ...customer,
      currentTier,
      nextTier,
      pointsToNextTier: nextTier ? nextTier.minPoints - customer.totalPointsEarned : 0,
    };
  }

  // ---------------------------------------------------------------
  // Earn points
  // ---------------------------------------------------------------

  async earnPoints(
    organizationId: string,
    data: {
      customerId: string;
      amount: number;
      branchId?: string;
      description?: string;
    },
  ) {
    const program = await this.getProgram(organizationId);
    if (!program.isActive) {
      throw new BadRequestException("El programa de lealtad no esta activo");
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, organizationId },
    });
    if (!customer) {
      throw new NotFoundException("Cliente no encontrado");
    }

    const tiers = (program.tiers as TierConfig[] | null) || DEFAULT_TIERS;
    const currentTier = this.getCustomerTier(customer.totalPointsEarned, tiers);
    const multiplier = currentTier?.multiplier || 1;

    const basePoints = Math.floor(data.amount * program.pointsPerDollar);
    const earnedPoints = Math.floor(basePoints * multiplier);

    const newBalance = customer.loyaltyPoints + earnedPoints;
    const newTotalEarned = customer.totalPointsEarned + earnedPoints;

    const expiresAt =
      program.expirationDays != null
        ? new Date(Date.now() + program.expirationDays * 24 * 60 * 60 * 1000)
        : null;

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.loyaltyTransaction.create({
        data: {
          organizationId,
          customerId: data.customerId,
          branchId: data.branchId || null,
          type: "EARN",
          points: earnedPoints,
          balance: newBalance,
          description: data.description || `Puntos por compra de $${data.amount.toFixed(2)}`,
          referenceType: "SALE",
          expiresAt,
        },
      });

      const newTier = this.getCustomerTier(newTotalEarned, tiers);

      await tx.customer.update({
        where: { id: data.customerId },
        data: {
          loyaltyPoints: newBalance,
          totalPointsEarned: newTotalEarned,
          loyaltyTier: newTier?.name || "Bronce",
        },
      });

      return {
        transaction,
        pointsEarned: earnedPoints,
        multiplier,
        newBalance,
        tier: newTier?.name || "Bronce",
      };
    });
  }

  // ---------------------------------------------------------------
  // Redeem points
  // ---------------------------------------------------------------

  async redeemPoints(
    organizationId: string,
    data: {
      customerId: string;
      rewardId?: string;
      points?: number;
      branchId?: string;
    },
  ) {
    const program = await this.getProgram(organizationId);
    if (!program.isActive) {
      throw new BadRequestException("El programa de lealtad no esta activo");
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, organizationId },
    });
    if (!customer) {
      throw new NotFoundException("Cliente no encontrado");
    }

    let pointsToRedeem: number;
    let description: string;
    let rewardName: string | null = null;

    if (data.rewardId) {
      const reward = await this.prisma.loyaltyReward.findFirst({
        where: { id: data.rewardId, organizationId, isActive: true },
      });
      if (!reward) {
        throw new NotFoundException("Recompensa no encontrada");
      }
      if (reward.maxRedemptions != null && reward.currentRedemptions >= reward.maxRedemptions) {
        throw new BadRequestException("Esta recompensa ha alcanzado su limite de canjes");
      }
      if (reward.validUntil && new Date(reward.validUntil) < new Date()) {
        throw new BadRequestException("Esta recompensa ha expirado");
      }
      pointsToRedeem = reward.pointsCost;
      description = `Canje: ${reward.name}`;
      rewardName = reward.name;
    } else if (data.points) {
      pointsToRedeem = data.points;
      description = `Canje de ${data.points} puntos`;
    } else {
      throw new BadRequestException("Debe especificar rewardId o points para canjear");
    }

    if (pointsToRedeem < program.minRedemption) {
      throw new BadRequestException(`Minimo de canje: ${program.minRedemption} puntos`);
    }

    if (customer.loyaltyPoints < pointsToRedeem) {
      throw new BadRequestException(
        `Puntos insuficientes. Balance: ${customer.loyaltyPoints}, requeridos: ${pointsToRedeem}`,
      );
    }

    const newBalance = customer.loyaltyPoints - pointsToRedeem;

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.loyaltyTransaction.create({
        data: {
          organizationId,
          customerId: data.customerId,
          branchId: data.branchId || null,
          type: "REDEEM",
          points: -pointsToRedeem,
          balance: newBalance,
          description,
          referenceType: data.rewardId ? "PROMOTION" : "MANUAL",
          referenceId: data.rewardId || null,
        },
      });

      await tx.customer.update({
        where: { id: data.customerId },
        data: { loyaltyPoints: newBalance },
      });

      if (data.rewardId) {
        await tx.loyaltyReward.update({
          where: { id: data.rewardId },
          data: { currentRedemptions: { increment: 1 } },
        });
      }

      return {
        transaction,
        pointsRedeemed: pointsToRedeem,
        rewardName,
        newBalance,
      };
    });
  }

  // ---------------------------------------------------------------
  // Adjust points (admin)
  // ---------------------------------------------------------------

  async adjustPoints(
    organizationId: string,
    data: { customerId: string; points: number; description?: string },
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, organizationId },
    });
    if (!customer) {
      throw new NotFoundException("Cliente no encontrado");
    }

    const newBalance = customer.loyaltyPoints + data.points;
    if (newBalance < 0) {
      throw new BadRequestException("El ajuste resultaria en un balance negativo");
    }

    const newTotalEarned =
      data.points > 0 ? customer.totalPointsEarned + data.points : customer.totalPointsEarned;

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.loyaltyTransaction.create({
        data: {
          organizationId,
          customerId: data.customerId,
          type: "ADJUST",
          points: data.points,
          balance: newBalance,
          description:
            data.description || `Ajuste manual: ${data.points > 0 ? "+" : ""}${data.points} puntos`,
          referenceType: "MANUAL",
        },
      });

      const program = await this.getProgram(organizationId);
      const tiers = (program.tiers as TierConfig[] | null) || DEFAULT_TIERS;
      const newTier = this.getCustomerTier(newTotalEarned, tiers);

      await tx.customer.update({
        where: { id: data.customerId },
        data: {
          loyaltyPoints: newBalance,
          totalPointsEarned: newTotalEarned,
          loyaltyTier: newTier?.name || "Bronce",
        },
      });

      return { transaction, newBalance, tier: newTier?.name || "Bronce" };
    });
  }

  // ---------------------------------------------------------------
  // Rewards CRUD
  // ---------------------------------------------------------------

  async getRewards(organizationId: string) {
    return this.prisma.loyaltyReward.findMany({
      where: { organizationId },
      orderBy: { pointsCost: "asc" },
    });
  }

  async createReward(
    organizationId: string,
    data: {
      name: string;
      description?: string;
      pointsCost: number;
      category?: string;
      isActive?: boolean;
      imageUrl?: string;
      maxRedemptions?: number;
      validFrom?: string;
      validUntil?: string;
    },
  ) {
    return this.prisma.loyaltyReward.create({
      data: {
        organizationId,
        name: data.name,
        description: data.description,
        pointsCost: data.pointsCost,
        category: data.category || "PRODUCT",
        isActive: data.isActive !== false,
        imageUrl: data.imageUrl,
        maxRedemptions: data.maxRedemptions,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
      },
    });
  }

  async updateReward(
    organizationId: string,
    rewardId: string,
    data: {
      name?: string;
      description?: string;
      pointsCost?: number;
      category?: string;
      isActive?: boolean;
      imageUrl?: string;
      maxRedemptions?: number;
      validFrom?: string;
      validUntil?: string;
    },
  ) {
    const reward = await this.prisma.loyaltyReward.findFirst({
      where: { id: rewardId, organizationId },
    });
    if (!reward) {
      throw new NotFoundException("Recompensa no encontrada");
    }

    return this.prisma.loyaltyReward.update({
      where: { id: rewardId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.pointsCost !== undefined && { pointsCost: data.pointsCost }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.maxRedemptions !== undefined && {
          maxRedemptions: data.maxRedemptions,
        }),
        ...(data.validFrom !== undefined && {
          validFrom: data.validFrom ? new Date(data.validFrom) : null,
        }),
        ...(data.validUntil !== undefined && {
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
        }),
      },
    });
  }

  async deactivateReward(organizationId: string, rewardId: string) {
    const reward = await this.prisma.loyaltyReward.findFirst({
      where: { id: rewardId, organizationId },
    });
    if (!reward) {
      throw new NotFoundException("Recompensa no encontrada");
    }

    return this.prisma.loyaltyReward.update({
      where: { id: rewardId },
      data: { isActive: false },
    });
  }

  // ---------------------------------------------------------------
  // Dashboard stats
  // ---------------------------------------------------------------

  async getDashboard(organizationId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalMembers,
      tierDistribution,
      monthlyEarned,
      monthlyRedeemed,
      topRedeemers,
      totalPointsInCirculation,
      redemptionsByReward,
    ] = await Promise.all([
      // Total members
      this.prisma.customer.count({ where: { organizationId } }),

      // Tier distribution
      this.prisma.customer.groupBy({
        by: ["loyaltyTier"],
        where: { organizationId },
        _count: { id: true },
      }),

      // Points earned this month
      this.prisma.loyaltyTransaction.aggregate({
        where: {
          organizationId,
          type: "EARN",
          createdAt: { gte: startOfMonth },
        },
        _sum: { points: true },
      }),

      // Points redeemed this month
      this.prisma.loyaltyTransaction.aggregate({
        where: {
          organizationId,
          type: "REDEEM",
          createdAt: { gte: startOfMonth },
        },
        _sum: { points: true },
      }),

      // Top redeemers
      this.prisma.customer.findMany({
        where: { organizationId, loyaltyPoints: { gt: 0 } },
        orderBy: { loyaltyPoints: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          loyaltyPoints: true,
          loyaltyTier: true,
          totalPointsEarned: true,
        },
      }),

      // Total points in circulation
      this.prisma.customer.aggregate({
        where: { organizationId },
        _sum: { loyaltyPoints: true },
      }),

      // Redemptions by reward (last 30 days)
      this.prisma.loyaltyTransaction.groupBy({
        by: ["referenceId"],
        where: {
          organizationId,
          type: "REDEEM",
          referenceType: "PROMOTION",
          referenceId: { not: null },
          createdAt: {
            gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        _count: { id: true },
      }),
    ]);

    // Active members: those with at least one transaction in last 30 days
    const activeMembers = await this.prisma.customer.count({
      where: {
        organizationId,
        loyaltyTransactions: {
          some: {
            createdAt: {
              gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
      },
    });

    // Enrich redemptions with reward names
    const rewardIds = redemptionsByReward
      .map((r) => r.referenceId)
      .filter((id): id is string => id != null);

    const rewards =
      rewardIds.length > 0
        ? await this.prisma.loyaltyReward.findMany({
            where: { id: { in: rewardIds } },
            select: { id: true, name: true },
          })
        : [];

    const rewardMap = new Map(rewards.map((r) => [r.id, r.name]));

    return {
      totalMembers,
      activeMembers,
      pointsInCirculation: totalPointsInCirculation._sum.loyaltyPoints || 0,
      pointsEarnedThisMonth: monthlyEarned._sum.points || 0,
      pointsRedeemedThisMonth: Math.abs(monthlyRedeemed._sum.points || 0),
      topRedeemers: topRedeemers.map((c) => ({
        customerId: c.id,
        name: c.name,
        points: c.loyaltyPoints,
        tier: c.loyaltyTier,
      })),
      tierDistribution: tierDistribution.map((t) => ({
        tier: t.loyaltyTier,
        count: t._count.id,
      })),
      redemptionsByReward: redemptionsByReward.map((r) => ({
        rewardId: r.referenceId,
        name: rewardMap.get(r.referenceId!) || "Desconocido",
        count: r._count.id,
      })),
    };
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  private getCustomerTier(totalPointsEarned: number, tiers: TierConfig[]): TierConfig | null {
    const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
    for (const tier of sorted) {
      if (totalPointsEarned >= tier.minPoints) {
        return tier;
      }
    }
    return tiers[0] || null;
  }

  private getNextTier(totalPointsEarned: number, tiers: TierConfig[]): TierConfig | null {
    const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints);
    for (const tier of sorted) {
      if (totalPointsEarned < tier.minPoints) {
        return tier;
      }
    }
    return null;
  }
}
