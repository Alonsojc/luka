import { describe, expect, it } from "vitest";
import { TenantContextService } from "../tenant/tenant-context.service";
import { applyTenantScopeToArgs, createTenantQueryExtension } from "./prisma.service";

describe("Prisma tenant scoping", () => {
  it("injects organizationId into scoped read queries", () => {
    expect(
      applyTenantScopeToArgs("branch", "findMany", { where: { isActive: true } }, "org-1"),
    ).toEqual({
      where: {
        isActive: true,
        organizationId: "org-1",
      },
    });
  });

  it("preserves explicit organizationId filters", () => {
    expect(
      applyTenantScopeToArgs(
        "branch",
        "findMany",
        { where: { organizationId: "org-explicit", isActive: true } },
        "org-1",
      ),
    ).toEqual({
      where: {
        organizationId: "org-explicit",
        isActive: true,
      },
    });
  });

  it("does not scope writes or non-tenant models", () => {
    expect(applyTenantScopeToArgs("branch", "create", { data: { name: "Sucursal" } }, "org-1")).toEqual(
      { data: { name: "Sucursal" } },
    );
    expect(
      applyTenantScopeToArgs("userBranchRole", "findMany", { where: { userId: "user-1" } }, "org-1"),
    ).toEqual({
      where: {
        userId: "user-1",
      },
    });
  });

  it("keeps concurrent requests isolated by AsyncLocalStorage", async () => {
    const tenantContext = new TenantContextService();
    const extension = createTenantQueryExtension(() => tenantContext.getOrganizationId());
    const operation = extension.query.$allModels.$allOperations;

    const runConcurrentQuery = (organizationId: string, delayMs: number) =>
      tenantContext.run({ organizationId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        return operation({
          model: "branch",
          operation: "findMany",
          args: { where: { isActive: true } },
          query: async (args: { where: { organizationId: string; isActive: boolean } }) =>
            args.where.organizationId,
        });
      });

    const [first, second] = await Promise.all([
      runConcurrentQuery("org-1", 25),
      runConcurrentQuery("org-2", 5),
    ]);

    expect(first).toBe("org-1");
    expect(second).toBe("org-2");
  });
});
