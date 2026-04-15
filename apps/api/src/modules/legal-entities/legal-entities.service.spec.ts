import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ConflictException } from "@nestjs/common";
import { LegalEntitiesService } from "./legal-entities.service";
import { PrismaService } from "../../common/prisma/prisma.service";

describe("LegalEntitiesService", () => {
  let service: LegalEntitiesService;
  let mockPrisma: any;

  const ORG_ID = "org-1";

  const mockEntity = {
    id: "entity-1",
    organizationId: ORG_ID,
    name: "Luka Poke SA de CV",
    rfc: "LPK210101ABC",
    razonSocial: "Luka Poke House SA de CV",
    regimenFiscal: "601",
    address: "Av. Reforma 123, CDMX",
    postalCode: "06600",
    logoUrl: null,
    isActive: true,
    _count: { branches: 3 },
  };

  const mockEntityWithBranches = {
    ...mockEntity,
    branches: [
      { id: "branch-1", name: "Sucursal Centro" },
      { id: "branch-2", name: "Sucursal Norte" },
    ],
  };

  beforeEach(async () => {
    mockPrisma = {
      legalEntity: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      branch: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalEntitiesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<LegalEntitiesService>(LegalEntitiesService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // findAll
  // -----------------------------------------------------------------------
  describe("findAll", () => {
    it("should return all legal entities for org", async () => {
      mockPrisma.legalEntity.findMany.mockResolvedValue([mockEntity]);

      const result = await service.findAll(ORG_ID);

      expect(result).toEqual([mockEntity]);
      expect(mockPrisma.legalEntity.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        include: {
          _count: { select: { branches: true } },
        },
        orderBy: { name: "asc" },
      });
    });
  });

  // -----------------------------------------------------------------------
  // findOne
  // -----------------------------------------------------------------------
  describe("findOne", () => {
    it("should return single entity", async () => {
      mockPrisma.legalEntity.findFirst.mockResolvedValue(mockEntityWithBranches);

      const result = await service.findOne(ORG_ID, "entity-1");

      expect(result).toEqual(mockEntityWithBranches);
      expect(mockPrisma.legalEntity.findFirst).toHaveBeenCalledWith({
        where: { id: "entity-1", organizationId: ORG_ID },
        include: {
          branches: { orderBy: { name: "asc" } },
        },
      });
    });

    it("should throw NotFoundException when not found", async () => {
      mockPrisma.legalEntity.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(ORG_ID, "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe("create", () => {
    it("should create legal entity", async () => {
      const dto = {
        name: "Luka Poke SA de CV",
        rfc: "LPK210101ABC",
        razonSocial: "Luka Poke House SA de CV",
        regimenFiscal: "601",
        address: "Av. Reforma 123, CDMX",
        postalCode: "06600",
      };

      mockPrisma.legalEntity.findUnique.mockResolvedValue(null);
      mockPrisma.legalEntity.create.mockResolvedValue(mockEntity);

      const result = await service.create(ORG_ID, dto as any);

      expect(result).toEqual(mockEntity);
      expect(mockPrisma.legalEntity.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_rfc: { organizationId: ORG_ID, rfc: "LPK210101ABC" },
        },
      });
      expect(mockPrisma.legalEntity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            name: "Luka Poke SA de CV",
            rfc: "LPK210101ABC",
          }),
        }),
      );
    });

    it("should throw ConflictException for duplicate RFC", async () => {
      const dto = {
        name: "Duplicate Entity",
        rfc: "LPK210101ABC",
        razonSocial: "Duplicate SA de CV",
        regimenFiscal: "601",
      };

      mockPrisma.legalEntity.findUnique.mockResolvedValue(mockEntity);

      await expect(service.create(ORG_ID, dto as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------
  describe("update", () => {
    it("should update legal entity", async () => {
      const dto = {
        name: "Luka Poke Updated",
        address: "New Address 456",
      };

      // findOne call inside update
      mockPrisma.legalEntity.findFirst.mockResolvedValue(mockEntityWithBranches);
      const updatedEntity = { ...mockEntityWithBranches, name: "Luka Poke Updated" };
      mockPrisma.legalEntity.update.mockResolvedValue(updatedEntity);

      const result = await service.update(ORG_ID, "entity-1", dto as any);

      expect(result.name).toBe("Luka Poke Updated");
      expect(mockPrisma.legalEntity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "entity-1" },
          data: dto,
        }),
      );
    });

    it("should throw ConflictException when updating to duplicate RFC", async () => {
      const dto = { rfc: "DUPLICATE_RFC" };

      // findOne succeeds
      mockPrisma.legalEntity.findFirst
        .mockResolvedValueOnce(mockEntityWithBranches) // findOne
        .mockResolvedValueOnce({ id: "entity-2", rfc: "DUPLICATE_RFC" }); // duplicate check

      await expect(
        service.update(ORG_ID, "entity-1", dto as any),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw NotFoundException when entity does not exist", async () => {
      mockPrisma.legalEntity.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, "nonexistent", { name: "Test" } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // deactivate (soft-delete)
  // -----------------------------------------------------------------------
  describe("deactivate", () => {
    it("should soft-delete entity by setting isActive to false", async () => {
      mockPrisma.legalEntity.findFirst.mockResolvedValue(mockEntityWithBranches);
      const deactivated = { ...mockEntity, isActive: false };
      mockPrisma.legalEntity.update.mockResolvedValue(deactivated);

      const result = await service.deactivate(ORG_ID, "entity-1");

      expect(result.isActive).toBe(false);
      expect(mockPrisma.legalEntity.update).toHaveBeenCalledWith({
        where: { id: "entity-1" },
        data: { isActive: false },
      });
    });

    it("should throw NotFoundException for non-existing entity", async () => {
      mockPrisma.legalEntity.findFirst.mockResolvedValue(null);

      await expect(
        service.deactivate(ORG_ID, "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
