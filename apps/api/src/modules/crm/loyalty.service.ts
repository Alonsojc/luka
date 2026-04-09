import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  async getTransactions(customerId: string) {
    return this.prisma.loyaltyTransaction.findMany({
      where: { customerId },
      include: { branch: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async earnPoints(data: {
    customerId: string;
    organizationId: string;
    branchId: string;
    points: number;
    referenceType?: string;
    referenceId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const currentCustomer = await tx.customer.findUnique({
        where: { id: data.customerId },
      });
      if (!currentCustomer) {
        throw new NotFoundException("Cliente no encontrado");
      }

      const newBalance = currentCustomer.loyaltyPoints + data.points;

      const transaction = await tx.loyaltyTransaction.create({
        data: {
          organizationId: data.organizationId || currentCustomer.organizationId,
          customerId: data.customerId,
          branchId: data.branchId,
          type: "EARN",
          points: data.points,
          balance: newBalance,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
        },
      });

      const customer = await tx.customer.update({
        where: { id: data.customerId },
        data: {
          loyaltyPoints: newBalance,
          totalPointsEarned: { increment: data.points },
        },
      });

      // Auto-upgrade tier based on total points
      let newTier = customer.tier;
      if (customer.totalPointsEarned >= 5000) {
        newTier = "GOLD";
      } else if (customer.totalPointsEarned >= 2000) {
        newTier = "SILVER";
      }

      if (newTier !== customer.tier) {
        await tx.customer.update({
          where: { id: data.customerId },
          data: { tier: newTier },
        });
      }

      return transaction;
    });
  }

  async redeemPoints(data: {
    customerId: string;
    organizationId: string;
    branchId: string;
    points: number;
    referenceType?: string;
    referenceId?: string;
  }) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: data.customerId },
    });

    if (!customer) {
      throw new NotFoundException("Cliente no encontrado");
    }

    if (customer.loyaltyPoints < data.points) {
      throw new NotFoundException("Puntos insuficientes");
    }

    const newBalance = customer.loyaltyPoints - data.points;

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.loyaltyTransaction.create({
        data: {
          organizationId: data.organizationId || customer.organizationId,
          customerId: data.customerId,
          branchId: data.branchId,
          type: "REDEEM",
          points: -data.points,
          balance: newBalance,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
        },
      });

      await tx.customer.update({
        where: { id: data.customerId },
        data: {
          loyaltyPoints: newBalance,
        },
      });

      return transaction;
    });
  }

  async adjustPoints(data: {
    customerId: string;
    organizationId: string;
    branchId: string;
    points: number;
    referenceType?: string;
    referenceId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const currentCustomer = await tx.customer.findUnique({
        where: { id: data.customerId },
      });
      if (!currentCustomer) {
        throw new NotFoundException("Cliente no encontrado");
      }

      const newBalance =
        data.points > 0
          ? currentCustomer.loyaltyPoints + data.points
          : currentCustomer.loyaltyPoints - Math.abs(data.points);

      const transaction = await tx.loyaltyTransaction.create({
        data: {
          organizationId: data.organizationId || currentCustomer.organizationId,
          customerId: data.customerId,
          branchId: data.branchId,
          type: "ADJUST",
          points: data.points,
          balance: newBalance,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
        },
      });

      if (data.points > 0) {
        await tx.customer.update({
          where: { id: data.customerId },
          data: {
            loyaltyPoints: { increment: data.points },
            totalPointsEarned: { increment: data.points },
          },
        });
      } else {
        await tx.customer.update({
          where: { id: data.customerId },
          data: { loyaltyPoints: { decrement: Math.abs(data.points) } },
        });
      }

      return transaction;
    });
  }
}
