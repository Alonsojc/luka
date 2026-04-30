import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { LoyaltyService } from "./loyalty.service";
import { PrismaService } from "../../common/prisma/prisma.service";

describe("LoyaltyService", () => {
  let service: LoyaltyService;
  let mockPrisma: any;

  const ORG_ID = "org-1";

  const mockProgram = {
    id: "program-1",
    organizationId: ORG_ID,
    name: "Luka Rewards",
    pointsPerDollar: 10,
    pointValue: 0.1,
    minRedemption: 100,
    expirationDays: null,
    isActive: true,
    tiers: [
      { name: "Bronce", minPoints: 0, multiplier: 1 },
      { name: "Plata", minPoints: 500, multiplier: 1.5 },
      { name: "Oro", minPoints: 2000, multiplier: 2 },
    ],
  };

  const mockCustomer = {
    id: "customer-1",
    organizationId: ORG_ID,
    name: "Juan Perez",
    email: "juan@example.com",
    phone: "5551234567",
    loyaltyPoints: 300,
    loyaltyTier: "Bronce",
    totalPointsEarned: 300,
  };

  const mockReward = {
    id: "reward-1",
    organizationId: ORG_ID,
    name: "Poke Bowl Gratis",
    pointsCost: 200,
    category: "PRODUCT",
    isActive: true,
    maxRedemptions: null,
    currentRedemptions: 0,
    validUntil: null,
  };

  beforeEach(async () => {
    mockPrisma = {
      loyaltyProgram: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      customer: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
        aggregate: vi.fn(),
        groupBy: vi.fn(),
      },
      loyaltyTransaction: {
        create: vi.fn(),
        findMany: vi.fn(),
        aggregate: vi.fn(),
        groupBy: vi.fn(),
      },
      loyaltyReward: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LoyaltyService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<LoyaltyService>(LoyaltyService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // getProgram
  // -----------------------------------------------------------------------
  describe("getProgram", () => {
    it("should return existing loyalty program", async () => {
      mockPrisma.loyaltyProgram.findUnique.mockResolvedValue(mockProgram);

      const result = await service.getProgram(ORG_ID);

      expect(result).toEqual(mockProgram);
      expect(mockPrisma.loyaltyProgram.findUnique).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
      });
    });

    it("should create a default program if none exists", async () => {
      mockPrisma.loyaltyProgram.findUnique.mockResolvedValue(null);
      mockPrisma.loyaltyProgram.create.mockResolvedValue(mockProgram);

      const result = await service.getProgram(ORG_ID);

      expect(result).toEqual(mockProgram);
      expect(mockPrisma.loyaltyProgram.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            name: "Luka Rewards",
            pointsPerDollar: 10,
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // earnPoints
  // -----------------------------------------------------------------------
  describe("earnPoints", () => {
    it("should create loyalty transaction and update customer points", async () => {
      mockPrisma.loyaltyProgram.findUnique.mockResolvedValue(mockProgram);
      mockPrisma.customer.findFirst.mockResolvedValue(mockCustomer);

      const mockTransaction = {
        id: "tx-1",
        type: "EARN",
        points: 1000,
        balance: 1300,
      };
      mockPrisma.loyaltyTransaction.create.mockResolvedValue(mockTransaction);
      mockPrisma.customer.update.mockResolvedValue({
        ...mockCustomer,
        loyaltyPoints: 1300,
      });

      const result = await service.earnPoints(ORG_ID, {
        customerId: "customer-1",
        amount: 100,
        branchId: "branch-1",
      });

      expect(result).toBeDefined();
      expect(result.pointsEarned).toBe(1000); // 100 * 10 * 1 (Bronce multiplier)
      expect(result.newBalance).toBe(1300); // 300 + 1000
      expect(result.multiplier).toBe(1);
      expect(mockPrisma.loyaltyTransaction.create).toHaveBeenCalled();
      expect(mockPrisma.customer.update).toHaveBeenCalled();
    });

    it("should throw BadRequestException if program is inactive", async () => {
      mockPrisma.loyaltyProgram.findUnique.mockResolvedValue({
        ...mockProgram,
        isActive: false,
      });

      await expect(
        service.earnPoints(ORG_ID, {
          customerId: "customer-1",
          amount: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException if customer not found", async () => {
      mockPrisma.loyaltyProgram.findUnique.mockResolvedValue(mockProgram);
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.earnPoints(ORG_ID, {
          customerId: "nonexistent",
          amount: 100,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // redeemPoints
  // -----------------------------------------------------------------------
  describe("redeemPoints", () => {
    it("should create redemption transaction", async () => {
      mockPrisma.loyaltyProgram.findUnique.mockResolvedValue(mockProgram);
      mockPrisma.customer.findFirst.mockResolvedValue(mockCustomer);
      mockPrisma.loyaltyReward.findFirst.mockResolvedValue(mockReward);

      const mockTransaction = {
        id: "tx-2",
        type: "REDEEM",
        points: -200,
        balance: 100,
      };
      mockPrisma.loyaltyTransaction.create.mockResolvedValue(mockTransaction);
      mockPrisma.customer.update.mockResolvedValue({
        ...mockCustomer,
        loyaltyPoints: 100,
      });
      mockPrisma.loyaltyReward.update.mockResolvedValue({
        ...mockReward,
        currentRedemptions: 1,
      });

      const result = await service.redeemPoints(ORG_ID, {
        customerId: "customer-1",
        rewardId: "reward-1",
      });

      expect(result).toBeDefined();
      expect(result.pointsRedeemed).toBe(200);
      expect(result.rewardName).toBe("Poke Bowl Gratis");
      expect(result.newBalance).toBe(100);
      expect(mockPrisma.loyaltyTransaction.create).toHaveBeenCalled();
      expect(mockPrisma.customer.update).toHaveBeenCalled();
      expect(mockPrisma.loyaltyReward.update).toHaveBeenCalled();
    });

    it("should throw BadRequestException for insufficient points", async () => {
      const poorCustomer = { ...mockCustomer, loyaltyPoints: 50 };
      mockPrisma.loyaltyProgram.findUnique.mockResolvedValue(mockProgram);
      mockPrisma.customer.findFirst.mockResolvedValue(poorCustomer);
      mockPrisma.loyaltyReward.findFirst.mockResolvedValue(mockReward);

      await expect(
        service.redeemPoints(ORG_ID, {
          customerId: "customer-1",
          rewardId: "reward-1",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if program is inactive", async () => {
      mockPrisma.loyaltyProgram.findUnique.mockResolvedValue({
        ...mockProgram,
        isActive: false,
      });

      await expect(
        service.redeemPoints(ORG_ID, {
          customerId: "customer-1",
          points: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // getCustomerDetail (customer history)
  // -----------------------------------------------------------------------
  describe("getCustomerDetail", () => {
    it("should return customer with transaction history", async () => {
      const customerWithTx = {
        ...mockCustomer,
        loyaltyTransactions: [
          {
            id: "tx-1",
            type: "EARN",
            points: 100,
            createdAt: new Date(),
            branch: { name: "Centro", code: "CNT" },
          },
        ],
      };
      mockPrisma.customer.findFirst.mockResolvedValue(customerWithTx);
      mockPrisma.loyaltyProgram.findUnique.mockResolvedValue(mockProgram);

      const result = await service.getCustomerDetail(ORG_ID, "customer-1");

      expect(result).toBeDefined();
      expect(result.loyaltyTransactions).toHaveLength(1);
      expect(result.currentTier).toBeDefined();
      expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "customer-1", organizationId: ORG_ID },
        }),
      );
    });

    it("should throw NotFoundException if customer not found", async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.getCustomerDetail(ORG_ID, "nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // getRewards (findAllRewards)
  // -----------------------------------------------------------------------
  describe("getRewards", () => {
    it("should return rewards list", async () => {
      const rewards = [mockReward];
      mockPrisma.loyaltyReward.findMany.mockResolvedValue(rewards);

      const result = await service.getRewards(ORG_ID);

      expect(result).toEqual(rewards);
      expect(mockPrisma.loyaltyReward.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        orderBy: { pointsCost: "asc" },
      });
    });
  });
});
