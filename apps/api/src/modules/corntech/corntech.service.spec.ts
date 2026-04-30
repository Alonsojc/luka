import { beforeEach, describe, expect, it, vi } from "vitest";
import { CorntechService } from "./corntech.service";

describe("CorntechService", () => {
  let service: CorntechService;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      product: { findMany: vi.fn() },
      posSale: { create: vi.fn() },
      branchInventory: { updateMany: vi.fn() },
      inventoryMovement: { create: vi.fn() },
    };

    mockPrisma = {
      branch: { findFirst: vi.fn() },
      posSyncLog: { create: vi.fn(), update: vi.fn() },
      $transaction: vi.fn((callback) => callback(mockTx)),
    };

    service = new CorntechService(mockPrisma);
  });

  describe("processSalesBatch", () => {
    const sale = {
      ticketNumber: "T-001",
      date: "2026-04-20T18:00:00Z",
      subtotal: 200,
      tax: 32,
      total: 232,
      paymentMethod: "CARD",
      terminalId: "term-1",
      items: [{ sku: "BOWL-001", name: "Poke Bowl", quantity: 2, unitPrice: 100, total: 200 }],
    };

    beforeEach(() => {
      mockPrisma.branch.findFirst.mockResolvedValue({ id: "branch-1" });
      mockPrisma.posSyncLog.create.mockResolvedValue({ id: "log-1" });
      mockPrisma.posSyncLog.update.mockResolvedValue({ id: "log-1" });
    });

    it("creates SALE_DEDUCTION inventory movements for synced POS sales", async () => {
      mockTx.product.findMany.mockResolvedValue([
        { id: "product-1", sku: "BOWL-001", costPerUnit: 45 },
      ]);
      mockTx.posSale.create.mockResolvedValue({ id: "sale-1" });
      mockTx.branchInventory.updateMany.mockResolvedValue({ count: 1 });
      mockTx.inventoryMovement.create.mockResolvedValue({ id: "move-1" });

      const result = await service.processSalesBatch("org-1", "branch-1", [sale]);

      expect(result).toEqual({ total: 1, synced: 1, failed: 0, errors: [] });
      expect(mockTx.branchInventory.updateMany).toHaveBeenCalledWith({
        where: { branchId: "branch-1", productId: "product-1" },
        data: { currentQuantity: { decrement: 2 } },
      });
      expect(mockTx.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          branchId: "branch-1",
          productId: "product-1",
          movementType: "SALE_DEDUCTION",
          quantity: 2,
          unitCost: 45,
          referenceType: "pos_sale",
          referenceId: "sale-1",
          notes: "Venta POS T-001",
        },
      });
      expect(mockPrisma.posSyncLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "SUCCESS", recordsSynced: 1, recordsFailed: 0 }),
        }),
      );
    });

    it("marks the sale as failed when a POS SKU is not mapped to inventory", async () => {
      mockTx.product.findMany.mockResolvedValue([]);

      const result = await service.processSalesBatch("org-1", "branch-1", [sale]);

      expect(result.synced).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("SKU sin producto inventariable: BOWL-001");
      expect(mockTx.posSale.create).not.toHaveBeenCalled();
      expect(mockPrisma.posSyncLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED", recordsSynced: 0, recordsFailed: 1 }),
        }),
      );
    });

    it("rejects non-positive POS quantities before mutating inventory", async () => {
      const result = await service.processSalesBatch("org-1", "branch-1", [
        {
          ...sale,
          items: [{ ...sale.items[0], quantity: -1 }],
        },
      ]);

      expect(result.synced).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("Cantidad POS invalida para SKU BOWL-001");
      expect(mockTx.product.findMany).not.toHaveBeenCalled();
      expect(mockTx.branchInventory.updateMany).not.toHaveBeenCalled();
    });
  });
});
