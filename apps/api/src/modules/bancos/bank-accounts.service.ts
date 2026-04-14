import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class BankAccountsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, includeInactive = false) {
    return this.prisma.bankAccount.findMany({
      where: {
        organizationId,
        ...(!includeInactive && { isActive: true }),
      },
      include: { branch: true },
      orderBy: { bankName: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId },
      include: { branch: true },
    });
    if (!account) {
      throw new NotFoundException("Cuenta bancaria no encontrada");
    }
    return account;
  }

  async create(
    organizationId: string,
    data: {
      branchId?: string;
      bankName: string;
      accountNumber: string;
      clabe?: string;
      currency?: string;
      currentBalance?: number;
    },
  ) {
    return this.prisma.bankAccount.create({
      data: {
        organizationId,
        ...data,
      },
      include: { branch: true },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      branchId?: string;
      bankName?: string;
      accountNumber?: string;
      clabe?: string;
      currency?: string;
      isActive?: boolean;
    },
  ) {
    await this.findOne(organizationId, id);
    return this.prisma.bankAccount.update({
      where: { id },
      data,
      include: { branch: true },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.bankAccount.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
