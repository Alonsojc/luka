import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { TransfersService } from "./transfers.service";

describe("TransfersService", () => {
  let service: TransfersService;
  let mockPrisma: any;
  let mockAudit: any;

  const ORG_ID = "org-1";
  const USER_ID = "user-1";

  const baseTransfer = {
    id: "transfer-1",
    fromBranchId: "cedis-1",
    toBranchId: "branch-1",
    status: "APPROVED",
    fromBranch: { id: "cedis-1", name: "CEDIS", code: "CDS" },
    toBranch: { id: "branch-1", name: "Sucursal Centro", code: "CTR" },
    items: [
      {
        id: "transfer-item-1",
        productId: "product-1",
        requestedQuantity: 10,
        sentQuantity: null,
        receivedQuantity: null,
        product: { id: "product-1", name: "Salmon", sku: "SAL-001", unitOfMeasure: "kg" },
      },
    ],
  };

  beforeEach(async () => {
    mockPrisma = {
      interBranchTransfer: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      interBranchTransferItem: {
        update: vi.fn(),
      },
      branchInventory: {
        findUnique: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      inventoryMovement: {
        create: vi.fn(),
      },
      requisition: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(mockPrisma)),
    };
    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransfersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<TransfersService>(TransfersService);
  });

  describe("ship", () => {
    it("should allow partial shipment and record sent quantity before reception", async () => {
      mockPrisma.interBranchTransfer.findUnique.mockResolvedValue(baseTransfer);
      mockPrisma.branchInventory.findUnique.mockResolvedValue({ currentQuantity: 20 });
      mockPrisma.interBranchTransfer.update.mockResolvedValue({
        ...baseTransfer,
        status: "IN_TRANSIT",
      });

      const result = await service.ship(
        "transfer-1",
        { items: [{ itemId: "transfer-item-1", sentQuantity: 8 }] },
        USER_ID,
        ORG_ID,
      );

      expect(result.status).toBe("IN_TRANSIT");
      expect(mockPrisma.interBranchTransferItem.update).toHaveBeenCalledWith({
        where: { id: "transfer-item-1" },
        data: { sentQuantity: 8 },
      });
      expect(mockPrisma.branchInventory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { currentQuantity: { decrement: 8 } },
        }),
      );
      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          movementType: "TRANSFER_OUT",
          quantity: 8,
          notes: "Envio parcial: solicitado 10, enviado 8",
        }),
      });
    });

    it("should reject shipping more than requested", async () => {
      mockPrisma.interBranchTransfer.findUnique.mockResolvedValue(baseTransfer);

      await expect(
        service.ship(
          "transfer-1",
          { items: [{ itemId: "transfer-item-1", sentQuantity: 11 }] },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.branchInventory.update).not.toHaveBeenCalled();
    });
  });

  describe("receive", () => {
    it("should reject receiving more than CEDIS sent", async () => {
      mockPrisma.interBranchTransfer.findUnique.mockResolvedValue({
        ...baseTransfer,
        status: "IN_TRANSIT",
        items: [{ ...baseTransfer.items[0], sentQuantity: 8 }],
      });

      await expect(
        service.receive(
          "transfer-1",
          { items: [{ itemId: "transfer-item-1", receivedQuantity: 9 }] },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.branchInventory.upsert).not.toHaveBeenCalled();
    });

    it("should mark linked requisition partially fulfilled when received is below requested", async () => {
      mockPrisma.interBranchTransfer.findUnique.mockResolvedValue({
        ...baseTransfer,
        status: "IN_TRANSIT",
        items: [{ ...baseTransfer.items[0], sentQuantity: 8 }],
      });
      mockPrisma.interBranchTransfer.update.mockResolvedValue({
        ...baseTransfer,
        status: "RECEIVED",
      });
      mockPrisma.requisition.findFirst.mockResolvedValue({ id: "req-1" });

      await service.receive(
        "transfer-1",
        { items: [{ itemId: "transfer-item-1", receivedQuantity: 8 }] },
        USER_ID,
        ORG_ID,
      );

      expect(mockPrisma.branchInventory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { currentQuantity: { increment: 8 } },
        }),
      );
      expect(mockPrisma.requisition.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: { status: "PARTIALLY_FULFILLED" },
      });
    });

    it("should mark linked requisition fulfilled when received covers requested", async () => {
      mockPrisma.interBranchTransfer.findUnique.mockResolvedValue({
        ...baseTransfer,
        status: "IN_TRANSIT",
        items: [{ ...baseTransfer.items[0], sentQuantity: 10 }],
      });
      mockPrisma.interBranchTransfer.update.mockResolvedValue({
        ...baseTransfer,
        status: "RECEIVED",
      });
      mockPrisma.requisition.findFirst.mockResolvedValue({ id: "req-1" });

      await service.receive(
        "transfer-1",
        { items: [{ itemId: "transfer-item-1", receivedQuantity: 10 }] },
        USER_ID,
        ORG_ID,
      );

      expect(mockPrisma.requisition.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: { status: "FULFILLED" },
      });
    });
  });
});
