import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { AccountsPayableService } from "./accounts-payable.service";
import { PrismaService } from "../../common/prisma/prisma.service";

describe("AccountsPayableService", () => {
  let service: AccountsPayableService;
  let mockPrisma: any;

  const ORG_ID = "org-1";

  const mockPayable = {
    id: "ap-1",
    organizationId: ORG_ID,
    supplierId: "supplier-1",
    branchId: "branch-1",
    invoiceNumber: "FAC-001",
    amount: 10000,
    balanceDue: 10000,
    dueDate: new Date("2026-05-01"),
    status: "PENDING",
    supplier: { id: "supplier-1", name: "Proveedor 1" },
    branch: { id: "branch-1", name: "Centro" },
    payments: [],
  };

  beforeEach(async () => {
    mockPrisma = {
      accountPayable: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      payment: { create: vi.fn() },
      bankAccount: { update: vi.fn() },
      $transaction: vi.fn((fn) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsPayableService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AccountsPayableService>(AccountsPayableService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findOne", () => {
    it("should throw NotFoundException when payable not found", async () => {
      mockPrisma.accountPayable.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, "bad-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("create", () => {
    it("should set balanceDue equal to amount on creation", async () => {
      mockPrisma.accountPayable.create.mockResolvedValue(mockPayable);

      await service.create(ORG_ID, {
        supplierId: "supplier-1",
        branchId: "branch-1",
        amount: 5000,
        dueDate: "2026-06-01",
      });

      const createCall = mockPrisma.accountPayable.create.mock.calls[0][0];
      expect(createCall.data.balanceDue).toBe(5000);
      expect(createCall.data.amount).toBe(5000);
    });
  });

  describe("registerPayment", () => {
    it("should mark as PAID when full amount is paid", async () => {
      mockPrisma.accountPayable.findFirst.mockResolvedValue(mockPayable);
      mockPrisma.payment.create.mockResolvedValue({});
      mockPrisma.accountPayable.update.mockResolvedValue({
        ...mockPayable,
        balanceDue: 0,
        status: "PAID",
      });

      const result = await service.registerPayment(ORG_ID, "ap-1", {
        amount: 10000,
        paymentDate: "2026-04-14",
        paymentMethod: "transfer",
      });

      expect(result.status).toBe("PAID");
      const updateCall = mockPrisma.accountPayable.update.mock.calls[0][0];
      expect(updateCall.data.balanceDue).toBe(0);
      expect(updateCall.data.status).toBe("PAID");
    });

    it("should mark as PARTIALLY_PAID when partial amount is paid", async () => {
      mockPrisma.accountPayable.findFirst.mockResolvedValue(mockPayable);
      mockPrisma.payment.create.mockResolvedValue({});
      mockPrisma.accountPayable.update.mockResolvedValue({
        ...mockPayable,
        balanceDue: 5000,
        status: "PARTIALLY_PAID",
      });

      await service.registerPayment(ORG_ID, "ap-1", {
        amount: 5000,
        paymentDate: "2026-04-14",
        paymentMethod: "transfer",
      });

      const updateCall = mockPrisma.accountPayable.update.mock.calls[0][0];
      expect(updateCall.data.balanceDue).toBe(5000);
      expect(updateCall.data.status).toBe("PARTIALLY_PAID");
    });

    it("should decrement bank account balance when bankAccountId provided", async () => {
      mockPrisma.accountPayable.findFirst.mockResolvedValue(mockPayable);
      mockPrisma.payment.create.mockResolvedValue({});
      mockPrisma.accountPayable.update.mockResolvedValue(mockPayable);

      await service.registerPayment(ORG_ID, "ap-1", {
        amount: 3000,
        paymentDate: "2026-04-14",
        paymentMethod: "transfer",
        bankAccountId: "bank-1",
      });

      expect(mockPrisma.bankAccount.update).toHaveBeenCalledWith({
        where: { id: "bank-1" },
        data: { currentBalance: { decrement: 3000 } },
      });
    });

    it("should NOT update bank account when no bankAccountId", async () => {
      mockPrisma.accountPayable.findFirst.mockResolvedValue(mockPayable);
      mockPrisma.payment.create.mockResolvedValue({});
      mockPrisma.accountPayable.update.mockResolvedValue(mockPayable);

      await service.registerPayment(ORG_ID, "ap-1", {
        amount: 3000,
        paymentDate: "2026-04-14",
        paymentMethod: "cash",
      });

      expect(mockPrisma.bankAccount.update).not.toHaveBeenCalled();
    });

    it("should never set balanceDue below zero", async () => {
      mockPrisma.accountPayable.findFirst.mockResolvedValue({
        ...mockPayable,
        balanceDue: 100,
      });
      mockPrisma.payment.create.mockResolvedValue({});
      mockPrisma.accountPayable.update.mockResolvedValue(mockPayable);

      await service.registerPayment(ORG_ID, "ap-1", {
        amount: 200,
        paymentDate: "2026-04-14",
        paymentMethod: "cash",
      });

      const updateCall = mockPrisma.accountPayable.update.mock.calls[0][0];
      expect(updateCall.data.balanceDue).toBe(0);
    });
  });
});
