import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { KardexService } from "./kardex.service";
import { PrismaService } from "../../common/prisma/prisma.service";

const mockPrisma: any = {
  inventoryMovement: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  product: {
    findFirst: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
  branchInventory: {
    findMany: vi.fn(),
  },
};

describe("KardexService", () => {
  let service: KardexService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KardexService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<KardexService>(KardexService);
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // getKardex
  // -----------------------------------------------------------------------
  describe("getKardex", () => {
    const baseMovements = [
      {
        id: "m1",
        productId: "p1",
        branchId: "b1",
        movementType: "IN",
        quantity: 100,
        unitCost: 10,
        timestamp: new Date("2026-04-01"),
        userId: "u1",
        referenceType: null,
        referenceId: null,
        notes: "Recepcion",
        branch: { name: "Sucursal Centro", code: "CTR" },
        product: { name: "Salmon", sku: "SAL-001", unitOfMeasure: "KG", costPerUnit: 10 },
      },
      {
        id: "m2",
        productId: "p1",
        branchId: "b1",
        movementType: "OUT",
        quantity: 30,
        unitCost: 10,
        timestamp: new Date("2026-04-02"),
        userId: "u1",
        referenceType: null,
        referenceId: null,
        notes: "Venta",
        branch: { name: "Sucursal Centro", code: "CTR" },
        product: { name: "Salmon", sku: "SAL-001", unitOfMeasure: "KG", costPerUnit: 10 },
      },
      {
        id: "m3",
        productId: "p1",
        branchId: "b1",
        movementType: "IN",
        quantity: 50,
        unitCost: 12,
        timestamp: new Date("2026-04-03"),
        userId: null,
        referenceType: null,
        referenceId: null,
        notes: "Recepcion 2",
        branch: { name: "Sucursal Centro", code: "CTR" },
        product: { name: "Salmon", sku: "SAL-001", unitOfMeasure: "KG", costPerUnit: 10 },
      },
    ];

    it("should return movements with correct running balance", async () => {
      mockPrisma.inventoryMovement.findMany.mockResolvedValue(baseMovements);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1", firstName: "Juan", lastName: "Perez" },
      ]);

      const result = await service.getKardex("org-1", "p1");

      expect(result.movements).toHaveLength(3);

      // IN 100 => balance 100
      expect(result.movements[0].quantity).toBe(100);
      expect(result.movements[0].runningBalance).toBe(100);

      // OUT 30 => balance 70
      expect(result.movements[1].quantity).toBe(-30);
      expect(result.movements[1].runningBalance).toBe(70);

      // IN 50 => balance 120
      expect(result.movements[2].quantity).toBe(50);
      expect(result.movements[2].runningBalance).toBe(120);
    });

    it("should return product info even when there are no movements", async () => {
      mockPrisma.inventoryMovement.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.product.findFirst.mockResolvedValue({
        name: "Atun",
        sku: "ATN-001",
        unitOfMeasure: "KG",
        costPerUnit: 180,
      });

      const result = await service.getKardex("org-1", "p2");

      expect(result.movements).toHaveLength(0);
      expect(result.product).toBeTruthy();
      expect(result.product!.sku).toBe("ATN-001");
    });

    it("should map user names to movements or default to Sistema", async () => {
      mockPrisma.inventoryMovement.findMany.mockResolvedValue(baseMovements);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1", firstName: "Juan", lastName: "Perez" },
      ]);

      const result = await service.getKardex("org-1", "p1");

      // m1 and m2 have userId "u1" => "Juan Perez"
      expect(result.movements[0].userName).toBe("Juan Perez");
      // m3 has userId null => "Sistema"
      expect(result.movements[2].userName).toBe("Sistema");
    });

    it("should calculate initialBalance from prior movements when dateFrom is set", async () => {
      // Prior movements (before dateFrom)
      const priorMovements = [
        { movementType: "IN", quantity: 200 },
        { movementType: "OUT", quantity: 50 },
      ];

      // First call: prior movements, second call: current movements
      mockPrisma.inventoryMovement.findMany
        .mockResolvedValueOnce(priorMovements) // prior
        .mockResolvedValueOnce([baseMovements[2]]); // current period
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.getKardex("org-1", "p1", {
        dateFrom: "2026-04-03",
      });

      // initialBalance = 200 - 50 = 150
      expect(result.initialBalance).toBe(150);
      // First movement starts from 150 + 50 = 200
      expect(result.movements[0].runningBalance).toBe(200);
    });

    it("should filter movements by branchId", async () => {
      mockPrisma.inventoryMovement.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await service.getKardex("org-1", "p1", { branchId: "b1" });

      expect(mockPrisma.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: "b1" }),
        }),
      );
    });

    it("should filter movements by movementType", async () => {
      mockPrisma.inventoryMovement.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await service.getKardex("org-1", "p1", { movementType: "IN" });

      expect(mockPrisma.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ movementType: "IN" }),
        }),
      );
    });

    it("should handle ADJUSTMENT type preserving the signed quantity", async () => {
      const adjustmentMovement = {
        id: "m-adj",
        productId: "p1",
        branchId: "b1",
        movementType: "ADJUSTMENT",
        quantity: -5,
        unitCost: 10,
        timestamp: new Date("2026-04-05"),
        userId: null,
        referenceType: null,
        referenceId: null,
        notes: "Ajuste",
        branch: { name: "Centro", code: "CTR" },
        product: { name: "Salmon", sku: "SAL-001", unitOfMeasure: "KG", costPerUnit: 10 },
      };

      mockPrisma.inventoryMovement.findMany.mockResolvedValue([
        adjustmentMovement,
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.getKardex("org-1", "p1");

      // ADJUSTMENT keeps its original sign: -5
      expect(result.movements[0].quantity).toBe(-5);
      expect(result.movements[0].runningBalance).toBe(-5);
    });

    it("should compute totalCost = |signed| * unitCost for each movement", async () => {
      mockPrisma.inventoryMovement.findMany.mockResolvedValue([
        baseMovements[0],
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1", firstName: "Juan", lastName: "Perez" },
      ]);

      const result = await service.getKardex("org-1", "p1");

      // |100| * 10 = 1000
      expect(result.movements[0].totalCost).toBe(1000);
    });
  });

  // -----------------------------------------------------------------------
  // getKardexSummary
  // -----------------------------------------------------------------------
  describe("getKardexSummary", () => {
    it("should return current stock and movement totals", async () => {
      mockPrisma.branchInventory.findMany.mockResolvedValue([
        { currentQuantity: 80, branch: { name: "Centro" } },
        { currentQuantity: 40, branch: { name: "Sur" } },
      ]);
      mockPrisma.product.findFirst.mockResolvedValue({
        name: "Salmon",
        sku: "SAL-001",
        unitOfMeasure: "KG",
        costPerUnit: 10,
      });
      mockPrisma.inventoryMovement.findMany.mockResolvedValue([
        { movementType: "IN", quantity: 200, unitCost: 10, timestamp: new Date() },
        { movementType: "OUT", quantity: 80, unitCost: 10, timestamp: new Date() },
      ]);

      const result = await service.getKardexSummary("org-1", "p1");

      expect(result.currentStock).toBe(120); // 80 + 40
      expect(result.totalEntries).toBe(200);
      expect(result.totalExits).toBe(80);
      expect(result.stockValue).toBe(1200); // 120 * 10
    });
  });
});
