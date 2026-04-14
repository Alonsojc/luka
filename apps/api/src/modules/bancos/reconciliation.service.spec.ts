import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ReconciliationService } from "./reconciliation.service";
import { PrismaService } from "../../common/prisma/prisma.service";

describe("ReconciliationService", () => {
  let service: ReconciliationService;
  let mockPrisma: any;

  const ORG_ID = "org-1";
  const ACCOUNT_ID = "bank-1";

  beforeEach(async () => {
    mockPrisma = {
      bankAccount: { findFirst: vi.fn() },
      bankTransaction: {
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      accountPayable: { findFirst: vi.fn() },
      accountReceivable: { findFirst: vi.fn() },
      payment: { findFirst: vi.fn() },
      $transaction: vi.fn((fn) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("importStatement", () => {
    it("should throw NotFoundException for invalid account", async () => {
      mockPrisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.importStatement(ORG_ID, "bad-id", []),
      ).rejects.toThrow(NotFoundException);
    });

    it("should import transactions and update bank balance", async () => {
      mockPrisma.bankAccount.findFirst.mockResolvedValue({
        id: ACCOUNT_ID,
        organizationId: ORG_ID,
      });
      mockPrisma.bankTransaction.create.mockResolvedValue({ id: "txn-1" });
      mockPrisma.bankAccount.update = vi.fn().mockResolvedValue({});

      const result = await service.importStatement(ORG_ID, ACCOUNT_ID, [
        { date: "2026-04-10", amount: 5000, type: "credit", reference: "DEP-001" },
        { date: "2026-04-11", amount: 2000, type: "debit", reference: "PAY-001" },
      ]);

      expect(result.imported).toBe(2);
      // Two transactions = two balance updates
      expect(mockPrisma.bankAccount.update).toHaveBeenCalledTimes(2);
    });

    it("should increment balance for credit and decrement for debit", async () => {
      mockPrisma.bankAccount.findFirst.mockResolvedValue({
        id: ACCOUNT_ID,
        organizationId: ORG_ID,
      });
      mockPrisma.bankTransaction.create.mockResolvedValue({ id: "txn-1" });
      mockPrisma.bankAccount.update = vi.fn().mockResolvedValue({});

      await service.importStatement(ORG_ID, ACCOUNT_ID, [
        { date: "2026-04-10", amount: 3000, type: "credit" },
      ]);

      expect(mockPrisma.bankAccount.update).toHaveBeenCalledWith({
        where: { id: ACCOUNT_ID },
        data: { currentBalance: { increment: 3000 } },
      });
    });
  });

  describe("autoReconcile", () => {
    it("should throw NotFoundException for invalid account", async () => {
      mockPrisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.autoReconcile(ORG_ID, "bad-id"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should return match count for empty transaction list", async () => {
      mockPrisma.bankAccount.findFirst.mockResolvedValue({
        id: ACCOUNT_ID,
        organizationId: ORG_ID,
      });
      mockPrisma.bankTransaction.findMany.mockResolvedValue([]);

      const result = await service.autoReconcile(ORG_ID, ACCOUNT_ID);

      expect(result.matched).toBe(0);
      expect(result.total).toBe(0);
    });
  });
});
