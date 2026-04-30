import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@luka/database";
import { AlertEngineService } from "./alert-engine.service";

describe("AlertEngineService", () => {
  let service: AlertEngineService;
  let mockPrisma: any;
  let mockWhatsApp: any;
  let mockReportes: any;

  const rule = {
    id: "rule-1",
    organizationId: "org-1",
    eventType: "OPERATIONAL_RECONCILIATION",
    conditions: { lookbackDays: 1, minIssueCount: 1 },
    recipients: [{ phone: "+5214420000000", name: "Operaciones" }],
    messageTemplate: "Incidencias {{issueCount}} POS {{posIssueCount}}",
    isActive: true,
  };

  beforeEach(() => {
    mockPrisma = {
      alertRule: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      alertLog: {
        create: vi.fn(),
      },
      branch: {
        findMany: vi.fn(),
      },
    };
    mockWhatsApp = {
      renderTemplate: vi.fn((template: string, data: Record<string, string>) =>
        template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? ""),
      ),
      sendMessage: vi.fn().mockResolvedValue({ success: true, logId: "log-1" }),
    };
    mockReportes = {
      operationalReconciliation: vi.fn(),
    };

    service = new AlertEngineService(mockPrisma, mockWhatsApp, mockReportes);
  });

  it("does not trigger operational reconciliation alerts when there are no issues", async () => {
    mockPrisma.alertRule.findMany.mockResolvedValue([rule]);
    mockReportes.operationalReconciliation.mockResolvedValue({
      issueCount: 0,
      posInventory: { summary: { issueCount: 0 } },
      cedisTransfers: { summary: { issueCount: 0 } },
      foodCost: { summary: { issueCount: 0 } },
      deliveryNetRevenue: {
        summary: { issueCount: 0, recalculatedNetRevenue: 0 },
      },
    });

    const result = await service.checkOperationalReconciliationAlerts("org-1");

    expect(result).toEqual({ triggered: 0, issueCount: 0, deduped: 0 });
    expect(mockPrisma.alertLog.create).not.toHaveBeenCalled();
    expect(mockWhatsApp.sendMessage).not.toHaveBeenCalled();
    expect(mockPrisma.alertRule.update).not.toHaveBeenCalled();
  });

  it("triggers operational reconciliation alerts when issue count reaches the rule threshold", async () => {
    mockPrisma.alertRule.findMany.mockResolvedValue([rule]);
    mockReportes.operationalReconciliation.mockResolvedValue({
      issueCount: 4,
      posInventory: { summary: { issueCount: 1 } },
      cedisTransfers: { summary: { issueCount: 1 } },
      foodCost: { summary: { issueCount: 1 } },
      deliveryNetRevenue: {
        summary: { issueCount: 1, recalculatedNetRevenue: 8450 },
      },
    });
    mockPrisma.alertLog.create.mockResolvedValue({ id: "dedupe-log-1" });
    mockPrisma.alertRule.update.mockResolvedValue({ id: "rule-1" });

    const result = await service.checkOperationalReconciliationAlerts("org-1");

    expect(result).toEqual({ triggered: 1, issueCount: 4, deduped: 0 });
    expect(mockReportes.operationalReconciliation).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ branchId: undefined }),
    );
    expect(mockPrisma.alertLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alertRuleId: "rule-1",
        recipient: "__system_dedupe__",
        status: "RESERVED",
        dedupeKey: expect.stringMatching(
          /^operational-reconciliation:rule-1:all-branches:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/,
        ),
      }),
    });
    expect(mockWhatsApp.renderTemplate).toHaveBeenCalledWith(
      rule.messageTemplate,
      expect.objectContaining({
        issueCount: "4",
        posIssueCount: "1",
        cedisIssueCount: "1",
        foodCostIssueCount: "1",
        deliveryIssueCount: "1",
        deliveryNetRevenue: "$8,450.00",
        reportUrl: "/reportes",
      }),
    );
    expect(mockWhatsApp.sendMessage).toHaveBeenCalledWith(
      "org-1",
      "+5214420000000",
      "Incidencias 4 POS 1",
      "rule-1",
    );
    expect(mockPrisma.alertRule.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { lastTriggeredAt: expect.any(Date) },
    });
  });

  it("skips duplicate operational reconciliation alerts for the same rule, scope, and range", async () => {
    mockPrisma.alertRule.findMany.mockResolvedValue([rule]);
    mockReportes.operationalReconciliation.mockResolvedValue({
      issueCount: 4,
      posInventory: { summary: { issueCount: 1 } },
      cedisTransfers: { summary: { issueCount: 1 } },
      foodCost: { summary: { issueCount: 1 } },
      deliveryNetRevenue: {
        summary: { issueCount: 1, recalculatedNetRevenue: 8450 },
      },
    });
    mockPrisma.alertLog.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const result = await service.checkOperationalReconciliationAlerts("org-1");

    expect(result).toEqual({ triggered: 0, issueCount: 0, deduped: 1 });
    expect(mockWhatsApp.sendMessage).not.toHaveBeenCalled();
    expect(mockPrisma.alertRule.update).not.toHaveBeenCalled();
  });
});
