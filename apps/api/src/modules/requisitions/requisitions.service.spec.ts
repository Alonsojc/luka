import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { RequisitionsService } from "./requisitions.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

describe("RequisitionsService", () => {
  let service: RequisitionsService;
  let mockPrisma: any;
  let mockAudit: any;

  const ORG_ID = "org-1";
  const USER_ID = "user-1";

  const mockRequisition = {
    id: "req-1",
    organizationId: ORG_ID,
    requestingBranchId: "branch-1",
    fulfillingBranchId: "branch-2",
    status: "DRAFT",
    priority: "NORMAL",
    requestedDeliveryDate: null,
    notes: null,
    requestedById: USER_ID,
    approvedById: null,
    rejectionReason: null,
    transferId: null,
    requestingBranch: { id: "branch-1", name: "Sucursal Norte", code: "NRT" },
    fulfillingBranch: { id: "branch-2", name: "CEDIS", code: "CDS" },
    requestedBy: {
      id: USER_ID,
      firstName: "Juan",
      lastName: "Perez",
      email: "juan@luka.com",
    },
    approvedBy: null,
    items: [
      {
        id: "item-1",
        productId: "product-1",
        requestedQuantity: 10,
        approvedQuantity: null,
        unitOfMeasure: "kg",
        notes: null,
        product: {
          id: "product-1",
          name: "Salmon",
          sku: "SAL-001",
          unitOfMeasure: "kg",
          costPerUnit: 350,
        },
      },
    ],
  };

  beforeEach(async () => {
    mockPrisma = {
      requisition: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      requisitionItem: {
        deleteMany: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
      branch: {
        findFirst: vi.fn(),
      },
      product: {
        findMany: vi.fn(),
      },
      interBranchTransfer: {
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: any) => fn(mockPrisma)),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequisitionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<RequisitionsService>(RequisitionsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // findAll
  // -----------------------------------------------------------------------
  describe("findAll", () => {
    it("should return paginated requisitions", async () => {
      mockPrisma.requisition.findMany.mockResolvedValue([mockRequisition]);
      mockPrisma.requisition.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID);

      expect(result).toEqual({
        data: [mockRequisition],
        total: 1,
        page: 1,
        totalPages: 1,
      });
      expect(mockPrisma.requisition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_ID },
          skip: 0,
          take: 50,
        }),
      );
      expect(mockPrisma.requisition.count).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
      });
    });
  });

  // -----------------------------------------------------------------------
  // findOne
  // -----------------------------------------------------------------------
  describe("findOne", () => {
    it("should return single requisition", async () => {
      mockPrisma.requisition.findFirst.mockResolvedValue(mockRequisition);

      const result = await service.findOne("req-1", ORG_ID);

      expect(result).toEqual(mockRequisition);
      expect(mockPrisma.requisition.findFirst).toHaveBeenCalledWith({
        where: { id: "req-1", organizationId: ORG_ID },
        include: expect.any(Object),
      });
    });

    it("should throw NotFoundException when not found", async () => {
      mockPrisma.requisition.findFirst.mockResolvedValue(null);

      await expect(service.findOne("nonexistent", ORG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe("create", () => {
    it("should create requisition with items", async () => {
      const dto = {
        requestingBranchId: "branch-1",
        fulfillingBranchId: "branch-2",
        priority: "NORMAL",
        notes: "Urgente",
        items: [
          {
            productId: "product-1",
            requestedQuantity: 10,
            unitOfMeasure: "kg",
          },
        ],
      };

      mockPrisma.branch.findFirst
        .mockResolvedValueOnce({ id: "branch-1", organizationId: ORG_ID }) // requesting branch
        .mockResolvedValueOnce({ id: "branch-2", organizationId: ORG_ID }); // fulfilling branch
      mockPrisma.product.findMany.mockResolvedValue([{ id: "product-1", organizationId: ORG_ID }]);
      mockPrisma.requisition.create.mockResolvedValue(mockRequisition);

      const result = await service.create(USER_ID, ORG_ID, dto as any);

      expect(result).toEqual(mockRequisition);
      expect(mockPrisma.requisition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            requestingBranchId: "branch-1",
            requestedById: USER_ID,
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it("should throw BadRequestException for invalid requesting branch", async () => {
      const dto = {
        requestingBranchId: "invalid-branch",
        items: [
          {
            productId: "product-1",
            requestedQuantity: 10,
            unitOfMeasure: "kg",
          },
        ],
      };

      mockPrisma.branch.findFirst.mockResolvedValue(null);

      await expect(service.create(USER_ID, ORG_ID, dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // approve
  // -----------------------------------------------------------------------
  describe("approve", () => {
    it("should update requisition status to approved", async () => {
      const submittedReq = { ...mockRequisition, status: "SUBMITTED" };
      mockPrisma.requisition.findFirst.mockResolvedValue(submittedReq);

      const approvedReq = { ...submittedReq, status: "APPROVED", approvedById: USER_ID };
      mockPrisma.requisitionItem.update.mockResolvedValue({});
      mockPrisma.requisition.update.mockResolvedValue(approvedReq);

      const result = await service.approve("req-1", USER_ID, ORG_ID, {});

      expect(result.status).toBe("APPROVED");
      expect(mockPrisma.requisition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "req-1" },
          data: expect.objectContaining({
            status: "APPROVED",
            approvedById: USER_ID,
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it("should throw BadRequestException for invalid status transition", async () => {
      // A DRAFT requisition cannot be directly APPROVED
      mockPrisma.requisition.findFirst.mockResolvedValue(mockRequisition);

      await expect(service.approve("req-1", USER_ID, ORG_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // reject
  // -----------------------------------------------------------------------
  describe("reject", () => {
    it("should update requisition status to rejected", async () => {
      const submittedReq = { ...mockRequisition, status: "SUBMITTED" };
      mockPrisma.requisition.findFirst.mockResolvedValue(submittedReq);

      const rejectedReq = {
        ...submittedReq,
        status: "REJECTED",
        rejectionReason: "Presupuesto insuficiente",
      };
      mockPrisma.requisition.update.mockResolvedValue(rejectedReq);

      const result = await service.reject("req-1", USER_ID, ORG_ID, {
        rejectionReason: "Presupuesto insuficiente",
      });

      expect(result.status).toBe("REJECTED");
      expect(mockPrisma.requisition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "req-1" },
          data: expect.objectContaining({
            status: "REJECTED",
            rejectionReason: "Presupuesto insuficiente",
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it("should throw BadRequestException when rejecting a non-SUBMITTED requisition", async () => {
      // DRAFT cannot be directly REJECTED
      mockPrisma.requisition.findFirst.mockResolvedValue(mockRequisition);

      await expect(
        service.reject("req-1", USER_ID, ORG_ID, {
          rejectionReason: "Not valid",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // fulfill
  // -----------------------------------------------------------------------
  describe("fulfill", () => {
    it("should create transfer and keep requisition approved until physical reception", async () => {
      const approvedReq = { ...mockRequisition, status: "APPROVED" };
      const transfer = { id: "transfer-1" };
      mockPrisma.requisition.findFirst.mockResolvedValue(approvedReq);
      mockPrisma.interBranchTransfer.create.mockResolvedValue(transfer);
      mockPrisma.requisition.update.mockResolvedValue({
        ...approvedReq,
        status: "APPROVED",
        transferId: "transfer-1",
      });

      const result = await service.fulfill("req-1", USER_ID, ORG_ID);

      expect(result.status).toBe("APPROVED");
      expect(result.transfer).toEqual(transfer);
      expect(mockPrisma.interBranchTransfer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromBranchId: "branch-2",
            toBranchId: "branch-1",
          }),
        }),
      );
      expect(mockPrisma.requisition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "APPROVED",
            transferId: "transfer-1",
          }),
        }),
      );
    });

    it("should reject creating a second transfer for the same requisition", async () => {
      mockPrisma.requisition.findFirst.mockResolvedValue({
        ...mockRequisition,
        status: "APPROVED",
        transferId: "transfer-1",
      });

      await expect(service.fulfill("req-1", USER_ID, ORG_ID)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.interBranchTransfer.create).not.toHaveBeenCalled();
    });
  });
});
