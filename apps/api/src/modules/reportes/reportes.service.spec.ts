import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportesService } from "./reportes.service";

describe("ReportesService", () => {
  let service: ReportesService;
  let mockPrisma: any;
  let mockCache: any;

  beforeEach(() => {
    mockPrisma = {
      posSaleItem: { findMany: vi.fn() },
      inventoryMovement: { findMany: vi.fn() },
      interBranchTransfer: { findMany: vi.fn() },
      recipe: { findMany: vi.fn() },
      deliveryOrder: { findMany: vi.fn() },
    };
    mockCache = { get: vi.fn(), set: vi.fn() };

    service = new ReportesService(mockPrisma, mockCache);
  });

  describe("operationalReconciliation", () => {
    it("flags POS, transfer, food cost, and delivery net revenue mismatches", async () => {
      mockPrisma.posSaleItem.findMany.mockResolvedValue([
        {
          saleId: "sale-1",
          productSku: "BOWL-001",
          productName: "Poke Bowl",
          quantity: 2,
          total: 200,
          sale: {
            branchId: "branch-1",
            branch: { id: "branch-1", name: "Centro", code: "CTR" },
          },
        },
      ]);
      mockPrisma.inventoryMovement.findMany.mockResolvedValue([]);
      mockPrisma.interBranchTransfer.findMany.mockResolvedValue([
        {
          id: "transfer-1",
          status: "RECEIVED",
          fromBranchId: "cedis-1",
          toBranchId: "branch-1",
          createdAt: new Date("2026-04-20T10:00:00Z"),
          completedAt: new Date("2026-04-20T12:00:00Z"),
          fromBranch: { id: "cedis-1", name: "CEDIS", code: "CED" },
          toBranch: { id: "branch-1", name: "Centro", code: "CTR" },
          items: [
            {
              productId: "product-1",
              requestedQuantity: 10,
              sentQuantity: 10,
              receivedQuantity: 8,
              product: {
                id: "product-1",
                sku: "SALMON",
                name: "Salmon",
                unitOfMeasure: "kg",
              },
            },
          ],
        },
      ]);
      mockPrisma.recipe.findMany.mockResolvedValue([
        {
          id: "recipe-1",
          menuItemName: "Poke Bowl",
          corntechProductId: "BOWL-001",
          costPerServing: 40,
          sellingPrice: 100,
        },
      ]);
      mockPrisma.deliveryOrder.findMany.mockResolvedValue([
        {
          id: "delivery-1",
          platform: "RAPPI",
          externalOrderId: "R-1",
          branchId: "branch-1",
          branch: { id: "branch-1", name: "Centro", code: "CTR" },
          orderDate: new Date("2026-04-20T18:00:00Z"),
          total: 300,
          deliveryFee: 20,
          platformFee: 60,
          discount: 0,
          netRevenue: 250,
        },
      ]);

      const result = await service.operationalReconciliation("org-1", {
        startDate: "2026-04-20",
        endDate: "2026-04-20",
      });

      expect(result.status).toBe("REVIEW_REQUIRED");
      expect(result.issueCount).toBe(4);
      expect(result.posInventory.issues[0].status).toBe("MISSING_DEDUCTION");
      expect(result.cedisTransfers.issues[0].status).toBe("RECEIVED_SHORT");
      expect(result.foodCost.issues[0].status).toBe("MISSING_DEDUCTION");
      expect(result.deliveryNetRevenue.issues[0].status).toBe("NET_REVENUE_MISMATCH");
    });
  });
});
