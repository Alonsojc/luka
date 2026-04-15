import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { InventoryService } from "./inventory.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CacheService } from "../../common/cache/cache.service";
import { AuditService } from "../audit/audit.service";

// ---------------------------------------------------------------------------
// Mock objects
// ---------------------------------------------------------------------------
const mockPrisma: any = {
  product: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  branchInventory: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  inventoryMovement: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
  $queryRaw: vi.fn(),
};

const mockAuditService = {
  log: vi.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// ProductsService
// ---------------------------------------------------------------------------
describe("ProductsService", () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: CacheService,
          useValue: { get: vi.fn(), set: vi.fn(), del: vi.fn(), invalidatePattern: vi.fn() },
        },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // findAll
  // -----------------------------------------------------------------------
  describe("findAll", () => {
    it("should return products for the given organization", async () => {
      const mockProducts = [
        { id: "p1", name: "Salmon", sku: "SAL-001", organizationId: "org-1" },
        { id: "p2", name: "Atun", sku: "ATN-001", organizationId: "org-1" },
      ];
      mockPrisma.product.findMany.mockResolvedValue(mockProducts);

      const result = await service.findAll("org-1");

      expect(result).toEqual(mockProducts);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1", isActive: true },
        include: {
          category: true,
          presentations: {
            where: { isActive: true },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          },
        },
        orderBy: { name: "asc" },
        skip: 0,
        take: 100,
      });
    });

    it("should return empty array when organization has no products", async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      const result = await service.findAll("org-empty");

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // findOne (findProductById)
  // -----------------------------------------------------------------------
  describe("findOne", () => {
    it("should return the product when found", async () => {
      const mockProduct = {
        id: "p1",
        name: "Salmon",
        sku: "SAL-001",
        organizationId: "org-1",
      };
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);

      const result = await service.findOne("org-1", "p1");

      expect(result).toEqual(mockProduct);
      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: "p1", organizationId: "org-1" },
        include: {
          category: true,
          presentations: {
            where: { isActive: true },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          },
        },
      });
    });

    it("should throw NotFoundException when product does not exist", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(service.findOne("org-1", "nonexistent")).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe("create", () => {
    const createData = {
      sku: "SAL-001",
      name: "Salmon Fresco",
      unitOfMeasure: "KG",
      costPerUnit: 250,
      description: "Salmon fresco premium",
    };

    it("should create a product with the correct fields", async () => {
      const created = { id: "p-new", organizationId: "org-1", ...createData };
      mockPrisma.product.create.mockResolvedValue(created);

      const result = await service.create("org-1", createData);

      expect(result).toEqual(created);
      expect(mockPrisma.product.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          ...createData,
        },
        include: {
          category: true,
          presentations: {
            where: { isActive: true },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          },
        },
      });
    });

    it("should call auditService.log when a caller is provided", async () => {
      const created = { id: "p-new", organizationId: "org-1", ...createData };
      mockPrisma.product.create.mockResolvedValue(created);

      const caller = { sub: "user-1", email: "admin@test.com", orgId: "org-1" } as any;
      await service.create("org-1", createData, caller);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-1",
          action: "CREATE",
          module: "INVENTARIOS",
          entityType: "Product",
          entityId: "p-new",
        }),
      );
    });

    it("should not call auditService.log when no caller is provided", async () => {
      mockPrisma.product.create.mockResolvedValue({ id: "p-new" });

      await service.create("org-1", createData);

      expect(mockAuditService.log).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------
  describe("update", () => {
    const existing = {
      id: "p1",
      name: "Salmon",
      sku: "SAL-001",
      costPerUnit: 200,
      organizationId: "org-1",
    };

    it("should update only the specified fields", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(existing);
      const updated = { ...existing, costPerUnit: 275 };
      mockPrisma.product.update.mockResolvedValue(updated);

      const result = await service.update("org-1", "p1", { costPerUnit: 275 });

      expect(result.costPerUnit).toBe(275);
      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { costPerUnit: 275 },
        include: {
          category: true,
          presentations: {
            where: { isActive: true },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          },
        },
      });
    });

    it("should throw NotFoundException when updating a non-existent product", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(service.update("org-1", "nonexistent", { name: "New Name" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should log audit changes when caller is provided", async () => {
      mockPrisma.product.findFirst.mockResolvedValue(existing);
      mockPrisma.product.update.mockResolvedValue({
        ...existing,
        name: "Salmon Premium",
      });

      const caller = { sub: "user-1", email: "admin@test.com", orgId: "org-1" } as any;
      await service.update("org-1", "p1", { name: "Salmon Premium" }, caller);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "UPDATE",
          entityId: "p1",
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// InventoryService (adjustStock, getStockByBranch)
// ---------------------------------------------------------------------------
describe("InventoryService", () => {
  let service: InventoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InventoryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // getStockByBranch
  // -----------------------------------------------------------------------
  describe("getStockByBranch", () => {
    it("should return inventory for a branch", async () => {
      const mockInventory = [{ branchId: "b1", productId: "p1", currentQuantity: 10 }];
      mockPrisma.branchInventory.findMany.mockResolvedValue(mockInventory);

      const result = await service.getStockByBranch("b1");

      expect(result).toEqual(mockInventory);
      expect(mockPrisma.branchInventory.findMany).toHaveBeenCalledWith({
        where: { branchId: "b1" },
        include: { product: true },
        orderBy: { product: { name: "asc" } },
      });
    });
  });

  // -----------------------------------------------------------------------
  // adjustStock
  // -----------------------------------------------------------------------
  describe("adjustStock", () => {
    it("should create movement and update BranchInventory quantity", async () => {
      const existingInventory = {
        branchId: "b1",
        productId: "p1",
        currentQuantity: 10,
      };
      mockPrisma.branchInventory.findUnique.mockResolvedValue(existingInventory);
      mockPrisma.branchInventory.upsert.mockResolvedValue({
        ...existingInventory,
        currentQuantity: 15,
      });
      mockPrisma.inventoryMovement.create.mockResolvedValue({});

      const result = await service.adjustStock("b1", "user-1", {
        productId: "p1",
        quantity: 15,
        notes: "Ajuste de conteo",
      });

      expect(result.currentQuantity).toBe(15);
      // Movement should record the diff (15 - 10 = 5)
      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          branchId: "b1",
          productId: "p1",
          movementType: "ADJUSTMENT",
          quantity: 5,
          notes: "Ajuste de conteo",
          userId: "user-1",
        }),
      });
    });

    it("should create inventory when it does not exist yet (upsert)", async () => {
      mockPrisma.branchInventory.findUnique.mockResolvedValue(null);
      mockPrisma.branchInventory.upsert.mockResolvedValue({
        branchId: "b1",
        productId: "p1",
        currentQuantity: 20,
      });
      mockPrisma.inventoryMovement.create.mockResolvedValue({});

      const result = await service.adjustStock("b1", "user-1", {
        productId: "p1",
        quantity: 20,
      });

      expect(result.currentQuantity).toBe(20);
      // diff should be 20 - 0 = 20 since no prior inventory
      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          quantity: 20,
          notes: "Ajuste manual de inventario",
        }),
      });
    });

    it("should handle negative adjustment quantities (decrease)", async () => {
      const existingInventory = {
        branchId: "b1",
        productId: "p1",
        currentQuantity: 30,
      };
      mockPrisma.branchInventory.findUnique.mockResolvedValue(existingInventory);
      mockPrisma.branchInventory.upsert.mockResolvedValue({
        ...existingInventory,
        currentQuantity: 5,
      });
      mockPrisma.inventoryMovement.create.mockResolvedValue({});

      const result = await service.adjustStock("b1", "user-1", {
        productId: "p1",
        quantity: 5,
      });

      expect(result.currentQuantity).toBe(5);
      // diff should be 5 - 30 = -25
      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          quantity: -25,
        }),
      });
    });
  });
});
