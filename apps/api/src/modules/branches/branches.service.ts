import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, includeInactive = false) {
    return this.prisma.branch.findMany({
      where: {
        organizationId,
        ...(!includeInactive && { isActive: true }),
      },
      include: {
        legalEntity: { select: { id: true, name: true, rfc: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, organizationId },
    });
    if (!branch) {
      throw new NotFoundException("Sucursal no encontrada");
    }
    return branch;
  }

  async create(
    organizationId: string,
    data: {
      name: string;
      code: string;
      city: string;
      state: string;
      address: string;
      postalCode: string;
      phone?: string;
      email?: string;
      timezone?: string;
      branchType?: string;
      corntechBranchId?: string;
      legalEntityId?: string;
    },
  ) {
    return this.prisma.branch.create({
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
      code?: string;
      city?: string;
      state?: string;
      address?: string;
      postalCode?: string;
      phone?: string;
      email?: string;
      timezone?: string;
      isActive?: boolean;
      branchType?: string;
      corntechBranchId?: string;
      legalEntityId?: string | null;
    },
  ) {
    await this.findOne(organizationId, id);
    return this.prisma.branch.update({
      where: { id },
      data,
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.branch.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
