import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.customer.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      include: {
        loyaltyTransactions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
    if (!customer) {
      throw new NotFoundException("Cliente no encontrado");
    }
    return customer;
  }

  async create(
    organizationId: string,
    data: {
      name: string;
      email?: string;
      phone?: string;
      rfc?: string;
      preferredBranchId?: string;
    },
  ) {
    return this.prisma.customer.create({
      data: {
        organizationId,
        ...data,
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      rfc?: string;
      preferredBranchId?: string;
      tier?: string;
    },
  ) {
    await this.findOne(organizationId, id);
    const { tier, ...rest } = data;
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...rest,
        ...(tier && { tier: tier as any }),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.customer.delete({ where: { id } });
  }
}
