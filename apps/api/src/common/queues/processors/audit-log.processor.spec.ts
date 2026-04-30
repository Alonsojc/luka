import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import { AuditLogProcessor } from "./audit-log.processor";

type AuditJob = Parameters<AuditLogProcessor["process"]>[0];

function createJob(data: unknown): AuditJob {
  return { id: "job-1", data } as unknown as AuditJob;
}

describe("AuditLogProcessor", () => {
  let processor: AuditLogProcessor;
  let prisma: {
    auditLog: {
      create: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    processor = new AuditLogProcessor(prisma as unknown as PrismaService);
  });

  it("rejects audit jobs without organizationId", async () => {
    await expect(
      processor.process(
        createJob({
          userId: "user-1",
          action: "CREATE",
          module: "inventarios",
          entityType: "Product",
          entityId: "product-1",
        }),
      ),
    ).rejects.toThrow("organizationId");

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("persists audit jobs with organizationId", async () => {
    const data = {
      organizationId: "org-1",
      userId: "user-1",
      action: "CREATE",
      module: "inventarios",
      entityType: "Product",
      entityId: "product-1",
    };

    await processor.process(createJob(data));

    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data });
  });
});
