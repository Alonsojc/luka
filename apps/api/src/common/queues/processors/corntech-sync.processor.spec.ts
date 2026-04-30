import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CorntechService } from "../../../modules/corntech/corntech.service";
import { CorntechSyncProcessor } from "./corntech-sync.processor";

type CorntechJob = Parameters<CorntechSyncProcessor["process"]>[0];

function createJob(name: string, data: unknown): CorntechJob {
  return { id: "job-1", name, data } as unknown as CorntechJob;
}

describe("CorntechSyncProcessor", () => {
  let processor: CorntechSyncProcessor;
  let corntechService: {
    assertBranchBelongsToOrganization: ReturnType<typeof vi.fn>;
    bulkUpsertSales: ReturnType<typeof vi.fn>;
    upsertCashClosing: ReturnType<typeof vi.fn>;
    processSalesBatch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    corntechService = {
      assertBranchBelongsToOrganization: vi.fn().mockResolvedValue(undefined),
      bulkUpsertSales: vi.fn().mockResolvedValue({ synced: 1 }),
      upsertCashClosing: vi.fn().mockResolvedValue({ id: "closing-1" }),
      processSalesBatch: vi.fn().mockResolvedValue({ total: 0, synced: 0, failed: 0, errors: [] }),
    };
    processor = new CorntechSyncProcessor(corntechService as unknown as CorntechService);
  });

  it("rejects sync-products jobs without organizationId", async () => {
    await expect(
      processor.process(createJob("sync-products", { branchId: "branch-1", products: [] })),
    ).rejects.toThrow("organizationId");

    expect(corntechService.assertBranchBelongsToOrganization).not.toHaveBeenCalled();
    expect(corntechService.bulkUpsertSales).not.toHaveBeenCalled();
  });

  it("validates organization and branch before syncing products", async () => {
    const result = await processor.process(
      createJob("sync-products", {
        organizationId: "org-1",
        branchId: "branch-1",
        products: [
          {
            corntechSaleId: "sale-1",
            saleDate: "2026-04-30",
            subtotal: 100,
            tax: 16,
            total: 116,
          },
        ],
      }),
    );

    expect(result).toEqual({ synced: 1 });
    expect(corntechService.assertBranchBelongsToOrganization).toHaveBeenCalledWith(
      "org-1",
      "branch-1",
    );
    expect(corntechService.bulkUpsertSales).toHaveBeenCalled();
  });

  it("rejects sync-cash-closings jobs without organizationId", async () => {
    await expect(
      processor.process(createJob("sync-cash-closings", { branchId: "branch-1", closings: [] })),
    ).rejects.toThrow("organizationId");

    expect(corntechService.upsertCashClosing).not.toHaveBeenCalled();
  });
});
