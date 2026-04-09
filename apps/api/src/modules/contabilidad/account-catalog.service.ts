import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class AccountCatalogService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.accountCatalog.findMany({
      where: { organizationId },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
      },
      orderBy: { code: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const account = await this.prisma.accountCatalog.findFirst({
      where: { id, organizationId },
      include: {
        parent: true,
        children: true,
      },
    });
    if (!account) {
      throw new NotFoundException("Cuenta contable no encontrada");
    }
    return account;
  }

  async create(
    organizationId: string,
    data: {
      code: string;
      name: string;
      type: string;
      nature: string;
      satGroupCode?: string;
      parentAccountId?: string;
      isDetail?: boolean;
    },
  ) {
    const { type, nature, ...rest } = data;
    return this.prisma.accountCatalog.create({
      data: {
        organizationId,
        type: type as any,
        nature: nature as any,
        ...rest,
      },
      include: { parent: true },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      satGroupCode?: string;
      parentAccountId?: string;
      isDetail?: boolean;
      isActive?: boolean;
    },
  ) {
    await this.findOne(organizationId, id);
    return this.prisma.accountCatalog.update({
      where: { id },
      data,
      include: { parent: true },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.accountCatalog.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
