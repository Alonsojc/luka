import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { DeliveryService } from "./delivery.service";
import { PrismaService } from "../../common/prisma/prisma.service";

describe("DeliveryService", () => {
  let service: DeliveryService;
  let mockPrisma: any;

  const ORG_ID = "org-1";

  const mockOrder = {
    id: "order-1",
    organizationId: ORG_ID,
    branchId: "branch-1",
    platform: "UBER_EATS",
    externalOrderId: "ext-123",
    customerName: "Juan Perez",
    subtotal: 200,
    deliveryFee: 30,
    platformFee: 20,
    discount: 0,
    total: 250,
    netRevenue: 200,
    status: "PENDING",
    orderDate: new Date("2026-04-10T12:00:00Z"),
    processedAt: null,
    branch: { id: "branch-1", name: "Sucursal Centro" },
  };

  beforeEach(async () => {
    mockPrisma = {
      deliveryOrder: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      deliveryConfig: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DeliveryService>(DeliveryService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // findAllOrders
  // -----------------------------------------------------------------------
  describe("findAllOrders", () => {
    it("should return paginated orders", async () => {
      mockPrisma.deliveryOrder.findMany.mockResolvedValue([mockOrder]);
      mockPrisma.deliveryOrder.count.mockResolvedValue(1);

      const result = await service.findAllOrders(ORG_ID, {});

      expect(result).toEqual({
        data: [mockOrder],
        total: 1,
        page: 1,
        limit: 25,
        totalPages: 1,
      });
      expect(mockPrisma.deliveryOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_ID },
          skip: 0,
          take: 25,
        }),
      );
      expect(mockPrisma.deliveryOrder.count).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
      });
    });

    it("should filter by platform, branchId, and status", async () => {
      mockPrisma.deliveryOrder.findMany.mockResolvedValue([]);
      mockPrisma.deliveryOrder.count.mockResolvedValue(0);

      await service.findAllOrders(ORG_ID, {
        platform: "UBER_EATS",
        branchId: "branch-1",
        status: "DELIVERED",
      });

      expect(mockPrisma.deliveryOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG_ID,
            platform: "UBER_EATS",
            branchId: "branch-1",
            status: "DELIVERED",
          },
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // findOneOrder
  // -----------------------------------------------------------------------
  describe("findOneOrder", () => {
    it("should return order by id", async () => {
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue(mockOrder);

      const result = await service.findOneOrder(ORG_ID, "order-1");

      expect(result).toEqual(mockOrder);
      expect(mockPrisma.deliveryOrder.findFirst).toHaveBeenCalledWith({
        where: { id: "order-1", organizationId: ORG_ID },
        include: { branch: true },
      });
    });

    it("should throw NotFoundException when order not found", async () => {
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneOrder(ORG_ID, "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // createOrder
  // -----------------------------------------------------------------------
  describe("createOrder", () => {
    it("should create order with calculated netRevenue", async () => {
      const dto = {
        branchId: "branch-1",
        platform: "UBER_EATS",
        externalOrderId: "ext-456",
        customerName: "Maria Lopez",
        subtotal: 200,
        deliveryFee: 30,
        platformFee: 20,
        discount: 0,
        total: 250,
        orderDate: "2026-04-10T12:00:00Z",
        items: [{ name: "Poke Bowl", quantity: 2, price: 125 }],
      };

      const createdOrder = { ...mockOrder, id: "order-2" };
      mockPrisma.deliveryOrder.create.mockResolvedValue(createdOrder);

      const result = await service.createOrder(ORG_ID, dto as any);

      expect(result).toEqual(createdOrder);
      expect(mockPrisma.deliveryOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            platform: "UBER_EATS",
            total: 250,
            netRevenue: 200, // 250 - 30 - 20
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // updateOrderStatus
  // -----------------------------------------------------------------------
  describe("updateOrderStatus", () => {
    it("should update order status", async () => {
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue(mockOrder);
      const updatedOrder = { ...mockOrder, status: "DELIVERED" };
      mockPrisma.deliveryOrder.update.mockResolvedValue(updatedOrder);

      const result = await service.updateOrderStatus(ORG_ID, "order-1", {
        status: "DELIVERED",
      });

      expect(result.status).toBe("DELIVERED");
      expect(mockPrisma.deliveryOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "order-1" },
          data: expect.objectContaining({ status: "DELIVERED" }),
        }),
      );
    });

    it("should throw NotFoundException for missing order", async () => {
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.updateOrderStatus(ORG_ID, "nonexistent", {
          status: "DELIVERED",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException when order is already cancelled", async () => {
      const cancelledOrder = { ...mockOrder, status: "CANCELLED" };
      mockPrisma.deliveryOrder.findFirst.mockResolvedValue(cancelledOrder);

      await expect(
        service.updateOrderStatus(ORG_ID, "order-1", {
          status: "DELIVERED",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // getSummary
  // -----------------------------------------------------------------------
  describe("getSummary", () => {
    it("should return order summary stats", async () => {
      const orders = [
        {
          ...mockOrder,
          platform: "UBER_EATS",
          total: 250,
          deliveryFee: 30,
          platformFee: 20,
          orderDate: new Date("2026-04-10T12:00:00Z"),
        },
        {
          ...mockOrder,
          id: "order-2",
          platform: "RAPPI",
          total: 180,
          deliveryFee: 25,
          platformFee: 15,
          orderDate: new Date("2026-04-11T12:00:00Z"),
        },
      ];
      mockPrisma.deliveryOrder.findMany.mockResolvedValue(orders);

      const result = await service.getSummary(ORG_ID, {});

      expect(result.totalOrders).toBe(2);
      expect(result.totalRevenue).toBe(430);
      expect(result.totalFees).toBe(90);
      expect(result.netRevenue).toBe(340);
      expect(result.avgOrderValue).toBe(215);
      expect(result.byPlatform).toHaveLength(2);
      expect(result.dailyTrend).toHaveLength(2);
    });
  });
});
