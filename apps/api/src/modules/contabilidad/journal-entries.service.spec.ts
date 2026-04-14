import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { JournalEntriesService } from "./journal-entries.service";
import { PrismaService } from "../../common/prisma/prisma.service";

describe("JournalEntriesService", () => {
  let service: JournalEntriesService;
  let mockPrisma: any;

  const ORG_ID = "org-1";
  const USER_ID = "user-1";

  const mockEntry = {
    id: "je-1",
    organizationId: ORG_ID,
    entryDate: new Date("2026-04-01"),
    type: "DIARIO",
    description: "Compra de insumos",
    status: "DRAFT",
    lines: [
      { id: "l-1", accountId: "acc-1", debit: 1000, credit: 0, account: { code: "1100", name: "Bancos" } },
      { id: "l-2", accountId: "acc-2", debit: 0, credit: 1000, account: { code: "2100", name: "Proveedores" } },
    ],
    branch: null,
  };

  beforeEach(async () => {
    mockPrisma = {
      journalEntry: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      journalEntryLine: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      $transaction: vi.fn((fn) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalEntriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<JournalEntriesService>(JournalEntriesService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findOne", () => {
    it("should throw NotFoundException when entry not found", async () => {
      mockPrisma.journalEntry.findFirst.mockResolvedValue(null);
      await expect(service.findOne(ORG_ID, "bad")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("should reject when debits != credits (partida doble)", async () => {
      await expect(
        service.create(ORG_ID, USER_ID, {
          entryDate: "2026-04-01",
          type: "DIARIO",
          description: "Bad entry",
          lines: [
            { accountId: "a1", debit: 1000, credit: 0 },
            { accountId: "a2", debit: 0, credit: 500 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject when debits != credits (partida doble) with message", async () => {
      await expect(
        service.create(ORG_ID, USER_ID, {
          entryDate: "2026-04-01",
          type: "DIARIO",
          description: "Unbalanced",
          lines: [
            { accountId: "a1", debit: 100, credit: 0 },
            { accountId: "a2", debit: 0, credit: 99 },
          ],
        }),
      ).rejects.toThrow("partida doble no cuadra");
    });

    it("should accept balanced entries (debits = credits)", async () => {
      mockPrisma.journalEntry.create.mockResolvedValue(mockEntry);

      const result = await service.create(ORG_ID, USER_ID, {
        entryDate: "2026-04-01",
        type: "DIARIO",
        description: "Compra de insumos",
        lines: [
          { accountId: "a1", debit: 1000, credit: 0 },
          { accountId: "a2", debit: 0, credit: 1000 },
        ],
      });

      expect(result).toEqual(mockEntry);
    });

    it("should tolerate floating point rounding (diff < 0.01)", async () => {
      mockPrisma.journalEntry.create.mockResolvedValue(mockEntry);

      // 0.1 + 0.2 = 0.30000000000000004 in JS
      await expect(
        service.create(ORG_ID, USER_ID, {
          entryDate: "2026-04-01",
          type: "DIARIO",
          description: "Floating point",
          lines: [
            { accountId: "a1", debit: 0.1, credit: 0 },
            { accountId: "a2", debit: 0.2, credit: 0 },
            { accountId: "a3", debit: 0, credit: 0.3 },
          ],
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("post", () => {
    it("should publish a draft entry", async () => {
      mockPrisma.journalEntry.findFirst.mockResolvedValue(mockEntry);
      mockPrisma.journalEntry.update.mockResolvedValue({
        ...mockEntry,
        status: "POSTED",
      });

      const result = await service.post(ORG_ID, "je-1", USER_ID);
      expect(result.status).toBe("POSTED");
    });

    it("should reject publishing a non-draft entry", async () => {
      mockPrisma.journalEntry.findFirst.mockResolvedValue({
        ...mockEntry,
        status: "POSTED",
      });

      await expect(service.post(ORG_ID, "je-1", USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("reverse", () => {
    it("should reverse a posted entry", async () => {
      mockPrisma.journalEntry.findFirst.mockResolvedValue({
        ...mockEntry,
        status: "POSTED",
      });
      mockPrisma.journalEntry.update.mockResolvedValue({
        ...mockEntry,
        status: "REVERSED",
      });

      const result = await service.reverse(ORG_ID, "je-1");
      expect(result.status).toBe("REVERSED");
    });

    it("should reject reversing a draft entry", async () => {
      mockPrisma.journalEntry.findFirst.mockResolvedValue(mockEntry);

      await expect(service.reverse(ORG_ID, "je-1")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("update", () => {
    it("should reject editing a posted entry", async () => {
      mockPrisma.journalEntry.findFirst.mockResolvedValue({
        ...mockEntry,
        status: "POSTED",
      });

      await expect(
        service.update(ORG_ID, "je-1", { description: "New desc" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should validate double-entry on line updates", async () => {
      mockPrisma.journalEntry.findFirst.mockResolvedValue(mockEntry);

      await expect(
        service.update(ORG_ID, "je-1", {
          lines: [
            { accountId: "a1", debit: 500, credit: 0 },
            { accountId: "a2", debit: 0, credit: 300 },
          ],
        }),
      ).rejects.toThrow("partida doble no cuadra");
    });
  });
});
