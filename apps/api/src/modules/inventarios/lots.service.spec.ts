import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LotsService } from "./lots.service";

describe("LotsService", () => {
  let service: LotsService;
  let mockPrisma: any;

  const organizationId = "org-1";
  const userId = "user-1";
  const branchId = "branch-1";
  const productId = "product-1";

  beforeEach(async () => {
    mockPrisma = {
      productLot: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        groupBy: vi.fn(),
      },
      branchInventory: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
      inventoryMovement: {
        create: vi.fn(),
      },
      wasteLog: {
        create: vi.fn(),
      },
      branch: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      product: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LotsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<LotsService>(LotsService);
  });

  it("creates a lot, increments branch inventory and creates an IN movement", async () => {
    mockPrisma.branch.findFirst.mockResolvedValue({ id: branchId });
    mockPrisma.product.findFirst.mockResolvedValue({ id: productId, costPerUnit: 120 });
    mockPrisma.productLot.create.mockResolvedValue({
      id: "lot-1",
      lotNumber: "LOT-001",
      branchId,
      productId,
      quantity: 10,
    });

    const result = await service.createLot(organizationId, userId, {
      branchId,
      productId,
      lotNumber: "LOT-001",
      expirationDate: "2026-05-10",
      quantity: 10,
      unitCost: 115,
    });

    expect(result.id).toBe("lot-1");
    expect(mockPrisma.branchInventory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ currentQuantity: { increment: 10 } }),
        create: expect.objectContaining({ currentQuantity: 10 }),
      }),
    );
    expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        branchId,
        productId,
        movementType: "IN",
        quantity: 10,
        unitCost: 115,
        referenceType: "product_lot",
        referenceId: "lot-1",
        userId,
      }),
    });
  });

  it("consumes from a lot, decrements branch inventory and creates an OUT movement", async () => {
    mockPrisma.productLot.findFirst.mockResolvedValue({
      id: "lot-1",
      organizationId,
      branchId,
      productId,
      lotNumber: "LOT-001",
      quantity: 10,
      initialQuantity: 10,
      unitCost: 115,
      status: "ACTIVE",
      product: { costPerUnit: 120 },
    });
    mockPrisma.branchInventory.findUnique.mockResolvedValue({ currentQuantity: 10 });
    mockPrisma.productLot.update.mockResolvedValue({
      id: "lot-1",
      quantity: 8,
      status: "ACTIVE",
    });

    const result = await service.consumeFromLot(organizationId, "lot-1", 2, userId);

    expect(result.quantity).toBe(8);
    expect(mockPrisma.branchInventory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { currentQuantity: { decrement: 2 } },
      }),
    );
    expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: "OUT",
        quantity: 2,
        unitCost: 115,
        referenceType: "product_lot",
        referenceId: "lot-1",
      }),
    });
  });

  it("blocks consuming more than the lot quantity", async () => {
    mockPrisma.productLot.findFirst.mockResolvedValue({
      id: "lot-1",
      branchId,
      productId,
      quantity: 1,
      initialQuantity: 10,
      status: "ACTIVE",
      product: { costPerUnit: 120 },
    });

    await expect(service.consumeFromLot(organizationId, "lot-1", 2, userId)).rejects.toThrow(
      BadRequestException,
    );
    expect(mockPrisma.branchInventory.update).not.toHaveBeenCalled();
    expect(mockPrisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("disposes a lot, records waste, decrements stock and creates a WASTE movement", async () => {
    mockPrisma.productLot.findFirst.mockResolvedValue({
      id: "lot-1",
      organizationId,
      branchId,
      productId,
      lotNumber: "LOT-001",
      quantity: 2,
      unitCost: 115,
      status: "ACTIVE",
      product: { id: productId, costPerUnit: 120, unitOfMeasure: "kg" },
    });
    mockPrisma.branchInventory.findUnique.mockResolvedValue({ currentQuantity: 2 });
    mockPrisma.productLot.update.mockResolvedValue({
      id: "lot-1",
      quantity: 0,
      status: "DISPOSED",
    });
    mockPrisma.wasteLog.create.mockResolvedValue({ id: "waste-1" });

    await service.disposeLot(organizationId, "lot-1", userId, "Caducado en sucursal");

    expect(mockPrisma.branchInventory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { currentQuantity: { decrement: 2 } },
      }),
    );
    expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: "WASTE",
        quantity: 2,
        unitCost: 115,
        referenceType: "product_lot",
        referenceId: "lot-1",
      }),
    });
    expect(mockPrisma.wasteLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId,
        branchId,
        productId,
        quantity: 2,
        reason: "EXPIRED",
        cost: 230,
      }),
    });
  });

  it("detects lot stock mismatches against branch inventory", async () => {
    mockPrisma.productLot.groupBy.mockResolvedValue([
      {
        branchId,
        productId,
        _sum: { quantity: 10 },
      },
    ]);
    mockPrisma.branchInventory.findMany.mockResolvedValue([
      {
        branchId,
        productId,
        currentQuantity: 8,
        branch: { id: branchId, name: "Centro", code: "CTR" },
        product: { id: productId, name: "Salmon", sku: "SAL-001", unitOfMeasure: "kg" },
      },
    ]);
    mockPrisma.branch.findMany.mockResolvedValue([{ id: branchId, name: "Centro", code: "CTR" }]);
    mockPrisma.product.findMany.mockResolvedValue([
      { id: productId, name: "Salmon", sku: "SAL-001", unitOfMeasure: "kg" },
    ]);

    const result = await service.getLotStockReconciliation(organizationId);

    expect(result.summary).toEqual({ total: 1, balanced: 0, mismatched: 1 });
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        branchId,
        productId,
        lotQuantity: 10,
        stockQuantity: 8,
        difference: -2,
        isBalanced: false,
      }),
    );
  });
});
