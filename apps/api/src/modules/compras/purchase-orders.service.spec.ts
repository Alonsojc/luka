import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { PrismaService } from "../../common/prisma/prisma.service";

describe("PurchaseOrdersService", () => {
  let service: PurchaseOrdersService;
  let mockPrisma: any;

  const ORG_ID = "org-1";
  const USER_ID = "user-1";

  const mockPO = {
    id: "po-1",
    organizationId: ORG_ID,
    branchId: "branch-1",
    supplierId: "supplier-1",
    status: "DRAFT",
    subtotal: 1000,
    tax: 160,
    total: 1160,
    createdById: USER_ID,
    items: [
      {
        id: "item-1",
        productId: "product-1",
        quantity: 10,
        unitPrice: 100,
        receivedQuantity: 0,
        unitOfMeasure: "kg",
      },
    ],
    supplier: { id: "supplier-1", name: "Proveedor 1" },
    branch: { id: "branch-1", name: "Sucursal Centro" },
  };

  beforeEach(async () => {
    mockPrisma = {
      purchaseOrder: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      purchaseOrderItem: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      branchInventory: { upsert: vi.fn() },
      inventoryMovement: { create: vi.fn() },
      $transaction: vi.fn((fn) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PurchaseOrdersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findOne", () => {
    it("should return PO when found", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(mockPO);

      const result = await service.findOne(ORG_ID, "po-1");

      expect(result).toEqual(mockPO);
      expect(mockPrisma.purchaseOrder.findFirst).toHaveBeenCalledWith({
        where: { id: "po-1", organizationId: ORG_ID },
        include: expect.any(Object),
      });
    });

    it("should throw NotFoundException when PO not found", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, "bad-id")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("should calculate subtotal, tax (16%), and total correctly", async () => {
      mockPrisma.purchaseOrder.create.mockResolvedValue(mockPO);

      await service.create(ORG_ID, USER_ID, {
        branchId: "branch-1",
        supplierId: "supplier-1",
        items: [
          { productId: "p1", quantity: 5, unitPrice: 200, unitOfMeasure: "kg" },
          { productId: "p2", quantity: 10, unitPrice: 50, unitOfMeasure: "lt" },
        ],
      });

      const createCall = mockPrisma.purchaseOrder.create.mock.calls[0][0];
      // 5*200 + 10*50 = 1500 subtotal
      expect(createCall.data.subtotal).toBe(1500);
      // 1500 * 0.16 = 240 tax
      expect(createCall.data.tax).toBe(240);
      // 1500 + 240 = 1740 total
      expect(createCall.data.total).toBe(1740);
    });

    it("should set createdById and organizationId", async () => {
      mockPrisma.purchaseOrder.create.mockResolvedValue(mockPO);

      await service.create(ORG_ID, USER_ID, {
        branchId: "branch-1",
        supplierId: "supplier-1",
        items: [{ productId: "p1", quantity: 1, unitPrice: 100, unitOfMeasure: "pz" }],
      });

      const createCall = mockPrisma.purchaseOrder.create.mock.calls[0][0];
      expect(createCall.data.organizationId).toBe(ORG_ID);
      expect(createCall.data.createdById).toBe(USER_ID);
    });
  });

  describe("send", () => {
    it("should change status to SENT for draft orders", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(mockPO);
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        status: "SENT",
      });

      const result = await service.send(ORG_ID, "po-1");

      expect(result.status).toBe("SENT");
    });

    it("should throw BadRequestException for non-draft orders", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
        ...mockPO,
        status: "SENT",
      });

      await expect(service.send(ORG_ID, "po-1")).rejects.toThrow(BadRequestException);
    });
  });

  describe("receive", () => {
    it("should throw BadRequestException for draft orders", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(mockPO);

      await expect(
        service.receive(ORG_ID, "po-1", USER_ID, [{ itemId: "item-1", receivedQuantity: 10 }]),
      ).rejects.toThrow(BadRequestException);
    });

    it("should mark as RECEIVED when all items fully received", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
        ...mockPO,
        status: "SENT",
      });
      mockPrisma.purchaseOrderItem.update.mockResolvedValue({});
      mockPrisma.branchInventory.upsert.mockResolvedValue({});
      mockPrisma.inventoryMovement.create.mockResolvedValue({});
      mockPrisma.purchaseOrderItem.findMany.mockResolvedValue([
        { quantity: 10, receivedQuantity: 10 },
      ]);
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        status: "RECEIVED",
      });

      const result = await service.receive(ORG_ID, "po-1", USER_ID, [
        { itemId: "item-1", receivedQuantity: 10 },
      ]);

      expect(result.status).toBe("RECEIVED");
    });

    it("should mark as PARTIALLY_RECEIVED when not all items received", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
        ...mockPO,
        status: "SENT",
      });
      mockPrisma.purchaseOrderItem.update.mockResolvedValue({});
      mockPrisma.branchInventory.upsert.mockResolvedValue({});
      mockPrisma.inventoryMovement.create.mockResolvedValue({});
      mockPrisma.purchaseOrderItem.findMany.mockResolvedValue([
        { quantity: 10, receivedQuantity: 5 },
      ]);
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        status: "PARTIALLY_RECEIVED",
      });

      const result = await service.receive(ORG_ID, "po-1", USER_ID, [
        { itemId: "item-1", receivedQuantity: 5 },
      ]);

      expect(result.status).toBe("PARTIALLY_RECEIVED");
    });

    it("should create inventory movements for received items", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
        ...mockPO,
        status: "SENT",
      });
      mockPrisma.purchaseOrderItem.update.mockResolvedValue({});
      mockPrisma.branchInventory.upsert.mockResolvedValue({});
      mockPrisma.inventoryMovement.create.mockResolvedValue({});
      mockPrisma.purchaseOrderItem.findMany.mockResolvedValue([
        { quantity: 10, receivedQuantity: 10 },
      ]);
      mockPrisma.purchaseOrder.update.mockResolvedValue(mockPO);

      await service.receive(ORG_ID, "po-1", USER_ID, [{ itemId: "item-1", receivedQuantity: 10 }]);

      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          branchId: "branch-1",
          productId: "product-1",
          movementType: "IN",
          quantity: 10,
          referenceType: "purchase_order",
          referenceId: "po-1",
        }),
      });
    });

    it("should reject zero received quantity", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
        ...mockPO,
        status: "SENT",
      });

      await expect(
        service.receive(ORG_ID, "po-1", USER_ID, [{ itemId: "item-1", receivedQuantity: 0 }]),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.purchaseOrderItem.update).not.toHaveBeenCalled();
    });

    it("should reject receiving more than pending quantity", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
        ...mockPO,
        status: "PARTIALLY_RECEIVED",
        items: [{ ...mockPO.items[0], quantity: 10, receivedQuantity: 7 }],
      });

      await expect(
        service.receive(ORG_ID, "po-1", USER_ID, [{ itemId: "item-1", receivedQuantity: 4 }]),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.branchInventory.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("should reject unknown purchase order items instead of silently skipping", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
        ...mockPO,
        status: "SENT",
      });

      await expect(
        service.receive(ORG_ID, "po-1", USER_ID, [{ itemId: "missing-item", receivedQuantity: 1 }]),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.purchaseOrderItem.update).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("should cancel draft orders", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(mockPO);
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        status: "CANCELLED",
      });

      const result = await service.remove(ORG_ID, "po-1");

      expect(result.status).toBe("CANCELLED");
    });

    it("should throw BadRequestException for non-draft orders", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
        ...mockPO,
        status: "RECEIVED",
      });

      await expect(service.remove(ORG_ID, "po-1")).rejects.toThrow(BadRequestException);
    });
  });
});
