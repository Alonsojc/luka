import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class PromotionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.promotion.findMany({
      where: { organizationId },
      orderBy: { startDate: "desc" },
    });
  }

  async findActive(organizationId: string) {
    const now = new Date();
    return this.prisma.promotion.findMany({
      where: {
        organizationId,
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { startDate: "desc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, organizationId },
    });
    if (!promotion) {
      throw new NotFoundException("Promoción no encontrada");
    }
    return promotion;
  }

  async create(
    organizationId: string,
    data: {
      name: string;
      type: string;
      conditions?: Record<string, any>;
      startDate: string;
      endDate: string;
      applicableBranches?: string[];
    },
  ) {
    const { type, startDate, endDate, ...rest } = data;
    return this.prisma.promotion.create({
      data: {
        organizationId,
        type: type as any,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        ...rest,
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      conditions?: Record<string, any>;
      startDate?: string;
      endDate?: string;
      isActive?: boolean;
      applicableBranches?: string[];
    },
  ) {
    await this.findOne(organizationId, id);
    const { startDate, endDate, ...rest } = data;
    return this.prisma.promotion.update({
      where: { id },
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.promotion.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
