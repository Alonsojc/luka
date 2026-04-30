import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { toPrismaJsonArray } from "../../common/utils/prisma-json";
import { CreateDeliveryOrderDto } from "./dto/create-order.dto";
import { UpdateDeliveryStatusDto } from "./dto/update-status.dto";
import { CreateDeliveryConfigDto } from "./dto/create-config.dto";

@Injectable()
export class DeliveryService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------

  async findAllOrders(
    organizationId: string,
    filters: {
      platform?: string;
      branchId?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { platform, branchId, status, dateFrom, dateTo } = filters;
    const page = filters.page || 1;
    const limit = filters.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (platform) where.platform = platform;
    if (branchId) where.branchId = branchId;
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.orderDate = {};
      if (dateFrom) where.orderDate.gte = new Date(dateFrom);
      if (dateTo) where.orderDate.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.deliveryOrder.findMany({
        where,
        include: { branch: true },
        orderBy: { orderDate: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.deliveryOrder.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOneOrder(organizationId: string, id: string) {
    const order = await this.prisma.deliveryOrder.findFirst({
      where: { id, organizationId },
      include: { branch: true },
    });
    if (!order) {
      throw new NotFoundException("Orden de delivery no encontrada");
    }
    return order;
  }

  async createOrder(organizationId: string, dto: CreateDeliveryOrderDto) {
    const fees = (dto.deliveryFee || 0) + (dto.platformFee || 0);
    const netRevenue = dto.total - fees;

    return this.prisma.deliveryOrder.create({
      data: {
        organizationId,
        branchId: dto.branchId || null,
        platform: dto.platform,
        externalOrderId: dto.externalOrderId || null,
        customerName: dto.customerName || null,
        subtotal: dto.subtotal,
        deliveryFee: dto.deliveryFee || null,
        platformFee: dto.platformFee || null,
        discount: dto.discount || null,
        total: dto.total,
        netRevenue,
        orderDate: new Date(dto.orderDate),
        items: toPrismaJsonArray(dto.items || []),
      },
      include: { branch: true },
    });
  }

  async updateOrderStatus(organizationId: string, id: string, dto: UpdateDeliveryStatusDto) {
    const order = await this.findOneOrder(organizationId, id);

    if (order.status === "CANCELLED") {
      throw new BadRequestException("No se puede cambiar el estado de una orden cancelada");
    }
    if (order.status === "DELIVERED" && dto.status !== "CANCELLED") {
      throw new BadRequestException("Una orden entregada solo puede ser cancelada");
    }

    const updateData: any = { status: dto.status };
    if (dto.status === "DELIVERED") {
      updateData.processedAt = new Date();
    }

    return this.prisma.deliveryOrder.update({
      where: { id },
      data: updateData,
      include: { branch: true },
    });
  }

  // ---------------------------------------------------------------
  // Summary / Analytics
  // ---------------------------------------------------------------

  async getSummary(
    organizationId: string,
    filters: {
      branchId?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const where: any = { organizationId };
    if (filters.branchId) where.branchId = filters.branchId;

    // Default to last 30 days
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : new Date();
    const dateFrom = filters.dateFrom
      ? new Date(filters.dateFrom)
      : new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    where.orderDate = { gte: dateFrom, lte: dateTo };

    const orders = await this.prisma.deliveryOrder.findMany({
      where,
      include: { branch: true },
    });

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalFees = orders.reduce(
      (sum, o) => sum + Number(o.deliveryFee || 0) + Number(o.platformFee || 0),
      0,
    );
    const netRevenue = totalRevenue - totalFees;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // By platform
    const platformMap: Record<string, { orders: number; revenue: number; fees: number }> = {};
    for (const o of orders) {
      if (!platformMap[o.platform]) {
        platformMap[o.platform] = { orders: 0, revenue: 0, fees: 0 };
      }
      platformMap[o.platform].orders++;
      platformMap[o.platform].revenue += Number(o.total);
      platformMap[o.platform].fees += Number(o.deliveryFee || 0) + Number(o.platformFee || 0);
    }
    const byPlatform = Object.entries(platformMap).map(([platform, data]) => ({
      platform,
      ...data,
    }));

    // By branch
    const branchMap: Record<string, { branchName: string; orders: number; revenue: number }> = {};
    for (const o of orders) {
      const bId = o.branchId || "sin_sucursal";
      const bName = o.branch?.name || "Sin sucursal";
      if (!branchMap[bId]) {
        branchMap[bId] = { branchName: bName, orders: 0, revenue: 0 };
      }
      branchMap[bId].orders++;
      branchMap[bId].revenue += Number(o.total);
    }
    const byBranch = Object.entries(branchMap).map(([branchId, data]) => ({
      branchId,
      ...data,
    }));

    // Daily trend
    const dailyMap: Record<string, { orders: number; revenue: number }> = {};
    for (const o of orders) {
      const day = o.orderDate.toISOString().slice(0, 10);
      if (!dailyMap[day]) {
        dailyMap[day] = { orders: 0, revenue: 0 };
      }
      dailyMap[day].orders++;
      dailyMap[day].revenue += Number(o.total);
    }
    const dailyTrend = Object.entries(dailyMap)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalFees: Math.round(totalFees * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      byPlatform,
      byBranch,
      dailyTrend,
    };
  }

  // ---------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------

  async findAllConfigs(organizationId: string) {
    return this.prisma.deliveryConfig.findMany({
      where: { organizationId },
      include: { branch: true },
      orderBy: { platform: "asc" },
    });
  }

  async upsertConfig(organizationId: string, dto: CreateDeliveryConfigDto) {
    const existing = await this.prisma.deliveryConfig.findFirst({
      where: {
        organizationId,
        branchId: dto.branchId || null,
        platform: dto.platform,
      },
    });

    if (existing) {
      return this.prisma.deliveryConfig.update({
        where: { id: existing.id },
        data: {
          apiKey: dto.apiKey !== undefined ? dto.apiKey : existing.apiKey,
          storeId: dto.storeId !== undefined ? dto.storeId : existing.storeId,
          isActive: dto.isActive !== undefined ? dto.isActive : existing.isActive,
          syncInterval: dto.syncInterval !== undefined ? dto.syncInterval : existing.syncInterval,
        },
        include: { branch: true },
      });
    }

    return this.prisma.deliveryConfig.create({
      data: {
        organizationId,
        branchId: dto.branchId || null,
        platform: dto.platform,
        apiKey: dto.apiKey || null,
        storeId: dto.storeId || null,
        isActive: dto.isActive ?? true,
        syncInterval: dto.syncInterval ?? 15,
      },
      include: { branch: true },
    });
  }

  async triggerSync(organizationId: string, platform: string) {
    const configs = await this.prisma.deliveryConfig.findMany({
      where: { organizationId, platform, isActive: true },
    });

    if (configs.length === 0) {
      throw new BadRequestException(`No hay configuración activa para ${platform}`);
    }

    // Update lastSyncAt for all matching configs
    await this.prisma.deliveryConfig.updateMany({
      where: { organizationId, platform, isActive: true },
      data: { lastSyncAt: new Date() },
    });

    // In a real implementation this would call the platform API.
    // For now we just acknowledge the sync was triggered.
    return {
      message: `Sincronización de ${platform} iniciada`,
      configsTriggered: configs.length,
      timestamp: new Date().toISOString(),
    };
  }
}
