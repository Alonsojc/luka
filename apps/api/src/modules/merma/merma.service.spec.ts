import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { MermaService } from "./merma.service";
import { PrismaService } from "../../common/prisma/prisma.service";

describe("MermaService", () => {
  let service: MermaService;
  let mockPrisma: any;

  const ORG_ID = "org-1";
  const USER_ID = "user-1";

  const mockWasteLog = {
    id: "waste-1",
    organizationId: ORG_ID,
    branchId: "branch-1",
    productId: "product-1",
    quantity: 2.5,
    unit: "kg",
    reason: "EXPIRED",
    notes: "Salmon vencido",
    cost: 875,
    reportedBy: USER_ID,
    reportedAt: new Date("2026-04-10T10:00:00Z"),
    branch: { id: "branch-1", name: "Sucursal Centro", code: "CNT" },
    product: { id: "product-1", name: "Salmon", sku: "SAL-001", unitOfMeasure: "kg" },
    reporter: { id: USER_ID, firstName: "Juan", lastName: "Perez" },
  };

  beforeEach(async () => {
    mockPrisma = {
      wasteLog: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        aggregate: vi.fn(),
        groupBy: vi.fn(),
      },
      product: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      branch: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      branchInventory: {
        findUnique: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      inventoryMovement: {
        create: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MermaService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<MermaService>(MermaService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // findAll
  // -----------------------------------------------------------------------
  describe("findAll", () => {
    it("should return paginated waste logs", async () => {
      mockPrisma.wasteLog.findMany.mockResolvedValue([mockWasteLog]);
      mockPrisma.wasteLog.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, {});

      expect(result).toEqual({
        data: [mockWasteLog],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });
      expect(mockPrisma.wasteLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_ID },
          skip: 0,
          take: 20,
        }),
      );
    });

    it("should apply filters (branchId, productId, reason, date range)", async () => {
      mockPrisma.wasteLog.findMany.mockResolvedValue([]);
      mockPrisma.wasteLog.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {
        branchId: "branch-1",
        productId: "product-1",
        reason: "EXPIRED",
        dateFrom: "2026-04-01",
        dateTo: "2026-04-15",
      });

      expect(mockPrisma.wasteLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            branchId: "branch-1",
            productId: "product-1",
            reason: "EXPIRED",
            reportedAt: {
              gte: new Date("2026-04-01"),
              lte: new Date("2026-04-15T23:59:59.999Z"),
            },
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // findOne
  // -----------------------------------------------------------------------
  describe("findOne", () => {
    it("should return single record", async () => {
      mockPrisma.wasteLog.findFirst.mockResolvedValue(mockWasteLog);

      const result = await service.findOne(ORG_ID, "waste-1");

      expect(result).toEqual(mockWasteLog);
      expect(mockPrisma.wasteLog.findFirst).toHaveBeenCalledWith({
        where: { id: "waste-1", organizationId: ORG_ID },
        include: expect.any(Object),
      });
    });

    it("should throw NotFoundException when not found", async () => {
      mockPrisma.wasteLog.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, "nonexistent")).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe("create", () => {
    it("should create waste log entry", async () => {
      const dto = {
        branchId: "branch-1",
        productId: "product-1",
        quantity: 2.5,
        unit: "kg",
        reason: "EXPIRED",
        notes: "Salmon vencido",
        cost: 875,
      };

      mockPrisma.product.findFirst.mockResolvedValue({ id: "product-1", costPerUnit: 350 });
      mockPrisma.branch.findFirst.mockResolvedValue({ id: "branch-1" });
      mockPrisma.branchInventory.findUnique.mockResolvedValue({ currentQuantity: 10 });
      mockPrisma.wasteLog.create.mockResolvedValue(mockWasteLog);

      const result = await service.create(ORG_ID, USER_ID, dto as any);

      expect(result).toEqual(mockWasteLog);
      expect(mockPrisma.wasteLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            productId: "product-1",
            quantity: 2.5,
            reason: "EXPIRED",
            reportedBy: USER_ID,
          }),
        }),
      );
      expect(mockPrisma.branchInventory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { currentQuantity: { decrement: 2.5 } },
        }),
      );
      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          branchId: "branch-1",
          productId: "product-1",
          movementType: "WASTE",
          quantity: 2.5,
          referenceType: "waste_log",
          referenceId: "waste-1",
        }),
      });
    });

    it("should auto-calculate cost from product price if not provided", async () => {
      const dto = {
        productId: "product-1",
        quantity: 2.5,
        unit: "kg",
        reason: "EXPIRED",
      };

      mockPrisma.product.findFirst.mockResolvedValue({
        id: "product-1",
        costPerUnit: 350,
      });
      mockPrisma.wasteLog.create.mockResolvedValue(mockWasteLog);

      await service.create(ORG_ID, USER_ID, dto as any);

      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: "product-1", organizationId: ORG_ID },
        select: { id: true, costPerUnit: true },
      });
      expect(mockPrisma.wasteLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cost: 875, // 350 * 2.5
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // getSummary
  // -----------------------------------------------------------------------
  describe("getSummary", () => {
    it("should return waste summary stats", async () => {
      mockPrisma.wasteLog.aggregate.mockResolvedValue({
        _sum: { quantity: 15.5, cost: 5425 },
      });

      mockPrisma.wasteLog.groupBy
        .mockResolvedValueOnce([
          // byReason
          {
            reason: "EXPIRED",
            _sum: { quantity: 10, cost: 3500 },
          },
          {
            reason: "DAMAGED",
            _sum: { quantity: 5.5, cost: 1925 },
          },
        ])
        .mockResolvedValueOnce([
          // byBranch
          {
            branchId: "branch-1",
            _sum: { quantity: 15.5, cost: 5425 },
          },
        ])
        .mockResolvedValueOnce([
          // byProduct
          {
            productId: "product-1",
            _sum: { quantity: 10, cost: 3500 },
          },
        ]);

      mockPrisma.branch.findMany.mockResolvedValue([{ id: "branch-1", name: "Sucursal Centro" }]);

      mockPrisma.product.findMany.mockResolvedValue([{ id: "product-1", name: "Salmon" }]);

      // trend data
      mockPrisma.wasteLog.findMany.mockResolvedValue([
        {
          reportedAt: new Date("2026-04-10T10:00:00Z"),
          quantity: 5,
          cost: 1750,
        },
        {
          reportedAt: new Date("2026-04-10T14:00:00Z"),
          quantity: 3,
          cost: 1050,
        },
        {
          reportedAt: new Date("2026-04-11T10:00:00Z"),
          quantity: 7.5,
          cost: 2625,
        },
      ]);

      const result = await service.getSummary(ORG_ID, {});

      expect(result.totalWaste).toBe(15.5);
      expect(result.totalCost).toBe(5425);
      expect(result.byReason).toHaveLength(2);
      expect(result.byBranch).toHaveLength(1);
      expect(result.byProduct).toHaveLength(1);
      expect(result.trend).toHaveLength(2); // Two distinct days
    });
  });
});
