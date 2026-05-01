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
      branchInventory: { findMany: vi.fn().mockResolvedValue([]) },
      productLot: { findMany: vi.fn().mockResolvedValue([]) },
      interBranchTransferLotAllocation: { findMany: vi.fn().mockResolvedValue([]) },
      requisition: { findMany: vi.fn().mockResolvedValue([]) },
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
      expect(result.inventoryIntegrity.summary.issueCount).toBe(0);
    });

    it("flags inventory integrity drifts that do not show up in POS totals", async () => {
      mockPrisma.posSaleItem.findMany.mockResolvedValue([]);
      mockPrisma.inventoryMovement.findMany.mockResolvedValue([]);
      mockPrisma.recipe.findMany.mockResolvedValue([]);
      mockPrisma.deliveryOrder.findMany.mockResolvedValue([]);
      mockPrisma.interBranchTransfer.findMany.mockImplementation((args: any) => {
        if (args.where?.id) {
          return Promise.resolve([
            {
              id: "transfer-stuck",
              status: "APPROVED",
              items: [{ id: "transfer-item-stuck" }],
            },
          ]);
        }

        return Promise.resolve([]);
      });
      mockPrisma.branchInventory.findMany.mockResolvedValue([
        {
          branchId: "branch-stock",
          productId: "product-stock",
          currentQuantity: 5,
          branch: { id: "branch-stock", name: "Centro", code: "CTR" },
          product: {
            id: "product-stock",
            sku: "SALMON",
            name: "Salmon",
            unitOfMeasure: "kg",
          },
        },
      ]);
      mockPrisma.productLot.findMany.mockImplementation((args: any) => {
        if (args.where.status.in.includes("CONSUMED")) {
          return Promise.resolve([
            {
              id: "lot-consumed",
              lotNumber: "L-CONSUMED",
              status: "CONSUMED",
              branchId: "branch-stock",
              productId: "product-stock",
              quantity: 2,
              updatedAt: new Date("2026-04-20T12:00:00Z"),
              branch: { id: "branch-stock", name: "Centro", code: "CTR" },
              product: {
                id: "product-stock",
                sku: "SALMON",
                name: "Salmon",
                unitOfMeasure: "kg",
              },
            },
          ]);
        }

        return Promise.resolve([
          {
            id: "lot-orphan",
            lotNumber: "L-ORPHAN",
            status: "ACTIVE",
            branchId: "branch-lot",
            productId: "product-lot",
            quantity: 3,
            branch: { id: "branch-lot", name: "Juriquilla", code: "JUR" },
            product: {
              id: "product-lot",
              sku: "TUNA",
              name: "Tuna",
              unitOfMeasure: "kg",
            },
          },
        ]);
      });
      mockPrisma.interBranchTransferLotAllocation.findMany.mockResolvedValue([
        {
          id: "allocation-1",
          transferItemId: "transfer-item-1",
          sourceLotId: "source-lot-1",
          lotNumber: "L-TRANSFER",
          expirationDate: new Date("2026-05-01T00:00:00Z"),
          quantity: 4,
          receivedQuantity: 1,
          sourceLot: { id: "source-lot-1", status: "ACTIVE", quantity: 6 },
          transferItem: {
            productId: "product-transfer",
            product: {
              id: "product-transfer",
              sku: "RICE",
              name: "Rice",
              unitOfMeasure: "kg",
            },
            transfer: {
              id: "transfer-1",
              status: "IN_TRANSIT",
              fromBranchId: "cedis-1",
              toBranchId: "branch-stock",
              fromBranch: { id: "cedis-1", name: "CEDIS", code: "CED" },
              toBranch: { id: "branch-stock", name: "Centro", code: "CTR" },
            },
          },
        },
      ]);
      mockPrisma.requisition.findMany.mockResolvedValue([
        {
          id: "req-1",
          status: "APPROVED",
          priority: "HIGH",
          transferId: "transfer-stuck",
          requestingBranchId: "branch-stock",
          fulfillingBranchId: "cedis-1",
          requestingBranch: { id: "branch-stock", name: "Centro", code: "CTR" },
          fulfillingBranch: { id: "cedis-1", name: "CEDIS", code: "CED" },
          items: [{ id: "req-item-1", approvedQuantity: 10, requestedQuantity: 10 }],
          createdAt: new Date("2026-04-20T09:00:00Z"),
          updatedAt: new Date("2026-04-20T10:00:00Z"),
        },
      ]);

      const result = await service.operationalReconciliation("org-1", {
        startDate: "2026-04-20",
        endDate: "2026-04-20",
      });

      expect(result.status).toBe("REVIEW_REQUIRED");
      expect(result.issueCount).toBe(5);
      expect(result.inventoryIntegrity.summary).toMatchObject({
        stockMismatchCount: 2,
        terminalLotCount: 1,
        transferLotIssueCount: 1,
        stalledRequisitionCount: 1,
        issueCount: 5,
      });
      expect(result.inventoryIntegrity.stockMismatches.map((issue) => issue.status)).toEqual([
        "STOCK_WITHOUT_LOTS",
        "LOTS_WITHOUT_STOCK",
      ]);
      expect(result.inventoryIntegrity.terminalLots[0].status).toBe("TERMINAL_LOT_WITH_STOCK");
      expect(result.inventoryIntegrity.transferLotAllocations[0].status).toBe(
        "IN_TRANSIT_LOT_PENDING",
      );
      expect(result.inventoryIntegrity.stalledRequisitions[0].status).toBe("TRANSFER_NOT_SHIPPED");
    });
  });
});
