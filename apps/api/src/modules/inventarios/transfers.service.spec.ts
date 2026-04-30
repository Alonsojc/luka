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
        findFirst: vi.fn(),
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
      productLot: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      interBranchTransferLotAllocation: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
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

  describe("findOne", () => {
    it("should scope transfer lookup to the organization on both branches", async () => {
      mockPrisma.interBranchTransfer.findFirst.mockResolvedValue(baseTransfer);

      const result = await service.findOne(ORG_ID, "transfer-1");

      expect(result).toEqual(baseTransfer);
      expect(mockPrisma.interBranchTransfer.findFirst).toHaveBeenCalledWith({
        where: {
          id: "transfer-1",
          fromBranch: { organizationId: ORG_ID },
          toBranch: { organizationId: ORG_ID },
        },
        include: expect.any(Object),
      });
    });
  });

  describe("ship", () => {
    it("should allow partial shipment and record sent quantity before reception", async () => {
      mockPrisma.interBranchTransfer.findFirst.mockResolvedValue(baseTransfer);
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

    it("should allocate source lots by expiration when shipping from CEDIS", async () => {
      const firstExpiration = new Date("2026-05-01T00:00:00.000Z");
      const secondExpiration = new Date("2026-05-10T00:00:00.000Z");
      mockPrisma.interBranchTransfer.findFirst.mockResolvedValue(baseTransfer);
      mockPrisma.branchInventory.findUnique.mockResolvedValue({ currentQuantity: 20 });
      mockPrisma.productLot.findMany.mockResolvedValue([
        {
          id: "lot-early",
          lotNumber: "LOT-EARLY",
          expirationDate: firstExpiration,
          quantity: 6,
          initialQuantity: 6,
          unitCost: 110,
          status: "ACTIVE",
        },
        {
          id: "lot-later",
          lotNumber: "LOT-LATER",
          expirationDate: secondExpiration,
          quantity: 10,
          initialQuantity: 10,
          unitCost: 120,
          status: "ACTIVE",
        },
      ]);
      mockPrisma.interBranchTransfer.update.mockResolvedValue({
        ...baseTransfer,
        status: "IN_TRANSIT",
      });

      await service.ship(
        "transfer-1",
        { items: [{ itemId: "transfer-item-1", sentQuantity: 8 }] },
        USER_ID,
        ORG_ID,
      );

      expect(mockPrisma.productLot.update).toHaveBeenNthCalledWith(1, {
        where: { id: "lot-early" },
        data: { quantity: 0, status: "CONSUMED" },
      });
      expect(mockPrisma.productLot.update).toHaveBeenNthCalledWith(2, {
        where: { id: "lot-later" },
        data: { quantity: 8, status: "ACTIVE" },
      });
      expect(mockPrisma.interBranchTransferLotAllocation.create).toHaveBeenNthCalledWith(1, {
        data: {
          transferItemId: "transfer-item-1",
          sourceLotId: "lot-early",
          lotNumber: "LOT-EARLY",
          expirationDate: firstExpiration,
          quantity: 6,
          unitCost: 110,
        },
      });
      expect(mockPrisma.interBranchTransferLotAllocation.create).toHaveBeenNthCalledWith(2, {
        data: {
          transferItemId: "transfer-item-1",
          sourceLotId: "lot-later",
          lotNumber: "LOT-LATER",
          expirationDate: secondExpiration,
          quantity: 2,
          unitCost: 120,
        },
      });
    });

    it("should reject shipping more than requested", async () => {
      mockPrisma.interBranchTransfer.findFirst.mockResolvedValue(baseTransfer);

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
      mockPrisma.interBranchTransfer.findFirst.mockResolvedValue({
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
      mockPrisma.interBranchTransfer.findFirst.mockResolvedValue({
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

    it("should recreate received lot allocations at the destination branch", async () => {
      const expirationDate = new Date("2026-05-01T00:00:00.000Z");
      mockPrisma.interBranchTransfer.findFirst.mockResolvedValue({
        ...baseTransfer,
        status: "IN_TRANSIT",
        items: [{ ...baseTransfer.items[0], sentQuantity: 8 }],
      });
      mockPrisma.interBranchTransferLotAllocation.findMany.mockResolvedValue([
        {
          id: "alloc-1",
          transferItemId: "transfer-item-1",
          lotNumber: "LOT-EARLY",
          expirationDate,
          quantity: 8,
          receivedQuantity: 0,
          unitCost: 110,
        },
      ]);
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

      expect(mockPrisma.productLot.upsert).toHaveBeenCalledWith({
        where: {
          branchId_productId_lotNumber: {
            branchId: "branch-1",
            productId: "product-1",
            lotNumber: "LOT-EARLY",
          },
        },
        update: {
          quantity: { increment: 8 },
          initialQuantity: { increment: 8 },
          unitCost: 110,
          status: "ACTIVE",
        },
        create: {
          organizationId: ORG_ID,
          branchId: "branch-1",
          productId: "product-1",
          lotNumber: "LOT-EARLY",
          batchDate: expect.any(Date),
          expirationDate,
          quantity: 8,
          initialQuantity: 8,
          unitCost: 110,
          receivedById: USER_ID,
          status: "ACTIVE",
          notes: "Transferencia transfer-1",
        },
      });
      expect(mockPrisma.interBranchTransferLotAllocation.update).toHaveBeenCalledWith({
        where: { id: "alloc-1" },
        data: { receivedQuantity: { increment: 8 } },
      });
    });

    it("should mark linked requisition fulfilled when received covers requested", async () => {
      mockPrisma.interBranchTransfer.findFirst.mockResolvedValue({
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

  describe("cancel", () => {
    it("should restore allocated source lots when an in-transit transfer is cancelled", async () => {
      mockPrisma.interBranchTransfer.findFirst.mockResolvedValue({
        ...baseTransfer,
        status: "IN_TRANSIT",
        items: [{ ...baseTransfer.items[0], sentQuantity: 8 }],
      });
      mockPrisma.interBranchTransferLotAllocation.findMany.mockResolvedValue([
        {
          id: "alloc-1",
          quantity: 8,
          receivedQuantity: 0,
          sourceLot: {
            id: "lot-early",
            quantity: 0,
            initialQuantity: 8,
            status: "CONSUMED",
          },
        },
      ]);

      await service.cancel("transfer-1", USER_ID, ORG_ID);

      expect(mockPrisma.branchInventory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { currentQuantity: { increment: 8 } },
        }),
      );
      expect(mockPrisma.productLot.update).toHaveBeenCalledWith({
        where: { id: "lot-early" },
        data: {
          quantity: { increment: 8 },
          status: "ACTIVE",
        },
      });
      expect(mockPrisma.interBranchTransfer.update).toHaveBeenCalledWith({
        where: { id: "transfer-1" },
        data: { status: "CANCELLED" },
      });
    });
  });
});
