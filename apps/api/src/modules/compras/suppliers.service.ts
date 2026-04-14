import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, includeInactive = false) {
    return this.prisma.supplier.findMany({
      where: {
        organizationId,
        ...(!includeInactive && { isActive: true }),
      },
      orderBy: { name: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!supplier) {
      throw new NotFoundException("Proveedor no encontrado");
    }
    return supplier;
  }

  async create(
    organizationId: string,
    data: {
      name: string;
      rfc?: string;
      contactName?: string;
      email?: string;
      phone?: string;
      address?: string;
      paymentTermsDays?: number;
      bankAccount?: string;
      clabe?: string;
    },
  ) {
    return this.prisma.supplier.create({
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
      rfc?: string;
      contactName?: string;
      email?: string;
      phone?: string;
      address?: string;
      paymentTermsDays?: number;
      bankAccount?: string;
      clabe?: string;
      rating?: number;
      isActive?: boolean;
    },
  ) {
    await this.findOne(organizationId, id);
    return this.prisma.supplier.update({
      where: { id },
      data,
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
